const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petAPI", {
  togglePanel: () => ipcRenderer.send("toggle-panel"),
  toggleChat: () => ipcRenderer.send("toggle-chat"),

  closePanel: () => ipcRenderer.send("close-panel"),
  closeChat: () => ipcRenderer.send("close-chat"),
  closeApp: () => ipcRenderer.send("close-app"),

  resetPet: () => ipcRenderer.send("reset-pet"),
  saveScale: (scale) => ipcRenderer.send("save-scale", scale),

  sendPanelCommand: (command) =>
    ipcRenderer.send("panel-command", command),

  sendModelInfo: (info) =>
    ipcRenderer.send("pet-model-info", info),

  setPetSpeaking: (speaking) =>
    ipcRenderer.send("pet-speaking-state", speaking),

  setPetMouthLevel: (level) =>
    ipcRenderer.send("pet-mouth-level", level),

  setVoicePlaying: (payload) =>
    ipcRenderer.send("voice-playing", payload || {}),

  petInteraction: (payload) =>
    ipcRenderer.send("pet-interaction", payload || {}),

  /*
    Bubble 实际布局回传。
  */
  reportBubbleLayout: (layout) =>
    ipcRenderer.send("bubble-layout", layout),

  /*
    Live2D 当前可见范围与 Bubble 锚点回传。
  */
  reportPetVisualBounds: (bounds) =>
    ipcRenderer.send("pet-visual-bounds", bounds),

  getAiConfig: () => ipcRenderer.invoke("get-ai-config"),

  saveAiConfig: (ai) =>
    ipcRenderer.invoke("save-ai-config", ai),

  exportAiConfig: () =>
    ipcRenderer.invoke("export-ai-config"),

  importAiConfig: () =>
    ipcRenderer.invoke("import-ai-config"),

  refreshModels: (ai) =>
    ipcRenderer.invoke("refresh-models", ai),

  sendChatMessage: (payload) =>
    ipcRenderer.invoke("send-chat-message", payload),

  cancelChatMessage: (clientMessageId) =>
    ipcRenderer.invoke("cancel-chat-message", clientMessageId),

  getChatHistory: () =>
    ipcRenderer.invoke("get-chat-history"),

  exportChatHistory: (format) =>
    ipcRenderer.invoke("export-chat-history", format),

  clearChatHistory: () =>
    ipcRenderer.invoke("clear-chat-history"),

  getSessions: () =>
    ipcRenderer.invoke("get-sessions"),

  createSession: (title) =>
    ipcRenderer.invoke("create-session", title),

  switchSession: (sessionId) =>
    ipcRenderer.invoke("switch-session", sessionId),

  renameSession: (sessionId, title) =>
    ipcRenderer.invoke("rename-session", { id: sessionId, title }),

  deleteSession: (sessionId) =>
    ipcRenderer.invoke("delete-session", sessionId),

  clearActiveSession: () =>
    ipcRenderer.invoke("clear-active-session"),

  setSessionPinned: (sessionId, pinned) =>
    ipcRenderer.invoke("set-session-pinned", { id: sessionId, pinned }),

  setAutoLaunch: (enabled) =>
    ipcRenderer.invoke("set-auto-launch", enabled),

  getAutoLaunch: () =>
    ipcRenderer.invoke("get-auto-launch"),

  getAudioCacheInfo: () =>
    ipcRenderer.invoke("get-audio-cache-info"),

  clearAudioCache: () =>
    ipcRenderer.invoke("clear-audio-cache"),

  recallChatMessage: (messageId) =>
    ipcRenderer.invoke("recall-chat-message", messageId),

  setMessageFavorite: (messageId, favorite) =>
    ipcRenderer.invoke("set-message-favorite", {
      messageId,
      favorite
    }),

  getFavorites: () =>
    ipcRenderer.invoke("get-favorites"),

  getAffection: () =>
    ipcRenderer.invoke("get-affection"),

  addAffection: (delta, reason) =>
    ipcRenderer.invoke("add-affection", { delta, reason }),

  getCheckin: () =>
    ipcRenderer.invoke("get-checkin"),

  checkinNow: () =>
    ipcRenderer.invoke("checkin-now"),

  getAnniversaries: () =>
    ipcRenderer.invoke("get-anniversaries"),

  saveAnniversaries: (list) =>
    ipcRenderer.invoke("save-anniversaries", list),

  getAnniversaryRemindDays: () =>
    ipcRenderer.invoke("get-anniversary-remind-days"),

  saveAnniversaryRemindDays: (days) =>
    ipcRenderer.invoke("save-anniversary-remind-days", days),

  setMemoryPinned: (memoryId, pinned) =>
    ipcRenderer.invoke("set-memory-pinned", { id: memoryId, pinned }),

  applyCharacterPreset: (presetId) =>
    ipcRenderer.invoke("apply-character-preset", presetId),

  createCharacterPreset: (name, description) =>
    ipcRenderer.invoke("create-character-preset", { name, description }),

  importLive2dModel: () =>
    ipcRenderer.invoke("import-live2d-model"),

  selectLive2dModel: (modelPath) =>
    ipcRenderer.invoke("select-live2d-model", modelPath),

  resetLive2dModel: () =>
    ipcRenderer.invoke("reset-live2d-model"),

  getLive2dModelInfo: () =>
    ipcRenderer.invoke("get-live2d-model-info"),

  setProactivePaused: (paused) =>
    ipcRenderer.invoke("set-proactive-paused", paused),

  getProactiveState: () =>
    ipcRenderer.invoke("get-proactive-state"),

  togglePetVisibility: () =>
    ipcRenderer.invoke("toggle-pet-visibility"),

  testAiConnection: (ai) =>
    ipcRenderer.invoke("test-ai-connection", ai),

  selectStickerFolder: () =>
    ipcRenderer.invoke("select-sticker-folder"),

  selectImage: () =>
    ipcRenderer.invoke("select-image"),

  getScreenSources: () =>
    ipcRenderer.invoke("get-screen-sources"),

  captureScreenSource: (sourceId) =>
    ipcRenderer.invoke("capture-screen-source", sourceId),

  selectTtsReference: () =>
    ipcRenderer.invoke("select-tts-reference"),

  transcribeAudio: (audio) =>
    ipcRenderer.invoke("transcribe-audio", audio),

  getUserStickers: () =>
    ipcRenderer.invoke("get-user-stickers"),

  importUserSticker: () =>
    ipcRenderer.invoke("import-user-sticker"),

  saveUserSticker: (sticker) =>
    ipcRenderer.invoke("save-user-sticker", sticker),

  deleteUserSticker: (stickerId) =>
    ipcRenderer.invoke("delete-user-sticker", stickerId),

  onPetCommand: (callback) => {
    ipcRenderer.on("pet-command", (event, command) => {
      callback(command);
    });
  },

  onCursorScreenPoint: (callback) => {
    ipcRenderer.on("cursor-screen-point", (event, data) => {
      callback(data);
    });
  },

  onModelInfo: (callback) => {
    ipcRenderer.on("model-info", (event, info) => {
      callback(info);
    });
  },

  onVisualState: (callback) => {
    ipcRenderer.on("visual-state", (event, state) => {
      callback(state);
    });
  },

  onInitSettings: (callback) => {
    ipcRenderer.on("init-settings", (event, settings) => {
      callback(settings);
    });
  },

  onBubbleText: (callback) => {
    ipcRenderer.on("bubble-text", (event, payload) => {
      callback(payload);
    });
  },

  onBubbleTail: (callback) => {
    ipcRenderer.on("bubble-tail", (event, payload) => {
      callback(payload);
    });
  },

  onChatAppendParts: (callback) => {
    ipcRenderer.on("chat-append-parts", (event, payload) => {
      callback(payload);
    });
  },

  onCheckinNotice: (callback) => {
    ipcRenderer.on("checkin-notice", (event, payload) => {
      callback(payload);
    });
  },

  onLevelUpNotice: (callback) => {
    ipcRenderer.on("level-up-notice", (event, payload) => {
      callback(payload);
    });
  }
});
