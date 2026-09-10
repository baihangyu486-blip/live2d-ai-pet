"use strict";

// Home receives an explicit display DTO; configuration and secrets stay in main.
const asObject = (value) => value && typeof value === "object" && !Array.isArray(value)
  ? value : {};
const text = (value, max = 160) => typeof value === "string"
  ? value.trim().slice(0, max) : "";
const number = (value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = typeof value === "number" || typeof value === "string"
    ? Number(value) : NaN;
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};
const dateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(text(value, 40))
  ? text(value, 40) : "";
const list = (value, count) => Array.isArray(value) ? value.slice(0, count) : [];

function eventDto(value) {
  const event = asObject(value);
  return {
    id: text(event.id, 200),
    type: text(event.type, 40) || "event",
    summary: text(event.summary, 300),
    dateKey: dateKey(event.dateKey),
    at: number(event.at),
    importance: number(event.importance, 1, 0, 100)
  };
}

function buildHomeSnapshot(input = {}) {
  const source = asObject(input);
  const settings = asObject(source.settings);
  const ai = asObject(settings.ai);
  const mood = asObject(source.mood);
  const affection = asObject(source.affection);
  const checkin = asObject(source.checkin);
  const memories = list(ai.memories, 500).map((value) => {
    const entry = typeof value === "string" ? { text: value, type: "legacy" } : asObject(value);
    return {
      id: text(entry.id, 200),
      type: text(entry.type, 40) || "legacy",
      text: text(entry.text, 160),
      pinned: entry.pinned === true,
      lastSeenAt: number(entry.lastSeenAt || entry.createdAt)
    };
  }).filter((entry) => entry.text)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastSeenAt - a.lastSeenAt)
    .slice(0, 80);

  const milestones = list(affection.milestones, 100).map((value) => {
    const milestone = asObject(value);
    return {
      id: text(milestone.id, 200),
      levelIndex: number(milestone.levelIndex, 0, 0, 4),
      title: text(milestone.title, 40),
      score: number(milestone.score, 0, 0, 100),
      reason: text(milestone.reason),
      at: number(milestone.at)
    };
  });

  const events = Array.isArray(settings.events) ? settings.events.slice(-120) : [];
  const diaries = list(settings.diaries, 90).map((value) => {
    const diary = asObject(value);
    return {
      dateKey: dateKey(diary.dateKey),
      text: text(diary.text, 800),
      mood: number(diary.mood, 0, -10, 10),
      at: number(diary.at)
    };
  }).filter((entry) => entry.dateKey && entry.text)
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  let fileUrl = "";
  try {
    const candidate = new URL(text(source.modelFileUrl, 4096));
    if (candidate.protocol === "file:") fileUrl = candidate.href;
  } catch {}

  return {
    character: { name: text(asObject(ai.character).name, 40) || "我的伙伴" },
    mood: {
      value: number(mood.value, 0, -10, 10),
      baseline: number(mood.baseline, 0, -10, 10),
      energy: number(mood.energy, 5, 0, 10),
      label: text(mood.label, 30) || "平静",
      updatedAt: number(mood.updatedAt)
    },
    affection: {
      score: number(affection.score, 5, 0, 100),
      levelIndex: number(affection.levelIndex, 0, 0, 4),
      levelTitle: text(affection.levelTitle, 40) || "初识",
      levelEmoji: text(affection.levelEmoji, 12) || "🌱",
      levelDesc: text(affection.levelDesc),
      nextMin: affection.nextMin == null ? null : number(affection.nextMin, 15, 0, 100),
      totalGained: number(affection.totalGained),
      milestones,
      updatedAt: number(affection.updatedAt)
    },
    checkin: {
      lastDate: dateKey(checkin.lastDate),
      streak: number(checkin.streak),
      bestStreak: number(checkin.bestStreak),
      total: number(checkin.total),
      today: dateKey(checkin.today),
      doneToday: checkin.doneToday === true
    },
    memories,
    events: events.map(eventDto).filter((entry) => entry.summary).sort((a, b) => b.at - a.at),
    summaries: list(settings.storySummaries, 60).map(eventDto)
      .filter((entry) => entry.summary).sort((a, b) => b.at - a.at),
    diaries,
    proactivePaused: source.proactivePaused === true,
    model: {
      fileUrl,
      status: fileUrl ? "ready" : asObject(source.model).status === "missing" ? "missing" : "none",
      name: text(asObject(source.model).name, 120)
    },
    generatedAt: number(source.generatedAt, Date.now())
  };
}

function getHomeBounds(workArea = {}) {
  const width = Math.round(number(workArea.width, 1280, 1));
  const height = Math.round(number(workArea.height, 800, 1));
  const windowWidth = Math.min(1180, width);
  const windowHeight = Math.min(800, height);
  return {
    width: windowWidth,
    height: windowHeight,
    minWidth: Math.min(760, width),
    minHeight: Math.min(560, height),
    x: Math.round(number(workArea.x, 0, -Number.MAX_SAFE_INTEGER) + (width - windowWidth) / 2),
    y: Math.round(number(workArea.y, 0, -Number.MAX_SAFE_INTEGER) + (height - windowHeight) / 2)
  };
}

module.exports = { buildHomeSnapshot, getHomeBounds };
