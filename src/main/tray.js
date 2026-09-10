const path = require("path");
const { Tray, Menu, nativeImage } = require("electron");
const { getAiConfig } = require("./ai-config.js");

let tray = null;
let proactiveEnabled = true;
let handlers = {};

function createTrayIcon() {
  const candidates = [
    process.resourcesPath
      ? path.join(process.resourcesPath, "icon.ico")
      : "",
    path.join(__dirname, "..", "..", "build", "icon.ico"),
    path.join(__dirname, "..", "..", "build", "icon.png")
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      if (require("fs").existsSync(candidate)) {
        const image = nativeImage.createFromPath(candidate);

        if (!image.isEmpty()) {
          return image;
        }
      }
    } catch {}
  }

  // 兜底：生成一个粉色圆点
  const buffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFElEQVR42mNk+M9QzwAEjIxUAMkwAQAJ+wH8fWl8eAAAAABJRU5ErkJggg==",
    "base64"
  );

  return nativeImage.createFromBuffer(buffer);
}

function buildMenu() {
  const template = [
    {
      label: "打开 AI 伴侣",
      click: () => handlers.onOpenHome?.()
    },
    {
      id: "toggle-pet",
      label: "显示 / 隐藏桌面形象",
      click: () => handlers.onTogglePet?.()
    },
    { type: "separator" },
    {
      label: "回到聊天",
      click: () => handlers.onOpenChat?.()
    },
    {
      label: "打开设置",
      click: () => handlers.onOpenPanel?.()
    },
    { type: "separator" },
    {
      id: "toggle-proactive",
      label: proactiveEnabled ? "暂停主动说话" : "恢复主动说话",
      click: () => {
        proactiveEnabled = !proactiveEnabled;
        handlers.onToggleProactive?.(proactiveEnabled);
        tray.setContextMenu(buildMenu());
      }
    },
    { type: "separator" },
    {
      label: "退出 AI 伴侣",
      click: () => handlers.onQuit?.()
    }
  ];

  return Menu.buildFromTemplate(template);
}

function setupTray(options = {}) {
  handlers = options;

  if (tray) {
    tray.destroy();
  }

  tray = new Tray(createTrayIcon());
  updateTrayName(getAiConfig().character?.name || "我的伙伴");
  tray.on("click", () => handlers.onOpenHome?.());
  tray.on("right-click", () => {
    tray.popUpContextMenu(buildMenu());
  });

  return tray;
}

function updateTrayName(name) {
  const safeName = String(name || "我的伙伴").trim() || "我的伙伴";

  if (tray) {
    tray.setToolTip(`AI 伴侣 · ${safeName}`);
  }
}

function updateProactiveState(enabled) {
  proactiveEnabled = enabled;
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = {
  setupTray,
  updateProactiveState,
  updateTrayName,
  destroyTray,
  isTrayActive: () => Boolean(tray)
};
