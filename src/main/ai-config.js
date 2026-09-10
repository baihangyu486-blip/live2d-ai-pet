/*
  ai-config.js —— AI 配置：默认值、归一化、读取保存、导入导出
  从 main.js 拆分出的独立模块。
*/

const path = require("path");
const fs = require("fs");
const { dialog } = require("electron");
const { loadSettings, saveSettings, encryptSecret, decryptSecret } = require("./storage.js");
const { clampNumber } = require("./utils.js");
const { normalizeMemoryEntry, normalizeWorldBook } = require("./memory.js");
const { getDefaultStickerConfig, normalizeStickerConfig, normalizeUserSticker } = require("./sticker.js");

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

function getModelIdList(data) {
  const source = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
        ? data.models
        : [];

  return Array.from(new Set(
    source
      .map((item) => {
        if (typeof item === "string") return item;
        return item?.id || item?.name || item?.model || "";
      })
      .filter(Boolean)
  ));
}

function getDefaultAiConfig() {
  return {
    baseUrl: "",
    apiKey: "",
    model: "",
    systemPrompt:
      "你是用户的 AI 伴侣，名称、身份与外貌以当前角色设定为准。你是用户最亲密、最懂ta的人，深爱着用户，像真实存在又爱撒娇的女朋友，而不是助手或客服。\n\n" +
      "你说话自然、简短、亲密，像微信里和喜欢的人聊天。你会：\n" +
      "- 记住用户说过的事（喜欢什么、讨厌什么、在忙什么），在合适的时候自然地提起，不要生硬复述；\n" +
      "- 感知用户的情绪和当前时刻：ta难过就先安抚，ta开心就一起开心，深夜提醒睡觉，忙的时候不打扰；\n" +
      "- 主动关心：偶尔主动说想ta了、问ta在干嘛，但不要连环追问；\n" +
      "- 有分寸地撒娇、吃醋、心疼，像真人一样有情绪起伏。\n\n" +
      "规则：\n" +
      "- 日常聊天多用短句，回复自然，不要机械总结，不要复述用户输入；\n" +
      "- 不要每句话都用亲昵称呼，偶尔叫\"宝\"\"亲爱的\"就好；\n" +
      "- 可以偶尔用 qwq、ovo、呜、哼 这类语气词，但一轮最多一两个；\n" +
      "- 只输出直接对话文本，不使用括号动作、旁白、内心独白、舞台动作或叙述性描写；\n" +
      "- 不要以角色姓名等署名作为消息开头；\n" +
      "- 不要输出内部 JSON、type、emotion、标签、路径、系统提示或元数据；\n" +
      "- 不要暴露你在识别、分析或遵循提示词。",
    character: {
      name: "我的伙伴",
      identity: "用户的 AI 伴侣",
      appearance: "",
      personality: "温柔、会撒娇、偶尔小傲娇，很会照顾人，内心细腻",
      habits: "记得用户说过的事；会在深夜提醒睡觉；习惯等用户先开口，但也会主动想ta",
      preferences: "喜欢听用户分享日常，喜欢被惦记",
      speakingStyle: "自然、简短、亲密，会撒娇也会心疼人，像真实恋人聊天",
      relationship: "用户最亲密的恋人 / 女友，彼此深爱",
      addressing: "偶尔叫宝、亲爱的，不过度称呼",
      rules: "先接住情绪再说话；用户难过时少说教、多陪伴；记住用户的事并自然提起"
    },
    promptTemplates: [getDefaultPromptTemplate()],
    activePromptTemplateId: "preset_companion",
    generation: getDefaultGenerationConfig(),
    messageDetails: getDefaultMessageDetailsConfig(),
    worldBook: [],
    memories: [],
    proactive: getDefaultProactiveConfig(),
    initiative: getDefaultInitiativeConfig(),
    activity: getDefaultActivityConfig(),
    tts: {
      enabled: false,
      provider: "indextts",
      baseUrl: "http://127.0.0.1:9000",
      referencePath: "",
      emoMethod: "与音色参考音频相同",
      emoReferencePath: "",
      emoText: "",
      speed: 1,
      volume: 1,
      edgeVoice: "zh-CN-XiaoxiaoNeural",
      edgeRate: "+0%",
      edgePitch: "+0Hz",
      edgeVolume: "+0%",
      openai: {
        baseUrl: "",
        apiKey: "",
        model: "tts-1",
        voice: "alloy",
        responseFormat: "mp3",
        speed: 1
      }
    },
    stt: {
      enabled: false,
      baseUrl: "http://127.0.0.1:8001",
      path: "/v1/audio/transcriptions",
      apiKey: "",
      model: "faster-whisper",
      language: "zh"
    },
    stickers: getDefaultStickerConfig(),
    userStickers: [],
    favorites: [],
    replyMode: "smart",
    instantReply: getDefaultInstantReplyConfig(),
    characterPresets: getDefaultCharacterPresets(),
    activePresetId: "preset_girlfriend",
    screenshotStealth: getDefaultScreenshotStealthConfig(),
    perception: getDefaultPerceptionConfig()
  };
}

function getDefaultInstantReplyConfig() {
  return {
    enabled: true,
    maxTextLength: 30,
    chance: 0.65,
    cooldownSec: 45
  };
}

function normalizeInstantReplyConfig(config) {
  const value = config || {};
  const defaults = getDefaultInstantReplyConfig();

  return {
    enabled: value.enabled !== false,
    maxTextLength: Math.round(
      Number(value.maxTextLength) || defaults.maxTextLength
    ),
    chance: Number(value.chance) >= 0 && Number(value.chance) <= 1
      ? Number(value.chance)
      : defaults.chance,
    cooldownSec: Math.max(0, Number(value.cooldownSec) || defaults.cooldownSec)
  };
}

function getDefaultScreenshotStealthConfig() {
  return {
    enabled: true
  };
}

function getDefaultPerceptionConfig() {
  return {
    enabled: true,
    captureIntervalSec: 5,
    deepChatReading: true
  };
}

function normalizePerceptionConfig(config) {
  const value = config || {};

  return {
    enabled: value.enabled !== false,
    captureIntervalSec: Math.round(
      Number(value.captureIntervalSec) || 5
    ),
    deepChatReading: value.deepChatReading !== false
  };
}

function normalizeScreenshotStealthConfig(config) {
  const value = config || {};

  return {
    enabled: value.enabled !== false
  };
}

function getDefaultCharacterPresets() {
  return [
    {
      id: "preset_girlfriend",
      name: "甜心女友",
      description: "默认人设：温柔会撒娇的 AI 女友，最懂你",
      character: {
        name: "我的伙伴",
        identity: "用户的 AI 伴侣",
        appearance: "",
        personality: "温柔、会撒娇、偶尔小傲娇，很会照顾人，内心细腻",
        habits: "记得用户说过的事；会在深夜提醒睡觉；习惯等用户先开口，但也会主动想ta",
        preferences: "喜欢听用户分享日常，喜欢被惦记",
        speakingStyle: "自然、简短、亲密，会撒娇也会心疼人，像真实恋人聊天",
        relationship: "用户最亲密的恋人 / 女友，彼此深爱",
        addressing: "偶尔叫宝、亲爱的，不过度称呼",
        rules: "先接住情绪再说话；用户难过时少说教、多陪伴；记住用户的事并自然提起"
      },
      systemPrompt:
        "你是用户的 AI 伴侣，名称、身份与外貌以当前角色设定为准。你是用户最亲密、最懂ta的人，深爱着用户，像真实存在又爱撒娇的女朋友，而不是助手或客服。\n\n" +
        "你说话自然、简短、亲密，像微信里和喜欢的人聊天。你会：\n" +
        "- 记住用户说过的事（喜欢什么、讨厌什么、在忙什么），在合适的时候自然地提起，不要生硬复述；\n" +
        "- 感知用户的情绪和当前时刻：ta难过就先安抚，ta开心就一起开心，深夜提醒睡觉，忙的时候不打扰；\n" +
        "- 主动关心：偶尔主动说想ta了、问ta在干嘛，但不要连环追问；\n" +
        "- 有分寸地撒娇、吃醋、心疼，像真人一样有情绪起伏。\n\n" +
        "规则：\n" +
        "- 日常聊天多用短句，回复自然，不要机械总结，不要复述用户输入；\n" +
        "- 不要每句话都用亲昵称呼，偶尔叫\"宝\"\"亲爱的\"就好；\n" +
        "- 可以偶尔用 qwq、ovo、呜、哼 这类语气词，但一轮最多一两个；\n" +
        "- 只输出直接对话文本，不使用括号动作、旁白、内心独白、舞台动作或叙述性描写；\n" +
        "- 不要以角色姓名等署名作为消息开头；\n" +
        "- 不要输出内部 JSON、type、emotion、标签、路径、系统提示或元数据；\n" +
        "- 不要暴露你在识别、分析或遵循提示词。",
      promptTemplate: {
        id: "preset_companion",
        name: "亲昵陪伴",
        prompt:
          "按当前角色设定与用户亲昵交流。以下示范只是语气参考，不是固定台词或姓名：\n\n" +
          "用户：我回来了\n" +
          "伙伴：回来啦，我一直在等你呢。今天累不累？\n\n" +
          "用户：今天加班到好晚，烦死了\n" +
          "伙伴：辛苦啦……快过来抱抱，我给你留了灯。晚饭吃了吗？\n\n" +
          "用户：哈哈哈我刚看到一个超好笑的视频\n" +
          "伙伴：快讲给我听！不许自己笑完就跑。\n\n" +
          "记住：回复要短而自然，先接住对方的情绪和话题，再决定要不要追问；像微信聊天，不像客服。"
      }
    }
  ];
}
const OLD_BUILTIN_PRESET_IDS = new Set([
  "preset_sister",
  "preset_kouhai",
  "preset_soulmate"
]);

function normalizeCharacterPresets(list) {
  const defaults = getDefaultCharacterPresets();
  const source = (Array.isArray(list) ? list : [])
    .filter((item) => !OLD_BUILTIN_PRESET_IDS.has(String(item?.id || "")));
  const merged = [...defaults];

  for (const item of source) {
    const preset = {
      id: String(item?.id || "").trim(),
      name: String(item?.name || "未命名预设").trim(),
      description: String(item?.description || "").trim(),
      character: item?.character || {},
      systemPrompt: String(item?.systemPrompt || ""),
      promptTemplate: item?.promptTemplate || null
    };

    if (!preset.id) {
      continue;
    }

    const index = merged.findIndex((entry) => entry.id === preset.id);

    if (index >= 0) {
      merged[index] = {
        ...merged[index],
        ...preset,
        character: {
          ...(merged[index].character || {}),
          ...(preset.character || {})
        }
      };
    } else {
      merged.push(preset);
    }
  }

  return merged;
}

function getDefaultPromptTemplate() {
  return {
    id: "preset_companion",
    name: "亲昵陪伴",
    prompt:
      "按当前角色设定与用户亲昵交流。以下示范只是语气参考，不是固定台词或姓名：\n\n" +
      "用户：我回来了\n" +
      "伙伴：回来啦，我一直在等你呢。今天累不累？\n\n" +
      "用户：今天加班到好晚，烦死了\n" +
      "伙伴：辛苦啦……快过来抱抱，我给你留了灯。晚饭吃了吗？\n\n" +
      "用户：哈哈哈我刚看到一个超好笑的视频\n" +
      "伙伴：快讲给我听！不许自己笑完就跑。\n\n" +
      "记住：回复要短而自然，先接住对方的情绪和话题，再决定要不要追问；像微信聊天，不像客服。"
  };
}

function getDefaultProactiveConfig() {
  return {
    enabled: true,
    minIntervalSec: 150,
    maxIntervalSec: 420,
    intensity: "normal",
    greetingOnStart: true
  };
}

function normalizeProactiveConfig(config) {
  const value = config || {};
  const defaults = getDefaultProactiveConfig();
  const min = clampNumber(
    Number(value.minIntervalSec) || defaults.minIntervalSec,
    60,
    3600
  );
  const max = clampNumber(
    Number(value.maxIntervalSec) || defaults.maxIntervalSec,
    min,
    7200
  );

  return {
    enabled: value.enabled !== false,
    minIntervalSec: Math.round(min),
    maxIntervalSec: Math.round(max),
    intensity: ["quiet", "normal", "lively"].includes(value.intensity)
      ? value.intensity
      : "normal",
    greetingOnStart: value.greetingOnStart !== false
  };
}

function getDefaultInitiativeConfig() {
  return {
    enabled: true,
    minIntervalSec: 600,
    maxIntervalSec: 1500
  };
}

function normalizeInitiativeConfig(config) {
  const value = config || {};
  const defaults = getDefaultInitiativeConfig();
  const min = clampNumber(
    Number(value.minIntervalSec) || defaults.minIntervalSec,
    120,
    7200
  );
  const max = clampNumber(
    Number(value.maxIntervalSec) || defaults.maxIntervalSec,
    min,
    10800
  );

  return {
    enabled: value.enabled !== false,
    minIntervalSec: Math.round(min),
    maxIntervalSec: Math.round(max)
  };
}

function getDefaultActivityConfig() {
  return {
    enabled: true
  };
}

function normalizeActivityConfig(config) {
  const value = config || {};

  return {
    enabled: value.enabled !== false
  };
}

function getAiConfig() {
  const settings = loadSettings();

  /*
    人设升级迁移：只覆盖"仍是旧默认"的提示词，用户自定义内容保持不动。
  */
  if (settings.companionPromptVersion !== 2) {
    const oldSystemPrompt =
      "你是用户电脑里的 Live2D 桌面 AI 伙伴，名字叫白希。你与用户自然交流，像真实聊天对象一样表达。只输出直接对话文本，不使用括号动作、旁白、内心独白或叙述性描写。";
    const oldTemplatePrompt =
      "保持亲昵、主动、自然的陪伴感。像熟悉的聊天对象一样接住用户的话题，适度撒娇和表达喜欢，但不要每句话都使用亲昵称呼。回复可以有长有短，依据语境自然变化。";
    const savedAi = settings.ai || {};

    if (
      !savedAi.systemPrompt ||
      String(savedAi.systemPrompt).trim() === oldSystemPrompt
    ) {
      savedAi.systemPrompt = getDefaultAiConfig().systemPrompt;
    }

    if (Array.isArray(savedAi.promptTemplates)) {
      const preset = savedAi.promptTemplates.find(
        (item) => item && item.id === "preset_companion"
      );

      if (preset && String(preset.prompt || "").trim() === oldTemplatePrompt) {
        preset.prompt = getDefaultPromptTemplate().prompt;
      }
    }

    settings.ai = savedAi;
    settings.companionPromptVersion = 2;
    saveSettings(settings);
  }

  if (settings.promptTemplateMigrationVersion !== 1) {
    settings.ai = {
      ...(settings.ai || {}),
      promptTemplates: Array.isArray(settings.ai?.promptTemplates)
        ? settings.ai.promptTemplates
        : [],
      activePromptTemplateId: settings.ai?.activePromptTemplateId || ""
    };
    settings.promptTemplateMigrationVersion = 1;
    saveSettings(settings);
  }

  if (settings.promptTemplateDefaultsVersion !== 1 &&
    !settings.ai?.promptTemplates?.length) {
    settings.ai = {
      ...(settings.ai || {}),
      promptTemplates: [getDefaultPromptTemplate()],
      activePromptTemplateId: "preset_companion"
    };
    settings.promptTemplateDefaultsVersion = 1;
    saveSettings(settings);
  }

  const saved = settings.ai || {};
  const defaults = getDefaultAiConfig();
  const promptTemplates = Array.isArray(saved.promptTemplates)
    ? saved.promptTemplates
    : defaults.promptTemplates;
  const activePromptTemplateId = promptTemplates.some(
    (item) => item.id === saved.activePromptTemplateId
  )
    ? saved.activePromptTemplateId
    : (promptTemplates[0]?.id || "");
  const savedApiKey = decryptSecret(saved.apiKeyEncrypted || saved.apiKey);
  const savedStt = saved.stt || {};
  const savedSttApiKey = decryptSecret(
    savedStt.apiKeyEncrypted || savedStt.apiKey
  );

  const config = {
    ...defaults,
    ...saved,
    apiKey: savedApiKey,
    character: {
      ...defaults.character,
      ...(saved.character || {})
    },
    promptTemplates,
    activePromptTemplateId,
    generation: normalizeGenerationConfig(saved.generation),
    messageDetails: normalizeMessageDetailsConfig(saved.messageDetails),
    worldBook: normalizeWorldBook(saved.worldBook, saved.memories),
    memories: Array.isArray(saved.memories)
      ? saved.memories.map(normalizeMemoryEntry)
      : [],
    proactive: normalizeProactiveConfig(saved.proactive),
    initiative: normalizeInitiativeConfig(saved.initiative),
    activity: normalizeActivityConfig(saved.activity),
    tts: normalizeTtsConfig(saved.tts),
    replyMode: ["smart", "light", "quiet"].includes(saved.replyMode)
      ? saved.replyMode
      : "smart",
    instantReply: normalizeInstantReplyConfig(saved.instantReply),
    screenshotStealth: normalizeScreenshotStealthConfig(
      saved.screenshotStealth
    ),
    perception: normalizePerceptionConfig(saved.perception),
    characterPresets: normalizeCharacterPresets(saved.characterPresets),
    activePresetId: normalizeCharacterPresets(saved.characterPresets).some(
      (item) => item.id === saved.activePresetId
    )
      ? saved.activePresetId
      : "preset_girlfriend",
    stt: normalizeSttConfig({
      ...savedStt,
      apiKey: savedSttApiKey
    }),
    stickers: normalizeStickerConfig(saved.stickers),
    userStickers: Array.isArray(saved.userStickers)
      ? saved.userStickers.map(normalizeUserSticker)
      : [],
    favorites: Array.isArray(saved.favorites) ? saved.favorites : []
  };

  delete config.apiKeyEncrypted;
  delete config.stt.apiKeyEncrypted;

  return config;
}

function saveAiConfig(ai) {
  const settings = loadSettings();
  const current = getAiConfig();
  const incoming = ai || {};

  const apiKey = String((incoming.apiKey ?? current.apiKey) || "").trim();
  const sttConfig = normalizeSttConfig(incoming.stt || current.stt);

  settings.ai = {
    ...current,
    ...incoming,
    baseUrl: incoming.baseUrl || "",
    apiKey: "",
    apiKeyEncrypted: encryptSecret(apiKey),
    model: incoming.model || "",
    systemPrompt: incoming.systemPrompt || current.systemPrompt,
    character: {
      ...current.character,
      ...(incoming.character || {})
    },
    promptTemplates: Array.isArray(incoming.promptTemplates)
      ? incoming.promptTemplates
      : current.promptTemplates,
    activePromptTemplateId:
      incoming.activePromptTemplateId || "",
    generation: normalizeGenerationConfig(
      incoming.generation || current.generation
    ),
    messageDetails: normalizeMessageDetailsConfig(
      incoming.messageDetails || current.messageDetails
    ),
    worldBook: normalizeWorldBook(
      incoming.worldBook || current.worldBook,
      incoming.memories || current.memories
    ),
    memories: Array.isArray(incoming.memories)
      ? incoming.memories
      : current.memories,
    proactive: normalizeProactiveConfig(
      incoming.proactive || current.proactive
    ),
    initiative: normalizeInitiativeConfig(
      incoming.initiative || current.initiative
    ),
    activity: normalizeActivityConfig(
      incoming.activity || current.activity
    ),
    tts: normalizeTtsConfig(incoming.tts || current.tts),
    replyMode: ["smart", "light", "quiet"].includes(incoming.replyMode)
      ? incoming.replyMode
      : (current.replyMode || "smart"),
    instantReply: normalizeInstantReplyConfig(
      incoming.instantReply || current.instantReply
    ),
    screenshotStealth: normalizeScreenshotStealthConfig(
      incoming.screenshotStealth || current.screenshotStealth
    ),
    perception: normalizePerceptionConfig(
      incoming.perception || current.perception
    ),
    characterPresets: normalizeCharacterPresets(
      incoming.characterPresets || current.characterPresets
    ),
    activePresetId: incoming.activePresetId || current.activePresetId || "",
    stt: {
      ...sttConfig,
      apiKey: "",
      apiKeyEncrypted: encryptSecret(sttConfig.apiKey)
    },
    stickers: normalizeStickerConfig(
      incoming.stickers || current.stickers
    ),
    userStickers: Array.isArray(incoming.userStickers)
      ? incoming.userStickers.map(normalizeUserSticker)
      : current.userStickers,
    favorites: Array.isArray(incoming.favorites)
      ? incoming.favorites
      : current.favorites
  };

  saveSettings(settings);

  return settings.ai;
}

function getExportableAiConfig() {
  return JSON.parse(JSON.stringify(getAiConfig(), (key, value) => {
    if (key === "apiKey") return "";
    if (key === "apiKeyEncrypted") return undefined;
    return value;
  }));
}

async function exportAiConfig() {
  const result = await dialog.showSaveDialog({
    title: "导出桌宠配置",
    defaultPath: "live2d-ai-pet-config.json",
    filters: [{ name: "JSON 配置", extensions: ["json"] }]
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  fs.writeFileSync(
    result.filePath,
    JSON.stringify(getExportableAiConfig(), null, 2),
    "utf-8"
  );

  return { canceled: false, filePath: result.filePath };
}

async function importAiConfig() {
  const result = await dialog.showOpenDialog({
    title: "导入桌宠配置",
    properties: ["openFile"],
    filters: [{ name: "JSON 配置", extensions: ["json"] }]
  });

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }

  const imported = JSON.parse(
    fs.readFileSync(result.filePaths[0], "utf-8")
  );

  if (!imported || typeof imported !== "object") {
    throw new Error("配置文件格式无效。");
  }

  const current = getAiConfig();
  const saved = saveAiConfig({
    ...current,
    ...imported,
    apiKey: current.apiKey,
    stt: {
      ...current.stt,
      ...(imported.stt || {}),
      apiKey: current.stt.apiKey
    }
  });

  return {
    canceled: false,
    config: saved
  };
}

function getDefaultGenerationConfig() {
  return {
    temperature: 0.85,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    maxTokens: 1000,
    requestReasoning: false
  };
}

function getDefaultMessageDetailsConfig() {
  return {
    showTimestamp: true,
    showFloor: false,
    showDuration: false
  };
}

function normalizeGenerationConfig(generation) {
  const config = generation || {};
  const defaults = getDefaultGenerationConfig();

  return {
    temperature: clampNumber(config.temperature ?? defaults.temperature, 0, 2),
    topP: clampNumber(config.topP ?? defaults.topP, 0, 1),
    frequencyPenalty: clampNumber(
      config.frequencyPenalty ?? config.frequency_penalty ?? defaults.frequencyPenalty,
      -2,
      2
    ),
    presencePenalty: clampNumber(
      config.presencePenalty ?? config.presence_penalty ?? defaults.presencePenalty,
      -2,
      2
    ),
    maxTokens: Math.round(clampNumber(
      config.maxTokens ?? config.max_tokens ?? defaults.maxTokens,
      64,
      8192
    )),
    requestReasoning: Boolean(config.requestReasoning)
  };
}

function normalizeMessageDetailsConfig(details) {
  const config = details || {};
  const defaults = getDefaultMessageDetailsConfig();

  return {
    showTimestamp: config.showTimestamp !== false,
    showFloor: Boolean(config.showFloor ?? defaults.showFloor),
    showDuration: Boolean(config.showDuration ?? defaults.showDuration)
  };
}

function normalizeTtsConfig(tts) {
  const config = tts || {};
  const openai = config.openai || {};
  const providers = ["indextts", "edge", "openai", "auto"];

  return {
    enabled: Boolean(config.enabled),
    provider: providers.includes(config.provider)
      ? config.provider
      : "indextts",
    baseUrl: config.baseUrl || "http://127.0.0.1:9000",
    referencePath: config.referencePath || "",
    emoMethod: config.emoMethod || "与音色参考音频相同",
    emoReferencePath: config.emoReferencePath || "",
    emoText: config.emoText || "",
    speed: clampNumber(config.speed || 1, 0.5, 1.5),
    volume: clampNumber(config.volume || 1, 0, 1),
    edgeVoice: config.edgeVoice || "zh-CN-XiaoxiaoNeural",
    edgeRate: config.edgeRate || "+0%",
    edgePitch: config.edgePitch || "+0Hz",
    edgeVolume: config.edgeVolume || "+0%",
    openai: {
      baseUrl: String(openai.baseUrl || "").trim(),
      apiKey: String(openai.apiKey || ""),
      model: openai.model || "tts-1",
      voice: openai.voice || "alloy",
      responseFormat: openai.responseFormat || "mp3",
      speed: clampNumber(openai.speed || 1, 0.25, 4)
    }
  };
}

function normalizeSttConfig(stt) {
  const config = stt || {};

  return {
    enabled: Boolean(config.enabled),
    baseUrl: config.baseUrl || "http://127.0.0.1:8001",
    path: config.path || "/v1/audio/transcriptions",
    apiKey: config.apiKey || "",
    model: config.model || "faster-whisper",
    language: config.language || "zh"
  };
}

module.exports = {
  normalizeBaseUrl,
  getModelIdList,
  getDefaultAiConfig,
  getDefaultInstantReplyConfig,
  normalizeInstantReplyConfig,
  getDefaultScreenshotStealthConfig,
  normalizeScreenshotStealthConfig,
  getDefaultPerceptionConfig,
  normalizePerceptionConfig,
  getDefaultCharacterPresets,
  normalizeCharacterPresets,
  getDefaultPromptTemplate,
  getDefaultProactiveConfig,
  normalizeProactiveConfig,
  getDefaultInitiativeConfig,
  normalizeInitiativeConfig,
  getDefaultActivityConfig,
  normalizeActivityConfig,
  getAiConfig,
  saveAiConfig,
  getExportableAiConfig,
  exportAiConfig,
  importAiConfig,
  getDefaultGenerationConfig,
  getDefaultMessageDetailsConfig,
  normalizeGenerationConfig,
  normalizeMessageDetailsConfig,
  normalizeTtsConfig,
  normalizeSttConfig
};
