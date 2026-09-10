/*
  sticker.js —— 贴纸：默认配置、归一化、候选、冷却与路径解析
  从 main.js 拆分出的独立模块。
*/

const path = require("path");
const fs = require("fs");
const {
  splitKeywords,
  clampNumber,
  createId,
  isImageFile,
  cleanDisplayText
} = require("./utils.js");
const { runtimeState } = require("./state.js");
const APP_ROOT = path.join(__dirname, "..", "..");

function getDefaultStickerConfig() {
  return {
    enabled: false,
    frequency: "normal",
    maxPerReply: 2,
    globalCooldown: 2,
    rules: {
      happy: {
        enabled: true,
        label: "开心",
        paths: "",
        minChance: 0.18,
        maxChance: 0.34,
        cooldown: 3,
        keywords: "开心,高兴,好耶,哈哈,太好了,棒,喜欢"
      },
      love: {
        enabled: true,
        label: "喜欢 / 贴贴",
        paths: "",
        minChance: 0.22,
        maxChance: 0.38,
        cooldown: 4,
        keywords: "喜欢你,最喜欢,贴贴,抱抱,想你,陪你"
      },
      shy: {
        enabled: true,
        label: "害羞",
        paths: "",
        minChance: 0.15,
        maxChance: 0.28,
        cooldown: 4,
        keywords: "害羞,脸红,不好意思,诶嘿,才不是"
      },
      comfort: {
        enabled: true,
        label: "安慰",
        paths: "",
        minChance: 0.08,
        maxChance: 0.18,
        cooldown: 4,
        keywords: "辛苦,没关系,我陪你,别怕,慢慢来,休息"
      },
      sad: {
        enabled: true,
        label: "难过",
        paths: "",
        minChance: 0.06,
        maxChance: 0.14,
        cooldown: 5,
        keywords: "难过,伤心,呜,委屈,哭,心疼"
      },
      angry: {
        enabled: true,
        label: "生气 / 傲娇",
        paths: "",
        minChance: 0.08,
        maxChance: 0.18,
        cooldown: 4,
        keywords: "生气,讨厌,哼,不理你,气,坏,笨蛋"
      },
      confused: {
        enabled: true,
        label: "疑惑",
        paths: "",
        minChance: 0.1,
        maxChance: 0.2,
        cooldown: 4,
        keywords: "欸,诶,为什么,不知道,疑惑,问号"
      }
    },
    customRules: []
  };
}

function normalizeCustomStickerRule(rule) {
  return {
    id: rule?.id || createId("custom"),
    enabled: rule?.enabled !== false,
    label: rule?.label || "自定义规则",
    paths: rule?.paths || "",
    minChance: Number(rule?.minChance ?? 0.15),
    maxChance: Number(rule?.maxChance ?? 0.3),
    cooldown: Number(rule?.cooldown ?? 3),
    keywords: rule?.keywords || ""
  };
}

function normalizeStickerConfig(stickers) {
  const defaults = getDefaultStickerConfig();
  const config = stickers || {};
  const savedRules = config.rules || {};
  const rules = {};

  for (const key of Object.keys(defaults.rules)) {
    rules[key] = {
      ...defaults.rules[key],
      ...(savedRules[key] || {})
    };
  }

  return {
    ...defaults,
    ...config,
    rules,
    customRules: Array.isArray(config.customRules)
      ? config.customRules.map(normalizeCustomStickerRule)
      : []
  };
}

function normalizeUserSticker(sticker) {
  return {
    id: sticker?.id || createId("sticker"),
    name: sticker?.name || "未命名表情",
    path: sticker?.path || "",
    tags: Array.isArray(sticker?.tags)
      ? sticker.tags.filter(Boolean)
      : splitKeywords(sticker?.tags || ""),
    description: sticker?.description || "",
    createdAt: sticker?.createdAt || Date.now()
  };
}

function insertPartNaturally(parts, part, options = {}) {
  if (!Array.isArray(parts)) {
    return;
  }

  if (!parts.length) {
    parts.push(part);
    return;
  }

  if (options.preferAnywhere) {
    const roll = Math.random();

    if (roll < 0.22) {
      parts.unshift(part);
      return;
    }

    if (roll < 0.72 && parts.length >= 2) {
      const index = 1 + Math.floor(
        Math.random() * (parts.length - 1)
      );

      parts.splice(index, 0, part);
      return;
    }
  }

  parts.push(part);
}

function chooseStickerParts(ai, emotion, text, serious) {
  const stickers = normalizeStickerConfig(ai.stickers);

  if (!stickers.enabled || serious) {
    return [];
  }

  const maxPerReply = clampNumber(
    stickers.maxPerReply,
    0,
    5
  );

  const candidates = buildStickerCandidates(
    stickers,
    emotion,
    text
  );

  const result = [];

  for (const candidate of candidates) {
    if (result.length >= maxPerReply) {
      break;
    }

    if (!candidate.rule.enabled) {
      continue;
    }

    const paths = resolveStickerPaths(candidate.rule.paths);

    if (!paths.length) {
      continue;
    }

    if (
      !isStickerCooldownReady(
        candidate.id,
        candidate.rule,
        stickers
      )
    ) {
      continue;
    }

    const chance = calculateStickerChance(
      candidate.rule,
      stickers,
      text
    );

    if (Math.random() > chance) {
      continue;
    }

    const selected =
      paths[Math.floor(Math.random() * paths.length)];

    result.push({
      id: createId("sticker"),
      type: "sticker",
      path: selected,
      emotion: candidate.id,
      label: candidate.rule.label || candidate.id,
      recalled: false,
      favorite: false
    });

    markStickerUsed(candidate.id);
  }

  return result;
}

function buildStickerCandidates(stickers, emotion, text) {
  const value = String(text || "");
  const list = [];

  if (emotion && stickers.rules[emotion]) {
    list.push({
      id: emotion,
      rule: stickers.rules[emotion]
    });
  }

  for (const [id, rule] of Object.entries(stickers.rules)) {
    if (id === emotion) {
      continue;
    }

    if (
      splitKeywords(rule.keywords).some((keyword) =>
        value.includes(keyword)
      )
    ) {
      list.push({
        id,
        rule
      });
    }
  }

  for (const rule of stickers.customRules || []) {
    if (
      splitKeywords(rule.keywords).some((keyword) =>
        value.includes(keyword)
      )
    ) {
      list.push({
        id: rule.id,
        rule
      });
    }
  }

  const seen = new Set();

  return list.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function resolveStickerPaths(value) {
  const entries = String(value || "")
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const result = [];

  for (const entry of entries) {
    const normalized = entry.replace(/\\/g, "/");

    if (
      normalized.startsWith("http://") ||
      normalized.startsWith("https://") ||
      normalized.startsWith("data:") ||
      normalized.startsWith("file:")
    ) {
      result.push(normalized);
      continue;
    }

    const absolute = path.isAbsolute(normalized)
      ? normalized
      : path.join(APP_ROOT, normalized);

    try {
      if (!fs.existsSync(absolute)) {
        if (isImageFile(normalized)) {
          result.push(normalized);
        }

        continue;
      }

      const stat = fs.statSync(absolute);

      if (stat.isDirectory()) {
        const files = fs.readdirSync(absolute)
          .filter(isImageFile)
          .map((file) =>
            path.posix.join(
              normalized.replace(/\/$/, ""),
              file
            )
          );

        result.push(...files);
        continue;
      }

      if (stat.isFile() && isImageFile(absolute)) {
        result.push(normalized);
      }
    } catch {
      if (isImageFile(normalized)) {
        result.push(normalized);
      }
    }
  }

  return [...new Set(result)];
}

function isStickerCooldownReady(id, rule, stickers) {
  const now = runtimeState.assistantMessageCount;

  if (
    now - runtimeState.lastStickerAt <
    Number(stickers.globalCooldown || 0)
  ) {
    return false;
  }

  const last = runtimeState.stickerCooldowns[id];

  if (
    typeof last === "number" &&
    now - last < Number(rule.cooldown || 0)
  ) {
    return false;
  }

  return true;
}

function calculateStickerChance(rule, stickers, text) {
  const min = Number(rule.minChance ?? 0);
  const max = Number(rule.maxChance ?? min);

  let chance =
    Math.min(min, max) +
    Math.random() * Math.abs(max - min);

  const frequencyMultiplier = {
    low: 0.55,
    normal: 1,
    high: 1.35
  };

  chance *=
    frequencyMultiplier[stickers.frequency] || 1;

  const keywords = splitKeywords(rule.keywords);

  if (
    keywords.some((keyword) =>
      String(text || "").includes(keyword)
    )
  ) {
    chance += 0.08;
  }

  if (String(text || "").length <= 35) {
    chance += 0.04;
  }

  chance += (Math.random() - 0.5) * 0.08;

  return clampNumber(chance, 0, 0.82);
}

function markStickerUsed(id) {
  runtimeState.lastStickerAt =
    runtimeState.assistantMessageCount;

  runtimeState.stickerCooldowns[id] =
    runtimeState.assistantMessageCount;
}

function getBubbleTextFromParts(parts) {
  if (!Array.isArray(parts)) {
    return "";
  }

  const textCandidates = parts
    .filter((part) => !part?.recalled)
    .filter((part) => part.type === "text" && part.text)
    .map((part) => cleanDisplayText(part.text))
    .filter(Boolean)
    .sort((a, b) => {
      const aGood = a.length <= 56 ? 0 : 1;
      const bGood = b.length <= 56 ? 0 : 1;

      if (aGood !== bGood) return aGood - bGood;

      return a.length - b.length;
    });

  if (textCandidates.length) {
    return textCandidates[0].slice(0, 70);
  }

  const voiceCandidates = parts
    .filter((part) => !part?.recalled)
    .filter((part) => part.type === "voice" && part.text)
    .map((part) => cleanDisplayText(part.text))
    .filter(Boolean)
    .sort((a, b) => a.length - b.length);

  if (voiceCandidates.length) {
    return voiceCandidates[0].slice(0, 64);
  }

  return "";
}

module.exports = {
  getDefaultStickerConfig,
  normalizeCustomStickerRule,
  normalizeStickerConfig,
  normalizeUserSticker,
  insertPartNaturally,
  chooseStickerParts,
  buildStickerCandidates,
  resolveStickerPaths,
  isStickerCooldownReady,
  calculateStickerChance,
  markStickerUsed,
  getBubbleTextFromParts
};
