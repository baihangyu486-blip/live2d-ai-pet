const faceList = document.getElementById("face-list");
const lookList = document.getElementById("look-list");
const poseList = document.getElementById("pose-list");
const motionList = document.getElementById("motion-list");

const aiBaseUrl = document.getElementById("ai-base-url");
const aiApiKey = document.getElementById("ai-api-key");
const aiModel = document.getElementById("ai-model");
const aiModelManual = document.getElementById("ai-model-manual");
const aiStatus = document.getElementById("ai-status");

const charName = document.getElementById("char-name");
const charIdentity = document.getElementById("char-identity");
const charAppearance = document.getElementById("char-appearance");
const charPersonality = document.getElementById("char-personality");
const charHabits = document.getElementById("char-habits");
const charPreferences = document.getElementById("char-preferences");
const charSpeakingStyle = document.getElementById("char-speaking-style");
const charRelationship = document.getElementById("char-relationship");
const charAddressing = document.getElementById("char-addressing");
const charRules = document.getElementById("char-rules");

const memoryList = document.getElementById("worldbook-list");
const generationTemperature = document.getElementById("generation-temperature");
const generationTopP = document.getElementById("generation-top-p");
const generationFrequency = document.getElementById("generation-frequency");
const generationPresence = document.getElementById("generation-presence");
const generationMaxTokens = document.getElementById("generation-max-tokens");
const generationReasoning = document.getElementById("generation-reasoning");

const proactiveEnabled = document.getElementById("proactive-enabled");
const proactiveMin = document.getElementById("proactive-min");
const proactiveMax = document.getElementById("proactive-max");
const initiativeEnabled = document.getElementById("initiative-enabled");
const initiativeMin = document.getElementById("initiative-min");
const initiativeMax = document.getElementById("initiative-max");
const activityEnabled = document.getElementById("activity-enabled");
const autoLaunch = document.getElementById("auto-launch");
const audioCacheInfo = document.getElementById("audio-cache-info");
const autoMemoryList = document.getElementById("memory-list");
const companionStatus = document.getElementById("companion-status");

const historyList = document.getElementById("history-list");
const historyStatus = document.getElementById("history-status");

const ttsEnabled = document.getElementById("tts-enabled");
const ttsBaseUrl = document.getElementById("tts-base-url");
const ttsReferencePath = document.getElementById("tts-reference-path");
const ttsEmoMethod = document.getElementById("tts-emo-method");
const ttsEmoReferencePath = document.getElementById("tts-emo-reference-path");
const ttsEmoText = document.getElementById("tts-emo-text");
const ttsSpeed = document.getElementById("tts-speed");
const ttsVolume = document.getElementById("tts-volume");
const ttsStatus = document.getElementById("tts-status");

const sttEnabled = document.getElementById("stt-enabled");
const sttBaseUrl = document.getElementById("stt-base-url");
const sttPath = document.getElementById("stt-path");
const sttApiKey = document.getElementById("stt-api-key");
const sttModel = document.getElementById("stt-model");
const sttLanguage = document.getElementById("stt-language");
const sttStatus = document.getElementById("stt-status");

const stickerEnabled = document.getElementById("sticker-enabled");
const stickerFrequency = document.getElementById("sticker-frequency");
const stickerMaxPerReply = document.getElementById("sticker-max-per-reply");
const stickerGlobalCooldown = document.getElementById("sticker-global-cooldown");
const stickerRules = document.getElementById("sticker-rules");
const stickerStatus = document.getElementById("sticker-status");

const modelCurrent = document.getElementById("model-current");
const modelStatus = document.getElementById("model-status");
const importedModelSelect = document.getElementById("imported-model-select");
const btnSelectModel = document.getElementById("btn-select-model");
const appStatus = document.getElementById("app-status");
const settingsSaveStatus = document.getElementById("settings-save-status");
const btnSaveSettings = document.getElementById("btn-save-settings");

const presetSelect = document.getElementById("preset-select");
const presetDescription = document.getElementById("preset-description");
const presetNewName = document.getElementById("preset-new-name");
const presetNewDesc = document.getElementById("preset-new-desc");
const presetStatus = document.getElementById("preset-status");

const replyModeRow = document.getElementById("reply-mode-row");
const stealthEnabled = document.getElementById("stealth-enabled");
const btnPauseProactive = document.getElementById("btn-pause-proactive");

const affectionDisplay = document.getElementById("affection-display");
const checkinLine = document.getElementById("checkin-line");
const btnCheckinNow = document.getElementById("btn-checkin-now");
const anniversaryList = document.getElementById("anniversary-list");
const anniName = document.getElementById("anni-name");
const anniDate = document.getElementById("anni-date");
const affectionStatus = document.getElementById("affection-status");

const ttsProvider = document.getElementById("tts-provider");
const ttsEdgeVoice = document.getElementById("tts-edge-voice");
const ttsOpenaiBaseUrl = document.getElementById("tts-openai-base-url");
const ttsOpenaiApiKey = document.getElementById("tts-openai-api-key");
const ttsOpenaiModel = document.getElementById("tts-openai-model");
const ttsOpenaiVoice = document.getElementById("tts-openai-voice");

const generationPreset = document.getElementById("generation-preset");
const generationAdvanced = document.getElementById("generation-advanced");
const btnTestConnection = document.getElementById("btn-test-connection");
const btnRestorePresetBackup = document.getElementById("btn-restore-preset-backup");
const sessionManagerList = document.getElementById("session-manager-list");
const btnNewSessionPanel = document.getElementById("btn-new-session-panel");
const anniRemindDays = document.getElementById("anni-remind-days");
const btnSaveAnniRemind = document.getElementById("btn-save-anni-remind");
const ttsEngineStatus = document.getElementById("tts-engine-status");
const detailShowTimestamp = document.getElementById("detail-show-timestamp");
const detailShowFloor = document.getElementById("detail-show-floor");
const detailShowDuration = document.getElementById("detail-show-duration");
const btnSaveMessageDetails = document.getElementById("btn-save-message-details");
const proactiveIntensityRow = document.getElementById("proactive-intensity-row");
const perceptionEnabled = document.getElementById("perception-enabled");
const deepChatReading = document.getElementById("deep-chat-reading");
const captureInterval = document.getElementById("capture-interval");
const historySearch = document.getElementById("history-search");

let currentAiConfig = null;
let presetBackup = null;
let availableExpressionFiles = [];

const openedStickerRuleIds = new Set();

const DEFAULT_BASE_PROMPT =
  "你是用户电脑里的 AI 伴侣，按照当前角色档案与用户相处。你与用户自然交流，像真实聊天对象一样表达。只输出直接对话文本，不使用括号动作、旁白、内心独白或叙述性描写。";

const DEFAULT_STICKER_RULES = {
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
};

const faceExpressions = [
  "wink.exp3.json",
  "爱心眼.exp3.json",
  "比心.exp3.json",
  "生气.exp3.json",
  "烦躁.exp3.json",
  "哭.exp3.json",
  "问号.exp3.json",
  "嫌弃.exp3.json",
  "星星眼.exp3.json",
  "耶.exp3.json",
  "晕晕.exp3.json"
];

const lookExpressions = [
  "短发.exp3.json",
  "双马尾短加后发.exp3.json",
  "丸子头.exp3.json",
  "长双马尾.exp3.json",
  "长双马尾加后发.exp3.json",
  "显示发夹.exp3.json",
  "去眼部高光.exp3.json",
  "去眼部红点.exp3.json"
];

const exclusiveLookExpressions = new Set(lookExpressions.slice(0, 5));

const poseExpressions = [
  "跪姿.exp3.json",
  "跪姿前倾.exp3.json",
  "唱歌.exp3.json",
  "打游戏.exp3.json"
];

document.getElementById("btn-close-panel").addEventListener("click", () => {
  window.petAPI.closePanel();
});

document.getElementById("btn-smaller").addEventListener("click", () => {
  sendCommand({ type: "scale-down" });
});

document.getElementById("btn-bigger").addEventListener("click", () => {
  sendCommand({ type: "scale-up" });
});

document.getElementById("btn-exit").addEventListener("click", () => {
  window.petAPI.closeApp();
});

document.getElementById("btn-refresh-models").addEventListener("click", refreshModels);
document.getElementById("btn-save-ai").addEventListener("click", saveAiConfig);
btnSaveSettings.addEventListener("click", saveAiConfig);
btnSelectModel.addEventListener("click", selectImportedModel);

autoLaunch.addEventListener("change", async () => {
  try {
    await window.petAPI.setAutoLaunch(autoLaunch.checked);
    appStatus.textContent = autoLaunch.checked
      ? "已开启开机自启。"
      : "已关闭开机自启。";
  } catch (error) {
    appStatus.textContent = toFriendlyError(error);
  }
});

document.getElementById("btn-clear-audio-cache").addEventListener("click", async () => {
  try {
    const result = await window.petAPI.clearAudioCache();
    appStatus.textContent = `已清理 ${result?.removed || 0} 个语音缓存文件。`;
    loadAudioCacheInfo();
  } catch (error) {
    appStatus.textContent = toFriendlyError(error);
  }
});

document.getElementById("btn-clear-auto-memories").addEventListener("click", clearAutoMemories);

aiModel.addEventListener("change", () => {
  aiModelManual.value = aiModel.value;
});

document.getElementById("btn-add-worldbook").addEventListener("click", addWorldBookEntry);
document.getElementById("btn-make-worldbook-constant").addEventListener("click", makeAllWorldBookConstant);
document.getElementById("btn-clear-worldbook").addEventListener("click", clearWorldBook);

document.getElementById("btn-refresh-history").addEventListener("click", loadChatHistoryPanel);
document.getElementById("btn-clear-history-panel").addEventListener("click", clearChatHistoryPanel);
document.getElementById("btn-export-history").addEventListener("click", () => exportHistory("json"));
document.getElementById("btn-export-history-md").addEventListener("click", () => exportHistory("markdown"));
document.getElementById("btn-export-history-archive").addEventListener("click", () => exportHistory("archive"));

document.getElementById("btn-select-tts-reference").addEventListener("click", async () => {
  await selectTtsReference("reference");
});

document.getElementById("btn-select-tts-emo-reference").addEventListener("click", async () => {
  await selectTtsReference("emotion");
});

document.getElementById("btn-save-tts").addEventListener("click", saveTtsSettings);
document.getElementById("btn-save-stt").addEventListener("click", saveSttSettings);

document.getElementById("btn-add-custom-sticker").addEventListener("click", addCustomStickerRule);
document.getElementById("btn-save-stickers").addEventListener("click", saveStickerSettings);

replyModeRow.addEventListener("change", () => {
  if (currentAiConfig) {
    saveAiConfig();
  }
});

stealthEnabled.addEventListener("change", () => {
  if (currentAiConfig) {
    saveAiConfig();
  }
});

document.getElementById("btn-apply-preset").addEventListener("click", applyPreset);
document.getElementById("btn-save-as-preset").addEventListener("click", saveAsPreset);
document.getElementById("btn-checkin-now").addEventListener("click", checkinNow);
document.getElementById("btn-add-anniversary").addEventListener("click", addAnniversary);
document.getElementById("btn-import-model").addEventListener("click", importModel);
document.getElementById("btn-reset-model").addEventListener("click", resetModel);
btnPauseProactive.addEventListener("click", toggleProactivePause);
btnTestConnection.addEventListener("click", testConnection);
btnRestorePresetBackup.addEventListener("click", restorePresetBackup);
btnNewSessionPanel.addEventListener("click", createSessionFromPanel);
btnSaveAnniRemind.addEventListener("click", saveAnniversaryRemindDays);
btnSaveMessageDetails.addEventListener("click", saveMessageDetailsPanel);
generationPreset.addEventListener("change", () => {
  applyGenerationPreset(generationPreset.value);
});

proactiveIntensityRow.addEventListener("change", () => {
  if (currentAiConfig) {
    saveAiConfig();
  }
});

perceptionEnabled.addEventListener("change", () => {
  if (currentAiConfig) {
    saveAiConfig();
  }
});

deepChatReading.addEventListener("change", () => {
  if (currentAiConfig) {
    saveAiConfig();
  }
});

captureInterval.addEventListener("change", () => {
  if (currentAiConfig) {
    saveAiConfig();
  }
});

historySearch.addEventListener("input", () => {
  loadChatHistoryPanel();
});

function renderPresetSelect() {
  const presets = Array.isArray(currentAiConfig?.characterPresets)
    ? currentAiConfig.characterPresets
    : [];

  presetSelect.innerHTML = "";

  for (const preset of presets) {
    const option = document.createElement("option");

    option.value = preset.id;
    option.textContent = preset.name;
    option.selected = preset.id === currentAiConfig?.activePresetId;
    presetSelect.appendChild(option);
  }

  const active = presets.find(
    (item) => item.id === currentAiConfig?.activePresetId
  );

  presetDescription.textContent = active?.description || "";
}

async function applyPreset() {
  try {
    presetStatus.textContent = "正在应用…";

    syncFormToCurrentConfig();
    presetBackup = JSON.parse(JSON.stringify(currentAiConfig));

    try {
      localStorage.setItem("presetBackup", JSON.stringify(presetBackup));
    } catch {}

    const applied = await window.petAPI.applyCharacterPreset(
      presetSelect.value
    );

    if (!applied) {
      presetStatus.textContent = "没有找到这张角色卡。";
      return;
    }

    currentAiConfig = normalizeAiConfig(applied);
    btnRestorePresetBackup.disabled = false;
    presetStatus.textContent = "角色卡已应用，正在刷新…";
    await loadAiConfig();
    presetStatus.textContent = "角色卡已应用。";
  } catch (error) {
    presetStatus.textContent = toFriendlyError(error);
  }
}

async function restorePresetBackup() {
  try {
    const backup = presetBackup ||
      (() => {
        try {
          const raw = localStorage.getItem("presetBackup");

          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      })();

    if (!backup) {
      presetStatus.textContent = "没有可还原的上一版人设。";
      return;
    }

    currentAiConfig = normalizeAiConfig(
      await window.petAPI.saveAiConfig(backup)
    );
    presetStatus.textContent = "已还原上一版人设。";
    await loadAiConfig();
  } catch (error) {
    presetStatus.textContent = toFriendlyError(error);
  }
}

async function saveAsPreset() {
  const name = presetNewName.value.trim();

  if (!name) {
    presetStatus.textContent = "请先填写角色卡名称。";
    return;
  }

  try {
    await saveAiConfig();
    const preset = await window.petAPI.createCharacterPreset(
      name,
      presetNewDesc.value.trim()
    );

    presetStatus.textContent = `已保存角色卡「${preset?.name || name}」。`;
    presetNewName.value = "";
    presetNewDesc.value = "";
    await loadAiConfig();
  } catch (error) {
    presetStatus.textContent = toFriendlyError(error);
  }
}

async function renderAffectionPanel() {
  try {
    const [affection, checkin] = await Promise.all([
      window.petAPI.getAffection(),
      window.petAPI.getCheckin()
    ]);

    const score = Math.round(affection?.score || 0);
    const heart = [
      '<svg class="affection-heart" viewBox="0 0 24 24" aria-hidden="true">',
      '<defs>',
      '<linearGradient id="heartGrad" x1="0" y1="0" x2="1" y2="1">',
      '<stop offset="0%" stop-color="#ffb1d8"/>',
      '<stop offset="100%" stop-color="#f85ca4"/>',
      '</linearGradient>',
      '</defs>',
      '<path fill="url(#heartGrad)" d="M12 21s-7.5-4.6-10-9.2C.4 8.6 2.3 5 5.6 5c2 0 3.3 1.1 4 2.2.4.6 1.6.6 2 0 .7-1.1 2-2.2 4-2.2 3.3 0 5.2 3.6 3.6 6.8-2.5 4.6-10 9.2-10 9.2z"/>',
      '</svg>'
    ].join("");

    affectionDisplay.innerHTML = [
      `<div class="affection-emoji">${heart}</div>`,
      `<div class="affection-info">`,
      `  <div class="affection-title">${affection?.levelTitle || "初识"} · ${score}/100</div>`,
      `  <div class="affection-bar"><div class="affection-bar-fill" style="width:${score}%"></div></div>`,
      `</div>`
    ].join("");

    checkinLine.textContent = checkin?.doneToday
      ? `今日已打卡 · 连续 ${checkin.streak} 天 · 累计 ${checkin.total} 次`
      : (checkin?.streak > 0
          ? `昨天连续 ${checkin.streak} 天，今天还没打卡`
          : "今天还没打卡，聊一句就会自动记录今日相伴");

    btnCheckinNow.textContent = checkin?.doneToday ? "今日已打卡 ✓" : "今日打卡";
    btnCheckinNow.disabled = Boolean(checkin?.doneToday);
  } catch (error) {
    affectionStatus.textContent = toFriendlyError(error);
  }
}

async function checkinNow() {
  try {
    const result = await window.petAPI.checkinNow();

    affectionStatus.textContent = result
      ? `打卡成功！连续 ${result.streak} 天，好感 +${result.delta}`
      : "今天已经打过卡啦。";
    await renderAffectionPanel();
  } catch (error) {
    affectionStatus.textContent = toFriendlyError(error);
  }
}

async function renderAnniversaries() {
  try {
    const list = await window.petAPI.getAnniversaries();

    anniversaryList.innerHTML = "";

    if (!list.length) {
      const empty = document.createElement("div");

      empty.className = "history-empty";
      empty.textContent = "还没有纪念日，添加一个吧。";
      anniversaryList.appendChild(empty);
      return;
    }

    for (const item of list) {
      const wrap = document.createElement("div");

      wrap.className = "memory-item";

      const info = document.createElement("div");

      info.textContent =
        `${item.name} · ${item.date}` +
        (item.kind === "once" ? "（仅一次）" : "（每年）");
      info.style.marginBottom = "6px";

      const actions = document.createElement("div");

      actions.className = "button-list";

      const toggle = document.createElement("button");

      toggle.textContent = item.remind ? "关闭提醒" : "开启提醒";

      const remove = document.createElement("button");

      remove.className = "danger";
      remove.textContent = "删除";

      toggle.addEventListener("click", async () => {
        item.remind = !item.remind;
        await window.petAPI.saveAnniversaries(list);
        renderAnniversaries();
      });

      remove.addEventListener("click", async () => {
        const next = list.filter((entry) => entry.id !== item.id);

        await window.petAPI.saveAnniversaries(next);
        renderAnniversaries();
      });

      actions.append(toggle, remove);
      wrap.append(info, actions);
      anniversaryList.appendChild(wrap);
    }
  } catch (error) {
    affectionStatus.textContent = toFriendlyError(error);
  }
}

async function addAnniversary() {
  const name = anniName.value.trim();
  const date = anniDate.value;

  if (!name || !date) {
    affectionStatus.textContent = "请填写名称和日期。";
    return;
  }

  try {
    const list = await window.petAPI.getAnniversaries();

    list.push({
      id: `anni_${Date.now()}`,
      name,
      date,
      kind: "yearly",
      remind: true,
      createdAt: Date.now()
    });
    await window.petAPI.saveAnniversaries(list);
    anniName.value = "";
    anniDate.value = "";
    affectionStatus.textContent = "纪念日已添加。";
    renderAnniversaries();
  } catch (error) {
    affectionStatus.textContent = toFriendlyError(error);
  }
}

async function renderModelInfo() {
  try {
    const info = await window.petAPI.getLive2dModelInfo();
    const active = info?.status === "ready";
    modelCurrent.textContent = active
      ? `正在使用：${info.name || "已导入形象"}`
      : info?.status === "missing"
        ? "形象文件暂时找不到了。可以重新导入，或继续无形象陪伴。"
        : "还没有启用 Live2D。聊天、记忆和声音陪伴都可以照常使用。";
    modelCurrent.title = active ? info.path || "" : "";
    document.getElementById("btn-smaller").disabled = !active;
    document.getElementById("btn-bigger").disabled = !active;
    document.getElementById("btn-reset-model").disabled = !info?.path;
    importedModelSelect.replaceChildren();
    const imported = Array.isArray(info?.imported) ? info.imported : [];
    if (!imported.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "导入后可以在这里切换";
      importedModelSelect.append(option);
    }
    imported.forEach((entry) => {
      const option = document.createElement("option");
      option.value = entry.path;
      option.textContent = entry.name + (entry.active ? " · 使用中" : "");
      option.selected = Boolean(entry.active);
      importedModelSelect.append(option);
    });
    importedModelSelect.disabled = !imported.length;
    btnSelectModel.disabled = !imported.length;
    availableExpressionFiles = active && Array.isArray(info.expressionFiles) ? info.expressionFiles : [];
    createMotionButtons(active ? info : { motions: {}, expressions: [] });
  } catch (error) {
    modelCurrent.textContent = "读取形象信息失败，请稍后重试。";
  }
}

async function selectImportedModel() {
  if (!importedModelSelect.value) return;
  try {
    btnSelectModel.disabled = true;
    await window.petAPI.selectLive2dModel(importedModelSelect.value);
    modelStatus.textContent = "形象已切换，角色设定与记忆保持不变。";
    await renderModelInfo();
  } catch (error) {
    modelStatus.textContent = toFriendlyError(error);
  } finally {
    btnSelectModel.disabled = !importedModelSelect.value;
  }
}

async function importModel() {
  try {
    modelStatus.textContent = "请选择 model3.json 或模型文件夹…";

    const result = await window.petAPI.importLive2dModel();

    if (result?.canceled) {
      modelStatus.textContent = "";
      return;
    }

    modelStatus.textContent = `已导入：${result?.name || "新模型"}`;
    renderModelInfo();
  } catch (error) {
    modelStatus.textContent = toFriendlyError(error);
  }
}

async function resetModel() {
  try {
    await window.petAPI.resetLive2dModel();
    modelStatus.textContent = "已关闭 Live2D 形象。聊天与记忆陪伴继续。";
    renderModelInfo();
  } catch (error) {
    modelStatus.textContent = toFriendlyError(error);
  }
}

async function loadProactivePauseState() {
  try {
    const state = await window.petAPI.getProactiveState();

    btnPauseProactive.textContent = state?.paused
      ? "恢复主动说话"
      : "暂停主动说话";
  } catch {}
}

async function toggleProactivePause() {
  try {
    const state = await window.petAPI.getProactiveState();
    const paused = await window.petAPI.setProactivePaused(!state?.paused);

    btnPauseProactive.textContent = paused
      ? "恢复主动说话"
      : "暂停主动说话";
  } catch (error) {
    companionStatus.textContent = toFriendlyError(error);
  }
}

async function testConnection() {
  try {
    syncFormToCurrentConfig();
    btnTestConnection.disabled = true;
    aiStatus.textContent = "正在测试连接…";

    const result = await window.petAPI.testAiConnection(currentAiConfig);

    aiStatus.textContent = result?.message || "测试完成。";
    aiStatus.style.color = result?.ok ? "#2e9e6b" : "#d9534f";
  } catch (error) {
    aiStatus.textContent = toFriendlyError(error);
  } finally {
    btnTestConnection.disabled = false;
  }
}

function loadMessageDetailsPanel() {
  const details = currentAiConfig?.messageDetails || {};

  detailShowTimestamp.checked = details.showTimestamp !== false;
  detailShowFloor.checked = Boolean(details.showFloor);
  detailShowDuration.checked = Boolean(details.showDuration);
}

async function saveMessageDetailsPanel() {
  try {
    currentAiConfig.messageDetails = {
      showTimestamp: detailShowTimestamp.checked,
      showFloor: detailShowFloor.checked,
      showDuration: detailShowDuration.checked
    };

    currentAiConfig = normalizeAiConfig(
      await window.petAPI.saveAiConfig(currentAiConfig)
    );
    historyStatus.textContent = "消息显示选项已保存。";
  } catch (error) {
    historyStatus.textContent = toFriendlyError(error);
  }
}

const GENERATION_PRESETS = {
  stable: {
    temperature: 0.55,
    topP: 0.8,
    frequencyPenalty: 0.2,
    presencePenalty: 0.1,
    maxTokens: 800
  },
  balanced: {
    temperature: 0.85,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    maxTokens: 1000
  },
  lively: {
    temperature: 1.15,
    topP: 1,
    frequencyPenalty: 0.1,
    presencePenalty: 0.3,
    maxTokens: 1200
  }
};

function applyGenerationPreset(presetId) {
  const preset = GENERATION_PRESETS[presetId];

  if (!preset) {
    return;
  }

  generationTemperature.value = preset.temperature;
  generationTopP.value = preset.topP;
  generationFrequency.value = preset.frequencyPenalty;
  generationPresence.value = preset.presencePenalty;
  generationMaxTokens.value = preset.maxTokens;

  if (currentAiConfig) {
    currentAiConfig.generation = {
      temperature: preset.temperature,
      topP: preset.topP,
      frequencyPenalty: preset.frequencyPenalty,
      presencePenalty: preset.presencePenalty,
      maxTokens: preset.maxTokens,
      requestReasoning: generationReasoning.checked
    };
  }
}

function syncGenerationPresetFromFields() {
  if (!currentAiConfig) {
    return;
  }

  const generation = currentAiConfig.generation || {};
  const values = [
    Number(generation.temperature ?? 0.85),
    Number(generation.topP ?? 1),
    Number(generation.frequencyPenalty ?? 0),
    Number(generation.presencePenalty ?? 0),
    Number(generation.maxTokens ?? 1000)
  ];
  let best = "balanced";
  let bestDistance = Infinity;

  for (const [id, preset] of Object.entries(GENERATION_PRESETS)) {
    const distance = Math.abs(values[0] - preset.temperature) +
      Math.abs(values[1] - preset.topP) * 2 +
      Math.abs(values[2] - preset.frequencyPenalty) +
      Math.abs(values[3] - preset.presencePenalty) +
      Math.abs(values[4] - preset.maxTokens) / 200;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = id;
    }
  }

  generationPreset.value = best;
}

async function renderSessionManager() {
  try {
    const sessions = await window.petAPI.getSessions();

    sessionManagerList.innerHTML = "";

    for (const session of sessions || []) {
      const wrap = document.createElement("div");

      wrap.className = "memory-item";

      const info = document.createElement("div");

      info.className = "memory-text";

      const nameInput = document.createElement("input");

      nameInput.value = session.title;
      nameInput.placeholder = "会话名称";
      nameInput.style.marginBottom = "4px";

      const meta = document.createElement("div");

      meta.textContent =
        `${session.messageCount} 条消息` +
        (session.active ? " · 当前" : "") +
        (session.pinned ? " · 置顶" : "");
      meta.style.fontSize = "10.5px";
      meta.style.color = "#b56a90";
      info.append(nameInput, meta);

      nameInput.addEventListener("change", async () => {
        const title = nameInput.value.trim();

        if (title && title !== session.title) {
          await window.petAPI.renameSession(session.id, title);
          renderSessionManager();
        }
      });

      const actions = document.createElement("div");

      actions.className = "button-list";

      const pin = document.createElement("button");

      pin.textContent = session.pinned ? "取消置顶" : "置顶";

      pin.addEventListener("click", async () => {
        await window.petAPI.setSessionPinned(session.id, !session.pinned);
        renderSessionManager();
      });

      actions.appendChild(pin);

      if (!session.active) {
        const open = document.createElement("button");

        open.textContent = "切换";

        open.addEventListener("click", async () => {
          await window.petAPI.switchSession(session.id);
          await renderSessionManager();
          await loadChatHistoryPanel();
        });

        actions.appendChild(open);
      }

      if (session.id !== "session_default") {
        const remove = document.createElement("button");

        remove.className = "danger";
        remove.textContent = "删除";

        remove.addEventListener("click", async () => {
          const result = await window.petAPI.deleteSession(session.id);

          if (!result?.success) {
            historyStatus.textContent = result?.message || "删除失败。";
            return;
          }

          await renderSessionManager();
          await loadChatHistoryPanel();
        });

        actions.appendChild(remove);
      }

      wrap.append(info, actions);
      sessionManagerList.appendChild(wrap);
    }
  } catch (error) {
    historyStatus.textContent = toFriendlyError(error);
  }
}

async function createSessionFromPanel() {
  try {
    const session = await window.petAPI.createSession("新的会话");

    if (session) {
      await renderSessionManager();
      await loadChatHistoryPanel();
      historyStatus.textContent = `已创建会话「${session.title}」。`;
    }
  } catch (error) {
    historyStatus.textContent = toFriendlyError(error);
  }
}

async function loadAnniversaryRemindDays() {
  try {
    const days = await window.petAPI.getAnniversaryRemindDays();

    anniRemindDays.value = String(days || 3);
  } catch {}
}

async function saveAnniversaryRemindDays() {
  try {
    const days = await window.petAPI.saveAnniversaryRemindDays(
      Number(anniRemindDays.value) || 3
    );

    affectionStatus.textContent = `已保存：提前 ${days} 天提醒。`;
  } catch (error) {
    affectionStatus.textContent = toFriendlyError(error);
  }
}

async function loadAiConfig() {
  try {
    currentAiConfig = normalizeAiConfig(await window.petAPI.getAiConfig());

    aiBaseUrl.value = currentAiConfig.baseUrl || "";
    aiApiKey.value = currentAiConfig.apiKey || "";
    aiModelManual.value = currentAiConfig.model || "";

    const character = currentAiConfig.character || {};

    charName.value = character.name || "";
    charIdentity.value = character.identity || "";
    charAppearance.value = character.appearance || "";
    charPersonality.value = character.personality || "";
    charHabits.value = character.habits || "";
    charPreferences.value = character.preferences || "";
    charSpeakingStyle.value = character.speakingStyle || "";
    charRelationship.value = character.relationship || "";
    charAddressing.value = character.addressing || "";
    charRules.value = character.rules || "";

    const generation = currentAiConfig.generation || {};
    generationTemperature.value = generation.temperature ?? 0.85;
    generationTopP.value = generation.topP ?? 1;
    generationFrequency.value = generation.frequencyPenalty ?? 0;
    generationPresence.value = generation.presencePenalty ?? 0;
    generationMaxTokens.value = generation.maxTokens ?? 1000;
    generationReasoning.checked = Boolean(generation.requestReasoning);

    const proactive = currentAiConfig.proactive || {};
    proactiveEnabled.checked = proactive.enabled !== false;
    proactiveMin.value = proactive.minIntervalSec ?? 150;
    proactiveMax.value = proactive.maxIntervalSec ?? 420;

    const initiative = currentAiConfig.initiative || {};
    initiativeEnabled.checked = initiative.enabled !== false;
    initiativeMin.value = initiative.minIntervalSec ?? 600;
    initiativeMax.value = initiative.maxIntervalSec ?? 1500;

    activityEnabled.checked =
      (currentAiConfig.activity || {}).enabled !== false;

    const replyMode = currentAiConfig.replyMode || "smart";

    replyModeRow.querySelectorAll("input[type=radio]").forEach((radio) => {
      radio.checked = radio.value === replyMode;
    });

    proactiveIntensityRow.querySelectorAll("input[type=radio]").forEach((radio) => {
      radio.checked = radio.value === (currentAiConfig.proactive?.intensity || "normal");
    });

    stealthEnabled.checked =
      (currentAiConfig.screenshotStealth || {}).enabled !== false;

    const perception = currentAiConfig.perception || {};

    perceptionEnabled.checked = perception.enabled !== false;
    deepChatReading.checked = perception.deepChatReading !== false;
    captureInterval.value = String(perception.captureIntervalSec || 5);

    renderMemoryList(currentAiConfig.memories);
    loadAutoLaunchState();
    loadAudioCacheInfo();
    renderPresetSelect();
    renderAffectionPanel();
    renderAnniversaries();
    renderModelInfo();
    loadProactivePauseState();
    loadMessageDetailsPanel();
    renderSessionManager();
    loadAnniversaryRemindDays();
    syncGenerationPresetFromFields();

    setModelOptions(
      currentAiConfig.model ? [currentAiConfig.model] : [],
      currentAiConfig.model || ""
    );

    renderWorldBook();
    renderTtsSettings();
    renderSttSettings();
    renderStickerSettings();

    await loadChatHistoryPanel();
    btnSaveSettings.disabled = false;

    const titleSmall = document.querySelector(".panel-title small");

    if (titleSmall) {
      titleSmall.textContent = `当前角色：${currentAiConfig.character?.name || "AI 伴侣"}`;
    }
  } catch (error) {
    aiStatus.textContent = toFriendlyError(error);
    settingsSaveStatus.textContent = toFriendlyError(error);
  }
}

async function refreshModels() {
  const refreshButton = document.getElementById("btn-refresh-models");

  try {
    syncFormToCurrentConfig();

    refreshButton.disabled = true;
    aiStatus.textContent = "正在刷新模型…";

    const models = await window.petAPI.refreshModels(currentAiConfig);
    const selected = currentAiConfig.model || models[0] || "";

    currentAiConfig.model = selected;
    aiModelManual.value = selected;

    setModelOptions(models, selected);

    aiStatus.textContent = `已加载 ${models.length} 个模型。`;
  } catch (error) {
    console.error("刷新模型失败：", error);
    aiStatus.textContent =
      (toFriendlyError(error)) +
      " 可直接在“手动模型 ID”里填写模型名称后保存。";
  } finally {
    refreshButton.disabled = false;
  }
}

async function saveAiConfig() {
  if (!currentAiConfig) return;
  btnSaveSettings.disabled = true;
  settingsSaveStatus.textContent = "正在保存…";
  try {
    syncFormToCurrentConfig();
    currentAiConfig = normalizeAiConfig(await window.petAPI.saveAiConfig(currentAiConfig));
    aiStatus.textContent = "设置已保存。";
    settingsSaveStatus.textContent = "♡ 设置已保存";
    renderTtsEngineStatus();
    document.querySelector(".panel-title small").textContent =
      `当前角色：${currentAiConfig.character?.name || "AI 伴侣"}`;
  } catch (error) {
    aiStatus.textContent = toFriendlyError(error);
    settingsSaveStatus.textContent = toFriendlyError(error);
  } finally {
    btnSaveSettings.disabled = false;
  }
}

function syncFormToCurrentConfig() {
  currentAiConfig = normalizeAiConfig(currentAiConfig || {});

  currentAiConfig.baseUrl = aiBaseUrl.value.trim();
  currentAiConfig.apiKey = aiApiKey.value.trim();
  currentAiConfig.model =
    aiModelManual.value.trim() || aiModel.value.trim();

  currentAiConfig.character = {
    ...(currentAiConfig.character || {}),
    name: charName.value.trim(),
    identity: charIdentity.value.trim(),
    appearance: charAppearance.value.trim(),
    personality: charPersonality.value.trim(),
    habits: charHabits.value.trim(),
    preferences: charPreferences.value.trim(),
    speakingStyle: charSpeakingStyle.value.trim(),
    relationship: charRelationship.value.trim(),
    addressing: charAddressing.value.trim(),
    rules: charRules.value.trim()
  };

  currentAiConfig.tts = readTtsForm();
  currentAiConfig.stt = readSttForm();
  currentAiConfig.stickers = readStickerForm();
  currentAiConfig.messageDetails = {
    showTimestamp: detailShowTimestamp.checked,
    showFloor: detailShowFloor.checked,
    showDuration: detailShowDuration.checked
  };
  currentAiConfig.generation = {
    temperature: Number(generationTemperature.value),
    topP: Number(generationTopP.value),
    frequencyPenalty: Number(generationFrequency.value),
    presencePenalty: Number(generationPresence.value),
    maxTokens: Number(generationMaxTokens.value),
    requestReasoning: generationReasoning.checked
  };

  currentAiConfig.proactive = {
    enabled: proactiveEnabled.checked,
    minIntervalSec: Math.max(60, Number(proactiveMin.value) || 150),
    maxIntervalSec: Math.max(
      Number(proactiveMin.value) || 150,
      Number(proactiveMax.value) || 420
    ),
    intensity: (
      proactiveIntensityRow.querySelector("input[type=radio]:checked")?.value ||
      "normal"
    )
  };
  currentAiConfig.initiative = {
    enabled: initiativeEnabled.checked,
    minIntervalSec: Math.max(120, Number(initiativeMin.value) || 600),
    maxIntervalSec: Math.max(
      Number(initiativeMin.value) || 600,
      Number(initiativeMax.value) || 1500
    )
  };
  currentAiConfig.activity = {
    enabled: activityEnabled.checked
  };

  currentAiConfig.replyMode = (
    replyModeRow.querySelector("input[type=radio]:checked")?.value ||
    "smart"
  );
  currentAiConfig.screenshotStealth = {
    enabled: stealthEnabled.checked
  };

  currentAiConfig.perception = {
    enabled: perceptionEnabled.checked,
    deepChatReading: deepChatReading.checked,
    captureIntervalSec: Number(captureInterval.value) || 5
  };

  return currentAiConfig;
}

function normalizeAiConfig(ai) {
  const config = ai || {};

  return {
    ...config,
    systemPrompt: config.systemPrompt || DEFAULT_BASE_PROMPT,
    character: { ...(config.character || {}) },
    promptTemplates: Array.isArray(config.promptTemplates)
      ? config.promptTemplates
      : [],
    activePromptTemplateId: config.activePromptTemplateId || "",
    memories: Array.isArray(config.memories) ? config.memories : [],
    worldBook: Array.isArray(config.worldBook)
      ? config.worldBook
      : (config.memories || [])
        .filter((content) => typeof content === "string")
        .map((content, index) => ({
          id: `world_${index}`,
          title: `旧记忆 ${index + 1}`,
          content,
          keywords: [],
          category: "",
          enabled: true,
          constant: true,
          priority: 0
        })),
    generation: {
      temperature: Number(config.generation?.temperature ?? 0.85),
      topP: Number(config.generation?.topP ?? 1),
      frequencyPenalty: Number(config.generation?.frequencyPenalty ?? 0),
      presencePenalty: Number(config.generation?.presencePenalty ?? 0),
      maxTokens: Number(config.generation?.maxTokens ?? 1000),
      requestReasoning: Boolean(config.generation?.requestReasoning)
    },
    proactive: {
      enabled: config.proactive?.enabled !== false,
      minIntervalSec: Number(config.proactive?.minIntervalSec ?? 150),
      maxIntervalSec: Number(config.proactive?.maxIntervalSec ?? 420),
      intensity: ["quiet", "normal", "lively"].includes(config.proactive?.intensity)
        ? config.proactive.intensity
        : "normal"
    },
    initiative: {
      enabled: config.initiative?.enabled !== false,
      minIntervalSec: Number(config.initiative?.minIntervalSec ?? 600),
      maxIntervalSec: Number(config.initiative?.maxIntervalSec ?? 1500)
    },
    activity: {
      enabled: config.activity?.enabled !== false
    },
    replyMode: ["smart", "light", "quiet"].includes(config.replyMode)
      ? config.replyMode
      : "smart",
    screenshotStealth: {
      enabled: config.screenshotStealth?.enabled !== false
    },
    perception: {
      enabled: config.perception?.enabled !== false,
      deepChatReading: config.perception?.deepChatReading !== false,
      captureIntervalSec: Number(config.perception?.captureIntervalSec) || 5
    },
    tts: normalizeTtsConfig(config.tts),
    stt: normalizeSttConfig(config.stt),
    stickers: normalizeStickerConfig(config.stickers)
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
    speed: Number(config.speed || 1),
    volume: Number(config.volume || 1),
    edgeVoice: config.edgeVoice || "zh-CN-XiaoxiaoNeural",
    edgeRate: config.edgeRate || "+0%",
    edgePitch: config.edgePitch || "+0Hz",
    edgeVolume: config.edgeVolume || "+0%",
    openai: {
      baseUrl: openai.baseUrl || "",
      apiKey: openai.apiKey || "",
      model: openai.model || "tts-1",
      voice: openai.voice || "alloy",
      responseFormat: openai.responseFormat || "mp3",
      speed: Number(openai.speed || 1)
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

function normalizeStickerConfig(stickers) {
  const config = stickers || {};
  const savedRules = config.rules || {};
  const rules = {};

  Object.keys(DEFAULT_STICKER_RULES).forEach((id) => {
    rules[id] = normalizeBuiltInStickerRule(id, savedRules[id]);
  });

  return {
    enabled: Boolean(config.enabled),
    frequency: ["low", "normal", "high"].includes(config.frequency)
      ? config.frequency
      : "normal",
    maxPerReply: clampNumber(config.maxPerReply ?? 2, 0, 5),
    globalCooldown: clampNumber(config.globalCooldown ?? 2, 0, 20),
    rules,
    customRules: Array.isArray(config.customRules)
      ? config.customRules.map(normalizeCustomRule)
      : []
  };
}

function normalizeBuiltInStickerRule(id, rule) {
  const defaults = DEFAULT_STICKER_RULES[id] || {};

  return {
    ...defaults,
    ...(rule || {}),
    label: defaults.label || rule?.label || id,
    enabled: rule?.enabled !== false,
    paths: rule?.paths || "",
    minChance: clampChance(rule?.minChance ?? defaults.minChance ?? 0),
    maxChance: clampChance(rule?.maxChance ?? defaults.maxChance ?? 0),
    cooldown: clampNumber(rule?.cooldown ?? defaults.cooldown ?? 0, 0, 30),
    keywords: rule?.keywords ?? defaults.keywords ?? ""
  };
}

function normalizeCustomRule(rule) {
  return {
    id: rule?.id || createCustomRuleId(),
    enabled: rule?.enabled !== false,
    label: rule?.label || "自定义规则",
    paths: rule?.paths || "",
    minChance: clampChance(rule?.minChance ?? 0.15),
    maxChance: clampChance(rule?.maxChance ?? 0.3),
    cooldown: clampNumber(rule?.cooldown ?? 3, 0, 30),
    keywords: rule?.keywords || ""
  };
}

function createCustomRuleId() {
  return `custom_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function setModelOptions(models, selected) {
  aiModel.innerHTML = "";

  const unique = Array.from(new Set((models || []).filter(Boolean)));

  if (!unique.length && selected) {
    unique.push(selected);
  }

  unique.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    option.selected = model === selected;
    aiModel.appendChild(option);
  });
}


const AUTO_MEMORY_LABELS = {
  name: "名字",
  like: "喜欢",
  dislike: "不喜欢",
  activity: "最近在忙",
  event: "最近安排",
  feeling: "最近心情",
  legacy: "旧记忆"
};

function formatMemoryTime(ts) {
  if (!ts) return "";
  const date = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderMemoryList(memories) {
  autoMemoryList.innerHTML = "";
  const list = Array.isArray(memories) ? memories : [];

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "status";
    empty.textContent =
      "还没有自动记忆。聊聊你的名字、喜好和近况，值得记住的片段会出现在这里。";
    autoMemoryList.appendChild(empty);
    return;
  }

  list.forEach((memory) => {
    const card = document.createElement("div");
    card.className = "worldbook-item";

    const header = document.createElement("div");
    header.className = "check-row";
    header.textContent =
      `${AUTO_MEMORY_LABELS[memory.type] || "记忆"} · ` +
      formatMemoryTime(memory.lastSeenAt || memory.createdAt);

    const text = document.createElement("div");
    text.textContent = memory.text || "";

    const remove = document.createElement("button");
    remove.className = "danger";
    remove.textContent = "删除";
    remove.addEventListener("click", () => {
      currentAiConfig.memories = (currentAiConfig.memories || []).filter(
        (item) => item !== memory
      );
      renderMemoryList(currentAiConfig.memories);
      saveAiConfig().then(() => {
        companionStatus.textContent = "已删除这条记忆。";
      });
    });

    const pin = document.createElement("button");
    pin.className = "secondary";
    pin.textContent = memory.pinned ? "取消固定" : "固定";
    pin.title = "固定后不会被自动清理";
    pin.addEventListener("click", async () => {
      await window.petAPI.setMemoryPinned(memory.id, !memory.pinned);
      const settings = await window.petAPI.getAiConfig();

      renderMemoryList(settings.memories);
      currentAiConfig.memories = settings.memories;
    });

    card.append(header, text, pin, remove);
    autoMemoryList.appendChild(card);
  });
}

async function clearAutoMemories() {
  currentAiConfig.memories = (currentAiConfig.memories || []).filter(
    (item) => item?.source === "manual"
  );
  renderMemoryList(currentAiConfig.memories);
  await saveAiConfig();
  companionStatus.textContent = "已清空自动记忆。";
}

async function loadAutoLaunchState() {
  try {
    autoLaunch.checked = Boolean(await window.petAPI.getAutoLaunch());
  } catch {}
}

async function loadAudioCacheInfo() {
  try {
    const info = await window.petAPI.getAudioCacheInfo();
    const bytes = Number(info?.bytes) || 0;
    const count = Number(info?.count) || 0;
    audioCacheInfo.textContent = count
      ? `语音缓存 ${count} 个，约 ${(bytes / 1024 / 1024).toFixed(1)} MB`
      : "语音缓存为空";
  } catch {}
}

function renderWorldBook() {
  const list = Array.isArray(currentAiConfig?.worldBook) ? currentAiConfig.worldBook : [];
  memoryList.innerHTML = "";
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "暂无世界书条目。";
    memoryList.appendChild(empty);
    return;
  }
  list.forEach((entry, index) => {
    const wrap = document.createElement("div");
    wrap.className = "memory-item worldbook-item";
    const title = document.createElement("input");
    title.value = entry.title || `条目 ${index + 1}`;
    title.placeholder = "条目名称";
    const content = document.createElement("textarea");
    content.value = entry.content || "";
    content.placeholder = "条目内容";
    const keywords = document.createElement("input");
    keywords.value = Array.isArray(entry.keywords) ? entry.keywords.join(",") : "";
    keywords.placeholder = "触发关键词，用逗号分隔";
    const category = document.createElement("input");
    category.value = entry.category || "";
    category.placeholder = "分类（可选）";
    const priority = document.createElement("input");
    priority.type = "number";
    priority.min = "-100";
    priority.max = "100";
    priority.step = "1";
    priority.value = Number(entry.priority || 0);
    priority.placeholder = "优先级";
    const options = document.createElement("div");
    options.className = "check-row";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = entry.enabled !== false;
    const constant = document.createElement("input");
    constant.type = "checkbox";
    constant.checked = Boolean(entry.constant);
    options.append(enabled, document.createTextNode("启用"), constant, document.createTextNode("常驻"));
    const actions = document.createElement("div");
    actions.className = "button-list";
    const save = document.createElement("button");
    save.textContent = "保存条目";
    const remove = document.createElement("button");
    remove.className = "danger";
    remove.textContent = "删除";
    save.addEventListener("click", async () => {
      entry.title = title.value.trim() || `条目 ${index + 1}`;
      entry.content = content.value.trim();
      entry.keywords = keywords.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
      entry.category = category.value.trim();
      entry.priority = clampNumber(priority.value, -100, 100);
      entry.enabled = enabled.checked;
      entry.constant = constant.checked;
      entry.updatedAt = Date.now();
      await saveAiConfig();
      renderWorldBook();
    });
    remove.addEventListener("click", async () => {
      currentAiConfig.worldBook.splice(index, 1);
      await saveAiConfig();
      renderWorldBook();
    });
    actions.append(save, remove);
    wrap.append(title, content, keywords, category, priority, options, actions);
    memoryList.appendChild(wrap);
  });
}

async function addWorldBookEntry() {
  currentAiConfig.worldBook = Array.isArray(currentAiConfig.worldBook) ? currentAiConfig.worldBook : [];
  currentAiConfig.worldBook.push({
    id: `world_${Date.now()}`,
    title: "",
    content: "",
    keywords: [],
    category: "",
    enabled: true,
    constant: false,
    priority: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  await saveAiConfig();
  renderWorldBook();
}

async function makeAllWorldBookConstant() {
  (currentAiConfig.worldBook || []).forEach((entry) => {
    entry.constant = true;
    entry.updatedAt = Date.now();
  });
  await saveAiConfig();
  renderWorldBook();
}

async function clearWorldBook() {
  if (!confirm("确定清空全部世界书条目吗？")) return;
  currentAiConfig.worldBook = [];
  await saveAiConfig();
  renderWorldBook();
}

async function exportHistory(format) {
  try {
    const result = await window.petAPI.exportChatHistory(format);
    if (!result?.canceled) {
      const name = format === "archive"
        ? "完整存档"
        : (format === "markdown" ? "Markdown" : "JSON");
      historyStatus.textContent = `已导出${name}。`;
    }
  } catch (error) {
    historyStatus.textContent = toFriendlyError(error);
  }
}

async function loadChatHistoryPanel() {
  try {
    const history = await window.petAPI.getChatHistory();
    const keyword = String(historySearch?.value || "").trim().toLocaleLowerCase();
    const filtered = keyword
      ? (history || []).filter((item) => {
          const text = String(
            item?.text ||
            item?.content ||
            item?.reasoning ||
            ""
          ).toLocaleLowerCase();

          return text.includes(keyword);
        })
      : history;

    historyList.innerHTML = "";

    if (!filtered?.length) {
      const empty = document.createElement("div");
      empty.className = "history-empty";
      empty.textContent = keyword ? "没有匹配的记录。" : "暂无聊天记录。";
      historyList.appendChild(empty);
      historyStatus.textContent = keyword
        ? `“${keyword}”没有匹配结果。`
        : "";
      return;
    }

    const characterName = currentAiConfig?.character?.name || "AI 伴侣";

    filtered.forEach((item) => {
      const wrap = document.createElement("div");
      wrap.className = "history-item";

      const role = document.createElement("div");
      role.className = "history-role";
      role.textContent = item.role === "user" ? "你" : characterName;

      const content = document.createElement("div");
      content.className = "history-content";
      content.appendChild(createHistoryPreview(item));

      wrap.append(role, content);
      historyList.appendChild(wrap);
    });

    historyStatus.textContent = keyword
      ? `匹配 ${filtered.length} / ${history?.length || 0} 条。`
      : `共 ${history?.length || 0} 条记录。`;
  } catch (error) {
    historyStatus.textContent = toFriendlyError(error);
  }
}

async function clearChatHistoryPanel() {
  const ok = confirm("确定清空全部聊天记录吗？");
  if (!ok) return;

  try {
    await window.petAPI.clearChatHistory();
    await loadChatHistoryPanel();
  } catch (error) {
    historyStatus.textContent = toFriendlyError(error);
  }
}

function historyItemToText(item) {
  if (item.recalled) {
    return item.role === "user"
      ? "你撤回了一条消息"
      : `${currentAiConfig?.character?.name || "对方"}撤回了一条消息`;
  }

  if (Array.isArray(item.parts)) {
    return item.parts
      .map((part) => {
        if (part.type === "text") return part.text || "";
        if (part.type === "voice") return "【语音】";
        if (part.type === "sticker") return "【表情包】";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return normalizeHistoryContent(item.content);
}

function normalizeHistoryContent(content) {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (item.type === "text") return item.text || "";
        if (item.type === "image_url") return "【图片】";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return String(content || "");
}

function renderTtsSettings() {
  const tts = normalizeTtsConfig(currentAiConfig?.tts);

  ttsEnabled.checked = tts.enabled;
  ttsProvider.value = tts.provider;
  ttsEdgeVoice.value = tts.edgeVoice;
  ttsOpenaiBaseUrl.value = tts.openai.baseUrl || "";
  ttsOpenaiApiKey.value = tts.openai.apiKey || "";
  ttsOpenaiModel.value = tts.openai.model || "";
  ttsOpenaiVoice.value = tts.openai.voice || "";
  ttsBaseUrl.value = tts.baseUrl;
  ttsReferencePath.value = tts.referencePath;
  ttsEmoMethod.value = tts.emoMethod;
  ttsEmoReferencePath.value = tts.emoReferencePath;
  ttsEmoText.value = tts.emoText;
  ttsSpeed.value = String(tts.speed);
  ttsVolume.value = String(tts.volume);
  renderTtsEngineStatus();
}

function renderTtsEngineStatus() {
  if (!currentAiConfig) {
    return;
  }

  const tts = normalizeTtsConfig(currentAiConfig.tts);

  if (!tts.enabled) {
    ttsEngineStatus.textContent = "语音回复未启用。";
    return;
  }

  const names = {
    indextts: "IndexTTS2（本地）",
    edge: "Edge TTS（在线免费）",
    openai: "OpenAI 兼容 TTS",
    auto: "自动降级"
  };
  const chain = [];

  if (tts.provider === "auto") {
    if (tts.referencePath) chain.push("IndexTTS2");
    if (tts.edgeVoice) chain.push("Edge");
    if (tts.openai?.baseUrl) chain.push("OpenAI");
    ttsEngineStatus.textContent = chain.length
      ? `当前引擎：自动降级（${chain.join(" → ")}）`
      : "自动降级未配置任何可用音源。";
  } else {
    const ready = tts.provider === "indextts"
      ? Boolean(tts.referencePath)
      : tts.provider === "edge"
        ? Boolean(tts.edgeVoice)
        : Boolean(tts.openai?.baseUrl);

    ttsEngineStatus.textContent =
      `${names[tts.provider] || tts.provider}` +
      (ready ? "（已就绪）" : "（缺少配置）");
  }
}

function readTtsForm() {
  return normalizeTtsConfig({
    enabled: ttsEnabled.checked,
    provider: ttsProvider.value,
    edgeVoice: ttsEdgeVoice.value,
    openai: {
      baseUrl: ttsOpenaiBaseUrl.value.trim(),
      apiKey: ttsOpenaiApiKey.value.trim(),
      model: ttsOpenaiModel.value.trim() || "tts-1",
      voice: ttsOpenaiVoice.value.trim() || "alloy",
      responseFormat: "mp3",
      speed: 1
    },
    baseUrl: ttsBaseUrl.value.trim(),
    referencePath: ttsReferencePath.value.trim(),
    emoMethod: ttsEmoMethod.value,
    emoReferencePath: ttsEmoReferencePath.value.trim(),
    emoText: ttsEmoText.value.trim(),
    speed: Number(ttsSpeed.value || 1),
    volume: Number(ttsVolume.value || 1)
  });
}

async function selectTtsReference(type) {
  try {
    const result = await window.petAPI.selectTtsReference();

    if (!result?.filePath) return;

    if (type === "reference") {
      ttsReferencePath.value = result.filePath;
    } else {
      ttsEmoReferencePath.value = result.filePath;
    }
  } catch (error) {
    ttsStatus.textContent = toFriendlyError(error);
  }
}

async function saveTtsSettings() {
  try {
    currentAiConfig.tts = readTtsForm();

    currentAiConfig = normalizeAiConfig(
      await window.petAPI.saveAiConfig(currentAiConfig)
    );

    ttsStatus.textContent = currentAiConfig.tts.enabled
      ? "语音设置已保存。"
      : "语音消息已关闭。";
  } catch (error) {
    ttsStatus.textContent = toFriendlyError(error);
  }
}

function renderSttSettings() {
  const stt = normalizeSttConfig(currentAiConfig?.stt);

  sttEnabled.checked = stt.enabled;
  sttBaseUrl.value = stt.baseUrl;
  sttPath.value = stt.path;
  sttApiKey.value = stt.apiKey;
  sttModel.value = stt.model;
  sttLanguage.value = stt.language;
}

function readSttForm() {
  return normalizeSttConfig({
    enabled: sttEnabled.checked,
    baseUrl: sttBaseUrl.value.trim(),
    path: sttPath.value.trim(),
    apiKey: sttApiKey.value.trim(),
    model: sttModel.value.trim(),
    language: sttLanguage.value.trim()
  });
}

async function saveSttSettings() {
  try {
    currentAiConfig.stt = readSttForm();

    currentAiConfig = normalizeAiConfig(
      await window.petAPI.saveAiConfig(currentAiConfig)
    );

    sttStatus.textContent = currentAiConfig.stt.enabled
      ? "语音输入设置已保存。"
      : "语音输入已关闭。";
  } catch (error) {
    sttStatus.textContent = toFriendlyError(error);
  }
}

function renderStickerSettings() {
  const stickers = normalizeStickerConfig(currentAiConfig?.stickers);

  stickerEnabled.checked = stickers.enabled;
  stickerFrequency.value = stickers.frequency;
  stickerMaxPerReply.value = String(stickers.maxPerReply);
  stickerGlobalCooldown.value = String(stickers.globalCooldown);

  stickerRules.innerHTML = "";

  Object.entries(stickers.rules).forEach(([id, rule]) => {
    stickerRules.appendChild(
      createStickerRuleCard(rule, {
        id,
        custom: false
      })
    );
  });

  stickers.customRules.forEach((rule) => {
    stickerRules.appendChild(
      createStickerRuleCard(rule, {
        id: rule.id,
        custom: true
      })
    );
  });

  if (!stickers.customRules.length) {
    const note = document.createElement("div");
    note.className = "history-empty";
    note.textContent = "可以点击“新增自定义规则”添加自己的触发表情。";
    stickerRules.appendChild(note);
  }
}

function createStickerRuleCard(rule, options) {
  const card = document.createElement("div");
  card.className = "rule-card";
  card.dataset.ruleId = options.id;
  card.dataset.custom = options.custom ? "true" : "false";

  if (openedStickerRuleIds.has(options.id)) {
    card.classList.add("is-open");
  }

  const summary = createStickerRuleSummary(rule);

  const head = document.createElement("div");
  head.className = "rule-head";

  const main = document.createElement("div");
  main.className = "rule-main";

  const nameRow = document.createElement("div");
  nameRow.className = "rule-name-row";

  const name = document.createElement("div");
  name.className = "rule-name";
  name.textContent = rule.label || (options.custom ? "自定义规则" : options.id);

  const badge = document.createElement("div");
  badge.className = "rule-badge";
  badge.textContent = options.custom ? "自定义" : "内置";

  nameRow.append(name, badge);

  const summaryNode = document.createElement("div");
  summaryNode.className = "rule-summary";
  summaryNode.textContent = summary;

  main.append(nameRow, summaryNode);

  const controls = document.createElement("div");
  controls.className = "rule-controls";

  const enableLabel = document.createElement("label");
  enableLabel.className = "rule-enable-label";

  const enable = document.createElement("input");
  enable.className = "sticker-rule-enabled";
  enable.type = "checkbox";
  enable.checked = rule.enabled !== false;

  const enableText = document.createElement("span");
  enableText.textContent = "启用";

  enableLabel.append(enable, enableText);

  const toggle = document.createElement("button");
  toggle.className = "rule-toggle-button";
  toggle.textContent = openedStickerRuleIds.has(options.id) ? "收起" : "编辑";

  toggle.addEventListener("click", () => {
    syncFormToCurrentConfig();

    if (openedStickerRuleIds.has(options.id)) {
      openedStickerRuleIds.delete(options.id);
    } else {
      openedStickerRuleIds.add(options.id);
    }

    renderStickerSettings();
  });

  controls.append(enableLabel, toggle);

  if (options.custom) {
    const deleteInline = document.createElement("button");
    deleteInline.className = "rule-delete-inline danger";
    deleteInline.textContent = "删除";

    deleteInline.addEventListener("click", () => {
      deleteCustomStickerRule(options.id);
    });

    controls.appendChild(deleteInline);
  }

  head.append(main, controls);

  const body = document.createElement("div");
  body.className = "rule-body";

  if (options.custom) {
    const labelTitle = createLabel("规则名称");
    const labelInput = document.createElement("input");
    labelInput.className = "sticker-rule-label";
    labelInput.value = rule.label || "自定义规则";
    labelInput.placeholder = "规则名称";

    body.append(labelTitle, labelInput);
  }

  const pathsInput = createTextarea(
    "sticker-rule-paths",
    rule.paths,
    "assets/stickers/example/"
  );
  const browse = document.createElement("button");

  browse.className = "secondary";
  browse.textContent = "选择文件夹";
  browse.style.marginBottom = "8px";
  browse.addEventListener("click", async () => {
    const result = await window.petAPI.selectStickerFolder();

    if (result?.canceled || !result.path) {
      return;
    }

    const folder = String(result.path).replace(/\\/g, "/");

    pathsInput.value = pathsInput.value.trim()
      ? `${pathsInput.value.trim()}\n${folder}/`
      : `${folder}/`;
  });

  body.append(
    createLabel("表情包路径"),
    pathsInput,
    browse,

    createInlineGrid([
      {
        label: "最低概率 %",
        input: createNumberInput("sticker-rule-min", chanceToPercent(rule.minChance), {
          min: 0,
          max: 100,
          step: 1
        })
      },
      {
        label: "最高概率 %",
        input: createNumberInput("sticker-rule-max", chanceToPercent(rule.maxChance), {
          min: 0,
          max: 100,
          step: 1
        })
      }
    ]),

    createLabel("冷却消息数"),
    createNumberInput("sticker-rule-cooldown", Number(rule.cooldown || 0), {
      min: 0,
      max: 30,
      step: 1
    }),

    createLabel("触发关键词"),
    createTextarea("sticker-rule-keywords", rule.keywords, "关键词用逗号或换行分隔")
  );

  const actions = document.createElement("div");
  actions.className = "rule-actions";

  if (options.custom) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "danger";
    deleteButton.textContent = "删除此规则";

    deleteButton.addEventListener("click", () => {
      deleteCustomStickerRule(options.id);
    });

    actions.appendChild(deleteButton);
  } else {
    const restore = document.createElement("button");
    restore.className = "secondary";
    restore.textContent = "恢复默认";

    restore.addEventListener("click", () => {
      restoreBuiltInStickerRule(options.id);
    });

    actions.appendChild(restore);
  }

  body.appendChild(actions);

  card.append(head, body);

  return card;
}

function createStickerRuleSummary(rule) {
  const pathsCount = String(rule.paths || "")
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .length;

  const keywordCount = String(rule.keywords || "")
    .split(/[,，;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .length;

  const chanceText =
    `${chanceToPercent(rule.minChance)}%-${chanceToPercent(rule.maxChance)}%`;

  return [
    rule.enabled === false ? "已停用" : "已启用",
    `概率 ${chanceText}`,
    `冷却 ${Number(rule.cooldown || 0)}`,
    pathsCount ? `${pathsCount} 个路径` : "未设置路径",
    keywordCount ? `${keywordCount} 个关键词` : "未设置关键词"
  ].join(" · ");
}

function createLabel(text) {
  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = text;
  return label;
}

function createTextarea(className, value, placeholder) {
  const textarea = document.createElement("textarea");
  textarea.className = className;
  textarea.value = value || "";
  textarea.placeholder = placeholder || "";
  return textarea;
}

function createNumberInput(className, value, options = {}) {
  const input = document.createElement("input");
  input.className = className;
  input.type = "number";
  input.value = String(value ?? 0);

  if (options.min !== undefined) input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  if (options.step !== undefined) input.step = String(options.step);

  return input;
}

function createInlineGrid(items) {
  const grid = document.createElement("div");
  grid.className = "inline-grid";

  items.forEach((item) => {
    const wrap = document.createElement("div");

    const label = createLabel(item.label);
    wrap.append(label, item.input);

    grid.appendChild(wrap);
  });

  return grid;
}

function addCustomStickerRule() {
  syncFormToCurrentConfig();

  const rule = {
    id: createCustomRuleId(),
    enabled: true,
    label: "自定义规则",
    paths: "",
    minChance: 0.15,
    maxChance: 0.3,
    cooldown: 3,
    keywords: ""
  };

  currentAiConfig.stickers.customRules.push(rule);
  openedStickerRuleIds.add(rule.id);

  renderStickerSettings();
  stickerStatus.textContent = "已新增自定义规则。";
}

async function deleteCustomStickerRule(id) {
  const ok = confirm("确定删除这条自定义规则吗？");
  if (!ok) return;

  syncFormToCurrentConfig();

  currentAiConfig.stickers.customRules =
    currentAiConfig.stickers.customRules.filter((rule) => rule.id !== id);

  openedStickerRuleIds.delete(id);

  renderStickerSettings();
  await saveStickerSettings();
}

async function restoreBuiltInStickerRule(id) {
  if (!DEFAULT_STICKER_RULES[id]) return;

  const ok = confirm("确定将这条内置规则恢复默认吗？");
  if (!ok) return;

  syncFormToCurrentConfig();

  currentAiConfig.stickers.rules[id] = {
    ...DEFAULT_STICKER_RULES[id]
  };

  openedStickerRuleIds.add(id);

  renderStickerSettings();
  await saveStickerSettings();

  stickerStatus.textContent = "已恢复该规则默认设置。";
}

function readStickerForm() {
  const current = normalizeStickerConfig(currentAiConfig?.stickers);
  const rules = {};
  const customRules = [];

  document.querySelectorAll("#sticker-rules .rule-card").forEach((card) => {
    const id = card.dataset.ruleId;
    const custom = card.dataset.custom === "true";

    if (custom) {
      const old = current.customRules.find((rule) => rule.id === id) || {};

      customRules.push({
        ...readStickerRuleCard(card, old),
        id,
        label: card.querySelector(".sticker-rule-label")?.value.trim() || "自定义规则"
      });

      return;
    }

    rules[id] = readStickerRuleCard(
      card,
      current.rules[id] || DEFAULT_STICKER_RULES[id]
    );
  });

  /*
    如果某些内置规则因为 DOM 异常没读到，保留当前值，
    避免保存时丢规则。
  */
  Object.keys(DEFAULT_STICKER_RULES).forEach((id) => {
    if (!rules[id]) {
      rules[id] = current.rules[id] || { ...DEFAULT_STICKER_RULES[id] };
    }
  });

  return normalizeStickerConfig({
    enabled: stickerEnabled.checked,
    frequency: stickerFrequency.value,
    maxPerReply: Number(stickerMaxPerReply.value || 2),
    globalCooldown: Number(stickerGlobalCooldown.value || 2),
    rules,
    customRules
  });
}

function readStickerRuleCard(card, oldRule) {
  const minChance = percentToChance(card.querySelector(".sticker-rule-min")?.value);
  const maxChance = percentToChance(card.querySelector(".sticker-rule-max")?.value);

  return {
    ...oldRule,
    enabled: Boolean(card.querySelector(".sticker-rule-enabled")?.checked),
    paths: card.querySelector(".sticker-rule-paths")?.value.trim() || "",
    minChance: Math.min(minChance, maxChance),
    maxChance: Math.max(minChance, maxChance),
    cooldown: clampNumber(
      card.querySelector(".sticker-rule-cooldown")?.value || 0,
      0,
      30
    ),
    keywords: card.querySelector(".sticker-rule-keywords")?.value.trim() || ""
  };
}

async function saveStickerSettings() {
  try {
    currentAiConfig.stickers = readStickerForm();

    currentAiConfig = normalizeAiConfig(
      await window.petAPI.saveAiConfig(currentAiConfig)
    );

    renderStickerSettings();

    stickerStatus.textContent = currentAiConfig.stickers.enabled
      ? "表情包设置已保存。"
      : "表情包已关闭。";
  } catch (error) {
    stickerStatus.textContent = toFriendlyError(error);
  }
}

function initButtons(expressionFiles = availableExpressionFiles) {
  const supported = new Set(expressionFiles);
  faceList.innerHTML = "";
  lookList.innerHTML = "";
  poseList.innerHTML = "";
  motionList.innerHTML = "";

  faceExpressions.filter((fileName) => supported.has(fileName)).forEach((fileName) => {
    createToggleButton(faceList, fileName, "face", "single");
  });

  lookExpressions.filter((fileName) => supported.has(fileName)).forEach((fileName) => {
    createToggleButton(
      lookList,
      fileName,
      "look",
      exclusiveLookExpressions.has(fileName) ? "exclusive" : "multi"
    );
  });

  poseExpressions.filter((fileName) => supported.has(fileName)).forEach((fileName) => {
    createToggleButton(poseList, fileName, "pose", "single");
  });
}

function createToggleButton(parent, fileName, groupType, mode) {
  const button = document.createElement("button");

  button.textContent = cleanName(fileName);
  button.dataset.fileName = fileName;
  button.dataset.groupType = groupType;
  button.dataset.exclusive = mode === "exclusive" ? "true" : "false";

  button.addEventListener("click", () => {
    const active = button.classList.contains("active");

    if (mode === "single" || mode === "exclusive") {
      if (active) {
        button.classList.remove("active");

        sendCommand({
          type: "toggle-expression",
          fileName,
          groupType,
          enabled: false
        });

        return;
      }

      const activeSelector = mode === "exclusive"
        ? 'button.active[data-exclusive="true"]'
        : "button.active";

      parent.querySelectorAll(activeSelector).forEach((oldButton) => {
        oldButton.classList.remove("active");
      });

      button.classList.add("active");

      sendCommand({
        type: "toggle-expression",
        fileName,
        groupType,
        enabled: true
      });

      return;
    }

    const enabled = !active;

    button.classList.toggle("active", enabled);

    sendCommand({
      type: "toggle-expression",
      fileName,
      groupType,
      enabled
    });
  });

  parent.appendChild(button);
}

function createMotionButtons(info = {}) {
  info = info || {};
  initButtons();

  Object.keys(info.motions || {}).forEach((groupName) => {
    const group = info.motions[groupName] || [];

    group.forEach((motion, index) => {
      const button = document.createElement("button");

      button.textContent = `${cleanName(groupName)} ${index + 1}`;

      button.addEventListener("click", () => {
        markSingleActive(button, motionList);

        sendCommand({
          type: "motion",
          groupName,
          index
        });
      });

      motionList.appendChild(button);
    });
  });

  if (Array.isArray(info.expressions)) {
    info.expressions.forEach((expression, index) => {
      const expressionFile = expression.file || expression.File;
      if ([faceList, lookList, poseList].some((list) =>
        [...list.children].some((button) => button.dataset.fileName === expressionFile))) return;
      const button = document.createElement("button");

      button.textContent = cleanName(
        expression.name || expression.Name || expression.file || expression.File || `表情${index + 1}`
      );

      button.addEventListener("click", () => {
        markSingleActive(button, faceList);

        sendCommand({
          type: "builtin-expression",
          index
        });
      });

      faceList.appendChild(button);
    });
  }
  [faceList, lookList, poseList, motionList].forEach((list) => {
    const empty = list.children.length === 0;
    list.hidden = empty;
    list.previousElementSibling.hidden = empty;
  });
}

function markSingleActive(activeButton, parent) {
  parent.querySelectorAll("button").forEach((button) => {
    button.classList.remove("active");
  });

  activeButton.classList.add("active");
}

function clearAllActiveButtons() {
  document.querySelectorAll("#face-list button.active, #look-list button.active, #pose-list button.active, #motion-list button.active").forEach((button) => {
    button.classList.remove("active");
  });
}

function createHistoryPreview(item) {
  const fragment = document.createDocumentFragment();
  const addText = (value) => {
    const text = String(value || "").trim();
    if (!text) return;
    const line = document.createElement("div");
    line.textContent = text;
    fragment.appendChild(line);
  };
  const addSticker = (pathValue, name) => {
    if (!pathValue) {
      addText(`【表情】${name || ""}`);
      return;
    }
    const image = document.createElement("img");
    image.className = "history-sticker";
    image.src = normalizeAssetPath(pathValue);
    image.alt = name || "表情";
    fragment.appendChild(image);
  };
  const addVoice = (part) => {
    const voice = document.createElement("div");
    voice.className = "history-voice";
    voice.textContent = `语音 · ${Math.max(1, Math.round(part.duration || estimateVoiceDuration(part.text || "")))}"`;
    if (part.text) {
      const transcript = document.createElement("div");
      transcript.className = "history-voice-text";
      transcript.textContent = part.text;
      voice.appendChild(transcript);
    }
    fragment.appendChild(voice);
  };

  if (item.recalled) {
    addText(item.role === "user" ? "你撤回了一条消息" : `${currentAiConfig?.character?.name || "对方"}撤回了一条消息`);
    return fragment;
  }
  if (item.type === "sticker" || item.sticker) {
    addSticker(item.sticker?.path || item.path, item.sticker?.name);
    return fragment;
  }
  if (Array.isArray(item.parts)) {
    item.parts.forEach((part) => {
      if (part.type === "voice") addVoice(part);
      else if (part.type === "sticker") addSticker(part.path, part.name);
      else if (part.type === "image") addText(part.text || "【图片】");
      else addText(part.text);
    });
    return fragment;
  }
  if (item.type === "image") {
    addText(item.text || item.content || "【图片】");
    return fragment;
  }
  addText(historyItemToText(item));
  return fragment;
}

function normalizeAssetPath(pathValue) {
  const value = String(pathValue || "").trim();
  if (!value || /^(?:https?:|data:|file:|\.\/|\.\.\/)/i.test(value)) {
    return value;
  }
  return `./${value}`;
}

function syncVisualState(state = {}) {
  const poseFile = String(state.poseFile || "");
  const rawLookFiles = Array.isArray(state.lookFiles) ? state.lookFiles : [];
  const lookFiles = new Set();
  let exclusiveLookFound = false;

  rawLookFiles.forEach((fileName) => {
    if (exclusiveLookExpressions.has(fileName)) {
      if (!exclusiveLookFound) {
        lookFiles.add(fileName);
        exclusiveLookFound = true;
      }
      return;
    }
    lookFiles.add(fileName);
  });

  poseList.querySelectorAll("button").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.fileName === poseFile
    );
  });

  lookList.querySelectorAll("button").forEach((button) => {
    button.classList.toggle(
      "active",
      lookFiles.has(button.dataset.fileName)
    );
  });
}

function sendCommand(command) {
  window.petAPI.sendPanelCommand(command);
}

function cleanName(name) {
  return String(name)
    .replace(".exp3.json", "")
    .replace(".motion3.json", "")
    .replace(".json", "");
}

function initSettingsNavigation() {
  const tabs = [...document.querySelectorAll(".settings-tab")];
  const panes = [...document.querySelectorAll(".settings-pane")];
  const nav = document.querySelector(".settings-nav");
  const compact = window.matchMedia("(max-width: 560px)");
  const scrollPositions = new Map();
  const content = document.querySelector(".panel-content");
  let active = "connection";
  const updateOrientation = () => nav.setAttribute("aria-orientation", compact.matches ? "horizontal" : "vertical");
  const activate = (category, focus = false) => {
    const next = tabs.find((tab) => tab.dataset.category === category);
    if (!next) return;
    scrollPositions.set(active, content.scrollTop);
    active = category;
    tabs.forEach((tab) => {
      const selected = tab === next;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panes.forEach((pane) => { pane.hidden = pane.id !== next.getAttribute("aria-controls"); });
    content.scrollTop = scrollPositions.get(active) || 0;
    if (focus) next.focus();
    try { sessionStorage.setItem("companion.settings.category", active); } catch {}
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab.dataset.category));
    tab.addEventListener("keydown", (event) => {
      const previous = compact.matches ? "ArrowLeft" : "ArrowUp";
      const next = compact.matches ? "ArrowRight" : "ArrowDown";
      let target = index;
      if (event.key === previous) target = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === next) target = (index + 1) % tabs.length;
      else if (event.key === "Home") target = 0;
      else if (event.key === "End") target = tabs.length - 1;
      else return;
      event.preventDefault();
      activate(tabs[target].dataset.category, true);
    });
  });
  updateOrientation();
  compact.addEventListener("change", updateOrientation);
  try { activate(sessionStorage.getItem("companion.settings.category") || "connection"); } catch {}
  window.petAPI.onInitSettings?.((settings) => {
    if (settings?.settingsCategory) activate(settings.settingsCategory);
  });
}

window.petAPI.onModelInfo(createMotionButtons);
window.petAPI.onVisualState(syncVisualState);

initSettingsNavigation();
initButtons();
loadAiConfig();
