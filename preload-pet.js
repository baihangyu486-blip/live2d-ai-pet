const { contextBridge, ipcRenderer } = require("electron");

function on(channel, callback) {
  if (typeof callback !== "function") return;
  ipcRenderer.on(channel, (_event, payload) => callback(payload));
}

contextBridge.exposeInMainWorld("petAPI", {
  togglePanel: () => ipcRenderer.send("toggle-panel"),
  toggleChat: () => ipcRenderer.send("toggle-chat"),
  petInteraction: (payload) =>
    ipcRenderer.send("pet-interaction", payload || {}),
  onInitSettings: (callback) => on("init-settings", callback),
  onCursorScreenPoint: (callback) => on("cursor-screen-point", callback),
  onPetCommand: (callback) => on("pet-command", callback),
  sendVisualState: (state) =>
    ipcRenderer.send("pet-visual-state", state || {}),
  saveVisualState: (state) =>
    ipcRenderer.send("save-pet-visual-state", state || {}),
  reportPetVisualBounds: (bounds) => ipcRenderer.send("pet-visual-bounds", bounds),
  sendModelInfo: (info) => ipcRenderer.send("pet-model-info", info)
});
