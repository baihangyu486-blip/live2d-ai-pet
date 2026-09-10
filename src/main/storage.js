/*
  storage.js —— 多文件持久化层

  原来所有数据都堆在 userData/settings.json 一个文件里（AI 配置、聊天记录、
  自动记忆、世界书、收藏……），消息越多文件越大，每次保存都整文件重写，
  越用越慢，而且一个字段写坏会影响全部数据。

  现在按数据性质拆分：
    - settings.json   小配置 + 其余数据
    - history.json    聊天记录（chatHistory）
    - memories.json   自动记忆（ai.memories）
    - worldbook.json  世界书（ai.worldBook）
    - favorites.json  收藏（ai.favorites）

  对外 API 与旧版完全一致：loadSettings() / saveSettings(settings)，
  主进程其它代码无需改动。写入采用「临时文件 + 原子改名」，避免写一半损坏；
  每次保存只重写有变化的那份文件。首次加载旧版 settings.json 会自动迁移拆分。
*/

const path = require("path");
const fs = require("fs");
const { app, safeStorage } = require("electron");

const SECTION_FILES = [
  {
    key: "chatHistory",
    fileName: "history.json",
    pick: (s) => (s ? s.chatHistory : undefined)
  },
  {
    key: "ai.memories",
    fileName: "memories.json",
    pick: (s) => (s && s.ai ? s.ai.memories : undefined)
  },
  {
    key: "ai.worldBook",
    fileName: "worldbook.json",
    pick: (s) => (s && s.ai ? s.ai.worldBook : undefined)
  },
  {
    key: "ai.favorites",
    fileName: "favorites.json",
    pick: (s) => (s && s.ai ? s.ai.favorites : undefined)
  },
  {
    key: "sessions",
    fileName: "sessions.json",
    pick: (s) => (s ? s.sessions : undefined)
  }
];

let cached = null;
let snapshots = {}; // key -> JSON string（最近一次落盘的内容）

function getDataDir() {
  return app.getPath("userData");
}

function getSettingsPath() {
  return path.join(getDataDir(), "settings.json");
}

function getSectionPath(fileName) {
  return path.join(getDataDir(), fileName);
}

function readJsonFile(file) {
  try {
    if (!fs.existsSync(file)) {
      return null;
    }
    const raw = fs.readFileSync(file, "utf-8");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getPath(obj, keyPath) {
  return keyPath.split(".").reduce(
    (cur, key) => (cur == null ? undefined : cur[key]),
    obj
  );
}

function setPath(obj, keyPath, value) {
  const keys = keyPath.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object") {
      cur[keys[i]] = {};
    }
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

function cloneStripped(settings) {
  const out = {};
  for (const [key, value] of Object.entries(settings || {})) {
    if (key === "chatHistory") {
      continue;
    }
    if (key === "ai" && value && typeof value === "object") {
      const ai = { ...value };
      delete ai.memories;
      delete ai.worldBook;
      delete ai.favorites;
      out.ai = ai;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function writeJsonFile(file, data) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

function toSnapshot(value) {
  return value === undefined ? undefined : JSON.stringify(value);
}

function refreshSnapshots(settings) {
  snapshots = {};
  snapshots.rest = toSnapshot(cloneStripped(settings));
  for (const sec of SECTION_FILES) {
    snapshots[sec.key] = toSnapshot(sec.pick(settings));
  }
}

function loadSettings() {
  if (cached) {
    return cached;
  }

  let merged = readJsonFile(getSettingsPath()) || {};

  // 旧版单文件迁移：把大字段摘到独立文件，并从 settings.json 移除
  try {
    const settingsFile = getSettingsPath();
    if (fs.existsSync(settingsFile)) {
      const backupFile = path.join(getDataDir(), "settings.pre-migrate.json");
      if (!fs.existsSync(backupFile)) {
        fs.copyFileSync(settingsFile, backupFile);
      }
    }
    let changed = false;
    for (const sec of SECTION_FILES) {
      const sectionFile = getSectionPath(sec.fileName);
      if (fs.existsSync(sectionFile)) {
        const value = readJsonFile(sectionFile);
        if (value !== null) {
          setPath(merged, sec.key, value);
        }
      } else {
        const legacy = getPath(merged, sec.key);
        if (legacy !== undefined && legacy !== null) {
          writeJsonFile(sectionFile, legacy);
          changed = true;
        }
      }
    }
    if (changed) {
      writeJsonFile(getSettingsPath(), cloneStripped(merged));
    }
  } catch {
    // 迁移失败不致命：内存里仍保留完整数据，下次保存会再尝试
  }

  refreshSnapshots(merged);
  cached = merged;
  return cached;
}

function saveSettings(settings) {
  if (!settings || typeof settings !== "object") {
    return;
  }

  const current = loadSettings();
  const target = settings === cached ? current : settings;

  for (const sec of SECTION_FILES) {
    const after = sec.pick(target);
    const afterSnapshot = toSnapshot(after);
    if (snapshots[sec.key] !== afterSnapshot) {
      if (after === undefined) {
        writeJsonFile(getSectionPath(sec.fileName), null);
      } else {
        writeJsonFile(getSectionPath(sec.fileName), after);
      }
      snapshots[sec.key] = afterSnapshot;
      setPath(current, sec.key, after);
    }
  }

  const restAfter = cloneStripped(target);
  const restSnapshot = toSnapshot(restAfter);
  if (snapshots.rest !== restSnapshot) {
    writeJsonFile(getSettingsPath(), restAfter);
    snapshots.rest = restSnapshot;
  }

  cached = target;
}

function encryptSecret(value) {
  const plain = String(value || "");

  if (!plain) {
    return "";
  }

  try {
    if (safeStorage.isEncryptionAvailable()) {
      return `safe:v1:${safeStorage
        .encryptString(plain)
        .toString("base64")}`;
    }
  } catch (error) {
    console.warn("安全存储不可用，将保留兼容配置：", error.message);
  }

  return plain;
}

function decryptSecret(value) {
  const stored = String(value || "");

  if (!stored.startsWith("safe:v1:")) {
    return stored;
  }

  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(
        Buffer.from(stored.slice("safe:v1:".length), "base64")
      );
    }
  } catch (error) {
    console.warn("读取安全存储密钥失败：", error.message);
  }

  return "";
}

/*
  测试/迁移用：丢弃内存缓存，下次 loadSettings 重新读盘。
*/
function resetCache() {
  cached = null;
  snapshots = {};
}

module.exports = {
  getSettingsPath,
  loadSettings,
  saveSettings,
  encryptSecret,
  decryptSecret,
  resetCache
};
