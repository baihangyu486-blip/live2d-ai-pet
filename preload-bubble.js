const { contextBridge, ipcRenderer } = require("electron");

function on(channel, callback) {
  if (typeof callback !== "function") return;
  ipcRenderer.on(channel, (_event, payload) => callback(payload));
}

contextBridge.exposeInMainWorld("petAPI", {
  onBubbleText: (callback) => on("bubble-text", callback),
  onBubbleTail: (callback) => on("bubble-tail", callback),
  reportBubbleLayout: (layout) => ipcRenderer.send("bubble-layout", layout)
});
