/*
  memory.js —— 自动记忆与世界书：提取、归一化、去重、容量裁剪
  从 main.js 拆分出的独立模块。
*/

const { splitKeywords, createId, clampNumber } = require("./utils.js");

function normalizeWorldBookEntry(entry, index = 0) {
  return {
    id: entry?.id || createId("world"),
    title: String(entry?.title || entry?.name || `条目 ${index + 1}`).trim(),
    content: String(entry?.content || entry?.text || "").trim(),
    keywords: Array.isArray(entry?.keywords)
      ? entry.keywords.map((item) => String(item || "").trim()).filter(Boolean)
      : splitKeywords(entry?.keywords || ""),
    category: String(entry?.category || "").trim(),
    enabled: entry?.enabled !== false,
    constant: Boolean(entry?.constant ?? entry?.permanent),
    priority: Math.round(clampNumber(entry?.priority ?? 0, -100, 100)),
    createdAt: Number(entry?.createdAt) || Date.now(),
    updatedAt: Number(entry?.updatedAt) || Date.now()
  };
}

function normalizeWorldBook(worldBook, legacyMemories = []) {
  const source = Array.isArray(worldBook) ? worldBook : [];
  const entries = source.map(normalizeWorldBookEntry);

  if (entries.length || !Array.isArray(legacyMemories)) {
    return entries;
  }

  return legacyMemories
    .filter((memory) => typeof memory === "string")
    .map((memory, index) => normalizeWorldBookEntry({
      id: createId("world"),
      title: `旧记忆 ${index + 1}`,
      content: String(memory || ""),
      constant: true,
      priority: 0
    }, index))
    .filter((entry) => entry.content);
}

const MAX_AUTO_MEMORIES = 80;

const MAX_MEMORY_CHARS = 4000;

function normalizeMemoryEntry(entry) {
  if (typeof entry === "string") {
    const text = String(entry || "").trim().slice(0, 160);

    if (!text) {
      return null;
    }

    return {
      id: createId("mem"),
      type: "legacy",
      text,
      createdAt: 0,
      lastSeenAt: 0,
      source: "manual"
    };
  }

  const value = entry || {};
  const text = String(value.text || "").trim().slice(0, 160);

  if (!text) {
    return null;
  }

  return {
    id: String(value.id || createId("mem")),
    type: ["name", "like", "dislike", "activity", "event", "feeling", "legacy"]
      .includes(value.type) ? value.type : "legacy",
    text,
    createdAt: Number(value.createdAt) || Date.now(),
    lastSeenAt: Number(value.lastSeenAt) || Number(value.createdAt) || Date.now(),
    source: value.source === "manual" ? "manual" : "auto",
    pinned: Boolean(value.pinned)
  };
}

function normalizeMemoryKey(text) {
  return String(text || "")
    .replace(/[，。！？、,.!?~\s]/g, "")
    .toLocaleLowerCase();
}

function extractMemoryCandidates(text) {
  const value = String(text || "").trim();
  const candidates = [];

  if (!value || value.length < 3 || value.length > 120) {
    return candidates;
  }

  const push = (type, raw) => {
    const clean = String(raw || "")
      .replace(/^[，,、\s]+|[。！？!?~，,、\s]+$/g, "")
      .trim();

    if (clean && clean.length >= 2 && clean.length <= 40) {
      candidates.push({ type, text: clean });
    }
  };

  const nameMatch = value.match(
    /(?:我叫|我的名字(?:是|叫)|你可以叫我|大家都叫我)([^，。！？!?,、\s]{1,12})/
  );

  if (nameMatch) {
    push("name", nameMatch[1]);
  }

  const likeMatch = value.match(
    /(?:我最喜欢|我超喜欢|我特别喜欢|我喜欢|我爱的|我爱|我超爱|我爱吃|我爱喝|我特喜欢)([^，。！？!?,、\s]{1,24})/
  );

  if (likeMatch) {
    push("like", likeMatch[1]);
  }

  const dislikeMatch = value.match(
    /(?:我最讨厌|我超级讨厌|我特别讨厌|我不喜欢|我讨厌|我最烦|我受不了|我不爱吃|我最怕)([^，。！？!?,、\s]{1,24})/
  );

  if (dislikeMatch) {
    push("dislike", dislikeMatch[1]);
  }

  const activityMatch = value.match(
    /(?:我正在|我这会在|我现在在|我在忙着|我在|我马上要|我准备|我打算)([^，。！？!?,、\s]{2,30})/
  );

  if (activityMatch) {
    push("activity", activityMatch[1]);
  }

  const eventMatch = value.match(
    /(?:我明天|我后天|我今天|我周末|我这周|我下周|我最近|我月底)([^，。！？!?,、\s]{2,30})/
  );

  if (eventMatch) {
    push("event", eventMatch[1]);
  }

  const feelingMatch = value.match(
    /(?:我今天|我最近|我现在)?(?:真的)?(?:好|很|有点|超级|特别)?(累死了|好累|难过|伤心|不开心|好烦|烦躁|焦虑|紧张|郁闷|委屈|孤独|开心|高兴)(?:啊|呀|死|死了)?/
  );

  if (feelingMatch) {
    push("feeling", `${feelingMatch[1]}${feelingMatch[2] || ""}`);
  }

  return candidates;
}

function rememberUserFacts(text, settings) {
  const candidates = extractMemoryCandidates(text);

  if (!candidates.length) {
    return;
  }

  const current = Array.isArray(settings.ai?.memories)
    ? settings.ai.memories.map(normalizeMemoryEntry).filter(Boolean)
    : [];
  const now = Date.now();

  for (const candidate of candidates) {
    const key = normalizeMemoryKey(candidate.text);
    const existing = current.find(
      (item) =>
        item.type === candidate.type &&
        normalizeMemoryKey(item.text) === key
    );

    if (existing) {
      existing.text = candidate.text;
      existing.lastSeenAt = now;
      continue;
    }

    current.push({
      id: createId("mem"),
      type: candidate.type,
      text: candidate.text,
      createdAt: now,
      lastSeenAt: now,
      source: "auto"
    });
  }

  /*
    容量裁剪：先丢最久没被提到的，name/like/dislike 这类长期事实保留更久。
  */
  current.sort((left, right) => {
    const priority = (item) =>
      (item.pinned ? 2 : 0) +
      (["name", "like", "dislike"].includes(item.type) ? 1 : 0);

    return (
      (priority(right) - priority(left)) ||
      (right.lastSeenAt - left.lastSeenAt)
    );
  });

  let totalChars = 0;
  const kept = [];

  for (const item of current) {
    if (kept.length >= MAX_AUTO_MEMORIES) {
      break;
    }

    const nextLength = item.text.length + 2;

    if (
      kept.length >= 60 &&
      totalChars + nextLength > MAX_MEMORY_CHARS
    ) {
      continue;
    }

    kept.push(item);
    totalChars += nextLength;
  }

  if (!settings.ai) {
    settings.ai = {};
  }

  settings.ai.memories = kept;
}

function getMemoryLines(memories) {
  const list = Array.isArray(memories)
    ? memories.map(normalizeMemoryEntry).filter(Boolean)
    : [];

  if (!list.length) {
    return [];
  }

  const labels = {
    name: "名字",
    like: "喜欢",
    dislike: "不喜欢",
    activity: "最近在忙",
    event: "最近安排",
    feeling: "最近心情",
    legacy: "旧记忆"
  };

  return list
    .sort((left, right) =>
      (Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))) ||
      (right.lastSeenAt - left.lastSeenAt)
    )
    .slice(0, 24)
    .map((item) => {
      const label = labels[item.type] || "记忆";
      return `- ${label}：${item.text}`;
    });
}

/*
  轻量相关性检索：把用户当前输入拆成关键词，和每条记忆做重合度打分。
  用于在组装提示词时优先注入"和当前话题相关"的记忆，而不是只取最近几条。
  （AIRI 的 RAG 思路在本地项目里的轻量实现）
*/
function tokenizeForMatch(text) {
  const value = String(text || "").toLocaleLowerCase();
  const tokens = value.match(/[\u4e00-\u9fa5]{1,4}|[a-z0-9]{2,}/g) || [];
  const result = [];

  for (const token of tokens) {
    if (/^[\u4e00-\u9fa5]{1,2}$/.test(token)) {
      result.push(token);
    } else {
      result.push(token);
    }
  }

  return Array.from(new Set(result)).filter(Boolean);
}

function scoreMemoryRelevance(memory, query) {
  const memoryText = String(memory?.text || "").toLocaleLowerCase();

  if (!memoryText || !query) {
    return 0;
  }

  const tokens = tokenizeForMatch(query);
  let score = 0;

  for (const token of tokens) {
    if (memoryText.includes(token)) {
      score += token.length >= 3 ? 2 : 1;
    }
  }

  const typeBoost = {
    name: 1.5,
    like: 1.2,
    dislike: 1.2,
    activity: 1.4,
    event: 1.4,
    feeling: 1.0,
    legacy: 0.6
  };

  score *= (typeBoost[memory?.type] || 1);

  return score;
}

/*
  返回按相关度排序的记忆行；没有命中时退回"最近提到"的排序。
*/
function getRelevantMemoryLines(memories, query, maxItems = 10) {
  const list = Array.isArray(memories)
    ? memories.map(normalizeMemoryEntry).filter(Boolean)
    : [];

  if (!list.length) {
    return [];
  }

  const scored = list
    .map((item) => ({
      item,
      score: scoreMemoryRelevance(item, query)
    }))
    .sort((left, right) =>
      (right.score - left.score) ||
      (right.item.lastSeenAt - left.item.lastSeenAt)
    );

  const hit = scored.filter((entry) => entry.score > 0);
  const selected = hit.length
    ? hit
    : scored.slice(0, 6);
  const labels = {
    name: "名字",
    like: "喜欢",
    dislike: "不喜欢",
    activity: "最近在忙",
    event: "最近安排",
    feeling: "最近心情",
    legacy: "旧记忆"
  };

  return selected
    .slice(0, maxItems)
    .map((entry) => {
      const label = labels[entry.item.type] || "记忆";
      return `- ${label}：${entry.item.text}`;
    });
}

module.exports = {
  normalizeWorldBookEntry,
  normalizeWorldBook,
  MAX_AUTO_MEMORIES,
  MAX_MEMORY_CHARS,
  normalizeMemoryEntry,
  normalizeMemoryKey,
  extractMemoryCandidates,
  rememberUserFacts,
  getMemoryLines,
  tokenizeForMatch,
  scoreMemoryRelevance,
  getRelevantMemoryLines
};
