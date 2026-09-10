/*
  perception.js —— 屏幕感知（她的眼睛）

  自动观察前台窗口：
  - 每 N 秒读一次窗口标题 / 句柄（N 由"感知频率"决定）
  - 定时截取前台窗口低清缩略图，用 Windows 本地 OCR 读文字
  - 识别"切换窗口 / 内容变化 / 长时间停留"等事件
  - 截图只存在内存和临时文件里，OCR 完立刻删除，不写入任何长期存储

  事件交给 main.js 决定要不要反应（快速短句 / AI 主动接话）。
*/

const fs = require("fs");
const path = require("path");
const { app, desktopCapturer } = require("electron");
const { execFile } = require("child_process");
const { getAiConfig } = require("./ai-config.js");
const {
  getForegroundWindowInfo,
  getCachedForegroundWindowInfo
} = require("./activity.js");
const { getMoodState } = require("./mood.js");

const OCR_TEMP_PREFIX = "pet-ocr-";
const MIN_OCR_INTERVAL_MS = 30000;
const WINDOW_SETTLE_MS = 5000;
const MONITOR_START_DELAY_MS = 30000;

const sceneState = {
  hwnd: 0,
  title: "",
  ocrText: "",
  textHash: "",
  startedAt: 0,
  lastCaptureAt: 0
};

const reactionCooldowns = {};

let monitorTimer = null;
let monitorStartTimer = null;
let lastTickAt = 0;
let lastOcrAt = 0;
let perceptionInFlight = false;
let monitorGeneration = 0;

function getPerceptionConfig() {
  return getAiConfig().perception || {
    enabled: true,
    captureIntervalSec: 5,
    deepChatReading: true
  };
}

function isOwnWindow(title) {
  const value = String(title || "");

  return (
    /^(AI 伴侣 · AI Companion|AI 伴侣设置|AI 伴侣 · 设置|设置 · AI 伴侣)$/.test(value) ||
    /Live2D Pet|Pet Panel|Chat|白希/.test(value) &&
    /pet|live2d/i.test(value)
  );
}

/*
  纯函数：对比上一次与这一次的场景，返回事件或 null。
  便于单元测试。
*/
function detectSceneChange(prev, next, now) {
  if (!next || !String(next.title || "").trim()) {
    return null;
  }

  const titleChanged =
    !prev ||
    Number(prev.hwnd || 0) !== Number(next.hwnd || 0) ||
    String(prev.title || "") !== String(next.title || "");

  if (titleChanged) {
    return {
      type: "app_switch",
      app: String(next.title || "").slice(0, 40),
      title: String(next.title || ""),
      text: String(next.ocrText || "").slice(0, 120)
    };
  }

  const diffRatio = textDiffRatio(prev.ocrText, next.ocrText);

  if (
    diffRatio > 0.38 &&
    String(next.ocrText || "").trim().length >= 10 &&
    now - Number(prev.lastCaptureAt || 0) > 8000
  ) {
    return {
      type: "content_change",
      app: String(next.title || "").slice(0, 40),
      text: String(next.ocrText || "").slice(0, 120)
    };
  }

  if (
    now - Number(prev.startedAt || 0) > 25 * 60 * 1000 &&
    now - Number(prev.lastLongSessionAt || 0) > 40 * 60 * 1000
  ) {
    return {
      type: "long_session",
      app: String(next.title || "").slice(0, 40),
      text: String(next.ocrText || "").slice(0, 80)
    };
  }

  return null;
}

function textDiffRatio(before, after) {
  const a = new Set(String(before || "").replace(/\s+/g, ""));
  const b = new Set(String(after || "").replace(/\s+/g, ""));

  if (!a.size && !b.size) {
    return 0;
  }

  let same = 0;

  for (const char of b) {
    if (a.has(char)) {
      same += 1;
    }
  }

  return 1 - same / Math.max(a.size, b.size);
}

/*
  截图 + 本地 OCR：返回 { title, ocrText, hwnd }。
  任何一步失败都优雅降级（标题仍可用）。
*/
async function captureForegroundInfo(options = {}) {
  const base = options.baseInfo || await getForegroundWindowInfo();
  const hwnd = Number(base.hwnd || 0);
  let ocrText = "";
  let tempFile = "";

  if (!hwnd || options.skipOcr || isOwnWindow(base.title)) {
    return {
      title: base.title || "",
      ocrText: "",
      hwnd
    };
  }

  try {
    const sources = await desktopCapturer.getSources({
      types: ["window"],
      thumbnailSize: { width: 640, height: 400 },
      fetchWindowIcons: false
    });
    const source = sources.find((item) =>
      item.id === `window:${hwnd}` || item.id.startsWith(`window:${hwnd}:`)
    );

    if (source && !source.thumbnail.isEmpty()) {
      tempFile = path.join(
        app.getPath("temp"),
        `${OCR_TEMP_PREFIX}${Date.now()}.png`
      );
      await fs.promises.writeFile(tempFile, source.thumbnail.toPNG());
      ocrText = await runLocalOcr(tempFile);
    }
  } catch (error) {
    console.warn("屏幕感知截图失败：", error?.message || error);
  } finally {
    if (tempFile) {
      try {
        await fs.promises.unlink(tempFile);
      } catch {}
    }
  }

  return {
    title: base.title || "",
    ocrText: String(ocrText || "").replace(/\s+/g, " ").trim().slice(0, 400),
    hwnd
  };
}

/*
  Windows 内置 OCR（本地，不上传）。
  需要系统装有对应语言包（中文系统默认支持中文）。
*/
function runLocalOcr(imagePath) {
  return new Promise((resolve) => {
    const script = `
$path = $args[0]
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics,ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
try {
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if ($null -eq $engine) { Write-Output ""; exit 0 }
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output $result.Text
} catch {
  Write-Output ""
}
`;

    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script, imagePath],
      { timeout: 15000, windowsHide: true, encoding: "utf8" },
      (error, stdout) => {
        if (error) {
          resolve("");
          return;
        }

        resolve(String(stdout || "").trim());
      }
    );
  });
}

/*
  是否值得对事件做出反应。
  intensity：quiet / normal / lively；mood 影响概率；深夜自动安静。
*/
function shouldReactToEvent(event, options = {}) {
  const now = Date.now();
  const config = options.perception || getPerceptionConfig();
  const intensity = options.intensity || "normal";
  const mood = options.mood ?? getMoodState().value;
  const hour = new Date().getHours();
  const type = event?.type || "";

  if (!config.enabled) {
    return false;
  }

  const cooldownMs = {
    app_switch: 18 * 60 * 1000,
    content_change: 30 * 60 * 1000,
    long_session: 45 * 60 * 1000
  }[type] || 30 * 60 * 1000;

  if (now - (reactionCooldowns[type] || 0) < cooldownMs) {
    return false;
  }

  const isNight = hour >= 23 || hour < 6;

  if (isNight && type === "content_change") {
    return false;
  }

  const intensityFactor = {
    quiet: 0.3,
    normal: 1,
    lively: 1.6
  }[intensity] || 1;

  const moodFactor = mood >= 4 ? 1.3 : (mood <= -4 ? 0.6 : 1);
  const baseChance = type === "app_switch" ? 0.5 : 0.28;
  const chance = Math.min(0.85, baseChance * intensityFactor * moodFactor);

  if (Math.random() >= chance) {
    return false;
  }

  reactionCooldowns[type] = now;
  return true;
}

/*
  感知主循环：定时捕获前台窗口、检测变化、回调事件。
*/
async function tickPerception(handlers = {}) {
  const config = getPerceptionConfig();

  if (!config.enabled) {
    return;
  }

  const now = Date.now();

  const intervalMs = Math.max(1000, (Number(config.captureIntervalSec) || 5) * 1000);

  if (now - lastTickAt < intervalMs) {
    return;
  }

  // OCR 可能超过一个周期，同一时间只保留一条截图 / OCR 链路。
  if (perceptionInFlight) {
    return;
  }

  lastTickAt = now;
  perceptionInFlight = true;
  const generation = monitorGeneration;

  try {
    // 切窗仅使用标题，等新窗口稳定后再读取文字。
    let base =
      getCachedForegroundWindowInfo() || await getForegroundWindowInfo();
    let titleChanged =
      Number(sceneState.hwnd || 0) !== Number(base.hwnd || 0) ||
      String(sceneState.title || "") !== String(base.title || "");
    let readOcr = config.deepChatReading !== false &&
      !titleChanged && !isOwnWindow(base.title) &&
      now - Number(sceneState.startedAt || 0) >= WINDOW_SETTLE_MS &&
      (!lastOcrAt || now - lastOcrAt >= Math.max(MIN_OCR_INTERVAL_MS, intervalMs));

    if (readOcr) {
      // 活动快照最长可复用 8 秒；真正截图前再次核实当前前台。
      base = await getForegroundWindowInfo();
      titleChanged =
        Number(sceneState.hwnd || 0) !== Number(base.hwnd || 0) ||
        String(sceneState.title || "") !== String(base.title || "");
      readOcr = !titleChanged && Boolean(base.hwnd) && !isOwnWindow(base.title);
    }

    const captureConfig = getPerceptionConfig();

    if (generation !== monitorGeneration || !captureConfig.enabled) {
      return;
    }

    readOcr = readOcr && captureConfig.deepChatReading !== false;

    if (readOcr) {
      // 失败也降频，避免不支持 OCR 的系统反复拉起 PowerShell。
      lastOcrAt = Date.now();
    }

    const info = await captureForegroundInfo({
      baseInfo: base,
      skipOcr: !readOcr
    });

    const latestConfig = getPerceptionConfig();

    if (generation !== monitorGeneration || !latestConfig.enabled ||
        (!info.title && !info.ocrText)) {
      return;
    }

    if (latestConfig.deepChatReading === false) {
      // 读取期间关掉深度阅读，也不能把迟到的 OCR 内容用于场景或事件。
      info.ocrText = "";
      readOcr = false;
      sceneState.lastCaptureAt = 0;
    } else if (!readOcr && !titleChanged) {
      info.ocrText = sceneState.ocrText;
    }

    const event = detectSceneChange(sceneState, info, now);

    if (titleChanged) {
      sceneState.startedAt = now;
      sceneState.lastLongSessionAt = now;
      sceneState.lastCaptureAt = 0;
    }

    sceneState.hwnd = info.hwnd;
    sceneState.title = info.title;
    sceneState.ocrText = info.ocrText;

    if (readOcr) {
      sceneState.lastCaptureAt = now;
    }

    if (event?.type === "long_session") {
      sceneState.lastLongSessionAt = now;
    }

    if (event && typeof handlers.onEvent === "function") {
      await handlers.onEvent(event, { ...sceneState });
    }
  } finally {
    perceptionInFlight = false;
  }
}

function startPerceptionMonitor(handlers = {}) {
  stopPerceptionMonitor();
  lastTickAt = 0;
  const generation = monitorGeneration;
  const runTick = () => {
    if (generation !== monitorGeneration) {
      return;
    }

    tickPerception(handlers).catch((error) => {
      console.warn("屏幕感知暂时不可用：", error?.message || error);
    });
  };

  // 避开 Live2D 模型和四个窗口同时初始化的启动高峰。
  monitorStartTimer = setTimeout(() => {
    monitorStartTimer = null;
    if (generation !== monitorGeneration) {
      return;
    }
    runTick();
    monitorTimer = setInterval(runTick, 2500);
  }, MONITOR_START_DELAY_MS);
}

function stopPerceptionMonitor() {
  monitorGeneration += 1;
  clearTimeout(monitorStartTimer);
  monitorStartTimer = null;
  clearInterval(monitorTimer);
  monitorTimer = null;
}

function resetReactionCooldowns() {
  for (const key of Object.keys(reactionCooldowns)) {
    delete reactionCooldowns[key];
  }
}

module.exports = {
  sceneState,
  getPerceptionConfig,
  isOwnWindow,
  detectSceneChange,
  textDiffRatio,
  captureForegroundInfo,
  runLocalOcr,
  shouldReactToEvent,
  tickPerception,
  startPerceptionMonitor,
  stopPerceptionMonitor,
  resetReactionCooldowns
};
