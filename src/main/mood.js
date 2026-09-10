/*
  mood.js —— 情绪状态机（持续存在的心情）

  她有一个会缓慢漂移、也会慢慢回到基线的心情：
  - 事件（你的情绪、她的所见所闻）会推动心情；
  - 时间会让心情向基线回归；
  - 心情影响她说话的甜度、主动频率和小动作。

  数据存 settings.mood，随应用长期存在。
*/

const { clampNumber } = require("./utils.js");
const { loadSettings, saveSettings } = require("./storage.js");

const MOOD_MIN = -10;
const MOOD_MAX = 10;

function getDefaultMood() {
  return {
    value: 0,
    baseline: 0,
    energy: 5,
    updatedAt: 0
  };
}

function normalizeMood(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    value: clampNumber(source.value ?? 0, MOOD_MIN, MOOD_MAX),
    baseline: clampNumber(source.baseline ?? 0, MOOD_MIN, MOOD_MAX),
    energy: clampNumber(source.energy ?? 5, 0, 10),
    updatedAt: Number(source.updatedAt) || 0
  };
}

function getMoodLabel(value) {
  const mood = clampNumber(Number(value) || 0, MOOD_MIN, MOOD_MAX);

  if (mood >= 6) return "心花怒放";
  if (mood >= 3) return "甜甜的";
  if (mood >= 1) return "轻快";
  if (mood > -1) return "平静";
  if (mood > -4) return "有点闷";
  if (mood > -7) return "低落";
  return "很难过";
}

function getMoodState() {
  const mood = normalizeMood(loadSettings().mood);

  return {
    value: mood.value,
    baseline: mood.baseline,
    energy: mood.energy,
    label: getMoodLabel(mood.value),
    updatedAt: mood.updatedAt
  };
}

/*
  心情变动：delta 会随时间衰减（只把一部分记进当下心情）。
  事件越近，影响越大。
*/
function applyMoodDelta(delta, reason = "") {
  const settings = loadSettings();
  const mood = normalizeMood(settings.mood);
  const now = Date.now();

  mood.value = clampNumber(
    mood.value + (Number(delta) || 0),
    MOOD_MIN,
    MOOD_MAX
  );

  if (mood.value > mood.baseline) {
    mood.baseline = clampNumber(
      mood.baseline + Math.abs(Number(delta) || 0) * 0.08,
      MOOD_MIN,
      MOOD_MAX
    );
  }

  mood.updatedAt = now;
  settings.mood = mood;
  saveSettings(settings);

  return getMoodState();
}

/*
  心情回归：向基线靠拢，精力慢慢恢复。
  每隔一段时间调用一次。
*/
function tickMoodDecay() {
  const settings = loadSettings();
  const mood = normalizeMood(settings.mood);
  const now = Date.now();

  if (!mood.updatedAt) {
    mood.updatedAt = now;
    settings.mood = mood;
    saveSettings(settings);
    return getMoodState();
  }

  const hours = (now - mood.updatedAt) / 3600000;

  if (hours < 1) {
    return getMoodState();
  }

  const drift = clampNumber(hours * 0.35, 0, 2.5);

  if (mood.value > mood.baseline) {
    mood.value = clampNumber(mood.value - drift, MOOD_MIN, MOOD_MAX);
  } else if (mood.value < mood.baseline) {
    mood.value = clampNumber(mood.value + drift, MOOD_MIN, MOOD_MAX);
  }

  mood.energy = clampNumber(mood.energy + hours * 0.3, 0, 10);
  mood.updatedAt = now;
  settings.mood = mood;
  saveSettings(settings);

  return getMoodState();
}

/*
  组装给提示词的心情上下文。
*/
function getMoodContext() {
  const state = getMoodState();
  const lines = [
    `你此刻的心情：${state.label}（心情值 ${Math.round(state.value * 10) / 10}，精力 ${Math.round(state.energy * 10) / 10}/10）`
  ];

  if (state.value >= 4) {
    lines.push("你今天心情很好，会更主动、更甜、更爱撒娇。");
  } else if (state.value <= -4) {
    lines.push("你今天有点低落，语气会更软、更需要被安慰，但不要表现得太沉重。");
  } else if (state.value <= -1) {
    lines.push("你今天情绪平平，回复可以安静温柔一点。");
  }

  if (state.energy <= 3) {
    lines.push("你有点困倦，回复可以更短、更慵懒。");
  } else if (state.energy >= 8) {
    lines.push("你精力很足，可以聊得更热烈一些。");
  }

  return lines;
}

module.exports = {
  MOOD_MIN,
  MOOD_MAX,
  getDefaultMood,
  normalizeMood,
  getMoodLabel,
  getMoodState,
  applyMoodDelta,
  tickMoodDecay,
  getMoodContext
};
