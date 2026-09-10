/*
  sessions.js —— 多会话

  会话列表存 settings.sessions（独立 JSON 文件），每条会话自带 messages。
  settings.chatHistory 始终镜像"当前会话"的消息，兼容旧版 UI 与历史模块。
*/

const { createId } = require("./utils.js");
const { loadSettings, saveSettings } = require("./storage.js");

const DEFAULT_SESSION_ID = "session_default";

function normalizeSession(value, index = 0) {
  const source = value && typeof value === "object" ? value : {};

  return {
    id: String(source.id || (index === 0 ? DEFAULT_SESSION_ID : createId("session"))),
    title: String(source.title || `会话 ${index + 1}`).trim(),
    createdAt: Number(source.createdAt) || Date.now(),
    updatedAt: Number(source.updatedAt) || Date.now(),
    messages: Array.isArray(source.messages) ? source.messages : [],
    pinned: Boolean(source.pinned)
  };
}

function getSessions() {
  const settings = loadSettings();

  return (Array.isArray(settings.sessions) ? settings.sessions : [])
    .map(normalizeSession);
}

function getDefaultSession() {
  return {
    id: DEFAULT_SESSION_ID,
    title: "默认会话",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: []
  };
}

function ensureSessions() {
  const settings = loadSettings();
  let sessions = Array.isArray(settings.sessions)
    ? settings.sessions.map(normalizeSession)
    : [];
  let changed = false;

  // 旧版单会话迁移：把历史消息塞进默认会话
  if (
    !sessions.length &&
    Array.isArray(settings.chatHistory) &&
    settings.chatHistory.length
  ) {
    sessions = [{
      id: DEFAULT_SESSION_ID,
      title: "默认会话",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: settings.chatHistory
    }];
    changed = true;
  }

  if (!sessions.length) {
    sessions = [getDefaultSession()];
    changed = true;
  }

  if (!sessions.some((item) => item.id === DEFAULT_SESSION_ID)) {
    sessions.unshift(getDefaultSession());
    changed = true;
  }

  if (!settings.activeSessionId) {
    settings.activeSessionId = sessions[0].id;
    changed = true;
  }

  if (changed) {
    settings.sessions = sessions;
    saveSettings(settings);
  }

  return sessions;
}

function getActiveSession() {
  const sessions = ensureSessions();
  const settings = loadSettings();
  const active = sessions.find((item) => item.id === settings.activeSessionId);

  return active || sessions[0];
}

function getActiveSessionId() {
  const settings = loadSettings();

  return settings.activeSessionId || DEFAULT_SESSION_ID;
}

function getSessionList() {
  return ensureSessions().map((session) => ({
    id: session.id,
    title: session.title,
    messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    pinned: Boolean(session.pinned),
    active: session.id === getActiveSessionId()
  })).sort((left, right) =>
    (Number(right.pinned) - Number(left.pinned)) ||
    (right.updatedAt - left.updatedAt)
  );
}

function getActiveSessionHistory() {
  const session = getActiveSession();

  return Array.isArray(session.messages) ? session.messages : [];
}

function syncChatHistoryMirror(settings) {
  const session = (Array.isArray(settings.sessions) ? settings.sessions : [])
    .find((item) => item.id === settings.activeSessionId);

  if (session) {
    settings.chatHistory = Array.isArray(session.messages)
      ? session.messages
      : [];
  }
}

function touchSession(session) {
  session.updatedAt = Date.now();
  return session;
}

function persistSessions(sessions, activeSessionId) {
  const settings = loadSettings();

  settings.sessions = sessions;
  settings.activeSessionId = activeSessionId;
  syncChatHistoryMirror(settings);
  saveSettings(settings);
}

function createSession(title) {
  const sessions = ensureSessions();
  const session = {
    id: createId("session"),
    title: String(title || "新的会话").trim() || "新的会话",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: []
  };

  sessions.push(session);
  persistSessions(sessions, session.id);

  return getSessionList().find((item) => item.id === session.id);
}

function switchSession(sessionId) {
  const sessions = ensureSessions();

  if (!sessions.some((item) => item.id === sessionId)) {
    return null;
  }

  persistSessions(sessions, sessionId);
  return getSessionList().find((item) => item.id === sessionId);
}

function renameSession(sessionId, title) {
  const sessions = ensureSessions();
  const session = sessions.find((item) => item.id === sessionId);

  if (!session) {
    return null;
  }

  session.title = String(title || "").trim() || session.title;
  touchSession(session);
  persistSessions(sessions, getActiveSessionId());

  return getSessionList().find((item) => item.id === sessionId);
}

function setSessionPinned(sessionId, pinned) {
  const sessions = ensureSessions();
  const session = sessions.find((item) => item.id === sessionId);

  if (!session) {
    return null;
  }

  session.pinned = Boolean(pinned);
  touchSession(session);
  persistSessions(sessions, getActiveSessionId());

  return getSessionList().find((item) => item.id === sessionId);
}

function deleteSession(sessionId) {
  if (sessionId === DEFAULT_SESSION_ID) {
    return {
      success: false,
      message: "默认会话不能删除。"
    };
  }

  const sessions = ensureSessions();
  const index = sessions.findIndex((item) => item.id === sessionId);

  if (index < 0) {
    return {
      success: false,
      message: "未找到该会话。"
    };
  }

  sessions.splice(index, 1);

  const nextActive = getActiveSessionId() === sessionId
    ? sessions[0].id
    : getActiveSessionId();

  persistSessions(sessions, nextActive);

  return {
    success: true,
    activeSession: getSessionList().find((item) => item.id === nextActive)
  };
}

function clearActiveSession() {
  const sessions = ensureSessions();
  const active = sessions.find((item) => item.id === getActiveSessionId());

  if (active) {
    active.messages = [];
    touchSession(active);
  }

  persistSessions(sessions, getActiveSessionId());
  return true;
}

/*
  追加消息到当前会话，并同步 chatHistory 镜像。
  供 chatWithAiRequest 保存后调用。
*/
function appendToActiveSession(message) {
  if (!message) {
    return;
  }

  const sessions = ensureSessions();
  const active = sessions.find((item) => item.id === getActiveSessionId());

  if (active) {
    /*
      自动命名：新会话收到第一条用户文字时，用前几个字当标题。
    */
    const isAutoNamed =
      /^(新的会话|会话 \d+|默认会话)$/.test(active.title);

    if (
      isAutoNamed &&
      message?.role === "user" &&
      message?.type === "text" &&
      String(message.content || "").trim()
    ) {
      const head = String(message.content || "").trim().slice(0, 10);

      active.title = head || active.title;
    }

    active.messages = [
      ...(Array.isArray(active.messages) ? active.messages : []),
      message
    ];
    touchSession(active);
  }

  persistSessions(sessions, getActiveSessionId());
}

module.exports = {
  DEFAULT_SESSION_ID,
  getSessions,
  ensureSessions,
  getActiveSession,
  getActiveSessionId,
  getSessionList,
  getActiveSessionHistory,
  syncChatHistoryMirror,
  createSession,
  switchSession,
  renameSession,
  setSessionPinned,
  deleteSession,
  clearActiveSession,
  appendToActiveSession
};
