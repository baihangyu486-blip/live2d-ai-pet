"use strict";

const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("homeAPI", {
  getSnapshot: () => ipcRenderer.invoke("home:get-snapshot"),
  openChat: () => ipcRenderer.send("home:open-chat"),
  openSettings: () => ipcRenderer.send("home:open-settings"),
  close: () => ipcRenderer.send("home:close"),
  minimize: () => ipcRenderer.send("home:minimize"),
  getModels: () => ipcRenderer.invoke("get-live2d-model-info"),
  importModel: () => ipcRenderer.invoke("import-live2d-model"),
  selectModel: (modelPath) => ipcRenderer.invoke("select-live2d-model", String(modelPath || "")),
  disableModel: () => ipcRenderer.invoke("disable-live2d-model"),
  togglePet: () => ipcRenderer.invoke("toggle-pet-visibility"),
  onNavigate: (callback) => subscribe("home:navigate", callback),
  onModelChanged: (callback) => subscribe("home:model-changed", callback),
  checkin: () => ipcRenderer.invoke("checkin-now"),
  setProactivePaused: (paused) => ipcRenderer.invoke("set-proactive-paused", Boolean(paused)),
  setMemoryPinned: (id, pinned) => ipcRenderer.invoke("set-memory-pinned", {
    id: typeof id === "string" ? id : "",
    pinned: Boolean(pinned)
  }),
  onVisibilityChange: (callback) => subscribe("home:visibility", callback)
});

// The embedded, local chat receives only its existing conversation capabilities.
contextBridge.exposeInMainWorld("chatAPI", {
  getAiConfig: () => ipcRenderer.invoke("home:get-chat-config"),
  closeChat: () => ipcRenderer.send("home:close"),
  togglePanel: () => ipcRenderer.send("home:open-settings"),
  sendChatMessage: (payload) => ipcRenderer.invoke("send-chat-message", payload),
  cancelChatMessage: (id) => ipcRenderer.invoke("cancel-chat-message", id),
  getChatHistory: () => ipcRenderer.invoke("get-chat-history"),
  clearChatHistory: () => ipcRenderer.invoke("clear-chat-history"),
  getSessions: () => ipcRenderer.invoke("get-sessions"),
  createSession: (title) => ipcRenderer.invoke("create-session", title),
  switchSession: (id) => ipcRenderer.invoke("switch-session", id),
  recallChatMessage: (id) => ipcRenderer.invoke("recall-chat-message", id),
  setMessageFavorite: (messageId, favorite) => ipcRenderer.invoke("set-message-favorite", { messageId, favorite }),
  getFavorites: () => ipcRenderer.invoke("get-favorites"),
  getAffection: () => ipcRenderer.invoke("get-affection"),
  getCheckin: () => ipcRenderer.invoke("get-checkin"),
  selectImage: () => ipcRenderer.invoke("select-image"),
  getScreenSources: () => ipcRenderer.invoke("get-screen-sources"),
  captureScreenSource: (sourceId) => ipcRenderer.invoke("capture-screen-source", sourceId),
  transcribeAudio: (audio) => ipcRenderer.invoke("transcribe-audio", audio),
  getUserStickers: () => ipcRenderer.invoke("get-user-stickers"),
  importUserSticker: () => ipcRenderer.invoke("import-user-sticker"),
  saveUserSticker: (sticker) => ipcRenderer.invoke("save-user-sticker", sticker),
  deleteUserSticker: (id) => ipcRenderer.invoke("delete-user-sticker", id),
  setPetSpeaking: (speaking) => ipcRenderer.send("pet-speaking-state", Boolean(speaking)),
  setPetMouthLevel: (level) => ipcRenderer.send("pet-mouth-level", level),
  setVoicePlaying: (payload) => ipcRenderer.send("voice-playing", payload || {}),
  onChatAppendParts: (callback) => subscribe("chat-append-parts", callback),
  onCheckinNotice: (callback) => subscribe("checkin-notice", callback),
  onLevelUpNotice: (callback) => subscribe("level-up-notice", callback)
});
