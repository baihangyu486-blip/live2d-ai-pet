/*
  screen-capture.js —— 屏幕源、截图隐身

  从 main.js 拆出的桌面捕获能力，加上"识别到截图/录屏应用时自动隐身"。
*/

const { desktopCapturer } = require("electron");

const CAPTURE_APP_PATTERN = new RegExp(
  [
    "OBS Studio",
    "obs64",
    "Bandicam",
    "bdcam",
    "NVIDIA ShadowPlay",
    "GeForce Experience",
    "Xbox Game Bar",
    "GameBar",
    "Snipping Tool",
    "截图工具",
    "截图和草图",
    "Snipaste",
    "ShareX",
    "FastStone Capture",
    "PicPick",
    "ScreenToGif",
    "Fraps",
    "Streamlabs",
    "XSplit",
    "Camtasia",
    "Loom",
    "Clipchamp",
    "Captura",
    "OBS",
    "录屏",
    "屏幕录制",
    "视频录制"
  ].join("|"),
  "i"
);

function isCaptureAppActive(title) {
  const value = String(title || "");

  if (!value) {
    return false;
  }

  if (/微信截图|QQ截图|WeChat.*截图|剪贴板截图/.test(value)) {
    return true;
  }

  return CAPTURE_APP_PATTERN.test(value);
}

async function getScreenSources() {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 360, height: 203 },
    fetchWindowIcons: false
  });

  return sources
    .map((source) => {
      const capture = getScreenCaptureState(source.thumbnail);

      return {
        id: source.id,
        name: source.name,
        kind: source.id.startsWith("screen:") ? "screen" : "window",
        thumbnail: source.thumbnail.toDataURL(),
        available: capture.available,
        unavailableReason: capture.reason
      };
    })
    .filter((source) => source.available)
    .sort((left, right) => {
      if (left.available !== right.available) {
        return left.available ? -1 : 1;
      }

      if (left.kind !== right.kind) {
        return left.kind === "screen" ? -1 : 1;
      }

      return left.name.localeCompare(right.name, "zh-CN");
    })
    .slice(0, 12);
}

async function captureScreenSource(sourceId) {
  const id = String(sourceId || "");
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 1600, height: 900 },
    fetchWindowIcons: false
  });
  const source = sources.find((item) => item.id === id);

  if (!source || source.thumbnail.isEmpty()) {
    throw new Error("无法获取该屏幕或窗口，请重新选择。");
  }

  const capture = getScreenCaptureState(source.thumbnail);

  if (!capture.available) {
    throw new Error(
      "该窗口当前只能获取黑屏，Windows 未提供可读取的画面。请改选整个屏幕，或让目标窗口保持可见后刷新重试。"
    );
  }

  return {
    name: `屏幕快照 - ${source.name}`,
    mime: "image/png",
    dataUrl: source.thumbnail.toDataURL(),
    source: "screen"
  };
}

function getScreenCaptureState(thumbnail) {
  if (!thumbnail || thumbnail.isEmpty()) {
    return {
      available: false,
      reason: "无法获取画面"
    };
  }

  const { width, height } = thumbnail.getSize();
  const bitmap = thumbnail.toBitmap();

  if (!width || !height || !bitmap?.length) {
    return {
      available: false,
      reason: "无法获取画面"
    };
  }

  const sampleStep = Math.max(1, Math.floor(Math.sqrt((width * height) / 900)));
  let sampleCount = 0;
  let nearlyBlackCount = 0;
  let minBrightness = 255;
  let maxBrightness = 0;

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const offset = (y * width + x) * 4;
      const brightness = Math.max(
        bitmap[offset],
        bitmap[offset + 1],
        bitmap[offset + 2]
      );

      sampleCount += 1;
      minBrightness = Math.min(minBrightness, brightness);
      maxBrightness = Math.max(maxBrightness, brightness);

      if (brightness <= 8) {
        nearlyBlackCount += 1;
      }
    }
  }

  const looksLikeBlackFrame =
    sampleCount && nearlyBlackCount / sampleCount >= 0.992;
  const looksLikeFlatPlaceholder =
    sampleCount >= 50 && maxBrightness - minBrightness <= 6;

  if (looksLikeBlackFrame || looksLikeFlatPlaceholder) {
    return {
      available: false,
      reason: "此窗口没有可读取的画面，请选择整个屏幕"
    };
  }

  return {
    available: true,
    reason: ""
  };
}

module.exports = {
  CAPTURE_APP_PATTERN,
  isCaptureAppActive,
  getScreenSources,
  captureScreenSource,
  getScreenCaptureState
};
