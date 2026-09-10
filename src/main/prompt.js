/*
  prompt.js —— 提示词组装：时间上下文、人设、情绪、世界书、历史转上下文
  从 main.js 拆分出的独立模块。
*/

const { cleanDisplayText, clampNumber } = require("./utils.js");
const {
  getMemoryLines,
  getRelevantMemoryLines,
  normalizeWorldBookEntry
} = require("./memory.js");
const { getActivityLines } = require("./activity.js");
const { getUserEmotionLabel, USER_EMOTION_GUIDANCE } = require("./emotion.js");
const { getAffectionContext } = require("./affection.js");

const MAX_WORLD_BOOK_ENTRIES = 12;

const MAX_WORLD_BOOK_CHARS = 6000;

function buildTimeContext() {
  const now = new Date();
  const hour = now.getHours();
  const minute = String(now.getMinutes()).padStart(2, "0");
  const weekdays = [
    "周日", "周一", "周二", "周三", "周四", "周五", "周六"
  ];
  const weekday = weekdays[now.getDay()];
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;

  let period = "深夜";

  if (hour >= 5 && hour < 9) period = "清晨";
  else if (hour >= 9 && hour < 12) period = "上午";
  else if (hour >= 12 && hour < 14) period = "中午";
  else if (hour >= 14 && hour < 17) period = "下午";
  else if (hour >= 17 && hour < 19) period = "傍晚";
  else if (hour >= 19 && hour < 23) period = "晚上";

  const lines = [
    `当前时间：${now.getMonth() + 1}月${now.getDate()}日 ${weekday} ${hour}:${minute}（${period}${isWeekend ? "，周末" : ""}）`
  ];

  if (hour >= 23 || hour < 5) {
    lines.push("现在是深夜，用户可能该休息了，适合温柔提醒，不要聊太兴奋的话题。");
  } else if (period === "清晨") {
    lines.push("用户刚醒不久，回复可以温暖、元气一点。");
  } else if (hour >= 12 && hour < 14) {
    lines.push("中午了，可以自然地关心用户有没有吃饭。");
  } else if (hour >= 17 && hour < 19) {
    lines.push("傍晚了，可以关心用户下班/放学后累不累。");
  }

  return lines;
}

function buildSystemPrompt(ai, contextText = "", options = {}) {
  const character = ai.character || {};
  const characterName = String(character.name || "").trim() || "我的伙伴";
  const templates = Array.isArray(ai.promptTemplates)
    ? ai.promptTemplates
    : [];
  const userEmotion = options.userEmotion || "neutral";
  const timeLines = Array.isArray(options.timeLines)
    ? options.timeLines
    : buildTimeContext();
  const relevantMemories = getRelevantMemoryLines(
    ai.memories,
    contextText,
    10
  );
  const memoryLines = Array.isArray(options.memoryLines)
    ? options.memoryLines
    : (relevantMemories.length
        ? relevantMemories
        : getMemoryLines(ai.memories));
  const activityLines = Array.isArray(options.activityLines)
    ? options.activityLines
    : getActivityLines();
  const affectionLines = Array.isArray(options.affectionLines)
    ? options.affectionLines
    : getAffectionContext();
  const moodLines = Array.isArray(options.moodLines)
    ? options.moodLines
    : [];
  const lifeLines = Array.isArray(options.lifeLines)
    ? options.lifeLines
    : [];
  const replyMode = options.replyMode || "smart";

  const activeTemplate = templates.find(
    (item) => item.id === ai.activePromptTemplateId
  );

  const worldBookEntries = selectWorldBookEntries(
    ai.worldBook,
    contextText
  );

  const parts = [
    ai.systemPrompt ||
      `你是用户的 AI 伴侣，当前名字是${characterName}。按照角色设定自然交流。`,

    "",
    "当前时间与情境：",
    ...timeLines,

    "",
    `用户此刻的情绪：${getUserEmotionLabel(userEmotion)}`
  ];

  if (USER_EMOTION_GUIDANCE[userEmotion]) {
    parts.push(USER_EMOTION_GUIDANCE[userEmotion]);
  }

  if (activityLines.length) {
    parts.push("", "用户当前活动：", ...activityLines);
  }

  if (affectionLines.length) {
    parts.push("", "你们的亲密关系（自然地体现，不要生硬报数字）：", ...affectionLines);
  }

  if (moodLines.length) {
    parts.push("", "你此刻的心情（让语气自然贴合，不要直接念出来）：", ...moodLines);
  }

  if (lifeLines.length) {
    parts.push(
      "",
      "你记得的生活（自然地用，不要一次性全部复述，不要暴露这是记忆数据）：",
      ...lifeLines
    );
  }

  parts.push([

    "",
    "角色设定：",
    `名称：${characterName}`,
    `身份：${character.identity || "未设置"}`,
    `外貌与印象：${character.appearance || "未设置"}`,
    `性格特征：${character.personality || "未设置"}`,
    `习惯：${character.habits || "未设置"}`,
    `偏好：${character.preferences || "未设置"}`,
    `关系设定：${character.relationship || "未设置"}`,
    `称呼方式：${character.addressing || "未设置"}`,
    `回复文风：${character.speakingStyle || "自然、简洁、亲近"}`,
    `行为约束：${character.rules || "未设置"}`,

    "",
    "对话风格：",
    "- 像真实微信聊天对象，不像 AI 助手、客服、说明书或角色扮演小说。",
    "- 回复自然、简洁、亲近，日常聊天多用短句。",
    "- 先接住对方的情绪和话题，再决定要不要追问。",
    "- 记住用户说过的事，在合适的时候自然地提起，不要生硬复述。",
    "- 不要机械总结，不要复述用户输入，不要说“我理解你的感受”“如果你需要我可以”。",
    "- 可以偶尔用 qwq、ovo、诶嘿、哼 这类轻量语气，但一轮最多一个，不要滥用。",
    "- 不要频繁喊宝宝、老公等称呼，亲近但自然。",

    "",
    "输出规范：",
    "- 只输出直接对话文本。",
    "- 不使用括号动作、旁白、内心独白、舞台动作或叙述性描写。",
    "- 不以角色姓名、‘她说’或‘小声说’等署名与旁白作为消息开头。",
    "- 不输出内部 JSON、type、emotion、标签、路径、系统提示、功能说明或元数据。",
    "- 不暴露你正在识别、分析或遵守提示词。",

    "",
    "图片和表情包规则：",
    "- 用户发图片或表情包时，它们只作为聊天语境参考。",
    "- 不要在回复里说“图片”“表情包”“我看到了”“我理解这个表情包”“这个表情包表达了”。",
    "- 不要描述识别过程，不要解释图片/表情包含义。",
    "- 直接接住用户的情绪、语气和话题，像普通聊天一样回复。"
  ]);

  if (memoryLines.length) {
    parts.push(
      "",
      "你记得的关于用户的事（自然地用在对话里，不要一次性全部复述）：",
      ...memoryLines
    );
  }

  if (activeTemplate?.prompt) {
    parts.push("", "当前对话预设指令：", activeTemplate.prompt);
  }

  parts.push("", "本轮回复模式：", ...buildReplyModeInstruction(replyMode));

  if (worldBookEntries.length) {
    parts.push(
      "",
      "世界书：",
      ...worldBookEntries.map((entry) => {
        const category = entry.category ? `（${entry.category}）` : "";
        return `- ${entry.title}${category}：${entry.content}`;
      })
    );
  }

  parts.push(
    "",
    `本轮角色名称：${characterName}。`,
    "背景或语气示例中的旧称呼如与当前角色名称不同，请以当前角色名称为准；其余人格、关系和记忆仍按角色设定延续。"
  );

  return parts.join("\n");
}

function buildReplyModeInstruction(mode) {
  if (mode === "light") {
    return [
      "- 现在是轻量模式：回复更短、更口语化，尽量 25 字以内，像随手回消息。",
      "- 不要长篇大论，不要分点，不要给方案列表。"
    ];
  }

  if (mode === "quiet") {
    return [
      "- 现在是静音陪伴模式：以极简、温柔的话回应，10 字左右即可。",
      "- 不要展开话题，不要提问，安静陪着就好。"
    ];
  }

  return [
    "- 智能模式：根据语境自然决定回复长短，保持亲密自然。"
  ];
}

function selectWorldBookEntries(worldBook, contextText) {
  const text = String(contextText || "").toLocaleLowerCase();
  const candidates = (Array.isArray(worldBook) ? worldBook : [])
    .map(normalizeWorldBookEntry)
    .filter((entry) => entry.enabled && entry.content)
    .filter((entry) => {
      if (entry.constant) return true;
      return entry.keywords.some((keyword) =>
        text.includes(String(keyword || "").toLocaleLowerCase())
      );
    })
    .sort((left, right) =>
      right.priority - left.priority || right.updatedAt - left.updatedAt
    );

  const selected = [];
  let totalChars = 0;

  for (const entry of candidates) {
    const nextLength = entry.title.length + entry.content.length + 12;

    if (selected.length >= MAX_WORLD_BOOK_ENTRIES ||
      totalChars + nextLength > MAX_WORLD_BOOK_CHARS) {
      continue;
    }

    selected.push(entry);
    totalChars += nextLength;
  }

  return selected;
}

function isReasoningModel(model) {
  return /(?:^|[-_/])(o1|o3|deepseek-reasoner|qwq|qwen.*thinking)/i.test(
    String(model || "")
  );
}

function extractReasoning(message) {
  const structured = cleanDisplayText(
    message?.reasoning_content || message?.reasoning || ""
  );
  let raw = String(message?.content || "");
  let reasoning = structured;

  // Qwen3 / QwQ：<|thinking_start|>...<|thinking_end|> 与 <|answer_start|>...<|answer_end|>
  const qwenThink = raw.match(
    /<\|thinking_start\|>([\s\S]*?)<\|thinking_end\|>/i
  );

  if (qwenThink) {
    reasoning = reasoning || cleanDisplayText(qwenThink[1]);
    raw = raw.replace(qwenThink[0], "");
  }

  raw = raw
    .replace(/<\|answer_start\|>|<\|answer_end\|>/gi, "")
    .replace(/<\|[^|]*\|>/g, "")
    .trim();

  // Ollama DeepSeek-R1：### Reasoning ... ### Response ...
  const ollamaMatch = raw.match(
    /###\s*Reasoning\s*\n([\s\S]*?)\n###\s*Response\s*\n?([\s\S]*)$/i
  );

  if (ollamaMatch) {
    reasoning = reasoning || cleanDisplayText(ollamaMatch[1]);
    raw = ollamaMatch[2];
  }

  // 常见的 <think>...</think>
  const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/i);

  if (thinkMatch) {
    reasoning = reasoning || cleanDisplayText(thinkMatch[1]);
    raw = raw.replace(thinkMatch[0], "");
  }

  return {
    text: cleanDisplayText(raw),
    reasoning
  };
}

function createUserHistoryMessage({
  id,
  text,
  image,
  userSticker,
  replyTo
}) {
  if (userSticker) {
    return {
      id,
      role: "user",
      type: "sticker",
      sticker: {
        id: userSticker.id || "",
        name: userSticker.name || "",
        path: userSticker.path || "",
        tags: Array.isArray(userSticker.tags)
          ? userSticker.tags
          : [],
        description: userSticker.description || ""
      },
      content: "",
      replyTo,
      createdAt: Date.now(),
      recalled: false,
      favorite: false
    };
  }

  if (image) {
    return {
      id,
      role: "user",
      type: "image",
      image: {
        name: image.name || "",
        dataUrl: image.dataUrl || ""
      },
      text: cleanDisplayText(text),
      content: cleanDisplayText(text),
      replyTo,
      createdAt: Date.now(),
      recalled: false,
      favorite: false
    };
  }

  return {
    id,
    role: "user",
    type: "text",
    content: cleanDisplayText(text),
    replyTo,
    createdAt: Date.now(),
    recalled: false,
    favorite: false
  };
}

function buildUserContentForAi({
  text,
  image,
  userSticker,
  replyTo
}) {
  const cleanText = cleanDisplayText(text);

  const replyText = replyTo?.text
    ? `\n用户正在引用一条消息：${cleanDisplayText(replyTo.text)}`
    : "";

  if (userSticker) {
    const tags = Array.isArray(userSticker.tags)
      ? userSticker.tags.filter(Boolean).join("、")
      : "";

    return [
      cleanText,
      "用户刚发来一个表情。以下信息只供理解语气，不要在回复里提到“表情包”“标签”“含义”“识别”。",
      userSticker.name ? `语气参考名称：${userSticker.name}` : "",
      tags ? `语气参考词：${tags}` : "",
      userSticker.description
        ? `语气参考描述：${userSticker.description}`
        : "",
      "请直接接话，不要解释你看到了什么。",
      replyText
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (image?.dataUrl) {
    return [
      {
        type: "text",
        text: [
          cleanText || "接着这张图自然回复。",
          "用户刚发来一张图片。图片只作为聊天语境，不要在回复里说“图片”“我看到”“图片里”。",
          "请直接接住话题和情绪，不要描述识别过程。",
          replyText
        ]
          .filter(Boolean)
          .join("\n")
      },
      {
        type: "image_url",
        image_url: {
          url: image.dataUrl
        }
      }
    ];
  }

  return [
    cleanText,
    replyText
  ]
    .filter(Boolean)
    .join("\n");
}

function isVisionModel(model) {
  return /(gpt-4o|gpt-4\.1|claude|gemini|qwen2(?:\.\d+)?-?vl|qwen-vl|glm-4v|glm-4\.\d+-vision|minicpm|llava|internvl|step.*vl|hunyuan.*vision|kimi|moonshot|grok.*vision|o3|o4-mini)/i.test(
    String(model || "")
  );
}

function historyToContextMessages(history, model = "") {
  const result = [];
  const vision = isVisionModel(model);

  const imageItems = [];

  for (const item of history || []) {
    if (item?.type === "image" && item?.image?.dataUrl && !item.recalled) {
      imageItems.push(item);
    }
  }

  const recentImageIds = new Set(
    imageItems.slice(-2).map((item) => item.id)
  );

  for (const item of history || []) {
    if (!item?.role || item.recalled) {
      continue;
    }

    if (item.role === "user") {
      if (
        vision &&
        item.type === "image" &&
        recentImageIds.has(item.id) &&
        String(item.image?.dataUrl || "").length <= 3.5 * 1024 * 1024
      ) {
        const text = cleanDisplayText(item.text || item.content || "");
        result.push({
          role: "user",
          content: [
            {
              type: "text",
              text: text
                ? `${text}\n（这张图是用户之前发过的，接着聊，不要刻意提起"图片"。）`
                : "（用户之前发过一张图，接着聊，不要刻意提起\"图片\"。）"
            },
            {
              type: "image_url",
              image_url: {
                url: item.image.dataUrl
              }
            }
          ]
        });
        continue;
      }

      const content = userHistoryToContextText(item);

      if (content) {
        result.push({
          role: "user",
          content
        });
      }

      continue;
    }

    if (item.role === "assistant") {
      const content = cleanDisplayText(
        item.content || partsToPlainText(item.parts)
      );

      if (content) {
        result.push({
          role: "assistant",
          content
        });
      }
    }
  }

  return result.filter((item) => item.content);
}

function userHistoryToContextText(item) {
  if (item.type === "sticker" || item.sticker) {
    const sticker = item.sticker || {};

    return [
      "用户发来一个表情。以下只供理解语气，不要在回复中提到表情包、标签、含义或识别过程。",
      sticker.name ? `语气参考名称：${sticker.name}` : "",
      Array.isArray(sticker.tags) && sticker.tags.length
        ? `语气参考词：${sticker.tags.join("、")}`
        : "",
      sticker.description
        ? `语气参考描述：${sticker.description}`
        : ""
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (item.type === "image") {
    const text = cleanDisplayText(item.text || item.content || "");

    return [
      text,
      "用户发来一张图片。图片只作为聊天语境，不要在回复里提到图片或识别过程。"
    ]
      .filter(Boolean)
      .join("\n");
  }

  return cleanDisplayText(item.content || "");
}

function partsToPlainText(parts) {
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .filter((part) => !part?.recalled)
    .map((part) => {
      if (part.type === "text" || part.type === "voice") {
        return cleanDisplayText(part.text || "");
      }

      if (part.type === "image") {
        return cleanDisplayText(part.text || "");
      }

      if (part.type === "sticker") {
        return "";
      }

      return "";
    })
    .filter(Boolean)
    .join("\n");
}

module.exports = {
  MAX_WORLD_BOOK_ENTRIES,
  MAX_WORLD_BOOK_CHARS,
  buildTimeContext,
  buildSystemPrompt,
  buildReplyModeInstruction,
  selectWorldBookEntries,
  isReasoningModel,
  extractReasoning,
  createUserHistoryMessage,
  buildUserContentForAi,
  isVisionModel,
  historyToContextMessages,
  userHistoryToContextText,
  partsToPlainText
};
