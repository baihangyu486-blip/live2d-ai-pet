/*
  history.js —— 聊天记录、收藏、用户贴纸：查询、撤回、收藏、导入导出
  从 main.js 拆分出的独立模块。
*/

const path = require("path");
const fs = require("fs");
const { app, dialog } = require("electron");
const { pathToFileURL, fileURLToPath } = require("url");
const { runtimeState } = require("./state.js");
const { loadSettings, saveSettings } = require("./storage.js");
const { estimateVoiceDuration, cleanDisplayText, clampNumber, createId, isImageFile, isSafeImageDataUrl, MAX_IMAGE_BYTES } = require("./utils.js");
const { normalizeUserSticker } = require("./sticker.js");
const { getAiConfig } = require("./ai-config.js");
const { toDisplayReasoning } = require("./emotion.js");

const USER_STICKER_DIR = path.join("assets", "user-stickers");

function getChatHistory() {
  const settings = loadSettings();
  const history = Array.isArray(settings.chatHistory)
    ? settings.chatHistory
    : [];

  return history.map((item) => {
    if (item && item.role === "assistant" && item.reasoning) {
      return {
        ...item,
        reasoning: toDisplayReasoning(item.reasoning, item.emotion)
      };
    }
    return item;
  });
}

function clearChatHistory() {
  const settings = loadSettings();

  settings.chatHistory = [];
  saveSettings(settings);

  runtimeState.stickerCooldowns = {};
  runtimeState.lastStickerAt = -999;
  runtimeState.assistantMessageCount = 0;

  return true;
}

function recallChatMessage(messageId) {
  const settings = loadSettings();
  const history = Array.isArray(settings.chatHistory)
    ? settings.chatHistory
    : [];

  const message = history.find((item) => item.id === messageId);

  if (!message) {
    return {
      success: false,
      message: "未找到该消息。"
    };
  }

  if (message.role !== "user") {
    return {
      success: false,
      message: "只能撤回自己发送的消息。"
    };
  }

  if (message.recalled) {
    return {
      success: false,
      message: "该消息已撤回。"
    };
  }

  message.recalled = true;
  message.recalledAt = Date.now();

  settings.chatHistory = history;
  saveSettings(settings);

  return {
    success: true
  };
}

function setMessageFavorite(messageId, favorite) {
  const settings = loadSettings();
  const ai = getAiConfig();

  const history = Array.isArray(settings.chatHistory)
    ? settings.chatHistory
    : [];

  const target = findMessageInHistory(history, messageId);

  if (!target) {
    return {
      success: false,
      message: "未找到该消息。"
    };
  }

  const type = normalizeFavoriteType(target);

  if (type === "sticker") {
    return {
      success: false,
      message: "表情包请存到表情库。"
    };
  }

  const favorites = Array.isArray(ai.favorites)
    ? ai.favorites
    : [];

  const index = favorites.findIndex(
    (item) => item.messageId === messageId
  );

  if (favorite && index < 0) {
    favorites.push(createFavoriteSnapshot(target, messageId));
  }

  if (favorite && index >= 0) {
    favorites[index] = {
      ...favorites[index],
      ...createFavoriteSnapshot(target, messageId),
      favoriteAt: favorites[index].favoriteAt || Date.now()
    };
  }

  if (!favorite && index >= 0) {
    favorites.splice(index, 1);
  }

  if (target.__partRef) {
    target.__partRef.favorite = Boolean(favorite);
  } else if (target.__messageRef) {
    target.__messageRef.favorite = Boolean(favorite);
  }

  settings.ai = {
    ...ai,
    favorites
  };

  settings.chatHistory = history;

  saveSettings(settings);

  return {
    success: true,
    favorite: Boolean(favorite)
  };
}

function createFavoriteSnapshot(target, messageId) {
  const type = normalizeFavoriteType(target);

  const item = {
    id: createId("favorite"),
    messageId,
    role: target.role || "assistant",
    type,
    text: getMessageText(target),
    createdAt: target.createdAt || Date.now(),
    favoriteAt: Date.now(),
    recalled: Boolean(target.recalled)
  };

  if (type === "voice") {
    item.audioUrl = target.audioUrl || target.audioPath || "";
    item.duration = target.duration || estimateVoiceDuration(target.text || "");
    item.volume =
      typeof target.volume === "number"
        ? target.volume
        : 1;
  }

  if (type === "image") {
    item.image = getMessageImage(target);
  }

  return item;
}

function normalizeFavoriteType(target) {
  if (target.type === "voice") return "voice";
  if (target.type === "image") return "image";
  if (target.type === "sticker") return "sticker";

  if (target.audioUrl || target.audioPath) return "voice";
  if (target.image) return "image";
  if (target.sticker || target.path) return "sticker";

  return "text";
}

function getMessageImage(target) {
  if (target.image) {
    return target.image;
  }

  if (target.dataUrl) {
    return {
      dataUrl: target.dataUrl,
      name: target.name || "image"
    };
  }

  return null;
}

function findMessageInHistory(history, messageId) {
  for (const item of history) {
    if (item.id === messageId) {
      return {
        ...item,
        __messageRef: item
      };
    }

    if (Array.isArray(item.parts)) {
      const part = item.parts.find(
        (candidate) => candidate.id === messageId
      );

      if (part) {
        return {
          ...part,
          role: item.role,
          parentMessageId: item.id,
          createdAt: item.createdAt,
          __partRef: part,
          __messageRef: item
        };
      }
    }
  }

  return null;
}

function getMessageText(message) {
  if (message.type === "voice") {
    return cleanDisplayText(message.text || "");
  }

  if (message.type === "image") {
    return cleanDisplayText(message.text || message.content || "");
  }

  if (message.type === "sticker") {
    return "";
  }

  return cleanDisplayText(message.text || message.content || "");
}

function getFavorites() {
  return getAiConfig().favorites || [];
}

function getUserStickers() {
  return getAiConfig().userStickers || [];
}

async function importUserSticker() {
  const result = await dialog.showOpenDialog({
    title: "导入表情",
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

  const sourcePath = result.filePaths[0];
  const ext = path.extname(sourcePath).toLowerCase();

  const targetDir = path.join(
    app.getPath("userData"),
    USER_STICKER_DIR
  );

  fs.mkdirSync(targetDir, {
    recursive: true
  });

  const targetPath = path.join(
    targetDir,
    `${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}${ext}`
  );

  fs.copyFileSync(sourcePath, targetPath);

  return {
    id: createId("user_sticker"),
    name: path.basename(sourcePath, ext),
    path: pathToFileURL(targetPath).href,
    tags: [],
    description: "",
    createdAt: Date.now()
  };
}

function saveUserSticker(sticker) {
  const settings = loadSettings();
  const ai = getAiConfig();

  const item = normalizeUserSticker(sticker);

  const exists = ai.userStickers.findIndex(
    (candidate) => candidate.id === item.id
  );

  if (exists >= 0) {
    ai.userStickers[exists] = item;
  } else {
    ai.userStickers.push(item);
  }

  settings.ai = {
    ...ai,
    userStickers: ai.userStickers
  };

  saveSettings(settings);

  return item;
}

function deleteUserSticker(stickerId) {
  const settings = loadSettings();
  const ai = getAiConfig();

  const sticker = ai.userStickers.find(
    (item) => item.id === stickerId
  );

  if (sticker?.path?.startsWith("file:")) {
    try {
      const localPath = fileURLToPath(sticker.path);

      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    } catch {}
  }

  ai.userStickers = ai.userStickers.filter(
    (item) => item.id !== stickerId
  );

  settings.ai = {
    ...ai,
    userStickers: ai.userStickers
  };

  saveSettings(settings);

  return true;
}

async function exportChatHistory(format = "json") {
  const history = getChatHistory();
  if (format === "archive") {
    return exportChatHistoryArchive(history);
  }
  const normalizedFormat = format === "markdown" ? "markdown" : "json";
  const extension = normalizedFormat === "markdown" ? "md" : "json";
  const result = await dialog.showSaveDialog({
    title: "导出聊天记录",
    defaultPath: `AI伴侣聊天记录-${formatExportDate(Date.now())}.${extension}`,
    filters: normalizedFormat === "markdown"
      ? [{ name: "Markdown 文档", extensions: ["md"] }]
      : [{ name: "JSON 记录", extensions: ["json"] }]
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  const content = normalizedFormat === "markdown"
    ? chatHistoryToMarkdown(history)
    : JSON.stringify({
      exportedAt: new Date().toISOString(),
      app: "Live2D AI Pet",
      messages: history
    }, null, 2);

  fs.writeFileSync(result.filePath, content, "utf-8");
  return { canceled: false, filePath: result.filePath, format: normalizedFormat };
}

async function exportChatHistoryArchive(history) {
  const result = await dialog.showOpenDialog({
    title: "选择完整存档保存位置",
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }

  const archiveRoot = path.join(
    result.filePaths[0],
    `AI伴侣聊天记录-${formatExportDate(Date.now())}`
  );
  const mediaRoot = path.join(archiveRoot, "media");
  fs.mkdirSync(mediaRoot, { recursive: true });

  const archivedHistory = JSON.parse(JSON.stringify(history || []));
  const copied = new Map();
  let mediaIndex = 0;

  const copyMedia = (value, label) => {
    const raw = String(value || "");
    if (!raw.startsWith("file:")) return "";
    let sourcePath = "";
    try {
      sourcePath = fileURLToPath(raw);
    } catch {
      return "";
    }
    if (!sourcePath || !fs.existsSync(sourcePath)) return "";
    if (copied.has(sourcePath)) return copied.get(sourcePath);

    const extension = path.extname(sourcePath) || ".bin";
    const targetName = `${String(label || "media").replace(/[^a-z0-9_-]/gi, "_")}_${mediaIndex++}${extension}`;
    const targetPath = path.join(mediaRoot, targetName);
    fs.copyFileSync(sourcePath, targetPath);
    const relative = path.join("media", targetName).replace(/\\/g, "/");
    copied.set(sourcePath, relative);
    return relative;
  };

  for (const item of archivedHistory) {
    if (item?.type === "sticker") {
      item.archivePath = copyMedia(item.sticker?.path || item.path, "sticker");
    }
    if (item?.type === "image") {
      item.archivePath = "内嵌在 JSON 的 dataUrl 中";
    }
    for (const part of item?.parts || []) {
      if (part?.type === "voice") {
        part.archivePath = copyMedia(part.audioUrl || part.audioPath, "voice");
      }
      if (part?.type === "sticker") {
        part.archivePath = copyMedia(part.path, "sticker");
      }
      if (part?.type === "image") {
        part.archivePath = "内嵌在 JSON 的 dataUrl 中";
      }
    }
  }

  fs.writeFileSync(
    path.join(archiveRoot, "chat-history.json"),
    JSON.stringify({
      exportedAt: new Date().toISOString(),
      app: "Live2D AI Pet",
      messages: archivedHistory
    }, null, 2),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(archiveRoot, "chat-history.md"),
    chatHistoryToMarkdown(archivedHistory),
    "utf-8"
  );

  return { canceled: false, filePath: archiveRoot, format: "archive" };
}

function chatHistoryToMarkdown(history) {
  const name = String(getAiConfig().character?.name || "我的伙伴").replace(/[\r\n]/g, " ");
  const lines = [`# 聊天记录 · ${name}`, ""];

  for (const item of history || []) {
    const role = item?.role === "user" ? "你" : name;
    const time = new Date(Number(item?.createdAt) || Date.now())
      .toLocaleString("zh-CN", { hour12: false });
    const floor = item?.floor ? ` · 第 ${item.floor} 轮` : "";
    const body = chatHistoryItemToMarkdown(item);
    lines.push(`## ${role} · ${time}${floor}`, "", body || "【无文字内容】", "");
  }

  return lines.join("\n");
}

function chatHistoryItemToMarkdown(item) {
  if (item?.recalled) return "【已撤回】";
  if (Array.isArray(item?.parts)) {
    return item.parts.map((part) => {
      if (part?.type === "voice") return `【语音】${part.text || ""}`;
      if (part?.type === "sticker") return `【表情】${part.name || ""}`;
      if (part?.type === "image") return `【图片】${part.text || ""}`;
      return part?.text || "";
    }).filter(Boolean).join("\n\n");
  }
  if (item?.type === "sticker") return `【表情】${item.sticker?.name || ""}`;
  if (item?.type === "image") return `【图片】${item.text || item.content || ""}`;
  return getMessageText(item);
}

function formatExportDate(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

module.exports = {
  USER_STICKER_DIR,
  getChatHistory,
  clearChatHistory,
  recallChatMessage,
  setMessageFavorite,
  createFavoriteSnapshot,
  normalizeFavoriteType,
  getMessageImage,
  findMessageInHistory,
  getMessageText,
  getFavorites,
  getUserStickers,
  importUserSticker,
  saveUserSticker,
  deleteUserSticker,
  exportChatHistory,
  exportChatHistoryArchive,
  chatHistoryToMarkdown,
  chatHistoryItemToMarkdown,
  formatExportDate
};
