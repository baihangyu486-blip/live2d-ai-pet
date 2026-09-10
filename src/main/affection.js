/*
  affection.js —— 好感度 / 养成、每日打卡、纪念日

  数据存在 settings 根节点（不混入 ai 配置，避免每次保存 AI 设置被覆盖）：
    - settings.affection     好感度分数与里程碑
    - settings.checkin       每日打卡记录
    - settings.anniversaries 纪念日列表
*/

const { createId, clampNumber } = require("./utils.js");
const { loadSettings, saveSettings } = require("./storage.js");

const AFFECTION_LEVELS = [
  { min: 0, title: "初识", emoji: "🌱", desc: "刚认识，还有点生疏" },
  { min: 15, title: "相识", emoji: "🌸", desc: "开始记住你的事了" },
  { min: 35, title: "熟悉", emoji: "💞", desc: "越来越有默契" },
  { min: 60, title: "亲密", emoji: "💖", desc: "无话不谈的亲密关系" },
  { min: 85, title: "挚爱", emoji: "💍", desc: "认定你是唯一" }
];

function getDefaultAffection() {
  return {
    score: 5,
    levelIndex: 0,
    totalGained: 0,
    lastSeenAt: 0,
    milestones: [],
    updatedAt: 0
  };
}

function normalizeAffection(value) {
  const source = value && typeof value === "object" ? value : {};
  const score = clampNumber(source.score ?? 5, 0, 100);

  return {
    score: Math.round(score * 10) / 10,
    levelIndex: Math.round(clampNumber(source.levelIndex ?? 0, 0, AFFECTION_LEVELS.length - 1)),
    totalGained: Math.round(clampNumber(source.totalGained ?? 0, 0, 100000)),
    lastSeenAt: Number(source.lastSeenAt) || 0,
    milestones: Array.isArray(source.milestones) ? source.milestones : [],
    updatedAt: Number(source.updatedAt) || 0
  };
}

function getLevelIndex(score) {
  let level = 0;

  for (let index = AFFECTION_LEVELS.length - 1; index >= 0; index--) {
    if (score >= AFFECTION_LEVELS[index].min) {
      level = index;
      break;
    }
  }

  return level;
}

function getAffectionState() {
  const settings = loadSettings();
  const affection = normalizeAffection(settings.affection);
  const levelIndex = getLevelIndex(affection.score);
  const level = AFFECTION_LEVELS[levelIndex];
  const next = AFFECTION_LEVELS[levelIndex + 1] || null;

  return {
    score: affection.score,
    levelIndex,
    levelTitle: level.title,
    levelEmoji: level.emoji,
    levelDesc: level.desc,
    nextMin: next ? next.min : null,
    totalGained: affection.totalGained,
    milestones: affection.milestones,
    updatedAt: affection.updatedAt
  };
}

/*
  增加好感度，返回 { score, levelIndex, levelTitle, levelUp, milestone }
  levelUp: 是否跨过等级线（用于触发庆祝动画）
*/
function addAffection(delta, reason = "") {
  const settings = loadSettings();
  const affection = normalizeAffection(settings.affection);
  const before = getLevelIndex(affection.score);
  const now = Date.now();

  affection.score = clampNumber(
    affection.score + (Number(delta) || 0),
    0,
    100
  );
  affection.totalGained += Math.max(0, Number(delta) || 0);
  affection.lastSeenAt = now;
  affection.updatedAt = now;

  const after = getLevelIndex(affection.score);

  if (after > before) {
    affection.levelIndex = after;
    const milestone = {
      id: createId("milestone"),
      levelIndex: after,
      title: AFFECTION_LEVELS[after].title,
      score: affection.score,
      reason: String(reason || "好感度提升"),
      at: now
    };

    if (!affection.milestones.some((item) => item.levelIndex === after)) {
      affection.milestones.push(milestone);
    }
  }

  settings.affection = affection;
  saveSettings(settings);

  const level = AFFECTION_LEVELS[after];

  return {
    score: affection.score,
    levelIndex: after,
    levelTitle: level.title,
    levelEmoji: level.emoji,
    levelUp: after > before,
    delta: Number(delta) || 0,
    reason
  };
}

/*
  长时间没互动会缓慢降温（只扣"降温"不扣到 0 以下）。
*/
function applyAffectionDecay() {
  const settings = loadSettings();
  const affection = normalizeAffection(settings.affection);

  if (!affection.lastSeenAt) {
    return 0;
  }

  const idleDays = (Date.now() - affection.lastSeenAt) / 86400000;
  let decay = 0;

  if (idleDays > 3) {
    decay = Math.floor(idleDays - 2) * 0.5;
  }

  if (decay <= 0) {
    return 0;
  }

  const result = addAffection(-decay, "太久没见面，有点想你");
  return -result.delta;
}

/* ---------- 每日打卡 ---------- */

function getDefaultCheckin() {
  return {
    lastDate: "",
    streak: 0,
    bestStreak: 0,
    total: 0
  };
}

function normalizeCheckin(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    lastDate: String(source.lastDate || ""),
    streak: Math.round(clampNumber(source.streak ?? 0, 0, 10000)),
    bestStreak: Math.round(clampNumber(source.bestStreak ?? 0, 0, 10000)),
    total: Math.round(clampNumber(source.total ?? 0, 0, 100000))
  };
}

function formatDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getYesterdayKey() {
  const yesterday = new Date(Date.now() - 86400000);

  return formatDateKey(yesterday);
}

function getCheckinState() {
  const settings = loadSettings();

  return {
    ...normalizeCheckin(settings.checkin),
    today: formatDateKey(),
    doneToday: normalizeCheckin(settings.checkin).lastDate === formatDateKey()
  };
}

function getAnniversaryRemindDays() {
  const settings = loadSettings();

  return Math.round(clampNumber(
    settings.anniversaryRemindDays ?? 3,
    1,
    7
  ));
}

function saveAnniversaryRemindDays(days) {
  const settings = loadSettings();

  settings.anniversaryRemindDays = Math.round(clampNumber(
    days ?? 3,
    1,
    7
  ));
  saveSettings(settings);

  return settings.anniversaryRemindDays;
}

/*
  每日首次互动自动打卡；也可手动调用。
  返回 null 表示今天已打过卡。
*/
function dailyCheckin() {
  const settings = loadSettings();
  const checkin = normalizeCheckin(settings.checkin);
  const today = formatDateKey();

  if (checkin.lastDate === today) {
    return null;
  }

  const streak =
    checkin.lastDate === getYesterdayKey()
      ? checkin.streak + 1
      : 1;
  const bonus = Math.min(2, Math.floor((streak - 1) / 7));
  const delta = 2 + bonus;
  const milestoneDays = [7, 30, 100, 365];
  const milestone = milestoneDays.includes(streak)
    ? streak
    : 0;
  const milestoneDelta = milestone ? 2 : 0;

  const next = {
    lastDate: today,
    streak,
    bestStreak: Math.max(checkin.bestStreak, streak),
    total: checkin.total + 1
  };

  settings.checkin = next;
  saveSettings(settings);

  const affection = addAffection(delta + milestoneDelta, "每日打卡");

  return {
    ...next,
    bonus,
    delta,
    milestone,
    milestoneDelta,
    affection
  };
}

/* ---------- 纪念日 ---------- */

function getDefaultAnniversaries() {
  return [];
}

function normalizeAnniversary(value) {
  const source = value && typeof value === "object" ? value : {};
  const date = String(source.date || "");

  return {
    id: String(source.id || createId("anni")),
    name: String(source.name || "纪念日").trim(),
    date,
    kind: source.kind === "once" ? "once" : "yearly",
    remind: source.remind !== false,
    createdAt: Number(source.createdAt) || Date.now()
  };
}

function getAnniversaries() {
  const settings = loadSettings();

  return (Array.isArray(settings.anniversaries)
    ? settings.anniversaries
    : []
  ).map(normalizeAnniversary);
}

function saveAnniversaries(list) {
  const settings = loadSettings();

  settings.anniversaries = (Array.isArray(list) ? list : [])
    .map(normalizeAnniversary);
  saveSettings(settings);

  return settings.anniversaries;
}

function parseAnniversaryDate(date) {
  const match = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    md: `${match[2]}-${match[3]}`
  };
}

function daysUntil(targetDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(
    targetDate.year,
    targetDate.month - 1,
    targetDate.day
  );

  return Math.round((target - today) / 86400000);
}

/*
  返回最近值得提的纪念日（今天正好、或 3 天内即将到来）。
*/
function getUpcomingAnniversaries(days) {
  const remindDays = days === undefined
    ? getAnniversaryRemindDays()
    : Number(days);
  const now = new Date();
  const todayMd = formatDateKey(now).slice(5);
  const results = [];

  for (const item of getAnniversaries()) {
    if (!item.remind || !item.date) {
      continue;
    }

    const parsed = parseAnniversaryDate(item.date);

    if (!parsed) {
      continue;
    }

    if (item.kind === "once") {
      const days = daysUntil(parsed);

      if (days === 0) {
        results.push({
          ...item,
          status: "today",
          daysLeft: 0
        });
      } else if (days > 0 && days <= remindDays) {
        results.push({
          ...item,
          status: "upcoming",
          daysLeft: days
        });
      }
      continue;
    }

    // 每年重复：计算今年对应日，已过则看明年
    const thisYear = new Date(
      now.getFullYear(),
      parsed.month - 1,
      parsed.day
    );
    const thisYearDays = Math.round(
      (thisYear - new Date(now.getFullYear(), now.getMonth(), now.getDate())) /
      86400000
    );

    if (thisYearDays === 0) {
      results.push({
        ...item,
        status: "today",
        daysLeft: 0
      });
    } else if (thisYearDays > 0 && thisYearDays <= remindDays) {
      results.push({
        ...item,
        status: "upcoming",
        daysLeft: thisYearDays
      });
    } else if (thisYearDays < 0) {
      const nextYear = new Date(
        now.getFullYear() + 1,
        parsed.month - 1,
        parsed.day
      );
      const daysUntilNext = Math.round(
        (nextYear - new Date(now.getFullYear(), now.getMonth(), now.getDate())) /
        86400000
      );

      if (daysUntilNext <= remindDays) {
        results.push({
          ...item,
          status: "upcoming",
          daysLeft: daysUntilNext
        });
      }
    }
  }

  return results.sort((left, right) => left.daysLeft - right.daysLeft);
}

/*
  组装给提示词的养成上下文。
*/
function getAffectionContext() {
  const state = getAffectionState();
  const checkin = getCheckinState();
  const anniversaries = getUpcomingAnniversaries();
  const lines = [];

  lines.push(
    `用户与你的亲密程度：${state.levelEmoji} ${state.levelTitle}（好感 ${Math.round(state.score)}/100）`
  );

  if (state.levelIndex >= 3) {
    lines.push("你们已经非常亲密了，可以自然地表达爱意和想念。");
  } else if (state.levelIndex >= 2) {
    lines.push("你们已经很熟了，可以自然撒娇、开玩笑。");
  } else if (state.levelIndex >= 1) {
    lines.push("你们正在变熟，可以适当关心和主动，但别太肉麻。");
  }

  if (checkin.streak >= 3) {
    lines.push(`用户已经连续 ${checkin.streak} 天来找你说话了，可以开心地提起这份默契。`);
  }

  for (const item of anniversaries) {
    if (item.status === "today") {
      lines.push(`今天是你们的纪念日「${item.name}」，要记得送上一句特别的祝福。`);
    } else if (item.status === "upcoming") {
      lines.push(`还有 ${item.daysLeft} 天就是「${item.name}」了，可以自然地期待一下。`);
    }
  }

  return lines;
}

module.exports = {
  AFFECTION_LEVELS,
  getDefaultAffection,
  normalizeAffection,
  getAffectionState,
  addAffection,
  applyAffectionDecay,
  getDefaultCheckin,
  normalizeCheckin,
  getCheckinState,
  formatDateKey,
  dailyCheckin,
  getAnniversaryRemindDays,
  saveAnniversaryRemindDays,
  getDefaultAnniversaries,
  normalizeAnniversary,
  getAnniversaries,
  saveAnniversaries,
  getUpcomingAnniversaries,
  getAffectionContext
};
