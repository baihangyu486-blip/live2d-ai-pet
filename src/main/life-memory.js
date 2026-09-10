/*
  life-memory.js —— 分层记忆（她记得的"生活"）

  结构：
    settings.events          近期事件（工作记忆/短期记忆）
    settings.storySummaries  压缩后的长期记忆（按天合并）
    settings.diaries         每天睡前整理的"日记"
    settings.mood            情绪状态机（见 mood.js）

  事件会自动合并、裁剪；深夜会"睡前整合"，把今天的事写成日记，
  第二天她会自然地记得昨天发生了什么——像真的过了夜。
*/

const { createId } = require("./utils.js");
const { loadSettings, saveSettings } = require("./storage.js");
const { applyMoodDelta } = require("./mood.js");

const MAX_EVENTS_PER_DAY = 24;
const MAX_SUMMARIES = 60;
const MAX_DIARIES = 90;

const EVENT_MOOD = {
  app_switch: 0.4,
  content_change: 0.2,
  long_session: -0.2,
  user_chat: 0.8,
  user_sad: -1.5,
  user_happy: 1.5,
  anniversary: 1.2,
  level_up: 2.0
};

function formatDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeEvent(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    id: String(source.id || createId("evt")),
    type: String(source.type || "event"),
    summary: String(source.summary || "").trim().slice(0, 120),
    dateKey: String(source.dateKey || formatDateKey()),
    at: Number(source.at) || Date.now(),
    importance: Number(source.importance) || 1
  };
}

function getEvents() {
  const settings = loadSettings();

  return (Array.isArray(settings.events) ? settings.events : [])
    .map(normalizeEvent)
    .filter((item) => item.summary);
}

function getSummaries() {
  const settings = loadSettings();

  return (Array.isArray(settings.storySummaries)
    ? settings.storySummaries
    : []
  ).map(normalizeEvent)
    .filter((item) => item.summary);
}

function getDiaries() {
  const settings = loadSettings();

  return (Array.isArray(settings.diaries) ? settings.diaries : [])
    .filter((item) => item && item.dateKey && item.text)
    .map((item) => ({
      dateKey: String(item.dateKey),
      text: String(item.text || "").slice(0, 800),
      mood: Number(item.mood) || 0,
      at: Number(item.at) || 0
    }));
}

function persistLife({ events, summaries, diaries }) {
  const settings = loadSettings();

  settings.events = events;
  settings.storySummaries = summaries;
  settings.diaries = diaries;
  saveSettings(settings);
}

/*
  记录一件事，并让心情产生轻微波动。
*/
function recordEvent(type, summary, options = {}) {
  const events = getEvents();
  const summaries = getSummaries();
  const diaries = getDiaries();
  const now = Date.now();
  const dateKey = options.dateKey || formatDateKey();
  const cleanSummary = String(summary || "").trim().slice(0, 120);

  if (!cleanSummary) {
    return null;
  }

  const event = {
    id: createId("evt"),
    type,
    summary: cleanSummary,
    dateKey,
    at: now,
    importance: Math.max(0.5, Number(options.importance) || 1)
  };

  events.push(event);

  const todayCount = events.filter((item) => item.dateKey === dateKey).length;

  /*
    当天事件太多就合并成一条长期记忆，避免短期记忆爆炸。
  */
  if (todayCount >= MAX_EVENTS_PER_DAY) {
    const todays = events.filter((item) => item.dateKey === dateKey);

    summaries.unshift({
      id: createId("sum"),
      type: "summary",
      summary: `${dateKey}：${todays
        .slice(-MAX_EVENTS_PER_DAY)
        .map((item) => item.summary)
        .join("；")}`.slice(0, 300),
      dateKey,
      at: now,
      importance: 1
    });

    events.splice(
      0,
      events.length,
      ...events.filter((item) => item.dateKey !== dateKey)
    );
  }

  const overflow = events.length - MAX_EVENTS_PER_DAY * 5;

  if (overflow > 0) {
    events.splice(0, overflow);
  }

  if (summaries.length > MAX_SUMMARIES) {
    summaries.length = MAX_SUMMARIES;
  }

  persistLife({ events, summaries, diaries });

  const moodDelta = EVENT_MOOD[type] ?? 0;

  if (moodDelta) {
    applyMoodDelta(moodDelta * (options.moodScale ?? 1), type);
  }

  return event;
}

/*
  睡前整合：把今天的事写成日记，清掉当天事件。
  返回日记内容；同一天只整合一次。
*/
function nightlyConsolidate(dateKey = formatDateKey()) {
  const events = getEvents();
  const summaries = getSummaries();
  const diaries = getDiaries();

  if (diaries.some((item) => item.dateKey === dateKey)) {
    return null;
  }

  const todays = events.filter((item) => item.dateKey === dateKey);
  const moodState = require("./mood.js").getMoodState();
  const lines = todays.map((item) => item.summary);
  const parts = [];

  if (lines.length) {
    parts.push(`今天：${lines.join("；")}`);
  }

  if (moodState.value <= -4) {
    parts.push("今天心情有点低落，希望明天会好一点。");
  } else if (moodState.value >= 4) {
    parts.push("今天心情很好，和他在一起很开心。");
  } else {
    parts.push("今天过得平平淡淡，但能陪着他，就很好。");
  }

  const text = parts.join("\n");

  diaries.unshift({
    dateKey,
    text,
    mood: moodState.value,
    at: Date.now()
  });

  if (diaries.length > MAX_DIARIES) {
    diaries.length = MAX_DIARIES;
  }

  persistLife({
    events: events.filter((item) => item.dateKey !== dateKey),
    summaries,
    diaries
  });

  return text;
}

/*
  组装给提示词的"生活记忆"上下文：
  最近发生的事 + 记得的过去（日记/长期记忆）+ 昨天发生了什么。
*/
function getLifeContext() {
  const events = getEvents();
  const summaries = getSummaries();
  const diaries = getDiaries();
  const today = formatDateKey();
  const yesterday = formatDateKey(new Date(Date.now() - 86400000));
  const lines = [];

  const recentEvents = events
    .filter((item) => item.dateKey === today)
    .slice(-6);

  if (recentEvents.length) {
    lines.push(
      "你今天注意到的事：",
      ...recentEvents.map((item) => `- ${item.summary}`)
    );
  }

  const yesterdayDiary = diaries.find((item) => item.dateKey === yesterday);

  if (yesterdayDiary) {
    lines.push(
      "昨天你写下的日记：",
      yesterdayDiary.text
    );
  }

  const remembered = diaries
    .filter((item) => item.dateKey !== yesterday && item.dateKey !== today)
    .slice(0, 2);

  for (const diary of remembered) {
    lines.push(`你记得的过去（${diary.dateKey}）：${diary.text.slice(0, 200)}`);
  }

  if (summaries.length) {
    lines.push(
      "更早的回忆：",
      ...summaries.slice(0, 2).map((item) => `- ${item.summary.slice(0, 160)}`)
    );
  }

  return lines;
}

module.exports = {
  MAX_EVENTS_PER_DAY,
  MAX_SUMMARIES,
  MAX_DIARIES,
  EVENT_MOOD,
  formatDateKey,
  normalizeEvent,
  getEvents,
  getSummaries,
  getDiaries,
  recordEvent,
  nightlyConsolidate,
  getLifeContext
};
