/*
  tts.js —— 多音源 TTS 链路

  参考 AIRI 的 multi-provider TTS 思路，做成降级链：
    1. IndexTTS2（本地 Gradio，音色最好）
    2. Edge TTS（微软在线免费，无需 Key）
    3. OpenAI 兼容 TTS（可接 SiliconFlow / OpenAI / 任意兼容服务）

  每一级失败自动尝试下一级，全部失败则返回空串，由调用方降级成纯文本。
*/

const path = require("path");
const fs = require("fs");
const { app } = require("electron");
const { pathToFileURL } = require("url");
const {
  normalizeBaseUrl,
  normalizeTtsConfig
} = require("./ai-config.js");
const {
  cleanDisplayText,
  fetchWithTimeout,
  sleep
} = require("./utils.js");
const { edgeTtsToBuffer } = require("./tts-edge.js");

const AUDIO_CACHE_DIR = "audio-cache";

/*
  IndexTTS2 的 refresh_ui 返回的是“全局最近完成音频”，
  所以所有 IndexTTS2 请求必须全局串行，避免多轮聊天抢同一个 spk_*.wav。
*/
let ttsSerialQueue = Promise.resolve();

function isTtsConfigured(config) {
  const tts = normalizeTtsConfig(config);

  if (!tts.enabled) {
    return false;
  }

  if (tts.provider === "edge") {
    return Boolean(tts.edgeVoice);
  }

  if (tts.provider === "openai") {
    return Boolean(tts.openai?.baseUrl);
  }

  return Boolean(tts.referencePath);
}

function getTtsChain(config) {
  const tts = normalizeTtsConfig(config);
  const chain = [];

  if (!tts.enabled) {
    return chain;
  }

  const providers = tts.provider === "auto"
    ? ["indextts", "edge", "openai"]
    : [tts.provider];

  for (const provider of providers) {
    if (provider === "indextts" && tts.referencePath) {
      chain.push("indextts");
    } else if (provider === "edge" && tts.edgeVoice) {
      chain.push("edge");
    } else if (provider === "openai" && tts.openai?.baseUrl) {
      chain.push("openai");
    }
  }

  return chain;
}

/*
  主入口：按链路合成语音，成功返回 file:// 音频地址，全部失败返回空串。
*/
async function synthesizeText(text, ttsConfig, options = {}) {
  const cleanText = cleanTextForTts(text);

  if (!cleanText) {
    return "";
  }

  const chain = getTtsChain(ttsConfig);

  if (!chain.length) {
    return "";
  }

  const errors = [];

  for (const provider of chain) {
    if (options.signal?.aborted) {
      throw new Error("本次回复已停止。");
    }

    try {
      if (provider === "indextts") {
        return await synthesizeIndexTts(cleanText, ttsConfig, options);
      }

      if (provider === "edge") {
        return await synthesizeEdgeTts(cleanText, ttsConfig, options);
      }

      if (provider === "openai") {
        return await synthesizeOpenAiTts(cleanText, ttsConfig, options);
      }
    } catch (error) {
      errors.push(`${provider}: ${error?.message || error}`);
    }
  }

  console.warn("TTS 链路全部失败：", errors.join(" | "));
  return "";
}

/* ---------- 共享音频缓存 ---------- */

function cacheAudioBuffer(buffer, ext = ".mp3") {
  const cacheDir = path.join(app.getPath("userData"), AUDIO_CACHE_DIR);

  fs.mkdirSync(cacheDir, { recursive: true });

  const safeExt = /^\.[a-z0-9]{2,5}$/i.test(ext) ? ext : ".mp3";
  const fileName =
    `${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`;
  const outputPath = path.join(cacheDir, fileName);

  fs.writeFileSync(outputPath, buffer);
  return pathToFileURL(outputPath).href;
}

function cleanTextForTts(text) {
  let value = cleanDisplayText(text);

  value = value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (value.length > 360) {
    value = value.slice(0, 360);
  }

  return value;
}

/* ---------- Edge TTS ---------- */

async function synthesizeEdgeTts(text, ttsConfig, options = {}) {
  const config = normalizeTtsConfig(ttsConfig);

  const buffer = await edgeTtsToBuffer(text, {
    voice: config.edgeVoice || "zh-CN-XiaoxiaoNeural",
    rate: config.edgeRate || "+0%",
    pitch: config.edgePitch || "+0Hz",
    volume: config.edgeVolume || "+0%",
    timeoutMs: 60000,
    signal: options.signal
  });

  if (!buffer?.length) {
    throw new Error("Edge TTS 返回空音频。");
  }

  return cacheAudioBuffer(buffer, ".mp3");
}

/* ---------- OpenAI 兼容 TTS ---------- */

async function synthesizeOpenAiTts(text, ttsConfig, options = {}) {
  const config = normalizeTtsConfig(ttsConfig);
  const openai = config.openai || {};
  const baseUrl = normalizeBaseUrl(openai.baseUrl);

  if (!baseUrl) {
    throw new Error("OpenAI 兼容 TTS 服务地址为空。");
  }

  const endpoint = `${baseUrl}/audio/speech`;
  const apiKey = String(openai.apiKey || "").trim();
  const responseFormat = openai.responseFormat || "mp3";
  const body = {
    model: openai.model || "tts-1",
    input: text,
    voice: openai.voice || "alloy",
    response_format: responseFormat,
    speed: Number(openai.speed) || 1
  };

  const headers = {
    "Content-Type": "application/json"
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers,
    signal: options.signal,
    body: JSON.stringify(body)
  }, 60000);

  if (!response.ok) {
    throw new Error(
      `OpenAI 兼容 TTS 请求失败：${response.status} ${await response.text()}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length) {
    throw new Error("OpenAI 兼容 TTS 返回空音频。");
  }

  const ext = responseFormat === "wav"
    ? ".wav"
    : responseFormat === "opus"
      ? ".ogg"
      : ".mp3";

  return cacheAudioBuffer(buffer, ext);
}

/* ---------- IndexTTS2（本地 Gradio） ---------- */

async function synthesizeIndexTts(text, ttsConfig, options = {}) {
  return runIndexTtsSerial(() =>
    synthesizeIndexTtsUnlocked(text, ttsConfig, options)
  );
}

function runIndexTtsSerial(task) {
  const run = ttsSerialQueue.then(task, task);

  ttsSerialQueue = run.catch(() => {});

  return run;
}

async function synthesizeIndexTtsUnlocked(text, ttsConfig, options = {}) {
  const config = normalizeTtsConfig(ttsConfig);
  const cleanText = cleanTextForTts(text);

  if (!config.enabled || !config.referencePath || !cleanText) {
    return "";
  }

  const baseUrl = normalizeBaseUrl(config.baseUrl);

  if (!baseUrl) {
    throw new Error("IndexTTS2 服务地址为空。");
  }

  if (!fs.existsSync(config.referencePath)) {
    throw new Error("参考音频文件不存在，请重新选择。");
  }

  const previousAudioPath = await getLatestIndexTtsAudioPath(baseUrl);
  const prompt = await uploadGradioFile(baseUrl, config.referencePath);

  let emotionReference = null;

  if (
    config.emoMethod === "使用情感参考音频" &&
    config.emoReferencePath
  ) {
    if (!fs.existsSync(config.emoReferencePath)) {
      throw new Error("情感参考音频文件不存在，请重新选择。");
    }

    emotionReference = await uploadGradioFile(
      baseUrl,
      config.emoReferencePath
    );
  }

  const submitData = buildIndexTtsSubmitData(
    cleanText,
    config,
    prompt,
    emotionReference
  );

  const submitResponse = await fetchWithTimeout(
    `${baseUrl}/gradio_api/run/submit_task`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: options.signal,
      body: JSON.stringify({
        data: submitData
      })
    },
    30000
  );

  const submitResult = await readJsonResponseSafely(submitResponse);

  if (!submitResponse.ok) {
    throw new Error(
      `IndexTTS2 任务提交失败：${submitResponse.status} ${JSON.stringify(submitResult)}`
    );
  }

  if (submitResult?.error) {
    throw new Error(
      `IndexTTS2 任务提交失败：${String(submitResult.error)}`
    );
  }

  const startedAt = Date.now();
  const timeout = 240000;
  let lastStatus = "";

  while (Date.now() - startedAt < timeout) {
    if (options.signal?.aborted) {
      throw new Error("本次回复已停止。");
    }

    await sleep(900);

    const refreshData = await refreshIndexTtsUi(baseUrl);

    if (refreshData?.error) {
      throw new Error(
        `IndexTTS2 任务执行失败：${String(refreshData.error)}`
      );
    }

    const data = Array.isArray(refreshData?.data)
      ? refreshData.data
      : [];

    const statusText = data
      .slice(0, 3)
      .filter((item) => typeof item === "string")
      .join(" ");

    if (statusText && statusText !== lastStatus) {
      lastStatus = statusText;
      console.log("IndexTTS2 状态：", lastStatus);
    }

    const audioFile = extractAudioFileFromRefresh(refreshData);
    const audioPath = getAudioFileIdentity(audioFile);

    if (!audioPath) {
      continue;
    }

    if (previousAudioPath && audioPath === previousAudioPath) {
      continue;
    }

    return cacheIndexTtsAudio(audioFile, baseUrl);
  }

  throw new Error(
    lastStatus
      ? `IndexTTS2 生成超时。最后状态：${lastStatus}`
      : "IndexTTS2 生成超时。"
  );
}

async function refreshIndexTtsUi(baseUrl) {
  const response = await fetchWithTimeout(
    `${baseUrl}/gradio_api/run/refresh_ui`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        data: [null]
      })
    },
    15000
  );

  const data = await readJsonResponseSafely(response);

  if (!response.ok && !data?.data) {
    throw new Error(
      `IndexTTS2 刷新状态失败：${response.status} ${JSON.stringify(data)}`
    );
  }

  return data || {};
}

async function readJsonResponseSafely(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text
    };
  }
}

async function getLatestIndexTtsAudioPath(baseUrl) {
  try {
    const refreshData = await refreshIndexTtsUi(baseUrl);
    const audioFile = extractAudioFileFromRefresh(refreshData);

    return getAudioFileIdentity(audioFile);
  } catch (error) {
    console.warn("读取 IndexTTS2 当前最近音频失败，继续提交新任务：", error);
    return "";
  }
}

function extractAudioFileFromRefresh(refreshData) {
  const data = Array.isArray(refreshData?.data)
    ? refreshData.data
    : [];

  return findFileData(data[3]) || findFileData(refreshData);
}

function getAudioFileIdentity(fileData) {
  if (!fileData) {
    return "";
  }

  const pathValue =
    fileData.path ||
    fileData.name ||
    fileData.url ||
    "";

  return String(pathValue)
    .replace(/\\/g, "/")
    .trim();
}

function buildIndexTtsSubmitData(
  text,
  config,
  prompt,
  emotionReference
) {
  const noPresetVoice = "---预设音色列表---";

  const data = [
    false,
    false,
    null,
    config.emoMethod,
    prompt,
    text,
    emotionReference,
    0.65,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    config.emoText || "",
    config.speed,
    false,
    120,
    true,
    0.8,
    30,
    0.8,
    0,
    3,
    10,
    1500
  ];

  for (let index = 0; index < 8; index++) {
    data.push("", noPresetVoice, 1);
  }

  return data;
}

async function uploadGradioFile(baseUrl, filePath) {
  const buffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const mimeType = getMimeTypeForAudio(filePath);

  const form = new FormData();
  const blob = new Blob([buffer], {
    type: mimeType
  });

  form.append("files", blob, fileName);

  const response = await fetchWithTimeout(
    `${baseUrl}/gradio_api/upload`,
    {
      method: "POST",
      body: form
    },
    30000
  );

  if (!response.ok) {
    throw new Error(
      `参考音频上传失败：${response.status} ${await response.text()}`
    );
  }

  const result = await response.json();
  const uploadedPath = extractUploadedFilePath(result);

  if (!uploadedPath) {
    throw new Error(
      `参考音频上传失败：服务未返回文件路径。${JSON.stringify(result)}`
    );
  }

  return {
    path: uploadedPath,
    meta: {
      _type: "gradio.FileData"
    },
    orig_name: fileName
  };
}

function extractUploadedFilePath(value) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractUploadedFilePath(item);

      if (found) {
        return found;
      }
    }

    return "";
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  if (typeof value.path === "string") {
    return value.path;
  }

  if (typeof value.name === "string") {
    return value.name;
  }

  for (const item of Object.values(value)) {
    const found = extractUploadedFilePath(item);

    if (found) {
      return found;
    }
  }

  return "";
}

function getMimeTypeForAudio(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".flac") return "audio/flac";
  if (ext === ".m4a") return "audio/mp4";

  return "audio/wav";
}

function findFileData(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    if (/\.(wav|mp3|ogg|m4a|flac)(\?|$)/i.test(value)) {
      return {
        path: value
      };
    }

    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFileData(item);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  if (value.__type__ === "update" && value.value) {
    const found = findFileData(value.value);

    if (found) {
      return found;
    }
  }

  const pathValue =
    typeof value.path === "string"
      ? value.path
      : typeof value.name === "string"
        ? value.name
        : "";

  const urlValue =
    typeof value.url === "string"
      ? value.url
      : "";

  if (
    pathValue &&
    (
      urlValue ||
      /\.(wav|mp3|ogg|m4a|flac)(\?|$)/i.test(pathValue)
    )
  ) {
    return {
      ...value,
      path: pathValue,
      url: urlValue
    };
  }

  for (const item of Object.values(value)) {
    const found = findFileData(item);

    if (found) {
      return found;
    }
  }

  return null;
}

async function cacheIndexTtsAudio(fileData, baseUrl) {
  let sourceUrl = fileData.url || "";

  if (!sourceUrl && fileData.path) {
    const pathValue = String(fileData.path)
      .replace(/\\/g, "/");

    sourceUrl =
      `${baseUrl}/gradio_api/file=` +
      encodeURI(pathValue);
  }

  if (!sourceUrl) {
    throw new Error("IndexTTS2 未返回音频地址。");
  }

  if (!/^https?:\/\//i.test(sourceUrl)) {
    sourceUrl = new URL(
      sourceUrl,
      `${baseUrl}/`
    ).href;
  }

  const response = await fetchWithTimeout(sourceUrl, {}, 30000);

  if (!response.ok) {
    throw new Error(
      `语音文件读取失败：${response.status} ${await response.text()}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const sourceName =
    fileData.orig_name ||
    path.basename(String(fileData.path || "")) ||
    "voice.wav";
  const ext =
    path.extname(sourceName) ||
    guessAudioExtension(fileData.mime_type) ||
    ".wav";

  return cacheAudioBuffer(buffer, ext);
}

function guessAudioExtension(mime) {
  const value = String(mime || "").toLowerCase();

  if (value.includes("mpeg") || value.includes("mp3")) {
    return ".mp3";
  }

  if (value.includes("ogg")) {
    return ".ogg";
  }

  if (value.includes("flac")) {
    return ".flac";
  }

  if (value.includes("wav")) {
    return ".wav";
  }

  return "";
}

module.exports = {
  AUDIO_CACHE_DIR,
  isTtsConfigured,
  getTtsChain,
  synthesizeText,
  cacheAudioBuffer,
  cleanTextForTts,
  synthesizeEdgeTts,
  synthesizeOpenAiTts,
  synthesizeIndexTts,
  runIndexTtsSerial,
  synthesizeIndexTtsUnlocked,
  refreshIndexTtsUi,
  readJsonResponseSafely,
  getLatestIndexTtsAudioPath,
  extractAudioFileFromRefresh,
  getAudioFileIdentity,
  buildIndexTtsSubmitData,
  uploadGradioFile,
  extractUploadedFilePath,
  getMimeTypeForAudio,
  findFileData,
  cacheIndexTtsAudio,
  guessAudioExtension
};
