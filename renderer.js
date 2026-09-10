const canvas = document.getElementById("live2d-canvas");
const panelButton = document.getElementById("panel-button");
const petHitArea = document.getElementById("pet-hit-area");
const modelLoadError = document.getElementById("model-load-error");

let live2dModel = null;

let modelPath = "";
let modelGeneration = 0;
let availableExpressionFiles = new Set();

let modelScale = 0.048;

let isDraggingPet = false;
let isSpeaking = false;
let isThinking = false;
let isPoseTransition = false;
let dragReleaseTime = 0;
let aiEmotionTimer = null;
let neutralFallTimer = null;
let idleMotionTimer = null;
let initiativeNoticeTimer = null;

/*
  音频驱动口型：chat.js 播放语音时按真实音量回传。
*/
let mouthLevel = 0;
let mouthLevelAt = 0;

let naturalTime = 0;
let lastVisualBoundsReportAt = 0;
let interactionSoftTimer = null;
let lastCursorMoveAt = Date.now();
let isDozing = false;
let lastCursorPos = null;

/*
  当前 renderer.js 不再负责 JS 拖动窗口。

  稳定方案：
  - 人物全身：短按互动；
  - 窗口拖动：index.html 中 #pet-native-drag-zone 使用 -webkit-app-region: drag；
  - 不再通过 pointermove + IPC + main.js setPosition 高频移动透明窗口。
*/

const emotionState = {
  current: "neutral",
  until: 0,
  lastSwitchAt: 0,
  lastAppliedFile: "",
  lastEmotionAt: 0
};

let speakingMotion = {
  mouth: 0,
  body: 0,
  angle: 0
};

let lookCurrent = {
  angleX: 0,
  angleY: 0,
  angleZ: 0,
  eyeX: 0,
  eyeY: 0,
  bodyX: 0,
  bodyY: 0,
  bodyZ: 0
};

let lookTarget = {
  angleX: 0,
  angleY: 0,
  angleZ: 0,
  eyeX: 0,
  eyeY: 0,
  bodyX: 0,
  bodyY: 0,
  bodyZ: 0
};

const originalParamValues = new Map();

let activeFaceFile = null;
let activePoseFile = null;
const activeLookFiles = new Set();
let savedVisualState = null;
let expressionTransitionToken = 0;

const EXCLUSIVE_LOOK_FILES = new Set([
  "短发.exp3.json",
  "双马尾短加后发.exp3.json",
  "丸子头.exp3.json",
  "长双马尾.exp3.json",
  "长双马尾加后发.exp3.json"
]);

const emotionFaceMap = {
  happy: ["星星眼.exp3.json", "耶.exp3.json"],
  love: ["爱心眼.exp3.json", "比心.exp3.json"],
  shy: ["wink.exp3.json", "爱心眼.exp3.json"],
  angry: ["生气.exp3.json", "烦躁.exp3.json", "嫌弃.exp3.json"],
  sad: ["哭.exp3.json", "去眼部高光.exp3.json"],
  confused: ["问号.exp3.json", "晕晕.exp3.json"],
  comfort: ["wink.exp3.json", "比心.exp3.json"],
  neutral: []
};

const emotionStrength = {
  love: 3,
  happy: 2,
  shy: 2,
  comfort: 2,
  angry: 3,
  sad: 3,
  confused: 1,
  neutral: 0
};

const emotionDuration = {
  love: 5200,
  happy: 4300,
  shy: 4500,
  comfort: 5000,
  angry: 4400,
  sad: 5200,
  confused: 3600,
  neutral: 2600
};

let pixiApp = null;

function getPixiApp() {
  if (!pixiApp) {
    pixiApp = new PIXI.Application({
      view: canvas,
      autoStart: false,
      resizeTo: window,
      transparent: true,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2.5),
      powerPreference: "high-performance"
    });
    PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.LINEAR;
    PIXI.settings.ROUND_PIXELS = false;
  }
  return pixiApp;
}

function setModelVisible(visible) {
  for (const element of [canvas, panelButton, petHitArea, document.getElementById("pet-native-drag-zone")]) {
    if (element) element.style.display = visible ? "" : "none";
  }
  if (!visible) {
    const indicator = document.getElementById("thinking-indicator");
    if (indicator) indicator.style.opacity = "0";
  }
}

setModelVisible(false);

panelButton.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  window.petAPI?.toggleChat?.();
});

panelButton.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  event.stopPropagation();
  window.petAPI?.togglePanel?.();
});

installPetPointerControls();

if (window.petAPI) {
  window.petAPI.onInitSettings(async (settings) => {
    if (settings && settings.scale) {
      modelScale = settings.scale;

      if (live2dModel) {
        applyNaturalTransform();
        updateModelPosition();
      }
    }

    await reloadLive2DModel(settings?.modelFileUrl, settings?.expressionFiles, settings?.visualState);
  });

  window.petAPI.onCursorScreenPoint((data) => {
    updateLookTargetFromScreen(data);
  });

  window.petAPI.onPetCommand(handlePanelCommand);
}

function installPetPointerControls() {
  if (!petHitArea) {
    return;
  }

  petHitArea.addEventListener("click", handlePetShortClick);
  petHitArea.addEventListener("pointermove", updatePetPointerCursor);
  petHitArea.addEventListener("pointerleave", () => {
    petHitArea.classList.remove("pet-interactive");
  });
}

function updatePetPointerCursor(event) {
  if (!petHitArea) {
    return;
  }

  const insidePet = isPointInsidePet(event.clientX, event.clientY);

  petHitArea.classList.toggle("pet-interactive", insidePet);
}

function isPanelButtonTarget(target) {
  return Boolean(
    target &&
    typeof target.closest === "function" &&
    target.closest("#panel-button")
  );
}

function getCurrentModelBounds() {
  if (!live2dModel) {
    return null;
  }

  try {
    const bounds = live2dModel.getBounds();

    if (
      !Number.isFinite(bounds.x) ||
      !Number.isFinite(bounds.y) ||
      !Number.isFinite(bounds.width) ||
      !Number.isFinite(bounds.height) ||
      bounds.width < 20 ||
      bounds.height < 20
    ) {
      return null;
    }

    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    };
  } catch (error) {
    return null;
  }
}

function isPointInsideRect(x, y, rect, padding = 0) {
  if (!rect) {
    return false;
  }

  return (
    x >= rect.x - padding &&
    x <= rect.x + rect.width + padding &&
    y >= rect.y - padding &&
    y <= rect.y + rect.height + padding
  );
}

function isPointInsidePet(clientX, clientY) {
  return isPointInsideRect(
    clientX,
    clientY,
    getCurrentModelBounds(),
    2
  );
}

function getPetInteractionArea(clientX, clientY, bounds) {
  if (!bounds || !isPointInsideRect(clientX, clientY, bounds, 2)) {
    return "body";
  }

  const x = clamp(
    (clientX - bounds.x) / bounds.width,
    0,
    1
  );

  const y = clamp(
    (clientY - bounds.y) / bounds.height,
    0,
    1
  );

  if (
    y >= 0.24 &&
    y <= 0.70 &&
    (x <= 0.23 || x >= 0.77)
  ) {
    return "hand";
  }

  if (y < 0.19) {
    return "head";
  }

  if (
    y < 0.42 &&
    x >= 0.27 &&
    x <= 0.73
  ) {
    return "face";
  }

  if (y < 0.46) {
    return "head";
  }

  if (y < 0.62) {
    return "body";
  }

  if (y < 0.78) {
    return "waist";
  }

  return "leg";
}

/*
  人物全身只处理短按互动。

  拖动由 index.html 的 #pet-native-drag-zone 原生处理。
*/
function handlePetShortClick(event) {
  if (
    event.button !== 0 ||
    isPanelButtonTarget(event.target)
  ) {
    return;
  }

  const bounds = getCurrentModelBounds();

  if (
    !bounds ||
    !isPointInsideRect(event.clientX, event.clientY, bounds, 2)
  ) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const area = getPetInteractionArea(
    event.clientX,
    event.clientY,
    bounds
  );

  window.petAPI?.petInteraction?.({
    area,
    at: Date.now()
  });
}

async function loadLive2DModel(target, generation) {
  let loaded = null;
  try {
    if (!window.Live2DCubismCore) {
      throw new Error("Live2D 运行核心未加载");
    }

    const app = getPixiApp();
    loaded = await PIXI.live2d.Live2DModel.from(target, { autoUpdate: false });
    if (generation !== modelGeneration || target !== modelPath) {
      destroyModel(loaded);
      return;
    }
    live2dModel = loaded;

    app.stage.addChild(live2dModel);

    live2dModel.scale.set(modelScale);
    live2dModel.anchor.set(0.5, 1);

    updateModelPosition();
    await restoreSavedVisualState();
    if (generation !== modelGeneration || live2dModel !== loaded) return;

    sendModelInfoToPanel();

    tryPlayIdleMotion();
    scheduleRandomIdleMotion();

    app.ticker.add(updateModelClock);
    app.ticker.add(updateNaturalLook);
    app.ticker.add(updateLifeMotion);
    setModelVisible(true);
    app.start();
  } catch (error) {
    if (generation !== modelGeneration) return;
    if (loaded && live2dModel === loaded) clearLoadedModel();
    console.error("Live2D 模型加载失败：", error);
    showModelLoadError(error);
  }
}

function updateModelClock() {
  live2dModel?.update(pixiApp.ticker.deltaMS);
}

function destroyModel(model) {
  // Concurrent loads can share Pixi textures; dispose only this model's resources.
  if (model && !model.destroyed) model.destroy({ children: true, texture: false, baseTexture: false });
}

function clearLoadedModel() {
  if (pixiApp) {
    pixiApp.stop();
    pixiApp.ticker.remove(updateModelClock);
    pixiApp.ticker.remove(updateNaturalLook);
    pixiApp.ticker.remove(updateLifeMotion);
  }
  const previous = live2dModel;
  live2dModel = null;
  if (previous) {
    pixiApp?.stage.removeChild(previous);
    destroyModel(previous);
  }
  setModelVisible(false);
}

function showModelLoadError(error) {
  if (!modelLoadError) return;

  const detail = String(error?.message || error || "未知错误")
    .replace(/\s+/g, " ")
    .slice(0, 100);

  modelLoadError.textContent = `模型加载失败：${detail}`;
  modelLoadError.style.display = "block";
}

function updateModelPosition() {
  if (!live2dModel) return;

  live2dModel.x = window.innerWidth / 2;
  live2dModel.y = window.innerHeight * 0.985;

  scheduleVisualBoundsReports();
}

function reportModelVisualBounds(force = false) {
  if (!live2dModel || !window.petAPI?.reportPetVisualBounds) {
    return;
  }

  if (isPoseTransition) {
    return;
  }

  const now = Date.now();

  if (!force && now - lastVisualBoundsReportAt < 140) {
    return;
  }

  lastVisualBoundsReportAt = now;

  try {
    const bounds = live2dModel.getBounds();

    if (
      !Number.isFinite(bounds.x) ||
      !Number.isFinite(bounds.y) ||
      !Number.isFinite(bounds.width) ||
      !Number.isFinite(bounds.height) ||
      bounds.width < 20 ||
      bounds.height < 20
    ) {
      return;
    }

    const x = Math.round(bounds.x);
    const y = Math.round(bounds.y);
    const width = Math.round(bounds.width);
    const height = Math.round(bounds.height);
    const windowWidth = Math.round(window.innerWidth);
    const windowHeight = Math.round(window.innerHeight);

    const speechAnchor = getSpeechAnchorInfo(bounds);

    window.petAPI.reportPetVisualBounds({
      x,
      y,
      width,
      height,
      windowWidth,
      windowHeight,
      speechAnchorX: Math.round(speechAnchor.x),
      speechAnchorY: Math.round(speechAnchor.y),
      activePoseFile,
      at: now
    });
  } catch (error) {
    console.warn("上报 Live2D 可见范围失败：", error);
  }
}

/*
  Bubble 说话锚点。

  main.js 的 Bubble 定位已经支持 speechAnchorX / speechAnchorY。
  这里根据当前姿势微调锚点，避免跪姿、跪姿前倾时气泡还停在站姿高度。

  如果后续觉得某个姿势气泡偏高 / 偏低，优先微调这里的 yRatio。
*/
function getSpeechAnchorInfo(bounds) {
  const pose = String(activePoseFile || "");

  let xRatio = 0.5;
  let yRatio = 0.31;

  if (pose.includes("跪姿前倾")) {
    xRatio = 0.49;
    yRatio = 0.455;
  } else if (pose.includes("跪姿")) {
    xRatio = 0.5;
    yRatio = 0.415;
  } else if (pose.includes("打游戏")) {
    xRatio = 0.515;
    yRatio = 0.365;
  } else if (pose.includes("唱歌")) {
    xRatio = 0.5;
    yRatio = 0.335;
  }

  /*
    姿势表情可能让 Live2D bounds 包含手、头发、裙摆。
    这里把锚点限制在 bounds 内部较安全的位置，避免极端动作把 Bubble 带飞。
  */
  const safeXRatio = clamp(xRatio, 0.38, 0.62);
  const safeYRatio = clamp(yRatio, 0.24, 0.54);

  return {
    x: bounds.x + bounds.width * safeXRatio,
    y: bounds.y + bounds.height * safeYRatio
  };
}

function scheduleVisualBoundsReports() {
  reportModelVisualBounds(true);

  requestAnimationFrame(() => {
    reportModelVisualBounds(true);
  });

  setTimeout(() => {
    reportModelVisualBounds(true);
  }, 120);

  setTimeout(() => {
    reportModelVisualBounds(true);
  }, 260);
}

function applyNaturalTransform() {
  if (!live2dModel) return;

  const breath = 1 + Math.sin(naturalTime * 1.28) * 0.0026;
  const floatY = Math.sin(naturalTime * 1.05) * 1.1;
  const dragScale = isDraggingPet ? 0.997 : 1;
  const speakingScale = isSpeaking
    ? 1 + Math.sin(naturalTime * 4.8) * 0.0012
    : 1;

  live2dModel.scale.set(
    modelScale * breath * dragScale * speakingScale
  );

  live2dModel.y = window.innerHeight * 0.985 + floatY;
}

function sendModelInfoToPanel() {
  if (!window.petAPI || !live2dModel) return;

  try {
    const settings = live2dModel.internalModel.settings;

    window.petAPI.sendModelInfo({
      motions: settings.motions || {},
      expressions: settings.expressions || []
    });
  } catch (error) {
    window.petAPI.sendModelInfo({
      motions: {},
      expressions: []
    });
  }
}

function updateLookTargetFromScreen(data) {
  if (!live2dModel || !data) return;

  const { cursor, bounds } = data;

  if (
    !lastCursorPos ||
    Math.abs(cursor.x - lastCursorPos.x) > 1 ||
    Math.abs(cursor.y - lastCursorPos.y) > 1
  ) {
    lastCursorMoveAt = Date.now();
    lastCursorPos = { x: cursor.x, y: cursor.y };
  }

  const mouseX = cursor.x - bounds.x;
  const mouseY = cursor.y - bounds.y;

  const faceX = window.innerWidth / 2;
  const faceY = window.innerHeight * 0.40;

  const dx = mouseX - faceX;
  const dy = mouseY - faceY;

  const nxRaw = Math.tanh(dx / 290);
  const nyRaw = Math.tanh(dy / 360);

  const leftBoost = dx < 0 ? 1.38 : 1.0;
  const rightLimit = dx > 0 ? 0.92 : 1.0;

  const distance = Math.sqrt(dx * dx + dy * dy);
  const distanceFactor = clamp(1 - distance / 1300, 0.52, 1);

  const nx = nxRaw * leftBoost * rightLimit * distanceFactor;
  const ny = nyRaw * distanceFactor;

  lookTarget.angleX = clamp(nx * 28, -30, 24);
  lookTarget.angleY = clamp(-ny * 15, -15, 15);
  lookTarget.angleZ = clamp(nx * 6.8, -7.2, 6.2);

  lookTarget.eyeX = clamp(nx * 0.88, -0.9, 0.78);
  lookTarget.eyeY = clamp(-ny * 0.58, -0.58, 0.58);

  lookTarget.bodyX = clamp(nx * 6.5, -7.0, 5.8);
  lookTarget.bodyY = clamp(-ny * 3.0, -3.0, 3.0);
  lookTarget.bodyZ = clamp(nx * 2.8, -3.2, 2.6);
}

function updateNaturalLook() {
  if (!live2dModel) return;

  lookCurrent.eyeX += (lookTarget.eyeX - lookCurrent.eyeX) * 0.16;
  lookCurrent.eyeY += (lookTarget.eyeY - lookCurrent.eyeY) * 0.16;

  lookCurrent.angleX += (lookTarget.angleX - lookCurrent.angleX) * 0.085;
  lookCurrent.angleY += (lookTarget.angleY - lookCurrent.angleY) * 0.08;
  lookCurrent.angleZ += (lookTarget.angleZ - lookCurrent.angleZ) * 0.065;

  lookCurrent.bodyX += (lookTarget.bodyX - lookCurrent.bodyX) * 0.04;
  lookCurrent.bodyY += (lookTarget.bodyY - lookCurrent.bodyY) * 0.035;
  lookCurrent.bodyZ += (lookTarget.bodyZ - lookCurrent.bodyZ) * 0.035;

  const dragPower = isDraggingPet ? 1 : getDragReleasePower();

  const dragTilt = dragPower * Math.sin(naturalTime * 8.5) * 1.8;
  const dragBody = dragPower * Math.sin(naturalTime * 7.2 + 0.8) * 1.25;
  const dragEye = dragPower * Math.sin(naturalTime * 9.5) * 0.12;

  const speak = getSpeakingParameterOffset();

  setParameterValueSafe("ParamEyeBallX", lookCurrent.eyeX + dragEye);
  setParameterValueSafe("ParamEyeBallY", lookCurrent.eyeY);

  setParameterValueSafe("ParamAngleX", lookCurrent.angleX + dragTilt);
  setParameterValueSafe("ParamAngleY", lookCurrent.angleY);
  setParameterValueSafe(
    "ParamAngleZ",
    lookCurrent.angleZ + dragTilt * 0.4 + speak.angle
  );

  setParameterValueSafe(
    "ParamBodyAngleX",
    lookCurrent.bodyX + dragBody + speak.body
  );

  setParameterValueSafe("ParamBodyAngleY", lookCurrent.bodyY);

  setParameterValueSafe(
    "ParamBodyAngleZ",
    lookCurrent.bodyZ + dragBody * 0.45
  );

  if (isSpeaking) {
    setParameterValueSafe("ParamMouthOpenY", speak.mouth);
    setParameterValueSafe("ParamMouthForm", speak.form);
  }
}

function updateLifeMotion(delta) {
  if (!live2dModel) return;

  naturalTime += delta / 60;

  const hour = new Date().getHours();
  const deepNight = hour >= 23 || hour < 6;
  const idleForAWhile =
    Date.now() - lastCursorMoveAt > 8 * 60 * 1000;

  isDozing = deepNight && idleForAWhile;

  applyNaturalTransform();
  maintainEmotionState();
  reportModelVisualBounds(false);

  if (!isDraggingPet) {
    const speak = getSpeakingParameterOffset();
    const doze = isDozing ? 0.38 : 1;
    let idleBodyX = Math.sin(naturalTime * 0.52) * 0.36 * doze;
    let idleBodyY = Math.sin(naturalTime * 0.66 + 1.3) * 0.24 * doze;
    let idleAngleZ = Math.sin(naturalTime * 0.46) * 0.22 * doze;

    if (isThinking) {
      /*
        思考状态：幅度更小、更安静的姿态，微微低头看"你"。
      */
      idleBodyX = Math.sin(naturalTime * 0.42) * 0.18;
      idleBodyY = Math.sin(naturalTime * 0.55 + 1.1) * 0.12 - 0.35;
      idleAngleZ = Math.sin(naturalTime * 0.38) * 0.14;

      setParameterValueSafe("ParamAngleX", lookCurrent.angleX);
      setParameterValueSafe("ParamAngleY", lookCurrent.angleY - 0.9);

      positionThinkingIndicator();
    }

    setParameterValueSafe(
      "ParamBodyAngleX",
      lookCurrent.bodyX + idleBodyX + speak.body
    );

    setParameterValueSafe(
      "ParamBodyAngleY",
      lookCurrent.bodyY + idleBodyY - (isDozing ? 0.6 : 0)
    );

    setParameterValueSafe(
      "ParamAngleZ",
      lookCurrent.angleZ + idleAngleZ + speak.angle
    );
  }
}

/*
  思考气泡跟随人物头部：模型缩放、站姿/蹲姿变化时
  用当前可视范围锚点（speechAnchor）重新定位。
*/
function positionThinkingIndicator() {
  const indicator = document.getElementById("thinking-indicator");

  if (!indicator) {
    return;
  }

  if (!isThinking || !live2dModel) {
    indicator.style.opacity = "0";
    return;
  }

  const bounds = getCurrentModelBounds();

  if (!bounds) {
    return;
  }

  const anchor = getSpeechAnchorInfo(bounds);

  indicator.style.left = `${Math.round(anchor.x)}px`;
  indicator.style.top = `${Math.round(anchor.y - 10)}px`;
  indicator.style.opacity = "";
}

function getSpeakingParameterOffset() {
  if (!isSpeaking) {
    speakingMotion.mouth += (0 - speakingMotion.mouth) * 0.22;
    speakingMotion.body += (0 - speakingMotion.body) * 0.14;
    speakingMotion.angle += (0 - speakingMotion.angle) * 0.14;

    return {
      mouth: speakingMotion.mouth,
      form: 0,
      body: speakingMotion.body,
      angle: speakingMotion.angle
    };
  }

  const levelFresh = Date.now() - mouthLevelAt < 260;
  let mouthTarget =
    0.18 +
    Math.abs(Math.sin(naturalTime * 10.5)) * 0.32 +
    Math.abs(Math.sin(naturalTime * 17.0 + 0.8)) * 0.08;

  if (levelFresh && mouthLevel > 0.01) {
    mouthTarget = 0.12 + mouthLevel * 0.5;
  }

  const bodyTarget = Math.sin(naturalTime * 3.2) * 0.42;
  const angleTarget = Math.sin(naturalTime * 3.8 + 0.4) * 0.32;

  speakingMotion.mouth +=
    (mouthTarget - speakingMotion.mouth) * 0.34;

  speakingMotion.body +=
    (bodyTarget - speakingMotion.body) * 0.12;

  speakingMotion.angle +=
    (angleTarget - speakingMotion.angle) * 0.12;

  return {
    mouth: clamp(speakingMotion.mouth, 0, 0.72),
    form: 0.05,
    body: speakingMotion.body,
    angle: speakingMotion.angle
  };
}

function getDragReleasePower() {
  if (!dragReleaseTime) return 0;

  const elapsed = Date.now() - dragReleaseTime;
  const duration = 520;

  if (elapsed >= duration) {
    dragReleaseTime = 0;
    return 0;
  }

  return 1 - elapsed / duration;
}

async function handlePanelCommand(command) {
  if (!command || !command.type) return;
  const generation = modelGeneration;

  if (command.type === "scale-up") {
    setScale(modelScale + 0.004);
    return;
  }

  if (command.type === "scale-down") {
    setScale(modelScale - 0.004);
    return;
  }

  if (command.type === "reset-all") {
    await resetVisualState();
    if (generation !== modelGeneration) return;
    setScale(0.048);
    resetLook();
    resetEmotionState();
    persistVisualState();
    return;
  }

  if (command.type === "toggle-expression") {
    await handleToggleExpression(command);
    return;
  }

  if (command.type === "builtin-expression") {
    await resetActiveFace();
    if (generation !== modelGeneration) return;
    playBuiltInExpression(command.index);
    return;
  }

  if (command.type === "motion") {
    playMotion(command.groupName, command.index);
    return;
  }

  if (command.type === "pet-interaction-reaction") {
    await handleInteractionReaction(command);
    return;
  }

  if (command.type === "ai-emotion") {
    await handleAiEmotion(command.emotion);
    return;
  }

  if (command.type === "speaking-state") {
    handleSpeakingState(command.speaking);
    return;
  }

  if (command.type === "ai-thinking") {
    handleAiThinking(Boolean(command.thinking));
    return;
  }

  if (command.type === "pet-mouth-level") {
    handleMouthLevel(Number(command.level) || 0);
    return;
  }

  if (command.type === "initiative-notice") {
    handleInitiativeNotice();
    return;
  }

  if (command.type === "drag-state") {
    handleDragState(command.dragging);
    return;
  }

  if (command.type === "model-imported") {
    await reloadLive2DModel(command.path, command.expressionFiles);
    return;
  }

  if (command.type === "celebrate") {
    handleCelebrate(command);
  }
}

async function reloadLive2DModel(nextPath, expressionFiles = [], visualState = null) {
  const generation = ++modelGeneration;
  expressionTransitionToken++;
  clearTimeout(idleMotionTimer);
  clearTimeout(initiativeNoticeTimer);
  clearTimeout(interactionSoftTimer);
  clearLoadedModel();
  modelPath = typeof nextPath === "string" ? nextPath : "";
  availableExpressionFiles = new Set(Array.isArray(expressionFiles)
    ? expressionFiles.filter((file) => typeof file === "string") : []);
  savedVisualState = visualState;
  activeFaceFile = null;
  activePoseFile = null;
  activeLookFiles.clear();
  originalParamValues.clear();
  isPoseTransition = false;
  isDraggingPet = false;
  isDozing = false;
  mouthLevel = 0;
  mouthLevelAt = 0;
  resetEmotionState();
  resetLook();
  document.body.classList.remove("has-new-message");
  if (modelLoadError) modelLoadError.style.display = "none";
  window.petAPI?.sendModelInfo?.({ expressions: [], motions: {} });
  if (modelPath) await loadLive2DModel(modelPath, generation);
}

function handleCelebrate(command = {}) {
  handleAiEmotion("happy", { forceSoft: false });

  if (Math.random() < 0.5) {
    playMotionByKeyword("wenhao");
  } else {
    playBuiltInExpression(1);
  }
}

function handleInitiativeNotice() {
  document.body.classList.add("has-new-message");

  clearTimeout(initiativeNoticeTimer);

  initiativeNoticeTimer = setTimeout(() => {
    document.body.classList.remove("has-new-message");
  }, 8000);
}

function handleAiThinking(thinking) {
  if (thinking === isThinking) {
    return;
  }

  isThinking = thinking;
  document.body.classList.toggle("thinking", isThinking);

  if (isThinking) {
    clearTimeout(aiEmotionTimer);
    clearTimeout(neutralFallTimer);

    lookTarget.eyeX = 0;
    lookTarget.eyeY = -0.12;
    lookTarget.angleX = 0;
    lookTarget.angleY = -1.6;
  } else {
    lookTarget.eyeY = 0;
    lookTarget.angleY = 0;
  }
}

function handleMouthLevel(level) {
  mouthLevel = clamp(Number(level) || 0, 0, 1);
  mouthLevelAt = Date.now();
}

async function handleInteractionReaction(command = {}) {
  if (!live2dModel) {
    return;
  }

  const emotion = normalizeEmotion(command.emotion);
  const expression = String(command.expression || "");
  const motion = String(command.motion || "");
  const generation = modelGeneration;

  if (availableExpressionFiles.has(expression)) {
    await setActiveFaceExpression(expression);
    if (generation !== modelGeneration) return;

    emotionState.current = emotion;
    emotionState.until = Date.now() + 2600;
    emotionState.lastSwitchAt = Date.now();
    emotionState.lastAppliedFile = expression;

    clearTimeout(aiEmotionTimer);

    aiEmotionTimer = setTimeout(() => {
      scheduleNeutralFall();
    }, 2800);
  } else {
    await handleAiEmotion(emotion, {
      source: "interaction",
      forceSoft: true
    });
  }
  if (generation !== modelGeneration) return;

  if (motion) {
    playMotionByKeyword(motion);
  }

  applySoftReaction(emotion, {
    applyFace: false
  });

  scheduleVisualBoundsReports();
}

async function handleAiEmotion(emotion, options = {}) {
  if (!live2dModel || isDraggingPet) return;
  const generation = modelGeneration;

  const nextEmotion = normalizeEmotion(emotion);
  const now = Date.now();

  if (nextEmotion === "neutral") {
    scheduleNeutralFall();
    return;
  }

  const strength = emotionStrength[nextEmotion] || 1;
  const currentStrength = emotionStrength[emotionState.current] || 0;
  const duration = emotionDuration[nextEmotion] || 3800;

  emotionState.lastEmotionAt = now;

  if (emotionState.current === nextEmotion) {
    emotionState.until = Math.max(
      emotionState.until,
      now + duration
    );

    clearTimeout(aiEmotionTimer);

    aiEmotionTimer = setTimeout(() => {
      scheduleNeutralFall();
    }, duration + 220);

    return;
  }

  const switchCooldown =
    options.source === "interaction" ? 900 : 1800;

  const elapsedFromSwitch = now - emotionState.lastSwitchAt;

  if (
    elapsedFromSwitch < switchCooldown &&
    !options.forceSoft &&
    strength <= currentStrength
  ) {
    emotionState.until = Math.max(
      emotionState.until,
      now + Math.round(duration * 0.55)
    );

    return;
  }

  if (
    isSpeaking &&
    strength <= 1 &&
    emotionState.current !== "neutral" &&
    !options.forceSoft
  ) {
    emotionState.until = Math.max(
      emotionState.until,
      now + Math.round(duration * 0.45)
    );

    return;
  }

  const shouldApplyFace = shouldApplyEmotionFace(
    nextEmotion,
    strength,
    options
  );

  emotionState.current = nextEmotion;
  emotionState.until = now + duration;
  emotionState.lastSwitchAt = now;

  if (shouldApplyFace) {
    const list = (emotionFaceMap[nextEmotion] || []).filter((file) => availableExpressionFiles.has(file));
    const fileName = chooseExpressionFile(
      list,
      emotionState.lastAppliedFile,
      strength
    );

    if (fileName) {
      await setActiveFaceExpression(fileName);
      if (generation !== modelGeneration) return;
      emotionState.lastAppliedFile = fileName;
    } else {
      applyEmotionAsParameterOnly(nextEmotion);
    }
  } else {
    applyEmotionAsParameterOnly(nextEmotion);
  }

  maybePlayEmotionMotion(nextEmotion, strength, options);

  clearTimeout(aiEmotionTimer);

  aiEmotionTimer = setTimeout(() => {
    scheduleNeutralFall();
  }, duration + 180);
}

function normalizeEmotion(emotion) {
  const value = String(emotion || "neutral");

  if (Object.prototype.hasOwnProperty.call(emotionFaceMap, value)) {
    return value;
  }

  return "neutral";
}

function shouldApplyEmotionFace(emotion, strength, options = {}) {
  if (options.forceSoft) {
    return Math.random() < 0.72;
  }

  if (isDraggingPet) {
    return false;
  }

  if (isSpeaking && strength <= 1) {
    return Math.random() < 0.18;
  }

  const baseChance = {
    love: 0.72,
    happy: 0.58,
    shy: 0.54,
    comfort: 0.48,
    angry: 0.68,
    sad: 0.72,
    confused: 0.36,
    neutral: 0
  }[emotion] ?? 0.42;

  return Math.random() < baseChance;
}

function chooseExpressionFile(list, lastFile, strength = 2) {
  const candidates = Array.isArray(list)
    ? list.filter(Boolean)
    : [];

  if (!candidates.length) {
    return "";
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  /*
    情绪越强，越选更"外放"的表情（列表前面的）；强度低时选更收敛的。
  */
  if (strength >= 3) {
    return candidates[0];
  }

  if (strength <= 1) {
    return candidates[candidates.length - 1];
  }

  const filtered = candidates.filter(
    (item) => item !== lastFile
  );

  const pool = filtered.length ? filtered : candidates;

  return pool[Math.floor(Math.random() * pool.length)];
}

async function setActiveFaceExpression(fileName) {
  if (!live2dModel || !availableExpressionFiles.has(fileName) || activeFaceFile === fileName) {
    return;
  }

  const generation = modelGeneration;
  if (activeFaceFile && activeFaceFile !== fileName) {
    await resetExpressionFile(activeFaceFile);
    if (generation !== modelGeneration) return;
  }

  await applyExpressionFile(fileName);
  if (generation !== modelGeneration) return;
  activeFaceFile = fileName;

  scheduleVisualBoundsReports();
}

function applyEmotionAsParameterOnly(emotion) {
  const factor = {
    happy: 1,
    love: 1.1,
    shy: 0.85,
    comfort: 0.65,
    angry: 1,
    sad: 0.8,
    confused: 0.9,
    neutral: 0
  }[emotion] || 0.55;

  if (emotion === "happy" || emotion === "love") {
    lookTarget.angleY -= 0.8 * factor;
    lookTarget.bodyY -= 0.35 * factor;
    lookTarget.angleZ += 0.8 * factor;
    return;
  }

  if (emotion === "shy") {
    lookTarget.angleX -= 0.8 * factor;
    lookTarget.angleY += 0.8 * factor;
    lookTarget.bodyZ -= 0.6 * factor;
    return;
  }

  if (emotion === "confused") {
    lookTarget.angleZ += 1.5 * factor;
    lookTarget.bodyZ += 0.8 * factor;
    return;
  }

  if (emotion === "sad") {
    lookTarget.angleY += 1.0 * factor;
    lookTarget.bodyY += 0.55 * factor;
    return;
  }

  if (emotion === "angry") {
    lookTarget.angleX += 0.9 * factor;
    lookTarget.angleZ -= 0.8 * factor;
  }
}

function applySoftReaction(emotion, options = {}) {
  clearTimeout(interactionSoftTimer);

  const xTilt = emotion === "confused"
    ? 3.2
    : emotion === "shy"
      ? -2.4
      : 2.2;

  const yTilt = emotion === "shy" ? -1.8 : -0.8;

  lookTarget.angleZ += xTilt;
  lookTarget.angleY += yTilt;
  lookTarget.bodyZ += xTilt * 0.45;
  lookTarget.bodyY += yTilt * 0.35;

  if (options.applyFace !== false) {
    handleAiEmotion(emotion, {
      source: "interaction",
      forceSoft: true
    });
  }

  interactionSoftTimer = setTimeout(() => {
    lookTarget.angleZ -= xTilt * 0.6;
    lookTarget.angleY -= yTilt * 0.5;
    lookTarget.bodyZ -= xTilt * 0.25;
    lookTarget.bodyY -= yTilt * 0.2;
  }, 900);
}

function scheduleNeutralFall() {
  clearTimeout(neutralFallTimer);
  if (!live2dModel) return;
  const generation = modelGeneration;

  const now = Date.now();
  const remain = emotionState.until - now;

  neutralFallTimer = setTimeout(async () => {
    if (generation !== modelGeneration) return;
    if (isDraggingPet) {
      scheduleNeutralFall();
      return;
    }

    if (Date.now() < emotionState.until) {
      scheduleNeutralFall();
      return;
    }

    if (isSpeaking && emotionState.current !== "neutral") {
      emotionState.until = Date.now() + 1300;
      scheduleNeutralFall();
      return;
    }

    await resetActiveFace();
    if (generation !== modelGeneration) return;

    emotionState.current = "neutral";
    emotionState.lastAppliedFile = "";
    emotionState.lastSwitchAt = Date.now();
  }, Math.max(900, remain + 260));
}

function maintainEmotionState() {
  if (
    emotionState.current !== "neutral" &&
    emotionState.until &&
    Date.now() > emotionState.until + 1200
  ) {
    scheduleNeutralFall();
  }
}

function resetEmotionState() {
  clearTimeout(aiEmotionTimer);
  clearTimeout(neutralFallTimer);

  isThinking = false;
  document.body.classList.remove("thinking");

  emotionState.current = "neutral";
  emotionState.until = 0;
  emotionState.lastSwitchAt = 0;
  emotionState.lastAppliedFile = "";
  emotionState.lastEmotionAt = 0;

  isSpeaking = false;

  speakingMotion = {
    mouth: 0,
    body: 0,
    angle: 0
  };
}

function maybePlayEmotionMotion(emotion, strength = 1, options = {}) {
  if (!live2dModel || isDraggingPet) return;

  if (isSpeaking && strength <= 1) {
    return;
  }

  /*
    情绪绑定专属动作，不再随机抽动作组，避免"生气却跳开心动画"。
  */
  const emotionMotionKeywords = {
    happy: [],
    love: [],
    shy: [],
    angry: ["shengqi", "fanzao"],
    sad: ["liulei"],
    confused: ["wenhao", "yunyun"],
    comfort: [],
    neutral: []
  };

  const chance = {
    happy: 0.14,
    love: 0.16,
    shy: 0.08,
    angry: 0.1,
    sad: 0.07,
    confused: 0.07,
    comfort: 0.06,
    neutral: 0
  }[emotion] || 0;

  const finalChance = options.source === "interaction"
    ? Math.min(0.16, chance + 0.04)
    : chance;

  if (Math.random() > finalChance) return;

  try {
    const keywords = emotionMotionKeywords[emotion] || [];

    if (keywords.length) {
      playMotionByKeyword(
        keywords[Math.floor(Math.random() * keywords.length)]
      );
      return;
    }

    const motions =
      live2dModel.internalModel.settings.motions || {};

    const groups = Object.keys(motions);

    if (!groups.length) return;

    let candidates = groups.filter((group) => {
      const lower = group.toLowerCase();

      return !lower.includes("idle") && !lower.includes("待机");
    });

    if (!candidates.length) {
      candidates = groups;
    }

    const groupName =
      candidates[Math.floor(Math.random() * candidates.length)];

    const group = motions[groupName] || [];

    if (!group.length) return;

    const index = Math.floor(Math.random() * group.length);

    playMotion(groupName, index);
  } catch (error) {}
}

function handleSpeakingState(speaking) {
  const generation = modelGeneration;
  const next = Boolean(speaking);

  if (next === isSpeaking) {
    return;
  }

  isSpeaking = next;

  if (isSpeaking) {
    if (emotionState.current !== "neutral") {
      emotionState.until = Math.max(
        emotionState.until,
        Date.now() + 1600
      );
    }

    return;
  }

  setTimeout(() => {
    if (generation === modelGeneration && !isSpeaking) {
      setParameterValueSafe("ParamMouthOpenY", 0);
      setParameterValueSafe("ParamMouthForm", 0);
    }
  }, 220);

  if (emotionState.current !== "neutral") {
    scheduleNeutralFall();
  }
}

function handleDragState(dragging) {
  const generation = modelGeneration;
  const next = Boolean(dragging);

  if (next === isDraggingPet) return;

  isDraggingPet = next;

  if (isDraggingPet) {
    clearTimeout(aiEmotionTimer);
    clearTimeout(neutralFallTimer);

    lookTarget.angleY -= 2.5;
    lookTarget.bodyY -= 1.2;
    return;
  }

  dragReleaseTime = Date.now();

  lookTarget.angleZ += Math.random() > 0.5 ? 2.2 : -2.2;
  lookTarget.bodyZ += Math.random() > 0.5 ? 1.5 : -1.5;

  setTimeout(async () => {
    if (generation === modelGeneration && !isDraggingPet && !isSpeaking) {
      await resetActiveFace();
      if (generation !== modelGeneration) return;
      emotionState.current = "neutral";
    }
  }, 680);
}

async function handleToggleExpression(command) {
  const { fileName, groupType, enabled } = command;

  if (!live2dModel || !availableExpressionFiles.has(fileName) || !groupType) return;
  const generation = modelGeneration;

  if (groupType === "face") {
    if (!enabled) {
      if (activeFaceFile === fileName) {
        await resetExpressionFile(fileName);
        if (generation !== modelGeneration) return;
        activeFaceFile = null;
        scheduleVisualBoundsReports();
      }

      return;
    }

    if (activeFaceFile && activeFaceFile !== fileName) {
      await resetExpressionFile(activeFaceFile);
      if (generation !== modelGeneration) return;
    }

    await applyExpressionFile(fileName);
    if (generation !== modelGeneration) return;
    activeFaceFile = fileName;

    scheduleVisualBoundsReports();
    return;
  }

  if (groupType === "pose") {
    if (!enabled) {
      if (activePoseFile === fileName) {
        await transitionExpressionFile(fileName, "");
        if (generation !== modelGeneration) return;
        activePoseFile = null;
        scheduleVisualBoundsReports();
        persistVisualState();
      }

      return;
    }

    await transitionExpressionFile(activePoseFile, fileName);
    if (generation !== modelGeneration) return;
    activePoseFile = fileName;

    scheduleVisualBoundsReports();
    persistVisualState();
    return;
  }

  if (groupType === "look") {
    if (enabled) {
      let switchedExclusiveLook = false;
      if (EXCLUSIVE_LOOK_FILES.has(fileName)) {
        for (const activeFile of Array.from(activeLookFiles)) {
          if (activeFile !== fileName && EXCLUSIVE_LOOK_FILES.has(activeFile)) {
            await transitionExpressionFile(activeFile, fileName);
            if (generation !== modelGeneration) return;
            activeLookFiles.delete(activeFile);
            switchedExclusiveLook = true;
          }
        }
      }

      if (!activeLookFiles.has(fileName) && !switchedExclusiveLook) {
        await transitionExpressionFile("", fileName);
        if (generation !== modelGeneration) return;
      }
      activeLookFiles.add(fileName);
    } else {
      await transitionExpressionFile(fileName, "");
      if (generation !== modelGeneration) return;
      activeLookFiles.delete(fileName);
    }

    scheduleVisualBoundsReports();
    persistVisualState();
  }
}

function persistVisualState() {
  const state = {
    poseFile: activePoseFile || "",
    lookFiles: Array.from(activeLookFiles)
  };

  window.petAPI?.saveVisualState?.(state);
  window.petAPI?.sendVisualState?.(state);
}

async function restoreSavedVisualState() {
  if (!live2dModel || !savedVisualState) {
    return;
  }

  const state = savedVisualState;
  const generation = modelGeneration;
  savedVisualState = null;
  const poseFile = String(state.poseFile || "");
  const lookFiles = Array.isArray(state.lookFiles)
    ? state.lookFiles
      .map((fileName) => String(fileName || ""))
      .filter((file) => availableExpressionFiles.has(file))
    : [];

  try {
    if (availableExpressionFiles.has(poseFile)) {
      await applyExpressionFile(poseFile);
      if (generation !== modelGeneration) return;
      activePoseFile = poseFile;
    }

    for (const fileName of lookFiles) {
      await applyExpressionFile(fileName);
      if (generation !== modelGeneration) return;
      activeLookFiles.add(fileName);
    }

    scheduleVisualBoundsReports();
  } catch (error) {
    console.warn("恢复桌宠装扮失败：", error);
  }
}

async function resetActiveFace() {
  if (!activeFaceFile) return;
  const generation = modelGeneration;

  await resetExpressionFile(activeFaceFile);
  if (generation !== modelGeneration) return;
  activeFaceFile = null;

  scheduleVisualBoundsReports();
}

async function resetVisualState() {
  expressionTransitionToken += 1;
  const generation = modelGeneration;
  if (activeFaceFile) {
    await resetExpressionFile(activeFaceFile);
    if (generation !== modelGeneration) return;
    activeFaceFile = null;
  }

  if (activePoseFile) {
    await resetExpressionFile(activePoseFile);
    if (generation !== modelGeneration) return;
    activePoseFile = null;
  }

  for (const fileName of Array.from(activeLookFiles)) {
    await resetExpressionFile(fileName);
    if (generation !== modelGeneration) return;
  }

  activeLookFiles.clear();

  resetAllTouchedParameters();
  scheduleVisualBoundsReports();
}

function setScale(newScale) {
  // 透明窗口有固定边界，限制尺寸避免人物缩到不可用或放大后被裁切。
  modelScale = clamp(newScale, 0.032, 0.12);

  if (live2dModel) {
    applyNaturalTransform();
    updateModelPosition();
    scheduleVisualBoundsReports();
  }

  window.petAPI?.saveScale?.(modelScale);
}

function resetLook() {
  lookCurrent = {
    angleX: 0,
    angleY: 0,
    angleZ: 0,
    eyeX: 0,
    eyeY: 0,
    bodyX: 0,
    bodyY: 0,
    bodyZ: 0
  };

  lookTarget = {
    angleX: 0,
    angleY: 0,
    angleZ: 0,
    eyeX: 0,
    eyeY: 0,
    bodyX: 0,
    bodyY: 0,
    bodyZ: 0
  };

  setParameterValueSafe("ParamEyeBallX", 0);
  setParameterValueSafe("ParamEyeBallY", 0);

  setParameterValueSafe("ParamAngleX", 0);
  setParameterValueSafe("ParamAngleY", 0);
  setParameterValueSafe("ParamAngleZ", 0);

  setParameterValueSafe("ParamBodyAngleX", 0);
  setParameterValueSafe("ParamBodyAngleY", 0);
  setParameterValueSafe("ParamBodyAngleZ", 0);

  setParameterValueSafe("ParamMouthOpenY", 0);
  setParameterValueSafe("ParamMouthForm", 0);
}

async function applyExpressionFile(fileName) {
  const generation = modelGeneration;
  try {
    const exp = await loadExpressionJson(fileName);

    if (generation !== modelGeneration || !live2dModel || !exp || !Array.isArray(exp.Parameters)) return;

    exp.Parameters.forEach((parameter) => {
      const id = parameter.Id;
      const value = Number(parameter.Value);
      const blend = parameter.Blend || "Add";

      rememberOriginalParamValue(id);
      applyParameter(id, value, blend);
    });
  } catch (error) {
    console.error("应用 exp3 失败：", fileName, error);
  }
}

async function resetExpressionFile(fileName) {
  const generation = modelGeneration;
  try {
    const exp = await loadExpressionJson(fileName);

    if (generation !== modelGeneration || !live2dModel || !exp || !Array.isArray(exp.Parameters)) return;

    exp.Parameters.forEach((parameter) => {
      const id = parameter.Id;

      if (originalParamValues.has(id)) {
        setParameterValue(id, originalParamValues.get(id));
      }
    });
  } catch (error) {
    console.error("关闭 exp3 失败：", fileName, error);
  }
}

async function transitionExpressionFile(previousFile, nextFile) {
  if (previousFile === nextFile) return;
  const generation = modelGeneration;

  const [previous, next] = await Promise.all([
    previousFile ? loadExpressionJson(previousFile) : null,
    nextFile ? loadExpressionJson(nextFile) : null
  ]);
  if (generation !== modelGeneration || !live2dModel) return;
  const previousParameters = Array.isArray(previous?.Parameters)
    ? previous.Parameters
    : [];
  const nextParameters = Array.isArray(next?.Parameters)
    ? next.Parameters
    : [];
  const nextById = new Map(nextParameters.map((item) => [item.Id, item]));
  const ids = new Set([
    ...previousParameters.map((item) => item.Id),
    ...nextParameters.map((item) => item.Id)
  ]);

  if (!ids.size) return;

  isPoseTransition = true;

  const starts = new Map();
  const targets = new Map();
  ids.forEach((id) => {
    rememberOriginalParamValue(id);
    const base = originalParamValues.get(id);
    const parameter = nextById.get(id);
    starts.set(id, getParameterValue(id));

    if (!parameter) {
      targets.set(id, base);
      return;
    }

    const value = Number(parameter.Value || 0);
    const blend = parameter.Blend || "Add";
    targets.set(
      id,
      blend === "Multiply"
        ? base * value
        : (blend === "Add" ? base + value : value)
    );
  });

  const token = ++expressionTransitionToken;
  const startedAt = performance.now();
  const duration = 190;

  await new Promise((resolve) => {
    const tick = (now) => {
      if (token !== expressionTransitionToken || generation !== modelGeneration) {
        resolve();
        return;
      }
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      ids.forEach((id) => {
        const from = starts.get(id);
        const to = targets.get(id);
        setParameterValue(id, from + (to - from) * eased);
      });
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });

  if (generation !== modelGeneration) return;
  isPoseTransition = false;
  scheduleVisualBoundsReports();
}

async function loadExpressionJson(fileName) {
  if (!live2dModel || !modelPath || !availableExpressionFiles.has(fileName)) return null;
  const generation = modelGeneration;
  const response = await fetch(
    `${getModelDir()}${fileName}`
  );

  if (!response.ok) {
    console.warn("找不到文件：", fileName);
    return null;
  }

  const expression = await response.json();
  return generation === modelGeneration ? expression : null;
}

function getModelDir() {
  const slash = String(modelPath || "").lastIndexOf("/");

  return slash >= 0
    ? String(modelPath).slice(0, slash + 1)
    : "";
}

function rememberOriginalParamValue(id) {
  if (originalParamValues.has(id)) return;

  originalParamValues.set(id, getParameterValue(id));
}

function resetAllTouchedParameters() {
  originalParamValues.forEach((value, id) => {
    setParameterValue(id, value);
  });

  originalParamValues.clear();
}

function applyParameter(id, value, blend) {
  const current = getParameterValue(id);

  if (blend === "Add") {
    setParameterValue(id, current + value);
  } else if (blend === "Multiply") {
    setParameterValue(id, current * value);
  } else {
    setParameterValue(id, value);
  }
}

function playBuiltInExpression(index) {
  if (!live2dModel || !Number.isInteger(index)
    || !live2dModel.internalModel.settings.expressions?.[index]) return;
  try {
    Promise.resolve(live2dModel.expression(index)).catch(() => {});
  } catch (error) {}
}

async function playMotionByKeyword(keyword) {
  if (!live2dModel || !keyword) {
    return;
  }

  try {
    const motions =
      live2dModel.internalModel.settings.motions || {};

    const groups = Object.keys(motions);

    if (!groups.length) {
      return;
    }

    const lowerKeyword = String(keyword).toLowerCase();

    let groupName = groups.find((group) =>
      group.toLowerCase().includes(lowerKeyword)
    );

    if (!groupName) {
      groupName = groups.find((group) => {
        const items = motions[group] || [];

        return items.some((item) => {
          const file = String(
            item.File || item.file || ""
          ).toLowerCase();

          return file.includes(lowerKeyword);
        });
      });
    }

    if (!groupName) {
      return;
    }

    const group = motions[groupName] || [];

    if (!group.length) {
      return;
    }

    let index = group.findIndex((item) => {
      const file = String(
        item.File || item.file || ""
      ).toLowerCase();

      return file.includes(lowerKeyword);
    });

    if (index < 0) {
      index = 0;
    }

    playMotion(groupName, index);
    return;
  } catch (error) {
    console.warn("按关键词播放动作失败：", keyword, error);
  }

}

function playMotion(groupName, index) {
  if (!live2dModel || !Number.isInteger(index)
    || !live2dModel.internalModel.settings.motions?.[groupName]?.[index]) return;
  try {
    Promise.resolve(live2dModel.motion(groupName, index)).catch(() => {});
    scheduleVisualBoundsReports();
  } catch (error) {
    console.error("播放动作失败：", groupName, index, error);
  }
}

function tryPlayIdleMotion() {
  try {
    const motions =
      live2dModel.internalModel.settings.motions || {};

    const idleGroup = Object.keys(motions).find((group) => {
      const lower = group.toLowerCase();

      return lower.includes("idle") || lower.includes("待机");
    });

    if (idleGroup) {
      playMotion(idleGroup, 0);
    }
  } catch (error) {}
}

function scheduleRandomIdleMotion() {
  clearTimeout(idleMotionTimer);
  if (!live2dModel) return;

  const delay = 22000 + Math.random() * 26000;

  idleMotionTimer = setTimeout(() => {
    if (!live2dModel || isDraggingPet || isSpeaking || isThinking) {
      scheduleRandomIdleMotion();
      return;
    }

    maybePlayIdleSmallMotion();
    scheduleRandomIdleMotion();
  }, delay);
}

function maybePlayIdleSmallMotion() {
  try {
    if (isThinking) {
      return;
    }

    if (
      emotionState.current !== "neutral" &&
      Date.now() < emotionState.until
    ) {
      return;
    }

    const roll = Math.random();

    if (roll < 0.52) {
      tryPlayIdleMotion();
      return;
    }

    if (roll < 0.59) {
      handleAiEmotion("confused");
      return;
    }

    if (roll < 0.64) {
      handleAiEmotion("shy");
    }
  } catch (error) {}
}

function setParameterValueSafe(id, value) {
  try {
    setParameterValue(id, value);
  } catch (error) {}
}

function setParameterValue(id, value) {
  if (!live2dModel) return;

  const internal = live2dModel.internalModel;
  const coreModel = internal.coreModel;

  if (
    coreModel &&
    typeof coreModel.setParameterValueById === "function"
  ) {
    coreModel.setParameterValueById(id, value);
    return;
  }

  if (typeof internal.setParameterValueById === "function") {
    internal.setParameterValueById(id, value);
  }
}

function getParameterValue(id) {
  try {
    const coreModel = live2dModel.internalModel.coreModel;

    if (
      coreModel &&
      typeof coreModel.getParameterValueById === "function"
    ) {
      return coreModel.getParameterValueById(id);
    }

    return 0;
  } catch (error) {
    return 0;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

window.addEventListener("resize", () => {
  updateModelPosition();
});
