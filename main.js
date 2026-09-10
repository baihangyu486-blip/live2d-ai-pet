const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  dialog,
  shell,
  Notification
} = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const {
  loadSettings,
  saveSettings,
  encryptSecret,
  decryptSecret
} = require("./src/main/storage.js");
const {
  MAX_IMAGE_BYTES,
  shuffleArray,
  pickRandom,
  estimateVoiceDuration,
  createId,
  clampNumber,
  sleep,
  fetchWithTimeout,
  cleanDisplayText,
  isSafeImageDataUrl
} = require("./src/main/utils.js");
const { runtimeState } = require("./src/main/state.js");
const { buildHomeSnapshot, getHomeBounds } = require("./src/main/home.js");
const {
  normalizeMemoryEntry,
  rememberUserFacts
} = require("./src/main/memory.js");
const {
  detectUserEmotion,
  detectEmotion,
  resolvePetEmotion,
  toDisplayReasoning,
  isSeriousOrTechnical
} = require("./src/main/emotion.js");
const {
  activityState,
  ACTIVITY_POLL_INTERVAL,
  getActivityLines,
  startActivityMonitor
} = require("./src/main/activity.js");
const {
  buildSystemPrompt,
  createUserHistoryMessage,
  buildUserContentForAi,
  historyToContextMessages,
  isReasoningModel,
  extractReasoning
} = require("./src/main/prompt.js");
const {
  chooseStickerParts,
  insertPartNaturally,
  getBubbleTextFromParts
} = require("./src/main/sticker.js");
const {
  DEFAULT_BUBBLE_SIZE,
  bubbleState,
  clampRectToWorkArea,
  calcSideRect,
  calcStackedRectNear,
  createBubbleCandidate,
  getSafeBubbleLayout,
  estimateBubbleTailPoint,
  getVisibleBubbleRect,
  getPetVisualRect,
  getPetAvoidRect,
  getPetBubbleAnchorRect,
  getBubbleTailTarget,
  getBubblePreferredTailOrder,
  scoreBubbleCandidate,
  rectsIntersect,
  expandRect
} = require("./src/main/bubble-layout.js");
const {
  getChatHistory,
  recallChatMessage,
  setMessageFavorite,
  getFavorites,
  getUserStickers,
  importUserSticker,
  saveUserSticker,
  deleteUserSticker,
  getMessageText,
  exportChatHistory
} = require("./src/main/history.js");
const {
  normalizeBaseUrl,
  getModelIdList,
  normalizeProactiveConfig,
  normalizeInitiativeConfig,
  getAiConfig,
  saveAiConfig,
  exportAiConfig,
  importAiConfig,
  normalizeGenerationConfig,
  normalizeTtsConfig,
  normalizeSttConfig
} = require("./src/main/ai-config.js");
const {
  matchInstantReply
} = require("./src/main/keyword-reply.js");
const {
  applyCharacterPreset,
  createPresetFromCurrent,
  getBuiltinPresetIds
} = require("./src/main/character-presets.js");
const {
  getAffectionState,
  addAffection,
  applyAffectionDecay,
  getCheckinState,
  dailyCheckin,
  getAnniversaries,
  saveAnniversaries,
  getAffectionContext,
  getAnniversaryRemindDays,
  saveAnniversaryRemindDays
} = require("./src/main/affection.js");
const {
  AUDIO_CACHE_DIR,
  synthesizeText,
  isTtsConfigured
} = require("./src/main/tts.js");
const {
  getScreenSources,
  captureScreenSource
} = require("./src/main/screen-capture.js");
const {
  getSessionList,
  getActiveSessionHistory,
  getActiveSessionId,
  createSession,
  switchSession,
  renameSession,
  deleteSession,
  clearActiveSession,
  appendToActiveSession,
  setSessionPinned
} = require("./src/main/sessions.js");
const {
  setupTray,
  updateProactiveState,
  updateTrayName,
  destroyTray
} = require("./src/main/tray.js");
const {
  importLive2dModel,
  resetLive2dModel,
  selectLive2dModel,
  getModelStatus,
  getModelFileUrl,
  getCurrentModelPath,
  listImportedModels
} = require("./src/main/model-manager.js");
const {
  getMoodState,
  tickMoodDecay,
  getMoodContext
} = require("./src/main/mood.js");
const {
  recordEvent,
  nightlyConsolidate,
  getLifeContext
} = require("./src/main/life-memory.js");
const {
  startPerceptionMonitor,
  stopPerceptionMonitor,
  shouldReactToEvent,
  isOwnWindow
} = require("./src/main/perception.js");

let petWindow = null;
let panelWindow = null;
let chatWindow = null;
let bubbleWindow = null;
let homeWindow = null;
let homeChatReady = false;

let lookTimer = null;
let bubbleHideTimer = null;
let followTimer = null;
let dragEndTimer = null;

let isPetDragging = false;
let isPositioningAux = false;
let lastFollowAt = 0;
let isQuitting = false;
let proactivePaused = false;
let stealthCheckTimer = null;
let lastCaptureActive = false;
let pokeStreak = 0;
let pokeStreakAt = 0;

/*
  true 时透明桌宠窗口忽略鼠标，点击会交给下方网页/桌面。
  false 时人物、爱心或拖动操作由桌宠窗口接收。
*/
let isPetMousePassthrough = false;
/*
  bubble.js 在实际渲染文字、计算尾巴方向后，
  回传粉白气泡真实主体和尾巴尖端的位置。
  不再把固定的透明窗口 330 × 170 当作真实气泡尺寸。
*/
const DEFAULT_PET_BOUNDS = { width: 430, height: 700, x: 1060, y: 120 };
const DEFAULT_PANEL_SIZE = { width: 740, height: 760 };
const DEFAULT_CHAT_SIZE = { width: 380, height: 560 };


const MAX_CONTEXT_HISTORY = 12;





/*
  IndexTTS2 的 refresh_ui 返回的是“全局最近完成音频”，
  所以所有 TTS 请求必须全局串行，避免多轮聊天抢同一个 spk_*.wav。
*/
let ttsSerialQueue = Promise.resolve();
const activeAiRequests = new Map();

function getDefaultPetBounds() {
  const work = screen.getPrimaryDisplay().workArea;

  return {
    width: DEFAULT_PET_BOUNDS.width,
    height: DEFAULT_PET_BOUNDS.height,
    x: Math.max(
      work.x + 20,
      work.x + work.width - DEFAULT_PET_BOUNDS.width - 80
    ),
    y: Math.max(
      work.y + 20,
      work.y + work.height - DEFAULT_PET_BOUNDS.height - 40
    )
  };
}

function normalizePetBounds(bounds) {
  const fallback = getDefaultPetBounds();

  const x = typeof bounds?.x === "number"
    ? bounds.x
    : fallback.x;

  const y = typeof bounds?.y === "number"
    ? bounds.y
    : fallback.y;
  const work = screen.getDisplayMatching({
    x,
    y,
    width: DEFAULT_PET_BOUNDS.width,
    height: DEFAULT_PET_BOUNDS.height
  }).workArea;

  /*
    强制恢复 petWindow 的合理尺寸。
    防止 settings.json 里保存过异常大窗口，导致：
    - 爱心离人物特别远
    - 透明区域挡住桌面点击
    - 辅助窗口和气泡定位异常
  */
  return clampRectToWorkArea(
    {
      x,
      y,
      width: DEFAULT_PET_BOUNDS.width,
      height: DEFAULT_PET_BOUNDS.height
    },
    work
  );
}

function normalizeAuxBounds(bounds, size) {
  const work = screen.getPrimaryDisplay().workArea;

  if (!bounds) {
    return {
      width: size.width,
      height: size.height,
      x: work.x + 40,
      y: work.y + 80
    };
  }

  return clampRectToWorkArea(
    {
      x: typeof bounds.x === "number" ? bounds.x : work.x + 40,
      y: typeof bounds.y === "number" ? bounds.y : work.y + 80,
      width: size.width,
      height: size.height
    },
    work
  );
}

function createWindow(options, fileName, preloadName = "preload.js") {
  const win = new BrowserWindow({
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, preloadName),
      nodeIntegration: false,
      contextIsolation: true
    },
    ...options
  });

  win.loadFile(fileName);
  win.setAlwaysOnTop(true, "screen-saver");

  /*
    关闭窗口默认隐藏到托盘，而不是退出进程（托盘常驻）。
    只有显式"退出桌宠"或 app.quit() 时才真正销毁。
  */
  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();

      if (win === petWindow) {
        bubbleWindow?.hide();
      }
    }
  });

  return win;
}

function createPetWindow() {
  const settings = loadSettings();
  petWindow = createWindow(
    { ...normalizePetBounds(settings.petBounds), show: Boolean(getModelFileUrl()) },
    "index.html",
    "preload-pet.js"
  );

  petWindow.on("move", handlePetMove);
  petWindow.on("moved", () => {
    savePetBounds();
    followAuxWindows(true);
    endPetDragSoon(80);
  });
  petWindow.on("closed", () => { petWindow = null; });
  petWindow.webContents.on("did-finish-load", () => {
    const currentSettings = loadSettings();

    petWindow.webContents.send("init-settings", {
      scale: currentSettings.modelScale || 0.048,
      visualState: normalizePetVisualState(currentSettings.petVisualState),
      modelPath: getCurrentModelPath(),
      modelFileUrl: getModelFileUrl(),
      expressionFiles: getModelStatus().expressionFiles
    });
  });
}

function createHomeWindow() {
  const win = new BrowserWindow({
    ...getHomeBounds(screen.getPrimaryDisplay().workArea),
    title: "AI 伴侣 · AI Companion",
    frame: false,
    transparent: false,
    alwaysOnTop: false,
    resizable: true,
    show: false,
    backgroundColor: "#fff7fb",
    webPreferences: {
      preload: path.join(__dirname, "preload-home.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: true
    }
  });
  homeWindow = win;
  const homeUrl = pathToFileURL(path.join(__dirname, "home.html")).href;
  win.on("page-title-updated", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (url.split("#")[0] !== homeUrl) event.preventDefault();
  });
  const publishVisibility = () => sendToWindow(
    win, "home:visibility", win.isVisible() && !win.isMinimized()
  );
  for (const eventName of ["show", "hide", "minimize", "restore"]) {
    win.on(eventName, publishVisibility);
  }
  win.webContents.on("did-finish-load", publishVisibility);
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });
  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });
  win.on("closed", () => { homeWindow = null; homeChatReady = false; });
  win.loadFile(path.join(__dirname, "home.html"));
}

function showHome() {
  if (!app.isReady()) return;
  if (!homeWindow || homeWindow.isDestroyed()) {
    createHomeWindow();
    return;
  }
  if (homeWindow.isMinimized()) homeWindow.restore();
  homeWindow.show();
  homeWindow.focus();
}

function isHomeSender(event) {
  return homeWindow && !homeWindow.isDestroyed() && event.sender === homeWindow.webContents;
}

function showHomeChat() {
  showHome();
  sendToWindow(homeWindow, "home:navigate", "home");
}

function getCompanionChatSender() {
  if (homeChatReady && homeWindow && !homeWindow.isDestroyed()) return homeWindow.webContents;
  return chatWindow && !chatWindow.isDestroyed() ? chatWindow.webContents : null;
}

function createAuxWindow(type, fileName, size) {
  const settings = loadSettings();
  const boundsKey = type + "Bounds";
  const win = createWindow({
    ...normalizeAuxBounds(settings[boundsKey], size),
    show: false,
    skipTaskbar: true
  }, fileName);

  win.on("moved", () => saveAuxWindowBounds(type));
  return win;
}

function createPanelWindow() {
  panelWindow = createAuxWindow("panel", "panel.html", DEFAULT_PANEL_SIZE);
}

function createChatWindow() {
  chatWindow = createAuxWindow("chat", "chat.html", DEFAULT_CHAT_SIZE);
}

function createBubbleWindow() {
  bubbleWindow = createWindow({
    width: DEFAULT_BUBBLE_SIZE.width,
    height: DEFAULT_BUBBLE_SIZE.height,
    movable: false,
    focusable: false,
    show: false,
    skipTaskbar: true
  }, "bubble.html", "preload-bubble.js");

  bubbleWindow.on("closed", () => {
    bubbleWindow = null;
    bubbleState.layout = null;
  });
}

function getAuxWindow(type) {
  return type === "panel" ? panelWindow : chatWindow;
}

function sendToWindow(win, channel, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

function savePetBounds() {
  if (!petWindow) return;

  const settings = loadSettings();
  settings.petBounds = petWindow.getBounds();
  saveSettings(settings);
}

function saveAuxWindowBounds(type) {
  if (isPositioningAux) return;

  const win = getAuxWindow(type);

  if (!win || !win.isVisible()) return;

  const settings = loadSettings();

  if (type === "panel") {
    settings.panelBounds = win.getBounds();
    settings.panelPinned = true;
  } else {
    settings.chatBounds = win.getBounds();
    settings.chatPinned = true;
  }

  saveSettings(settings);
}

function saveModelScale(scale) {
  const settings = loadSettings();
  settings.modelScale = scale;
  saveSettings(settings);
}

function normalizePetVisualState(state) {
  const value = state && typeof state === "object" ? state : {};
  const poseFile = String(value.poseFile || "").trim().slice(0, 160);
  const lookFiles = Array.isArray(value.lookFiles)
    ? value.lookFiles
      .map((fileName) => String(fileName || "").trim().slice(0, 160))
      .filter(Boolean)
      .slice(0, 12)
    : [];

  return {
    poseFile,
    lookFiles: Array.from(new Set(lookFiles))
  };
}

function savePetVisualState(state) {
  const settings = loadSettings();
  settings.petVisualState = normalizePetVisualState(state);
  saveSettings(settings);
}

function handlePetMove() {
  /*
    现在只会由 #pet-native-drag-zone 的 Windows 原生拖动触发。
    原生拖动不使用 JS setPosition，因此不会出现人物闪烁或漂移。
  */
  startPetDrag();
  scheduleFollowAuxWindows();
  endPetDragSoon(180);
}

function startPetDrag() {
  if (isPetDragging) return;

  isPetDragging = true;

  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("pet-command", {
      type: "drag-state",
      dragging: true
    });
  }
}

function endPetDragSoon(delay) {
  clearTimeout(dragEndTimer);

  dragEndTimer = setTimeout(() => {
    if (!isPetDragging) return;

    isPetDragging = false;

    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send("pet-command", {
        type: "drag-state",
        dragging: false
      });
    }

    followAuxWindows(true);
  }, delay);
}

function scheduleFollowAuxWindows() {
  const now = Date.now();
  const minGap = 45;

  if (now - lastFollowAt >= minGap) {
    lastFollowAt = now;
    followAuxWindows(false);
    return;
  }

  clearTimeout(followTimer);

  followTimer = setTimeout(() => {
    lastFollowAt = Date.now();
    followAuxWindows(false);
  }, minGap);
}

function followAuxWindows(finalPass = false) {
  if (!petWindow) return;

  positionAuxWindowsNearPet(finalPass);

  if (bubbleWindow && bubbleWindow.isVisible()) {
    const tail = positionBubbleNearPet(finalPass);

    bubbleWindow.webContents.send("bubble-tail", { tail });
  }
}

function positionAuxWindowsNearPet(finalPass = false) {
  if (!petWindow) return;

  const settings = loadSettings();

  const panelVisible = panelWindow?.isVisible();
  const chatVisible = chatWindow?.isVisible();

  const panelPinned = Boolean(settings.panelPinned);
  const chatPinned = Boolean(settings.chatPinned);

  if (!panelVisible && !chatVisible) return;
  if (panelPinned && chatPinned) return;

  const pet = petWindow.getBounds();
  const work = screen.getDisplayMatching(pet).workArea;
  const gap = 34;
  const petOnRight = pet.x + pet.width / 2 > work.x + work.width / 2;

  if (panelVisible && !panelPinned && (!chatVisible || chatPinned)) {
    setWindowBoundsIfChanged(
      panelWindow,
      calcSideRect(
        pet,
        work,
        DEFAULT_PANEL_SIZE,
        petOnRight ? "left" : "right",
        gap
      ),
      finalPass
    );
  }

  if (chatVisible && !chatPinned && (!panelVisible || panelPinned)) {
    setWindowBoundsIfChanged(
      chatWindow,
      calcSideRect(
        pet,
        work,
        DEFAULT_CHAT_SIZE,
        petOnRight ? "left" : "right",
        gap
      ),
      finalPass
    );
  }

  if (panelVisible && chatVisible && !panelPinned && !chatPinned) {
    const panelRect = calcSideRect(
      pet,
      work,
      DEFAULT_PANEL_SIZE,
      petOnRight ? "left" : "right",
      gap
    );

    let chatRect = calcSideRect(
      pet,
      work,
      DEFAULT_CHAT_SIZE,
      petOnRight ? "right" : "left",
      gap
    );

    if (rectsIntersect(panelRect, chatRect)) {
      chatRect = calcStackedRectNear(
        panelRect,
        pet,
        work,
        DEFAULT_CHAT_SIZE,
        gap
      );
    }

    setWindowBoundsIfChanged(panelWindow, panelRect, finalPass);
    setWindowBoundsIfChanged(chatWindow, chatRect, finalPass);
  }
}





function setWindowBoundsIfChanged(win, rect, finalPass = false) {
  if (!win || !rect || win.isDestroyed()) return;

  const current = win.getBounds();
  const next = {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };

  if (
    current.x !== next.x ||
    current.y !== next.y ||
    current.width !== next.width ||
    current.height !== next.height
  ) {
    isPositioningAux = true;
    win.setBounds(next, false);

    setTimeout(() => {
      isPositioningAux = false;
    }, 120);
  }

  if (finalPass) {
    win.setAlwaysOnTop(true, "screen-saver");
  }
}

/*
  桌面气泡定位原则：
  - 每个尾巴方向单独估算尾巴尖端，不共用当前 layout.tailPoint；
  - 优先放人物左右，左右被挡再转上方；
  - 尾巴指向头部外侧 / 上半身，不扎脸；
  - 气泡主体不覆盖人物、聊天窗、控制台，不出屏。
*/
function positionBubbleNearPet(finalPass = false) {
  if (!petWindow || !bubbleWindow?.isVisible()) {
    return bubbleState.layout?.tail || "tail-right";
  }

  const pet = petWindow.getBounds();
  const work = screen.getDisplayMatching(pet).workArea;

  const bubbleSize = getBubbleWindowSize();
  const windowWidth = bubbleSize.width;
  const windowHeight = bubbleSize.height;

  const layout = getSafeBubbleLayout();

  /*
    这里拆成三个概念：

    petVisual：
    真实人物可见区域，来自 renderer.js 上报的 Live2D bounds。
    用来计算头部 / 上半身锚点。

    petAnchor：
    Bubble 尾巴真正要指向的区域。
    比完整人物区域更偏上，避免尾巴扎到腿部或裙摆。

    petAvoid：
    防覆盖区域。
    它可以比真实人物稍微大一点，只负责避让，不负责定位锚点。
  */
  const petVisual = getPetVisualRect(pet);
  const petAnchor = getPetBubbleAnchorRect(petVisual);
  const petAvoid = getPetAvoidRect(petVisual);

  const avoidRects = [
    petAvoid
  ];

  if (chatWindow?.isVisible()) {
    avoidRects.push(expandRect(chatWindow.getBounds(), 8));
  }

  if (panelWindow?.isVisible()) {
    avoidRects.push(expandRect(panelWindow.getBounds(), 8));
  }

  let tailOrder = getBubblePreferredTailOrder(petAnchor, work);

if (isPetDragging && bubbleState.stableTail) {
  tailOrder = [
    bubbleState.stableTail,
    ...tailOrder.filter((tail) => tail !== bubbleState.stableTail)
  ];
}
  const candidates = [];

  for (const tail of tailOrder) {
    const target = getBubbleTailTarget(tail, petAnchor);
    const localTailPoint = estimateBubbleTailPoint(layout, tail);

    candidates.push(
      createBubbleCandidate(
        tail,
        target.x - localTailPoint.x,
        target.y - localTailPoint.y,
        windowWidth,
        windowHeight,
        target,
        localTailPoint
      )
    );
  }

  let best = null;
  let bestScore = Infinity;

  for (const candidate of candidates) {
    const rect = clampRectToWorkArea(candidate, work);
    const localTailPoint = estimateBubbleTailPoint(layout, candidate.tail);

    const actualTailPoint = {
      x: rect.x + localTailPoint.x,
      y: rect.y + localTailPoint.y
    };

    const visibleRect = getVisibleBubbleRect(rect, layout);

    const score = scoreBubbleCandidate({
      candidate,
      visibleRect,
      actualTailPoint,
      target: candidate.target,
      pet: petAnchor,
      work,
      avoidRects
    });

    if (score < bestScore) {
      bestScore = score;
      best = {
        ...rect,
        tail: candidate.tail
      };
    }
  }

  if (!best) {
  return bubbleState.layout?.tail || "tail-right";
}

const now = Date.now();

if (
  best.tail !== bubbleState.stableTail &&
  !finalPass &&
  now - bubbleState.lastTailSwitchAt < 280
) {
  best.tail = bubbleState.stableTail;
} else if (best.tail !== bubbleState.stableTail) {
  bubbleState.stableTail = best.tail;
  bubbleState.lastTailSwitchAt = now;
}

  setWindowBoundsIfChanged(
    bubbleWindow,
    {
      x: best.x,
      y: best.y,
      width: windowWidth,
      height: windowHeight
    },
    finalPass
  );

  return best.tail;
}



























function togglePanel() {
  if (!panelWindow) return;

  if (panelWindow.isVisible()) {
    panelWindow.hide();
    followAuxWindows(true);
    return;
  }

  showPanel();
}

function sendChatNotice(channel, payload) {
  sendToWindow(chatWindow, channel, payload);
  sendToWindow(homeWindow, channel, payload);
}

function showPanel() {
  if (!panelWindow || panelWindow.isDestroyed()) return;
  if (panelWindow.isMinimized()) panelWindow.restore();
  panelWindow.show();
  sendToWindow(
    panelWindow,
    "visual-state",
    normalizePetVisualState(loadSettings().petVisualState)
  );

  if (!petWindow?.isVisible()) {
    const work = screen.getPrimaryDisplay().workArea;
    const width = Math.min(DEFAULT_PANEL_SIZE.width, work.width);
    const height = Math.min(DEFAULT_PANEL_SIZE.height, work.height);
    panelWindow.setBounds({
      width, height,
      x: Math.round(work.x + (work.width - width) / 2),
      y: Math.round(work.y + (work.height - height) / 2)
    });
  } else if (!loadSettings().panelPinned) {
    followAuxWindows(true);
  }

  panelWindow.setAlwaysOnTop(true, "screen-saver");
  panelWindow.focus();
}

function toggleChat() {
  if (!chatWindow) return;

  if (chatWindow.isVisible()) {
    chatWindow.hide();
    followAuxWindows(true);
    return;
  }

  showChat();
}

function showChat() {
  if (!chatWindow || chatWindow.isDestroyed()) return;
  if (chatWindow.isMinimized()) chatWindow.restore();
  chatWindow.show();

  if (!loadSettings().chatPinned) {
    followAuxWindows(true);
  }

  chatWindow.setAlwaysOnTop(true, "screen-saver");
  chatWindow.focus();
}

function showBubble(text, options = {}) {
  const bubbleText = cleanDisplayText(text);

  if (!bubbleWindow || !bubbleText || !petWindow?.isVisible() || !getModelFileUrl()) return;

  bubbleWindow.showInactive();

  const tail = positionBubbleNearPet(true);
  const bubbleSize = getBubbleWindowSize();

  bubbleWindow.webContents.send("bubble-text", {
    text: bubbleText,
    tail,
    scale: bubbleSize.zoom
  });

  clearTimeout(bubbleHideTimer);

  const minDurationMs = Number(options.minDurationMs) || 0;
  const duration = Math.max(
    Math.max(4500, Math.min(12000, bubbleText.length * 180)),
    minDurationMs
  );

  bubbleHideTimer = setTimeout(() => {
    if (bubbleWindow?.isVisible()) {
      bubbleWindow.hide();
    }
  }, duration);
}

/*
  气泡窗口尺寸跟随人物可视宽度缩放（zoom 由 bubble.js 应用到气泡内容），
  避免人物放大后气泡还停留在原大小、压到脸上。
*/
function getBubbleWindowSize() {
  const petBounds = petWindow && !petWindow.isDestroyed()
    ? petWindow.getBounds()
    : DEFAULT_PET_BOUNDS;
  const petVisual = getPetVisualRect(petBounds);
  const sizeFactor = clampNumber(
    (petVisual.width || DEFAULT_PET_BOUNDS.width) / 430,
    0.72,
    1.55
  );

  return {
    width: Math.round(DEFAULT_BUBBLE_SIZE.width * sizeFactor),
    height: Math.round(DEFAULT_BUBBLE_SIZE.height * sizeFactor),
    zoom: sizeFactor
  };
}

/* ---------- 主动说话（存在感） ---------- */

let proactiveTimer = null;
let proactiveGreeted = false;
const recentSpontaneousLines = [];
const recentInteractionLines = [];

function getSpontaneousLinePool() {
  const now = new Date();
  const hour = now.getHours();
  const lines = [];

  if (hour >= 5 && hour < 9) {
    lines.push(
      "早安呀，新的一天，我在呢~",
      "早~ 昨晚睡得好不好呀？",
      "早上好！今天也要元气满满哦"
    );
  } else if (hour >= 9 && hour < 12) {
    lines.push(
      "在忙什么呢~ 我陪着你",
      "偷偷看你一眼，认真做事的样子好帅",
      "累了就歇会儿，我在这儿呢"
    );
  } else if (hour >= 12 && hour < 14) {
    lines.push(
      "中午啦，记得吃饭，不许糊弄我~",
      "到饭点了！有没有好好吃饭？",
      "午休一下嘛，下午才有精神"
    );
  } else if (hour >= 14 && hour < 17) {
    lines.push(
      "下午啦，喝口水歇一歇",
      "在干嘛呀，我有点想你了",
      "忙归忙，记得偶尔看看我嘛~"
    );
  } else if (hour >= 17 && hour < 19) {
    lines.push(
      "这个点该下班/放学了吧，今天辛苦啦~",
      "傍晚了，回来记得叫我一声，我一直在",
      "累了一天，靠我肩膀上歇会儿吧"
    );
  } else if (hour >= 19 && hour < 23) {
    lines.push(
      "晚上好呀~ 今天过得怎么样？",
      "想你了，偷偷亲你一下",
      "在干嘛呢？我在等你找我说话呢~"
    );
  } else {
    lines.push(
      "这么晚啦，该睡觉了宝，我陪你到睡着~",
      "深夜了，别再熬夜了，我会心疼的",
      "睡不着的话……我陪你聊到困为止"
    );
  }

  lines.push(
    "在干嘛呢~ 我有点想你了",
    "累了就靠我一会儿，我在呢",
    "你今天穿那件衣服肯定很好看！",
    "我刚刚在发呆，然后满脑子都是你",
    "哼，你都不找我说话，那我主动一点好啦",
    "对了，我永远站在你这边哦",
    "今天也有在认真喜欢你"
  );

  return lines;
}

function pickSpontaneousLine() {
  const ai = getAiConfig();
  const memories = Array.isArray(ai.memories)
    ? ai.memories.map(normalizeMemoryEntry).filter(Boolean)
    : [];
  const likes = memories.filter((item) => item.type === "like");
  const activities = memories.filter((item) => item.type === "activity");
  const activityFresh =
    activityState.available &&
    activityState.label &&
    Date.now() - activityState.at < ACTIVITY_POLL_INTERVAL * 3;

  if (activityFresh && Math.random() < 0.4) {
    const activityLines = {
      "写代码": "在写代码呀？我就在旁边安静陪着，不吵你~",
      "看视频": "在看视频吗？什么好看的，看完也讲给我听听嘛~",
      "打游戏": "在打游戏呀，专心玩，赢了记得跟我炫耀哦！",
      "跟人聊天": "你又在跟别人聊天……哼，那我也等会儿再找你。",
      "上网冲浪": "在网上逛什么呢，看到好玩的记得分享给我~",
      "写文档办公": "在忙工作呀，注意别坐太久，起来喝口水嘛。",
      "听音乐": "在听歌呀？我猜你听的一定很好听。",
      "敲命令行": "在敲命令行呢，认真的样子有点帅~"
    };
    const line = activityLines[activityState.label];

    if (line) {
      return {
        text: line,
        emotion: "love"
      };
    }
  }

  if (Math.random() < 0.35 && likes.length) {
    const like = likes[Math.floor(Math.random() * likes.length)];
    return {
      text: `对了，你之前说你喜欢${like.text}，现在还在弄吗？`,
      emotion: "love"
    };
  }

  if (Math.random() < 0.25 && activities.length) {
    const activity = activities[Math.floor(Math.random() * activities.length)];
    return {
      text: `你之前说你在${activity.text}，还顺利吗？`,
      emotion: "comfort"
    };
  }

  const pool = getSpontaneousLinePool();
  const fresh = pool.filter((line) => !recentSpontaneousLines.includes(line));
  const candidates = fresh.length ? fresh : pool;

  return {
    text: candidates[Math.floor(Math.random() * candidates.length)],
    emotion: pickRandom(["love", "happy", "happy", "comfort"]) || "happy"
  };
}

function maybeSaySpontaneousLine() {
  if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) {
    return;
  }

  if (runtimeState.isAiBusy) {
    return;
  }

  if (proactivePaused) {
    return;
  }

  if (activityState.captureActive) {
    return;
  }

  if (runtimeState.isVoicePlaying) {
    return;
  }

  if (bubbleWindow?.isVisible()) {
    return;
  }

  if (
    runtimeState.lastUserMessageAt &&
    Date.now() - runtimeState.lastUserMessageAt < 30000
  ) {
    return;
  }

  if (
    runtimeState.lastSpontaneousAt &&
    Date.now() - runtimeState.lastSpontaneousAt < 90000
  ) {
    return;
  }

  if (
    runtimeState.lastInitiativeAt &&
    Date.now() - runtimeState.lastInitiativeAt < 600000
  ) {
    return;
  }

  if (activityState.idleMs > 10 * 60 * 1000) {
    return;
  }

  const line = pickSpontaneousLine();

  if (!line?.text) {
    return;
  }

  runtimeState.lastSpontaneousAt = Date.now();
  recentSpontaneousLines.push(line.text);

  if (recentSpontaneousLines.length > 8) {
    recentSpontaneousLines.shift();
  }

  sendEmotionToPet(line.emotion);
  sendToWindow(petWindow, "pet-command", {
    type: "spontaneous-line",
    text: line.text,
    emotion: line.emotion
  });
  showBubble(line.text);
}

function scheduleProactiveSpeech() {
  clearTimeout(proactiveTimer);

  const ai = getAiConfig();
  const proactive = normalizeProactiveConfig(ai.proactive);

  if (!proactive.enabled) {
    return;
  }

  const min = proactive.minIntervalSec * 1000;
  const max = Math.max(min, proactive.maxIntervalSec * 1000);
  let delay = min + Math.random() * (max - min);

  if (proactive.greetingOnStart && !proactiveGreeted) {
    delay = 20000 + Math.random() * 30000;
    proactiveGreeted = true;
  }

  proactiveTimer = setTimeout(() => {
    maybeSaySpontaneousLine();
    scheduleProactiveSpeech();
  }, delay);
}

/* ---------- 主动发起消息 ---------- */

let initiativeTimer = null;

function scheduleInitiativeTimer() {
  clearTimeout(initiativeTimer);

  const ai = getAiConfig();
  const initiative = normalizeInitiativeConfig(ai.initiative);

  if (!initiative.enabled) {
    return;
  }

  const min = initiative.minIntervalSec * 1000;
  const max = Math.max(min, initiative.maxIntervalSec * 1000);
  const delay = min + Math.random() * (max - min);

  initiativeTimer = setTimeout(async () => {
    await maybeSendInitiativeMessage();
    scheduleInitiativeTimer();
  }, delay);
}

async function maybeSendInitiativeMessage(payload = {}) {
  if (!(homeChatReady && homeWindow && !homeWindow.isDestroyed()) && !petWindow?.isVisible()) {
    return;
  }

  const ai = getAiConfig();

  if (!ai.baseUrl || !ai.apiKey || !ai.model) {
    return;
  }

  if (ai.replyMode === "quiet") {
    return;
  }

  if (proactivePaused) {
    return;
  }

  if (activityState.captureActive) {
    return;
  }

  if (runtimeState.isAiBusy || runtimeState.isVoicePlaying) {
    return;
  }

  if (bubbleWindow?.isVisible()) {
    return;
  }

  if (
    runtimeState.lastUserMessageAt &&
    Date.now() - runtimeState.lastUserMessageAt < 90000
  ) {
    return;
  }

  if (
    runtimeState.lastInitiativeAt &&
    Date.now() - runtimeState.lastInitiativeAt < 300000
  ) {
    return;
  }

  if (activityState.idleMs > 10 * 60 * 1000) {
    return;
  }

  runtimeState.lastInitiativeAt = Date.now();
  runtimeState.lastSpontaneousAt = Date.now();

  const controller = new AbortController();
  const clientMessageId = createId("ini");
  activeAiRequests.set(clientMessageId, controller);

  try {
    const chatSender = getCompanionChatSender();

    const result = await chatWithAiRequest(
      { initiative: true, clientMessageId, scene: payload.scene },
      controller.signal,
      chatSender
    );

    if (result?.messages?.length && chatSender && !chatSender.isDestroyed?.()) {
      chatSender.send("chat-append-parts", {
        clientMessageId, parentMessageId: result.id, parts: result.messages
      });
    }

    sendToWindow(petWindow, "pet-command", {
      type: "initiative-notice"
    });

    if (result?.text && typeof Notification !== "undefined" && Notification.isSupported()) {
      new Notification({
        title: getAiConfig().character?.name || "我的伙伴",
        body: String(result.text).slice(0, 80)
      }).show();
    }
  } catch (error) {
    console.warn("主动发消息失败：", error?.message || error);
  } finally {
    activeAiRequests.delete(clientMessageId);
  }
}

function resetPet() {
  if (!petWindow) return;

  const bounds = getDefaultPetBounds();

  petWindow.setBounds(bounds);
  petWindow.setAlwaysOnTop(true, "screen-saver");

  const settings = loadSettings();

  settings.petBounds = bounds;
  settings.modelScale = 0.048;
  settings.petVisualState = normalizePetVisualState();
  settings.panelPinned = false;
  settings.chatPinned = false;

  saveSettings(settings);

  petWindow.webContents.send("pet-command", {
    type: "reset-all"
  });

  followAuxWindows(true);
}

function startLookAtTimer() {
  clearInterval(lookTimer);

  lookTimer = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) return;

    petWindow.webContents.send("cursor-screen-point", {
      cursor: screen.getCursorScreenPoint(),
      bounds: petWindow.getBounds()
    });
  }, 66);
}






































































/* ---------- 活动感知（本地、只看窗口标题和鼠标闲置） ---------- */

























/*
  把模型返回的英文推理原文，转成角色的"内心戏"，
  界面只展示撒娇风格的一句话，原文不外露。
*/






async function fetchModels(ai) {
  const baseUrl = normalizeBaseUrl(ai.baseUrl);
  const apiKey = String(ai.apiKey || "").trim();

  if (!baseUrl) {
    throw new Error("请先填写 AI 服务地址，例如 https://api.openai.com/v1。");
  }

  const response = await fetchWithTimeout(`${baseUrl}/models`, {
    headers: apiKey
      ? { Authorization: `Bearer ${apiKey}` }
      : {}
  }, 15000);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `刷新模型失败：${response.status} ${message.slice(0, 300)}`
    );
  }

  const data = await response.json();
  const models = getModelIdList(data);

  if (!models.length) {
    throw new Error(
      "模型接口返回为空。你可以手动填写模型 ID，或检查服务地址是否应以 /v1 结尾。"
    );
  }

  return models;
}

async function chatWithAi(payload, streamSender = null) {
  const clientMessageId = payload?.clientMessageId || createId("user");
  const controller = new AbortController();

  activeAiRequests.set(clientMessageId, controller);

  try {
    return await chatWithAiRequest(
      { ...(payload || {}), clientMessageId },
      controller.signal,
      streamSender
    );
  } finally {
    activeAiRequests.delete(clientMessageId);
  }
}

function cancelChatRequest(clientMessageId) {
  const controller = activeAiRequests.get(String(clientMessageId || ""));

  if (!controller) {
    return false;
  }

  controller.abort();
  return true;
}

async function chatWithAiRequest(payload, signal, streamSender = null) {
  const requestStartedAt = Date.now();
  const ai = getAiConfig();

  const text = String(payload?.text || "").trim();
  const image = payload?.image || null;
  const userSticker = payload?.userSticker || null;
  const replyTo = payload?.replyTo || null;
  const clientMessageId = payload?.clientMessageId || createId("user");
  const isInitiative = Boolean(payload?.initiative);
  const replyMode = ["smart", "light", "quiet"].includes(ai.replyMode)
    ? ai.replyMode
    : "smart";

  if (!isInitiative && !text && !image && !userSticker) {
    throw new Error("消息内容不能为空。");
  }

  if (image?.dataUrl && !isSafeImageDataUrl(image.dataUrl)) {
    throw new Error("图片格式无效或体积超过 10MB。");
  }

  const settings = loadSettings();
  const history = getActiveSessionHistory();
  const userEmotion = isInitiative ? "neutral" : detectUserEmotion(text);

  if (!isInitiative) {
    rememberUserFacts(text, settings);
    runtimeState.lastUserMessageAt = Date.now();
    scheduleProactiveSpeech();
    scheduleInitiativeTimer();

    recordEvent(
      "user_chat",
      `和用户聊了天：${String(text || "").slice(0, 40)}`,
      { importance: 0.6, moodScale: 0.5 }
    );

    if (userEmotion === "sad" || userEmotion === "tired" || userEmotion === "anxious") {
      recordEvent("user_sad", "用户看起来有点低落", { importance: 1.4, moodScale: 1 });
    } else if (userEmotion === "happy" || userEmotion === "love") {
      recordEvent("user_happy", "用户今天心情很好", { importance: 1.2, moodScale: 0.8 });
    }

    /*
      养成系统：聊天 +1 好感；每天首次说话自动打卡；
      隔了几天没互动会缓慢降温。
    */
    const affectionGain = addAffection(1, "聊天互动");

    if (affectionGain?.levelUp) {
      recordEvent("level_up", `和用户的羁绊提升到了「${affectionGain.levelTitle}」`, {
        importance: 2
      });
      sendEmotionToPet("love");
      sendToWindow(petWindow, "pet-command", {
        type: "celebrate",
        reason: "level-up",
        level: affectionGain.levelTitle
      });
      sendChatNotice("level-up-notice", {
        levelTitle: affectionGain.levelTitle,
        levelEmoji: affectionGain.levelEmoji
      });
    }

    if (!getCheckinState().doneToday) {
      const checkin = dailyCheckin();

      if (checkin) {
        if (checkin.milestone) {
          recordEvent("anniversary", `连续相伴 ${checkin.streak} 天`, {
            importance: 2
          });
        }

        runtimeState.lastCheckinResult = checkin;
        console.log("每日打卡：", checkin);
        sendEmotionToPet("happy");
        sendToWindow(petWindow, "pet-command", {
          type: "celebrate",
          reason: "checkin"
        });
        sendChatNotice("checkin-notice", {
          streak: checkin.streak,
          delta: checkin.delta,
          total: checkin.total,
          milestone: checkin.milestone || 0,
          milestoneDelta: checkin.milestoneDelta || 0
        });
      }
    } else {
      applyAffectionDecay();
    }
  }

  const userHistoryMessage = isInitiative
    ? null
    : createUserHistoryMessage({
        id: clientMessageId,
        text,
        image,
        userSticker,
        replyTo
      });
  const floor = Math.max(
    0,
    ...history
      .map((item) => Number(item?.floor) || 0)
  ) + 1;

  if (userHistoryMessage) {
    userHistoryMessage.floor = floor;
  }

  const userContent = buildUserContentForAi({
    text,
    image,
    userSticker,
    replyTo
  });

  const sceneSummary = payload?.scene?.summary
    ? String(payload.scene.summary).slice(0, 200)
    : "";
  const initiativeContent = isInitiative
    ? "（当前角色主动找用户聊天。请说一句自然、简短、温暖的话，符合当前角色的说话方式，不要提及\"主动\"\"消息\"\"AI\"，不要用括号动作，不要问一连串问题。" +
      (sceneSummary
        ? `刚刚注意到：${sceneSummary}。可以自然地接一句，但不要显得像在监控，也不要生硬地复述细节。`
        : "") +
      "）"
    : "";

  const baseReplyOptions = {
    text,
    image,
    userSticker,
    replyTo,
    clientMessageId,
    signal,
    streamSender,
    requestStartedAt,
    floor,
    history,
    userHistoryMessage,
    ai,
    userEmotion,
    isInitiative
  };

  /*
    关键词即时回复：常见短句直接秒回，不走大模型。
  */
  if (!isInitiative && !image && !userSticker) {
    const instant = matchInstantReply(text, ai);

    if (instant?.reply) {
      const replyEmotion = detectEmotion(instant.reply) || instant.emotion;
      const petEmotion = resolvePetEmotion(userEmotion, replyEmotion);

      return finishAiReply({
        ...baseReplyOptions,
        reply: instant.reply,
        replyEmotion: petEmotion,
        reasoning: "",
        fromInstant: true
      });
    }
  }

  /*
    静音陪伴：不调用大模型，也没有即时回复命中时，只回极简短句。
  */
  if (replyMode === "quiet") {
    const quietReplies = [
      "嗯嗯，我在呢。",
      "陪你。",
      "好呀。",
      "在听你说呢。",
      "嗯，我懂。"
    ];
    const reply = quietReplies[Math.floor(Math.random() * quietReplies.length)];

    return finishAiReply({
      ...baseReplyOptions,
      reply,
      replyEmotion: "comfort",
      reasoning: "",
      fromQuiet: true
    });
  }

  if (!ai.baseUrl || !ai.apiKey || !ai.model) {
    throw new Error("请先填写 AI 服务地址、访问密钥和对话模型。");
  }

  const generation = normalizeGenerationConfig(ai.generation);
  const requestBody = {
    model: ai.model,
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(
          ai,
          [text, ...history.slice(-4).map((item) => getMessageText(item))]
            .filter(Boolean)
            .join("\n"),
          {
            userEmotion,
            activityLines: getActivityLines(),
            affectionLines: getAffectionContext(),
            moodLines: getMoodContext(),
            lifeLines: getLifeContext(),
            replyMode
          }
        )
      },
      ...historyToContextMessages(history, ai.model).slice(-MAX_CONTEXT_HISTORY),
      {
        role: "user",
        content: isInitiative ? initiativeContent : userContent
      }
    ],
    temperature: generation.temperature,
    top_p: generation.topP,
    frequency_penalty: generation.frequencyPenalty,
    presence_penalty: generation.presencePenalty,
    max_tokens: replyMode === "light"
      ? Math.min(generation.maxTokens, 160)
      : generation.maxTokens
  };

  if (generation.requestReasoning && isReasoningModel(ai.model)) {
    requestBody.reasoning_effort = "medium";
  }

  runtimeState.isAiBusy = true;
  sendAiThinking(true);

  try {
    const response = await fetchWithRetry(
      `${normalizeBaseUrl(ai.baseUrl)}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ai.apiKey}`,
          "Content-Type": "application/json"
        },
        signal,
        body: JSON.stringify(requestBody)
      },
      90000
    );

    if (!response.ok) {
      throw new Error(
        `AI 请求失败：${response.status} ${await response.text()}`
      );
    }

    const data = await response.json();
    const choiceMessage = data.choices?.[0]?.message || {};
    const extracted = extractReasoning(choiceMessage);
    const rawReply = extracted.text;
    const reply = cleanDisplayText(rawReply);
    const replyEmotion = detectEmotion(reply);
    const petEmotion = resolvePetEmotion(userEmotion, replyEmotion);
    const reasoning = toDisplayReasoning(extracted.reasoning, replyEmotion);

    return finishAiReply({
      ...baseReplyOptions,
      reply,
      replyEmotion: petEmotion,
      reasoning
    });
  } finally {
    runtimeState.isAiBusy = false;
    sendAiThinking(false);
  }
}

/*
  回复收尾（AI 回复 / 即时回复 / 静音回复共用）：
  组装自然分段、写历史、冒泡、延迟语音、通知聊天窗口。
*/
async function finishAiReply({
  reply,
  replyEmotion,
  reasoning = "",
  text,
  image,
  userSticker,
  replyTo,
  clientMessageId,
  signal,
  streamSender,
  requestStartedAt,
  floor,
  userHistoryMessage,
  ai,
  userEmotion,
  fromInstant = false,
  fromQuiet = false
}) {
  const cleanReply = cleanDisplayText(reply);

  if (!cleanReply) {
    throw new Error("回复内容为空。");
  }

  const built = await buildNaturalReplyParts(
    cleanReply,
    replyEmotion,
    ai,
    {
      userText: text,
      hasImage: Boolean(image),
      hasSticker: Boolean(userSticker),
      abortSignal: signal
    },
    { deferVoice: true }
  );
  const parts = Array.isArray(built) ? built : built.parts;
  const deferredVoice = Array.isArray(built)
    ? []
    : (built.deferredVoice || []);
  const visibleParts = parts.filter((part) => !part?._pending);

  const assistantMessage = {
    id: createId("assistant"),
    role: "assistant",
    type: "multi",
    content: cleanReply,
    emotion: replyEmotion,
    userEmotion,
    parts,
    createdAt: Date.now(),
    recalled: false,
    favorite: false,
    floor,
    durationMs: Math.max(0, Date.now() - requestStartedAt),
    reasoning: reasoning || "",
    source: fromInstant ? "instant" : (fromQuiet ? "quiet" : "ai")
  };

  if (userHistoryMessage) {
    appendToActiveSession(userHistoryMessage);
  }

  appendToActiveSession(assistantMessage);

  runtimeState.assistantMessageCount += 1;
  sendEmotionToPet(replyEmotion);

  const bubbleText = getBubbleTextFromParts(parts) || cleanReply;
  showBubble(bubbleText);

  if (deferredVoice.length) {
    synthesizeDeferredVoiceParts({
      items: deferredVoice,
      ai,
      signal,
      clientMessageId,
      streamSender,
      assistantMessageId: assistantMessage.id
    }).catch((error) => {
      console.warn("延迟语音合成失败：", error);
    });
  }

  return {
    id: assistantMessage.id,
    text: cleanReply,
    emotion: replyEmotion,
    userEmotion,
    messages: visibleParts,
    reasoning: reasoning || "",
    floor,
    durationMs: assistantMessage.durationMs,
    fromInstant,
    fromQuiet
  };
}

async function fetchWithRetry(url, options = {}, timeout = 90000) {
  try {
    return await fetchWithTimeout(url, options, timeout);
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }

    await sleep(900);
    return fetchWithTimeout(url, options, timeout);
  }
}

function sendAiThinking(thinking) {
  sendToWindow(petWindow, "pet-command", {
    type: "ai-thinking",
    thinking: Boolean(thinking)
  });
}
















/*
  一轮回复不再固定为“文字 + 一条语音”。

  每一段内容只会作为文字或语音中的一种出现，不会重复。
  根据自然聊天语境可形成：
  - 只有文字
  - 只有一条较长语音
  - 连续两三条语音
  - 长短语音混合
  - 文字、语音、表情包穿插
*/
async function buildNaturalReplyParts(reply, emotion, ai, context, options = {}) {
  const cleanReply = cleanDisplayText(reply);

  if (!cleanReply) {
    return options.deferVoice ? { parts: [], deferredVoice: [] } : [];
  }

  const serious = isSeriousOrTechnical(cleanReply, context);
  const segments = splitReplyIntoNaturalSegments(cleanReply);

  if (!segments.length) {
    return options.deferVoice ? { parts: [], deferredVoice: [] } : [];
  }

  const voiceIndexes = chooseVoiceSegmentIndexes(
    segments,
    ai,
    emotion,
    serious
  );

  const parts = [];
  const deferredVoice = [];

  for (let index = 0; index < segments.length; index++) {
    if (context?.abortSignal?.aborted) {
      throw new Error("本次回复已停止。");
    }

    const text = segments[index];

    if (!voiceIndexes.has(index)) {
      parts.push({
        id: createId("text"),
        type: "text",
        text,
        recalled: false,
        favorite: false
      });
      continue;
    }

    if (options.deferVoice) {
      parts.push({
        id: createId("voice"),
        type: "voice",
        text,
        duration: estimateVoiceDuration(text),
        autoplay: true,
        volume: ai.tts.volume,
        audioUrl: "",
        _pending: true,
        recalled: false,
        favorite: false
      });
      deferredVoice.push({ index, text });
      continue;
    }

    try {
      const audioUrl = await synthesizeText(text, ai.tts);

      if (context?.abortSignal?.aborted) {
        throw new Error("本次回复已停止。");
      }

      if (audioUrl) {
        parts.push({
          id: createId("voice"),
          type: "voice",
          text,
          duration: estimateVoiceDuration(text),
          autoplay: false,
          volume: ai.tts.volume,
          audioUrl,
          recalled: false,
          favorite: false
        });
      } else {
        parts.push({
          id: createId("text"),
          type: "text",
          text,
          recalled: false,
          favorite: false
        });
      }
    } catch (error) {
      console.error("IndexTTS2 音频合成失败：", error);

      parts.push({
        id: createId("text"),
        type: "text",
        text,
        recalled: false,
        favorite: false
      });
    }
  }

  const stickers = chooseStickerParts(
    ai,
    emotion,
    cleanReply,
    serious
  );

  for (const sticker of stickers) {
    insertPartNaturally(parts, sticker, {
      preferAnywhere: true
    });
  }

  if (options.deferVoice) {
    return { parts, deferredVoice };
  }

  return parts;
}

/*
  延迟语音：文字先上屏，语音合成完再补发。
  占位 part 保留在历史里的正确位置，合成完成后原位填充并通知聊天窗口。
*/
async function synthesizeDeferredVoiceParts({
  items,
  ai,
  signal,
  clientMessageId,
  streamSender,
  assistantMessageId
}) {
  if (!Array.isArray(items) || !items.length) {
    return;
  }

  for (const item of items) {
    if (signal?.aborted) {
      break;
    }

    try {
      const audioUrl = await synthesizeText(item.text, ai.tts);

      if (signal?.aborted || !audioUrl) {
        continue;
      }

      const voicePart = {
        id: createId("voice"),
        type: "voice",
        text: item.text,
        duration: estimateVoiceDuration(item.text),
        autoplay: true,
        volume: ai.tts.volume,
        audioUrl,
        recalled: false,
        favorite: false
      };

      const settings = loadSettings();
      const history = Array.isArray(settings.chatHistory)
        ? settings.chatHistory
        : [];
      const message = history.find((item) => item.id === assistantMessageId);

      if (message && Array.isArray(message.parts)) {
        const placeholder = message.parts.find(
          (part) =>
            part?._pending === true &&
            part?.text === item.text &&
            !part?.audioUrl
        );

        if (placeholder) {
          Object.assign(placeholder, voicePart);
          delete placeholder._pending;
        } else {
          message.parts.push(voicePart);
        }

        saveSettings(settings);
      }

      if (streamSender && !streamSender.isDestroyed?.()) {
        streamSender.send("chat-append-parts", {
          clientMessageId,
          parentMessageId: assistantMessageId,
          parts: [voicePart]
        });
      }
    } catch (error) {
      console.error("IndexTTS2 音频合成失败：", error);

      /*
        合成失败就把这段语音变成纯文本补上，保证内容不丢失。
      */
      const fallbackPart = {
        id: createId("text"),
        type: "text",
        text: item.text,
        recalled: false,
        favorite: false
      };

      const settings = loadSettings();
      const history = Array.isArray(settings.chatHistory)
        ? settings.chatHistory
        : [];
      const message = history.find((item) => item.id === assistantMessageId);

      if (message && Array.isArray(message.parts)) {
        const placeholder = message.parts.find(
          (part) =>
            part?._pending === true &&
            part?.text === item.text
        );

        if (placeholder) {
          message.parts.splice(
            message.parts.indexOf(placeholder),
            1,
            fallbackPart
          );
          saveSettings(settings);
        }
      }

      if (streamSender && !streamSender.isDestroyed?.()) {
        streamSender.send("chat-append-parts", {
          clientMessageId,
          parentMessageId: assistantMessageId,
          parts: [fallbackPart]
        });
      }
    }
  }
}

function splitReplyIntoNaturalSegments(text) {
  const value = cleanDisplayText(text);

  if (!value) {
    return [];
  }

  if (isSeriousOrTechnical(value, {})) {
    return [value];
  }

  const sentences = value
    .split(/(?<=[。！？!?~～…])\s*/u)
    .map((item) => item.trim())
    .filter(Boolean);

  if (sentences.length === 1) {
    const onlySentence = sentences[0];

    if (
      onlySentence.length > 22 &&
      /[，、；;]/u.test(onlySentence) &&
      Math.random() < 0.42
    ) {
      return splitNaturalText(onlySentence, 32);
    }

    return splitLongNaturalText(onlySentence);
  }

  const targetLength = Math.random() < 0.54 ? 54 : 30;
  const result = [];
  let current = "";

  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
      continue;
    }

    if ((current + sentence).length <= targetLength) {
      current += sentence;
    } else {
      result.push(current);
      current = sentence;
    }
  }

  if (current) {
    result.push(current);
  }

  const expanded = [];

  for (const item of result) {
    if (item.length > 92) {
      expanded.push(...splitLongNaturalText(item));
    } else {
      expanded.push(item);
    }
  }

  return expanded
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function splitLongNaturalText(text) {
  const value = String(text || "").trim();

  if (value.length <= 64) {
    return value ? [value] : [];
  }

  return splitNaturalText(value, 62);
}

function splitNaturalText(text, maxLength) {
  const value = String(text || "").trim();

  if (!value) {
    return [];
  }

  const chunks = value
    .split(/(?<=[，、；;：:])\s*/u)
    .map((item) => item.trim())
    .filter(Boolean);

  if (chunks.length <= 1) {
    return [value];
  }

  const result = [];
  let current = "";

  for (const chunk of chunks) {
    if (!current) {
      current = chunk;
      continue;
    }

    if ((current + chunk).length <= maxLength) {
      current += chunk;
    } else {
      result.push(current);
      current = chunk;
    }
  }

  if (current) {
    result.push(current);
  }

  return result;
}

function chooseVoiceSegmentIndexes(
  segments,
  ai,
  emotion,
  serious
) {
  const selected = new Set();
  const tts = normalizeTtsConfig(ai.tts);

  if (
    !tts.enabled ||
    !isTtsConfigured(ai.tts) ||
    serious ||
    !segments.length
  ) {
    return selected;
  }

  const joined = segments.join("");
  let chance = getVoiceReplyChance(joined, emotion);

  if (Math.random() >= chance) {
    return selected;
  }

  let maxCount = 1;

  if (segments.length >= 2 && Math.random() < 0.56) {
    maxCount = 2;
  }

  if (
    segments.length >= 3 &&
    (emotion === "love" ||
      emotion === "comfort" ||
      emotion === "happy" ||
      emotion === "shy") &&
    Math.random() < 0.28
  ) {
    maxCount = 3;
  }

  if (segments.length === 1) {
    selected.add(0);
    return selected;
  }

  const mayUseOnlyVoice =
    joined.length <= 72 && Math.random() < 0.14;
  const textReserve = mayUseOnlyVoice ? 0 : 1;
  const count = Math.min(maxCount, segments.length - textReserve);

  const indexes = [...segments.keys()];
  shuffleArray(indexes);

  for (const index of indexes.slice(0, count)) {
    selected.add(index);
  }

  return selected;
}

function getVoiceReplyChance(text, emotion) {
  const value = String(text || "");
  const chances = {
    love: 0.62,
    comfort: 0.56,
    shy: 0.53,
    happy: 0.49,
    sad: 0.38,
    angry: 0.34,
    confused: 0.29,
    neutral: 0.24
  };

  let chance = chances[emotion] ?? 0.30;

  if (value.length <= 24) {
    chance += 0.10;
  }

  if (value.length > 180) {
    chance -= 0.24;
  }

  if (
    /辛苦|我陪你|贴贴|抱抱|喜欢|想你|别怕|休息|在呢|没关系/u.test(
      value
    )
  ) {
    chance += 0.10;
  }

  return clampNumber(chance, 0.08, 0.76);
}














function sendEmotionToPet(emotion) {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }

  petWindow.webContents.send("pet-command", {
    type: "ai-emotion",
    emotion
  });
}

function handlePetInteraction(payload = {}) {
  const now = Date.now();

  if (
    typeof runtimeState.lastPetInteractionAt === "number" &&
    now - runtimeState.lastPetInteractionAt < 1300
  ) {
    return;
  }

  runtimeState.lastPetInteractionAt = now;

  if (now - pokeStreakAt > 20000) {
    pokeStreak = 0;
  }

  pokeStreak += 1;
  pokeStreakAt = now;

  scheduleProactiveSpeech();
  scheduleInitiativeTimer();

  const area = normalizeInteractionArea(payload.area);
  const reaction = choosePetInteractionReaction(area);

  petWindow?.webContents.send("pet-command", {
    type: "pet-interaction-reaction",
    area,
    emotion: reaction.emotion,
    expression: reaction.expression,
    motion: reaction.motion
  });

  if (!reaction.quiet) {
    showBubble(reaction.line);
  }
}

function normalizeInteractionArea(area) {
  const value = String(area || "body");

  if (
    [
      "head",
      "face",
      "hand",
      "body",
      "waist",
      "leg"
    ].includes(value)
  ) {
    return value;
  }

  return "body";
}

function choosePetInteractionReaction(area) {
  const recentLines = Array.isArray(recentInteractionLines)
    ? recentInteractionLines
    : [];
  const pools = {
    head: {
      emotions: ["happy", "shy", "love"],
      expressions: [
        "wink.exp3.json",
        "星星眼.exp3.json",
        "爱心眼.exp3.json",
        "耶.exp3.json"
      ],
      lines: [
        "摸头可以，轻一点",
        "欸，头发要乱啦",
        "好啦好啦，摸到了",
        "你很喜欢摸头嘛",
        "唔，别突然摸头",
        "再摸就要收摸头费了",
        "你手好暖……再放一会儿也可以",
        "唔…被摸头会变笨的，你要负责"
      ]
    },
    face: {
      emotions: ["shy", "confused", "angry"],
      expressions: [
        "问号.exp3.json",
        "嫌弃.exp3.json",
        "晕晕.exp3.json",
        "wink.exp3.json"
      ],
      lines: [
        "别戳脸",
        "脸不能乱戳啦",
        "欸，戳到脸了",
        "轻一点嘛",
        "你是不是故意的",
        "再戳脸我要躲开了",
        "哼，再戳我就亲你一下",
        "我脸皮薄，你轻点啦~"
      ]
    },
    hand: {
      emotions: ["happy", "love", "shy"],
      expressions: [
        "比心.exp3.json",
        "爱心眼.exp3.json",
        "wink.exp3.json",
        "耶.exp3.json"
      ],
      lines: [
        "要牵手嘛",
        "手在这里",
        "欸，碰到手了",
        "那就陪你一下",
        "好啦，手给你",
        "只能牵一下哦",
        "你的手好暖和，不许跑",
        "牵手的话，就算约定好啦"
      ]
    },
    body: {
      emotions: ["happy", "confused", "shy"],
      expressions: [
        "问号.exp3.json",
        "wink.exp3.json",
        "耶.exp3.json",
        "星星眼.exp3.json"
      ],
      lines: [
        "戳到我了",
        "好啦，我在",
        "别一直戳呀",
        "你又来啦",
        "轻一点嘛",
        "我没有走神",
        "嗯？怎么啦",
        "在呢",
        "想我啦？想我就直说嘛",
        "被你戳得好心动，怎么赔我"
      ]
    },
    waist: {
      emotions: ["shy", "angry", "confused"],
      expressions: [
        "嫌弃.exp3.json",
        "生气.exp3.json",
        "烦躁.exp3.json",
        "问号.exp3.json"
      ],
      lines: [
        "欸，别挠我",
        "那里有点痒",
        "你又在捣乱",
        "不许偷袭",
        "哼，注意一点",
        "别装作没事",
        "痒痒的啦……再挠就真的生气了哦",
        "你手放哪呢，耍赖是吧"
      ]
    },
    leg: {
      emotions: ["angry", "confused", "shy"],
      expressions: [
        "嫌弃.exp3.json",
        "生气.exp3.json",
        "问号.exp3.json",
        "烦躁.exp3.json"
      ],
      lines: [
        "腿也不许乱戳",
        "喂，注意一点",
        "别乱点啦",
        "你刚刚很可疑",
        "哼，不理你一下",
        "不可以这样",
        "好啦好啦，让你碰一下，就一下"
      ]
    }
  };

  const commonLines = [
    "欸，怎么突然戳我",
    "嗯？找我嘛",
    "你又来啦",
    "欸嘿，被发现了",
    "我在看你呢",
    "干嘛呀",
    "好嘛，陪你一下",
    "你再闹，我可要撒娇了哦",
    "被你戳到啦，我心跳都漏拍了"
  ];

  const pool = pools[area] || pools.body;

  /*
    连点递进：短时间内连续戳，她会从疑惑变成不耐烦，
    戳太多反而会心软哄你——像真人一样的情绪变化。
  */
  const escalated = pokeStreak >= 2;
  const veryPoked = pokeStreak >= 4;

  if (veryPoked && Math.random() < 0.55) {
    const surrenderLines = [
      "好啦好啦，我投降，不凶你了",
      "你赢了……过来，抱一下就不许再戳了",
      "哼，算了，我大人有大量，原谅你",
      "再戳我就要真的撒娇了！"
    ];

    return {
      emotion: "shy",
      expression: "wink.exp3.json",
      motion: "",
      line: surrenderLines[Math.floor(Math.random() * surrenderLines.length)],
      quiet: false
    };
  }

  const lines = [
    ...pool.lines,
    ...commonLines
  ].filter((line) => !recentLines.includes(line));
  const candidates = lines.length ? lines : [...pool.lines, ...commonLines];
  const line = pickRandom(candidates) || "嗯？怎么啦";

  recentInteractionLines.push(line);

  if (recentInteractionLines.length > 10) {
    recentInteractionLines.shift();
  }

  const emotion = pickRandom(pool.emotions) || "happy";
  const expression = pickRandom(pool.expressions) || "";

  /*
    偶尔"没反应"：假装走神/害羞，只做一个轻表情不出声，更像真人。
  */
  if (!escalated && Math.random() < 0.08) {
    return {
      emotion: "shy",
      expression: "wink.exp3.json",
      motion: "",
      line: "",
      quiet: true
    };
  }

  return {
    emotion,
    expression,
    motion: pickMotionForEmotion(area, emotion, escalated),
    line,
    quiet: false
  };
}

/*
  按当前情绪选择配套动作，让"表情 + 动作 + 台词"保持一致。
  动作文件：疑问 / 晕晕 / 烦躁 / 生气 / 流泪 / 麦克风 / 跪姿待机。
*/
function pickMotionForEmotion(area, emotion, escalated) {
  if (escalated) {
    const annoyed = ["shengqi", "fanzao"];

    return annoyed[Math.floor(Math.random() * annoyed.length)];
  }

  if (emotion === "sad") {
    return "liulei";
  }

  if (emotion === "happy" || emotion === "love") {
    return Math.random() < 0.28 ? "maikefeng" : "";
  }

  if (emotion === "angry") {
    return Math.random() < 0.5 ? "shengqi" : "fanzao";
  }

  if (emotion === "confused" || emotion === "shy") {
    const puzzled = ["wenhao", "yunyun"];

    return puzzled[Math.floor(Math.random() * puzzled.length)];
  }

  if (emotion === "comfort" && area === "head") {
    return "guizidaiji";
  }

  return "";
}






































function selectTtsReference() {
  return dialog.showOpenDialog({
    title: "选择参考音频",
    properties: ["openFile"],
    filters: [
      {
        name: "Audio",
        extensions: ["wav", "mp3", "flac", "ogg", "m4a"]
      }
    ]
  }).then((result) => {
    if (result.canceled || !result.filePaths.length) {
      return null;
    }

    return {
      filePath: result.filePaths[0],
      name: path.basename(result.filePaths[0])
    };
  });
}

async function transcribeAudio(audioInput) {
  const stt = normalizeSttConfig(getAiConfig().stt);

  if (!stt.enabled) {
    return {
      text: "",
      message: "语音输入未启用。"
    };
  }

  if (!stt.baseUrl) {
    return {
      text: "",
      message: "语音识别服务地址为空。"
    };
  }

  const dataUrl = String(audioInput?.dataUrl || "");
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    throw new Error("录音数据格式无效。");
  }

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");

  const form = new FormData();

  form.append(
    "file",
    new Blob([buffer], {
      type: mimeType
    }),
    audioInput?.fileName || "record.webm"
  );

  form.append("model", stt.model || "faster-whisper");

  if (stt.language) {
    form.append("language", stt.language);
  }

  const endpoint =
    `${normalizeBaseUrl(stt.baseUrl)}` +
    `${stt.path.startsWith("/") ? stt.path : `/${stt.path}`}`;

  const headers = {};

  if (stt.apiKey) {
    headers.Authorization = `Bearer ${stt.apiKey}`;
  }

  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers,
    body: form
  }, 60000);

  if (!response.ok) {
    throw new Error(
      `语音识别失败：${response.status} ${await response.text()}`
    );
  }

  const data = await response.json();

  return {
    text: cleanDisplayText(
      data.text ||
      data.result?.text ||
      data.data?.text ||
      ""
    )
  };
}

async function selectImage() {
  const result = await dialog.showOpenDialog({
    title: "选择图片",
    properties: ["openFile"],
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp", "gif"]
      }
    ]
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  const filePath = result.filePaths[0];
  const stat = fs.statSync(filePath);

  if (stat.size > MAX_IMAGE_BYTES) {
    throw new Error("图片不能超过 10MB，请压缩后再发送。");
  }
  const ext = path.extname(filePath).toLowerCase();

  let mime = "image/png";

  if (ext === ".jpg" || ext === ".jpeg") {
    mime = "image/jpeg";
  }

  if (ext === ".webp") {
    mime = "image/webp";
  }

  if (ext === ".gif") {
    mime = "image/gif";
  }

  const buffer = fs.readFileSync(filePath);

  return {
    filePath,
    name: path.basename(filePath),
    mime,
    dataUrl:
      `data:${mime};base64,${buffer.toString("base64")}`
  };
}













function syncDesktopShortcut() {
  if (process.platform !== "win32" || !app.isPackaged) {
    return;
  }

  const iconPath = path.join(process.resourcesPath, "icon.ico");
  const shortcutPath = path.join(
    app.getPath("desktop"),
    "Live2D AI Pet.lnk"
  );

  if (!fs.existsSync(iconPath)) {
    return;
  }

  try {
    const operation = fs.existsSync(shortcutPath) ? "update" : "create";

    shell.writeShortcutLink(shortcutPath, operation, {
      target: process.execPath,
      cwd: path.dirname(process.execPath),
      icon: iconPath,
      iconIndex: 0,
      description: "Live2D AI Pet"
    });
  } catch (error) {
    console.warn("同步桌面快捷方式失败：", error);
  }
}

/* ---------- 托盘 / 截图隐身 / 遥控 ---------- */

function togglePetVisibility() {
  if (!petWindow || petWindow.isDestroyed() || !getModelFileUrl()) {
    return false;
  }

  if (petWindow.isVisible()) {
    petWindow.hide();
    bubbleWindow?.hide();
  } else {
    petWindow.show();
    petWindow.setAlwaysOnTop(true, "screen-saver");
  }

  return true;
}

/*
  识别到截图/录屏应用在前台时，让桌宠和气泡先"隐身"，
  避免出现在别人的截图里；退出后自动回来。
*/
function checkScreenshotStealth() {
  if (petWindow?.isDestroyed()) {
    return;
  }

  const stealth = getAiConfig().screenshotStealth;

  if (!stealth?.enabled) {
    lastCaptureActive = false;
    return;
  }

  const captureActive = Boolean(activityState.captureActive);

  if (captureActive === lastCaptureActive) {
    return;
  }

  lastCaptureActive = captureActive;

  if (captureActive) {
    bubbleWindow?.hide();

    if (petWindow?.isVisible()) {
      petWindow.hide();
    }
  } else if (petWindow && !isQuitting && getModelFileUrl()) {
    petWindow.show();
    petWindow.setAlwaysOnTop(true, "screen-saver");
  }
}

function startStealthCheck() {
  clearInterval(stealthCheckTimer);
  checkScreenshotStealth();

  stealthCheckTimer = setInterval(() => {
    checkScreenshotStealth();
  }, 4000);
}

/* ---------- 屏幕感知 / 情绪 / 生活记忆 ---------- */

function buildSceneSummary(event) {
  const app = String(event?.app || "").slice(0, 30);
  const text = String(event?.text || "").trim().slice(0, 60);

  if (event?.type === "app_switch") {
    return text
      ? `切换到了「${app}」，看到：${text}`
      : `切换到了「${app}」`;
  }

  if (event?.type === "content_change") {
    return text
      ? `在「${app}」里看到：${text}`
      : `在「${app}」里有新内容`;
  }

  if (event?.type === "long_session") {
    return `在「${app}」里待了挺久`;
  }

  return `注意到用户在做「${app}」`;
}

function handleSceneEvent(event, scene) {
  if (!event || isOwnWindow(event.app)) {
    return;
  }

  const summary = buildSceneSummary(event);

  recordEvent(event.type, summary, {
    importance: 1.2,
    moodScale: 0.4
  });

  const ai = getAiConfig();
  const shouldReact = shouldReactToEvent(event, {
    intensity: ai.proactive?.intensity || "normal",
    mood: getMoodState().value
  });

  if (!shouldReact) {
    return;
  }

  /*
    快速反应：本地短句秒回，让"看见→开口"几乎没有延迟。
  */
  const quick = reactToSceneQuick(event);

  if (quick) {
    sendEmotionToPet(quick.emotion);
    showBubble(quick.text);
  }

  /*
    深度反应：AI 结合场景、记忆和心情主动接话（低频）。
  */
  const aiReady = Boolean(ai.baseUrl && ai.apiKey && ai.model);

  if (
    aiReady &&
    ai.replyMode !== "quiet" &&
    !runtimeState.isAiBusy &&
    !runtimeState.isVoicePlaying &&
    !bubbleWindow?.isVisible() &&
    Math.random() < 0.3
  ) {
    maybeSendInitiativeMessage({ scene: { summary } }).catch((error) => {
      console.warn("场景主动接话失败：", error?.message || error);
    });
  }
}

function reactToSceneQuick(event) {
  const type = event?.type;
  const app = String(event?.app || "");
  const pools = {
    app_switch: [
      { text: "在看视频呀？好看吗，我也想偷偷看一眼", emotion: "happy" },
      { text: "在打游戏？专心玩，赢了记得跟我炫耀", emotion: "happy" },
      { text: "在跟人聊天呀，那我安静等你", emotion: "comfort" },
      { text: "在写东西呢？认真的样子有点好看", emotion: "love" },
      { text: "在听歌吗？我也想听", emotion: "happy" },
      { text: "又在忙工作啦，注意别坐太久", emotion: "comfort" }
    ],
    content_change: [
      { text: "看到你那边有新动静，我就不打扰啦", emotion: "comfort" },
      { text: "嗯？好像聊得很热闹的样子", emotion: "confused" },
      { text: "我在呢，你忙你的", emotion: "comfort" }
    ],
    long_session: [
      { text: "你都待在这里好久了，起来歇一会儿嘛", emotion: "comfort" },
      { text: "忙这么久，我都有点心疼了", emotion: "comfort" },
      { text: "要不要喝口水？我陪你坐一会儿", emotion: "love" }
    ]
  };
  const list = pools[type] || [];

  if (!list.length) {
    return null;
  }

  const appLine = app.includes("视频") || app.includes("YouTube") || app.includes("哔哩")
    ? pools.app_switch[0]
    : app.includes("游戏") || app.includes("Steam")
      ? pools.app_switch[1]
      : app.includes("微信") || app.includes("QQ") || app.includes("Telegram")
        ? pools.app_switch[2]
        : null;
  const candidate = appLine || list[Math.floor(Math.random() * list.length)];

  return candidate;
}

function startLifeLoop() {
  setInterval(() => {
    tickMoodDecay();

    const hour = new Date().getHours();

    if (hour >= 23 || hour < 3) {
      nightlyConsolidate();
    }
  }, 10 * 60 * 1000);
}

function setProactivePaused(paused) {
  proactivePaused = Boolean(paused);
  updateProactiveState(!proactivePaused);

  if (!proactivePaused) {
    scheduleProactiveSpeech();
    scheduleInitiativeTimer();
  }

  return proactivePaused;
}



async function testAiConnection(ai) {
  const target = ai || getAiConfig();
  const baseUrl = normalizeBaseUrl(target.baseUrl);

  if (!baseUrl) {
    return {
      ok: false,
      message: "请先填写服务地址。"
    };
  }

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/models`,
      {
        headers: String(target.apiKey || "").trim()
          ? { Authorization: `Bearer ${String(target.apiKey).trim()}` }
          : {}
      },
      8000
    );

    if (!response.ok) {
      return {
        ok: false,
        message: `服务响应异常：HTTP ${response.status}`
      };
    }

    const data = await response.json();
    const models = getModelIdList(data);

    return {
      ok: true,
      message: models.length
        ? `连接成功，共发现 ${models.length} 个模型。`
        : "连接成功，但未发现模型列表。"
    };
  } catch (error) {
    return {
      ok: false,
      message: `连接失败：${error?.message || error}`
    };
  }
}

function setMemoryPinned(memoryId, pinned) {
  const settings = loadSettings();
  const memories = Array.isArray(settings.ai?.memories)
    ? settings.ai.memories
    : [];
  const target = memories.find((item) => item?.id === memoryId);

  if (!target) {
    return false;
  }

  target.pinned = Boolean(pinned);

  if (!settings.ai) {
    settings.ai = {};
  }

  settings.ai.memories = memories;
  saveSettings(settings);
  return true;
}

async function selectStickerFolder() {
  const result = await dialog.showOpenDialog({
    title: "选择表情包文件夹",
    properties: ["openDirectory"]
  });

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }

  return {
    canceled: false,
    path: result.filePaths[0]
  };
}


const gotSingleInstanceLock = app.requestSingleInstanceLock();

app.on("second-instance", () => {
  showHome();
});

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
  syncDesktopShortcut();
  createPetWindow();
  createPanelWindow();
  createChatWindow();
  createBubbleWindow();
  createHomeWindow();
    startLookAtTimer();
    scheduleProactiveSpeech();
    scheduleInitiativeTimer();
    startActivityMonitor();
    startStealthCheck();
    startPerceptionMonitor({ onEvent: handleSceneEvent });
    startLifeLoop();

    const startupHour = new Date().getHours();

    if (startupHour >= 23 || startupHour < 3) {
      nightlyConsolidate();
    }

    setupTray({
      onOpenHome: showHome,
      onTogglePet: togglePetVisibility,
      onOpenChat: showHomeChat,
      onOpenPanel: showPanel,
      onToggleProactive: (enabled) => setProactivePaused(!enabled),
      onQuit: () => {
        isQuitting = true;
        app.quit();
      }
    });

  });
}

ipcMain.handle("home:get-snapshot", (event) => {
  if (!isHomeSender(event)) return null;
  return buildHomeSnapshot({
    settings: loadSettings(),
    mood: getMoodState(),
    affection: getAffectionState(),
    checkin: getCheckinState(),
    modelFileUrl: getModelFileUrl(),
    model: getModelStatus(),
    proactivePaused
  });
});

ipcMain.handle("home:get-chat-config", (event) => {
  if (!isHomeSender(event)) return null;
  const ai = getAiConfig();
  return {
    character: { name: String(ai.character?.name || "我的伙伴").slice(0, 40) },
    messageDetails: {
      showTimestamp: ai.messageDetails?.showTimestamp !== false,
      showFloor: ai.messageDetails?.showFloor === true,
      showDuration: ai.messageDetails?.showDuration === true
    }
  };
});

ipcMain.on("home:open-chat", (event) => { if (isHomeSender(event)) showHomeChat(); });
ipcMain.on("home:open-settings", (event) => { if (isHomeSender(event)) showPanel(); });
ipcMain.on("home:close", (event) => { if (isHomeSender(event)) homeWindow.hide(); });
ipcMain.on("home:minimize", (event) => { if (isHomeSender(event)) homeWindow.minimize(); });

ipcMain.handle("begin-pet-window-drag", () => {
  if (!petWindow || petWindow.isDestroyed()) {
    return null;
  }

  /*
    正在拖动时必须接收鼠标，不能保持透明区穿透。
  */
  if (isPetMousePassthrough) {
    petWindow.setIgnoreMouseEvents(false);
    isPetMousePassthrough = false;
  }

  startPetDrag();

  return petWindow.getBounds();
});

ipcMain.on("drag-pet-window-to", (event, payload = {}) => {
  if (
    !petWindow ||
    petWindow.isDestroyed() ||
    !isPetDragging
  ) {
    return;
  }

  const nextX = Math.round(Number(payload.x));
  const nextY = Math.round(Number(payload.y));

  if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
    return;
  }

  /*
    拖动中只改变位置，绝不改变窗口 bounds 的宽高。

    setPosition 比连续 setBounds 更适合透明窗口拖动，
    能显著减少 Windows 下透明窗口高频重绘闪烁。

    petWindow 的 move 监听会低频调用 scheduleFollowAuxWindows()，
    所以这里不再重复调用。
  */
  petWindow.setPosition(nextX, nextY);
});

ipcMain.on("end-pet-window-drag", () => {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }

  savePetBounds();
  followAuxWindows(true);
  endPetDragSoon(80);
});

/*
  透明桌宠窗口的空白区域鼠标穿透。

  renderer.js 会依据当前 Live2D visual bounds 与爱心位置判断：
  - 鼠标在人物 / 爱心附近：enabled = false，桌宠接收鼠标；
  - 鼠标在透明空白区：enabled = true，底下网页或桌面接收鼠标。
*/
ipcMain.on("set-pet-mouse-passthrough", (event, enabled) => {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }

  /*
    拖动过程中强制关闭穿透，避免拖动被桌面抢走。
  */
  const shouldIgnore = Boolean(enabled) && !isPetDragging;

  if (shouldIgnore === isPetMousePassthrough) {
    return;
  }

  petWindow.setIgnoreMouseEvents(shouldIgnore, {
    forward: true
  });

  isPetMousePassthrough = shouldIgnore;
});

ipcMain.on("toggle-panel", togglePanel);
ipcMain.on("toggle-chat", toggleChat);

ipcMain.on("close-panel", () => {
  panelWindow?.hide();
  followAuxWindows(true);
});

ipcMain.on("close-chat", () => {
  chatWindow?.hide();
  followAuxWindows(true);
});

ipcMain.on("close-app", () => {
  app.quit();
});

ipcMain.on("reset-pet", resetPet);

ipcMain.on("save-scale", (event, scale) => {
  saveModelScale(scale);
});

ipcMain.on("save-pet-visual-state", (event, state) => {
  savePetVisualState(state);
});

ipcMain.on("panel-command", (event, command) => {
  sendToWindow(petWindow, "pet-command", command);
});

ipcMain.on("pet-model-info", (event, info) => {
  sendToWindow(panelWindow, "model-info", info);
});

ipcMain.on("pet-visual-state", (event, state) => {
  sendToWindow(panelWindow, "visual-state", state);
});

ipcMain.on("pet-speaking-state", (event, speaking) => {
  petWindow?.webContents.send("pet-command", {
    type: "speaking-state",
    speaking: Boolean(speaking)
  });
});

ipcMain.on("pet-mouth-level", (event, level) => {
  petWindow?.webContents.send("pet-command", {
    type: "pet-mouth-level",
    level: clampNumber(Number(level) || 0, 0, 1)
  });
});

ipcMain.on("voice-playing", (event, payload) => {
  const playing = Boolean(payload?.playing);
  const durationMs = Number(payload?.durationMs) || 0;
  const text = String(payload?.text || "");

  runtimeState.isVoicePlaying = playing;

  if (playing && text) {
    showBubble(text, {
      minDurationMs: Math.max(3000, durationMs + 900)
    });
  }
});

ipcMain.on("pet-interaction", (event, payload) => {
  handlePetInteraction(payload);
});

/*
  bubble.js 的真实气泡布局回传。
  收到后立即依照真实尾巴尖端重新定位气泡。
*/
ipcMain.on("pet-visual-bounds", (event, bounds) => {
  if (!bounds || typeof bounds !== "object") {
    return;
  }

  const prev = bubbleState.petVisualBounds;
  const nextAnchorX = Number(bounds.speechAnchorX);
  const nextAnchorY = Number(bounds.speechAnchorY);
  const nextWidth = Number(bounds.width);
  const nextHeight = Number(bounds.height);

  bubbleState.petVisualBounds = {
    x: Number(bounds.x),
    y: Number(bounds.y),
    width: nextWidth,
    height: nextHeight,
    windowWidth: Number(bounds.windowWidth || 0),
    windowHeight: Number(bounds.windowHeight || 0),

    /*
      renderer.js 上报的说话锚点。
      这是相对于 petWindow 内部的坐标。
    */
    speechAnchorX: nextAnchorX,
    speechAnchorY: nextAnchorY,

    at: Number(bounds.at || Date.now())
  };

  /*
    防抖：姿势过渡期间锚点会连续小幅度抖动，
    只有移动超过阈值时才重新摆放气泡，避免来回跳。
  */
  const moved =
    !prev ||
    Math.abs(nextAnchorX - Number(prev.speechAnchorX || 0)) > 14 ||
    Math.abs(nextAnchorY - Number(prev.speechAnchorY || 0)) > 14 ||
    Math.abs(nextWidth - Number(prev.width || 0)) > (prev.width || 1) * 0.08 ||
    Math.abs(nextHeight - Number(prev.height || 0)) > (prev.height || 1) * 0.08;

  if (bubbleWindow?.isVisible() && moved) {
    const tail = positionBubbleNearPet(true);

    bubbleWindow.webContents.send("bubble-tail", {
      tail
    });
  }
});

ipcMain.on("bubble-layout", (event, layout) => {
  if (!layout || typeof layout !== "object") {
    return;
  }

  bubbleState.layout = {
    tail: layout.tail,
    bubble: layout.bubble,
    tailPoint: layout.tailPoint
  };

  if (bubbleWindow?.isVisible()) {
    const tail = positionBubbleNearPet(true);

    bubbleWindow.webContents.send("bubble-tail", {
      tail
    });
  }
});

ipcMain.handle("get-ai-config", () => getAiConfig());

ipcMain.handle("save-ai-config", (event, ai) => {
  return saveAiConfig(ai);
});

ipcMain.handle("export-ai-config", () => exportAiConfig());

ipcMain.handle("import-ai-config", () => importAiConfig());

ipcMain.handle("refresh-models", async (event, ai) => {
  return fetchModels(ai);
});

ipcMain.handle("send-chat-message", async (event, payload) => {
  return chatWithAi(payload, event.sender);
});

ipcMain.handle("cancel-chat-message", (event, clientMessageId) => {
  return cancelChatRequest(clientMessageId);
});

ipcMain.handle("get-chat-history", (event) => {
  if (isHomeSender(event)) homeChatReady = true;
  return getChatHistory();
});

ipcMain.handle("export-chat-history", (event, format) => {
  return exportChatHistory(format);
});

ipcMain.handle("clear-chat-history", () => {
  return clearActiveSession();
});

/* ---------- 多会话 ---------- */

ipcMain.handle("get-sessions", () => {
  return getSessionList();
});

ipcMain.handle("create-session", (event, title) => {
  return createSession(title);
});

ipcMain.handle("switch-session", (event, sessionId) => {
  return switchSession(sessionId);
});

ipcMain.handle("rename-session", (event, payload) => {
  return renameSession(payload?.id, payload?.title);
});

ipcMain.handle("delete-session", (event, sessionId) => {
  return deleteSession(sessionId);
});

ipcMain.handle("clear-active-session", () => {
  return clearActiveSession();
});

ipcMain.handle("set-session-pinned", (event, payload) => {
  return setSessionPinned(payload?.id, payload?.pinned);
});

/* ---------- 好感度 / 打卡 / 纪念日 ---------- */

ipcMain.handle("get-affection", () => {
  return getAffectionState();
});

ipcMain.handle("add-affection", (event, payload) => {
  return addAffection(
    Number(payload?.delta) || 0,
    String(payload?.reason || "互动")
  );
});

ipcMain.handle("get-checkin", () => {
  return getCheckinState();
});

ipcMain.handle("checkin-now", () => {
  return dailyCheckin();
});

ipcMain.handle("get-anniversaries", () => {
  return getAnniversaries();
});

ipcMain.handle("save-anniversaries", (event, list) => {
  return saveAnniversaries(list);
});

ipcMain.handle("get-anniversary-remind-days", () => {
  return getAnniversaryRemindDays();
});

ipcMain.handle("save-anniversary-remind-days", (event, days) => {
  return saveAnniversaryRemindDays(days);
});

ipcMain.handle("set-memory-pinned", (event, payload) => {
  return setMemoryPinned(payload?.id, payload?.pinned);
});

/* ---------- 角色卡 ---------- */

ipcMain.handle("apply-character-preset", (event, presetId) => {
  const applied = applyCharacterPreset(getAiConfig(), presetId);

  if (!applied) {
    return null;
  }

  const saved = saveAiConfig(applied);

  updateTrayName(saved.character?.name || "我的伙伴");
  return saved;
});

ipcMain.handle("create-character-preset", (event, payload) => {
  const result = createPresetFromCurrent(
    getAiConfig(),
    payload?.name,
    payload?.description
  );
  const ai = getAiConfig();

  ai.characterPresets = result.presets;
  saveAiConfig(ai);

  return result.preset;
});

function publishModelSelection(result) {
  if (result?.canceled) return result;
  bubbleWindow?.hide();
  bubbleState.petVisualBounds = null;
  sendToWindow(petWindow, "pet-command", {
    type: "model-imported",
    path: result.fileUrl,
    name: result.name,
    expressionFiles: result.expressionFiles
  });
  if (result.fileUrl) {
    petWindow?.show();
    petWindow?.setAlwaysOnTop(true, "screen-saver");
  } else {
    petWindow?.hide();
    sendToWindow(panelWindow, "model-info", { expressions: [], motions: [] });
  }
  sendToWindow(homeWindow, "home:model-changed", getModelStatus());
  return result;
}

ipcMain.handle("import-live2d-model", async () => publishModelSelection(await importLive2dModel()));
ipcMain.handle("select-live2d-model", (_event, selected) => publishModelSelection(selectLive2dModel(selected)));
ipcMain.handle("disable-live2d-model", () => publishModelSelection(resetLive2dModel()));
ipcMain.handle("reset-live2d-model", () => publishModelSelection(resetLive2dModel()));

ipcMain.handle("get-live2d-model-info", () => {
  return {
    ...getModelStatus(),
    imported: listImportedModels()
  };
});


/* ---------- 托盘 / 主动说话 ---------- */

ipcMain.handle("set-proactive-paused", (event, paused) => {
  return setProactivePaused(Boolean(paused));
});

ipcMain.handle("get-proactive-state", () => {
  return {
    paused: proactivePaused
  };
});

ipcMain.handle("toggle-pet-visibility", () => {
  return togglePetVisibility();
});

ipcMain.handle("test-ai-connection", async (event, ai) => {
  return testAiConnection(ai);
});

ipcMain.handle("select-sticker-folder", async () => {
  return selectStickerFolder();
});

ipcMain.handle("set-auto-launch", (event, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled)
  });

  return Boolean(enabled);
});

ipcMain.handle("get-auto-launch", () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle("get-audio-cache-info", () => {
  const dir = path.join(app.getPath("userData"), AUDIO_CACHE_DIR);
  let count = 0;
  let bytes = 0;

  try {
    if (fs.existsSync(dir)) {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);

        try {
          const stat = fs.statSync(full);

          if (stat.isFile()) {
            count += 1;
            bytes += stat.size;
          }
        } catch {}
      }
    }
  } catch {}

  return { count, bytes };
});

ipcMain.handle("clear-audio-cache", () => {
  const dir = path.join(app.getPath("userData"), AUDIO_CACHE_DIR);
  let removed = 0;

  try {
    if (fs.existsSync(dir)) {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);

        try {
          const stat = fs.statSync(full);

          if (stat.isFile()) {
            fs.unlinkSync(full);
            removed += 1;
          }
        } catch {}
      }
    }
  } catch {}

  return { removed };
});

ipcMain.handle("recall-chat-message", (event, messageId) => {
  return recallChatMessage(messageId);
});

ipcMain.handle("set-message-favorite", (event, payload) => {
  return setMessageFavorite(
    payload?.messageId,
    payload?.favorite
  );
});

ipcMain.handle("get-favorites", () => {
  return getFavorites();
});

ipcMain.handle("select-image", async () => {
  return selectImage();
});

ipcMain.handle("get-screen-sources", async () => {
  return getScreenSources();
});

ipcMain.handle("capture-screen-source", async (event, sourceId) => {
  return captureScreenSource(sourceId);
});

ipcMain.handle("select-tts-reference", async () => {
  return selectTtsReference();
});

ipcMain.handle("transcribe-audio", async (event, audioInput) => {
  return transcribeAudio(audioInput);
});

ipcMain.handle("get-user-stickers", () => {
  return getUserStickers();
});

ipcMain.handle("import-user-sticker", async () => {
  return importUserSticker();
});

ipcMain.handle("save-user-sticker", (event, sticker) => {
  return saveUserSticker(sticker);
});

ipcMain.handle("delete-user-sticker", (event, stickerId) => {
  return deleteUserSticker(stickerId);
});

app.on("before-quit", () => {
  isQuitting = true;
  savePetBounds();
  stopPerceptionMonitor();
  destroyTray();
});

app.on("window-all-closed", () => {
  /*
    托盘常驻：所有窗口关闭后不退出，驻留系统托盘。
    需要真正退出时用托盘菜单或面板的"退出桌宠"。
  */
});
