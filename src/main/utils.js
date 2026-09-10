/*
  utils.js —— 纯工具函数（文本清理、ID、随机、限幅、估算等）
  从 main.js 拆分出的独立模块。
*/


const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function splitKeywords(value) {
  return String(value || "")
    .split(/[,，;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isImageFile(fileName) {
  return /\.(png|jpg|jpeg|webp|gif)$/i.test(
    String(fileName || "")
  );
}

function shuffleArray(items) {
  for (let index = items.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(
      Math.random() * (index + 1)
    );

    [items[index], items[swapIndex]] = [
      items[swapIndex],
      items[index]
    ];
  }

  return items;
}

function pickRandom(list) {
  if (!Array.isArray(list) || !list.length) {
    return "";
  }

  return list[Math.floor(Math.random() * list.length)];
}

function estimateVoiceDuration(text) {
  const value = String(text || "").trim();

  if (!value) {
    return 2;
  }

  return Math.max(
    2,
    Math.min(60, Math.ceil(value.length / 4.5))
  );
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(16)
    .slice(2)}`;
}

function clampNumber(value, min, max) {
  return Math.max(
    min,
    Math.min(max, Number(value || 0))
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeout = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const externalSignal = options.signal;
  const abortFromCaller = () => controller.abort();

  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener("abort", abortFromCaller, {
      once: true
    });
  }

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      if (externalSignal?.aborted) {
        throw new Error("本次回复已停止。");
      }

      throw new Error("请求超时，请检查服务是否正在运行后重试。");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

function cleanDisplayText(text) {
  let value = String(text || "").trim();

  /*
    清理开头动作、旁白和人物叙述。
    再清理明显的句中舞台动作，保证聊天、气泡、TTS
    都是直接说话内容。
  */
  value = value.replace(
    /^\s*[（(][^（）()]{0,120}[）)]\s*/g,
    ""
  );

  value = value.replace(
    /^\s*\*[^*]{0,120}\*\s*/g,
    ""
  );

  value = value.replace(
    /^\s*【[^】]{0,120}】\s*/g,
    ""
  );

  value = value.replace(
    /^(白希|她|少女)?\s*(轻声|小声|害羞地|认真地|温柔地|笑着|鼓起脸颊|扭过头去|眨了眨眼|低下头)?\s*(说|说道|开口|嘀咕)[:：]\s*/g,
    ""
  );

  value = value
    .replace(
      /[（(](?:轻声|小声|害羞地|认真地|温柔地|笑着|鼓起脸颊|扭过头去|眨了眨眼|低下头|脸红|叹气|沉默|内心)[^）)]{0,50}[）)]/g,
      ""
    )
    .replace(
      /\*(?:轻声|小声|害羞地|认真地|温柔地|笑着|鼓起脸颊|扭过头去|眨了眨眼|低下头|脸红)[^*]{0,50}\*/g,
      ""
    )
    .replace(
      /(?:白希|她)\s*(?:轻声|小声|害羞地|认真地|温柔地|笑着)?\s*(?:说|说道|开口|嘀咕)[。:：]?/g,
      ""
    )
    .replace(/^\s*(内心|旁白)[:：].*$/gm, "")

    /*
      去掉图片/表情包相关出戏句式。
      这些内容不能进入聊天框、桌面气泡或 TTS。
    */
    .replace(
      /^(我看到|我看到了|我注意到|我理解|我明白)(你发的)?(这张|这个)?(图片|表情包)[，,。.\s]*/u,
      ""
    )
    .replace(
      /^(这张图片|图片里|这个表情包|表情包)(表达了|看起来是|显示|说明|传达了)[^。！？!?]*[。！？!?]?\s*/u,
      ""
    )
    .replace(
      /^(根据|从)(图片|表情包)(内容)?(来看|判断)[，,。.\s]*/u,
      ""
    )
    .replace(
      /图片只作为聊天语境参考[^。！？!?]*[。！？!?]?\s*/gu,
      ""
    )
    .replace(
      /不要在回复里说[^。！？!?]*[。！？!?]?\s*/gu,
      ""
    )
    .replace(
      /我正在识别[^。！？!?]*[。！？!?]?\s*/gu,
      ""
    )
    .replace(
      /内部\s*JSON|type|emotion|系统提示|功能说明/giu,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

  return value;
}

function isSafeImageDataUrl(dataUrl) {
  const value = String(dataUrl || "");
  return /^data:image\/(png|jpeg|webp|gif);base64,/i.test(value) &&
    Buffer.byteLength(value, "utf8") <= Math.ceil(MAX_IMAGE_BYTES * 1.37);
}

module.exports = {
  MAX_IMAGE_BYTES,
  splitKeywords,
  isImageFile,
  shuffleArray,
  pickRandom,
  estimateVoiceDuration,
  createId,
  clampNumber,
  sleep,
  fetchWithTimeout,
  cleanDisplayText,
  isSafeImageDataUrl
};
