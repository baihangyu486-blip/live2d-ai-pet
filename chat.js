const messages = document.getElementById("messages");
const input = document.getElementById("input");

const replyBar = document.getElementById("reply-bar");
const replyPreview = document.getElementById("reply-preview");
const stickerPicker = document.getElementById("sticker-picker");
const stickerGrid = document.getElementById("sticker-grid");
const contextMenu = document.getElementById("context-menu");
const speakingDot = document.getElementById("speaking-dot");
const sessionSelect = document.getElementById("session-select");
const affectionBadge = document.getElementById("affection-badge");
const softStatusEl = document.getElementById("soft-status");
const btnMore = document.getElementById("btn-more");
const moreMenu = document.getElementById("more-menu");

const btnSend = document.getElementById("btn-send");
const btnStopGeneration = document.getElementById("btn-stop-generation");
const btnRetryLast = document.getElementById("btn-retry-last");
const favoritesMask = document.getElementById("favorites-mask");
const favoritesPanel = document.getElementById("favorites-panel");
const btnCloseFavorites = document.getElementById("btn-close-favorites");
const favoriteMessagesContent = document.getElementById("favorite-messages-content");
const favoriteStickersContent = document.getElementById("favorite-stickers-content");
const favoriteStickerGrid = document.getElementById("favorite-sticker-grid");
const favoriteFilterRow = document.getElementById("favorite-filter-row");
const newMessagePill = document.getElementById("new-message-pill");
const newMessageCountEl = document.getElementById("new-message-count");
const imagePreviewMask = document.getElementById("image-preview-mask");
const previewImage = document.getElementById("preview-image");
const btnCloseImagePreview = document.getElementById("btn-close-image-preview");

const stickerEditorMask = document.getElementById("sticker-editor-mask");
const editorStickerPreview = document.getElementById("editor-sticker-preview");
const editorStickerName = document.getElementById("editor-sticker-name");
const editorStickerTags = document.getElementById("editor-sticker-tags");
const editorStickerDesc = document.getElementById("editor-sticker-desc");

let selectedImage = null;
let previewRow = null;
let replyTarget = null;
let contextTarget = null;
let editingSticker = null;

let mediaRecorder = null;
let recordingChunks = [];
let recordingStream = null;
let isRecording = false;
let isSending = false;
let activeClientMessageId = "";
let lastFailedRequest = null;
let isLoadingHistory = false;

let voiceQueue = [];
let voicePlaying = false;
let currentAudio = null;
let currentVoiceBubble = null;
let currentVoiceKey = "";
let playbackSequence = 0;
let queueDelayTimer = null;

let newMessageCount = 0;
let currentFavoriteTab = "messages";
let currentFavoriteFilter = "all";

let lastRenderedRole = "";
let lastRenderedAt = 0;
let messageDetails = { showTimestamp: true, showFloor: false, showDuration: false };
let companionName = "我的伙伴";
let profileRefreshSequence = 0;

document.getElementById("btn-close").addEventListener("click", () => {
  window.petAPI.closeChat();
});

document.getElementById("btn-panel").addEventListener("click", () => {
  window.petAPI.togglePanel();
});

window.petAPI.onChatAppendParts((payload) => {
  if (!payload?.parts?.length) {
    return;
  }

  renderAiParts(payload.parts, {
    autoplayVoice: true,
    parentMessageId: String(payload.parentMessageId || ""),
    immediate: true
  });
});

window.petAPI.onCheckinNotice((payload) => {
  if (payload?.streak) {
    const milestoneText = payload.milestone
      ? `，达成 ${payload.milestone} 天里程碑，好感 +${payload.milestoneDelta}！`
      : `，好感 +${payload.delta} ♡`;

    appendSystemMessage(`今日相伴：连续 ${payload.streak} 天${milestoneText}`);
    refreshAffectionBadge();
  }
});

window.petAPI.onLevelUpNotice((payload) => {
  if (payload?.levelTitle) {
    appendSystemMessage("", {
      companionPrefix: "♡ 羁绊升级：",
      companionSuffix: `与你的关系进入了「${payload.levelTitle}」${payload.levelEmoji || ""}`
    });
    refreshAffectionBadge();
  }
});

sessionSelect.addEventListener("change", async () => {
  if (!sessionSelect.value) {
    return;
  }

  await window.petAPI.switchSession(sessionSelect.value);
  await loadChatHistory();
  await loadSessionUi();
});

btnMore.addEventListener("click", (event) => {
  event.stopPropagation();
  moreMenu.classList.toggle("show");
});

moreMenu.addEventListener("click", async (event) => {
  const item = event.target.closest(".menu-item");

  if (!item) {
    return;
  }

  moreMenu.classList.remove("show");

  if (item.dataset.action === "favorites") {
    openFavoritesPanel();
  }

  if (item.dataset.action === "new-session") {
    await createNewSession();
  }

  if (item.dataset.action === "clear") {
    await clearHistory();
  }
});

async function createNewSession() {
  const session = await window.petAPI.createSession("新的会话");

  if (session) {
    await loadSessionUi();
    await loadChatHistory();
  }
}

btnSend.addEventListener("click", sendMessage);
btnStopGeneration.addEventListener("click", cancelCurrentGeneration);
btnRetryLast.addEventListener("click", retryLastFailedRequest);
document.getElementById("btn-image").addEventListener("click", selectImage);
document.getElementById("btn-screen").addEventListener("click", selectScreen);
document.getElementById("btn-sticker").addEventListener("click", toggleStickerPicker);
document.getElementById("btn-mic").addEventListener("click", toggleVoiceInput);
document.getElementById("btn-cancel-reply").addEventListener("click", clearReply);
document.getElementById("btn-import-sticker").addEventListener("click", importSticker);

btnCloseFavorites.addEventListener("click", closeFavoritesPanel);
favoritesMask.addEventListener("click", closeFavoritesPanel);

document.getElementById("btn-library-import-sticker").addEventListener("click", importSticker);
document.getElementById("btn-cancel-sticker-edit").addEventListener("click", closeStickerEditor);
document.getElementById("btn-save-sticker-edit").addEventListener("click", saveStickerEditor);

newMessagePill.addEventListener("click", () => {
  scrollToBottom(true);
  clearNewMessagePill();
});

btnCloseImagePreview.addEventListener("click", closeImagePreview);
imagePreviewMask.addEventListener("click", (event) => {
  if (event.target === imagePreviewMask) {
    closeImagePreview();
  }
});

stickerEditorMask.addEventListener("click", (event) => {
  if (event.target === stickerEditorMask) {
    closeStickerEditor();
  }
});

document.querySelectorAll(".favorite-tab").forEach((button) => {
  button.addEventListener("click", () => {
    setFavoriteTab(button.dataset.tab || "messages");
  });
});

document.querySelectorAll(".favorite-filter").forEach((button) => {
  button.addEventListener("click", () => {
    currentFavoriteFilter = button.dataset.filter || "all";

    document.querySelectorAll(".favorite-filter").forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    renderFavoriteMessages();
  });
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

messages.addEventListener("scroll", () => {
  if (isNearBottom()) {
    clearNewMessagePill();
  }
});

document.addEventListener("click", (event) => {
  if (!contextMenu.contains(event.target)) {
    hideContextMenu();
  }

  if (!moreMenu.contains(event.target) &&
    !event.target.closest("#btn-more")) {
    moreMenu.classList.remove("show");
  }

  const clickedStickerArea =
    stickerPicker.contains(event.target) ||
    event.target.closest("#btn-sticker");

  if (!clickedStickerArea) {
    stickerPicker.classList.remove("show");
  }
});

contextMenu.addEventListener("click", async (event) => {
  const item = event.target.closest(".menu-item");

  if (!item || !contextTarget) return;

  const action = item.dataset.action;
  const target = contextTarget;

  hideContextMenu();

  if (action === "copy") {
    await copyMessage(target);
  }

  if (action === "reply") {
    setReply(target);
  }

  if (action === "favorite") {
    await toggleFavorite(target);
  }

  if (action === "save-sticker") {
    await saveStickerFromMessage(target);
  }

  if (action === "voice-text") {
    toggleVoiceTextPreview(target);
  }

  if (action === "recall") {
    await recallMessage(target);
  }
});

async function loadMessageDetails() {
  try {
    const config = await window.petAPI.getAiConfig();
    messageDetails = {
      ...messageDetails,
      ...(config?.messageDetails || {})
    };
  } catch {}
}

function setCompanionLabel(element, prefix = "", suffix = "") {
  element.dataset.companionLabel = "true";
  element.dataset.companionPrefix = prefix;
  element.dataset.companionSuffix = suffix;
  element.textContent = prefix + companionName + suffix;
}

function applyCompanionName(value) {
  const previousName = companionName;
  companionName = String(value || "").trim() || "我的伙伴";
  const title = document.querySelector(".title");
  if (title) title.textContent = "♡ " + companionName;
  document.title = companionName + " · 聊天";
  input.placeholder = "和" + companionName + "说点什么…";
  document.querySelectorAll('[data-companion-label="true"]').forEach(element => {
    element.textContent = (element.dataset.companionPrefix || "") + companionName + (element.dataset.companionSuffix || "");
  });
  if (softStatusEl?.textContent === previousName + "正在输入…") {
    setSoftStatus(companionName + "正在输入…");
  }
  renderReplyPreview();
}

async function updateChatTitle() {
  const sequence = ++profileRefreshSequence;
  try {
    const ai = await window.petAPI.getAiConfig();
    if (sequence === profileRefreshSequence) applyCompanionName(ai?.character?.name);
  } catch {
    // Keep the visible name when a temporary settings read fails.
  }
}

async function loadSessionUi() {
  try {
    const sessions = await window.petAPI.getSessions();

    sessionSelect.innerHTML = "";

    for (const session of sessions || []) {
      const option = document.createElement("option");

      option.value = session.id;
      option.textContent = session.title;
      option.selected = Boolean(session.active);
      sessionSelect.appendChild(option);
    }
  } catch (error) {
    setSoftStatus(toChatError(error));
  }
}

async function refreshAffectionBadge() {
  try {
    const [affection, checkin] = await Promise.all([
      window.petAPI.getAffection(),
      window.petAPI.getCheckin()
    ]);

    const level = affection?.levelEmoji || "♡";
    const score = Math.round(affection?.score || 0);
    const streak = checkin?.streak || 0;
    const streakText = streak >= 2 ? ` · ${streak}天` : "";

    affectionBadge.textContent = `${level} ${score}${streakText}`;
    affectionBadge.title =
      `${affection?.levelTitle || ""}（好感 ${score}/100）` +
      (streak >= 2 ? `，连续打卡 ${streak} 天` : "");
  } catch (error) {
    affectionBadge.textContent = "♡";
  }
}

async function loadChatHistory(options = {}) {
  try {
    stopAllVoicePlayback();

    isLoadingHistory = true;

    const history = await window.petAPI.getChatHistory();

    if (!Array.isArray(history)) {
      console.warn("聊天记录返回格式异常，已保留当前聊天内容。");
      setSoftStatus("聊天记录暂时没能加载，请重启应用后再试；这不会清空已保存的记录。");
      return;
    }

    const prevScrollHeight = messages.scrollHeight;
    const prevDistanceFromBottom = Math.max(
      0,
      prevScrollHeight - messages.scrollTop - messages.clientHeight
    );

    messages.innerHTML = "";
    previewRow = null;
    lastRenderedRole = "";
    lastRenderedAt = 0;
    clearNewMessagePill();

    for (const item of history) {
      try {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          console.warn("跳过一条格式异常的聊天记录。");
          continue;
        }
        renderHistoryItem(item);
      } catch (error) {
        // A damaged old record should not hide the rest of the conversation.
        console.warn("跳过一条无法显示的聊天记录：", error);
      }
    }

    if (options.preserveScroll) {
      requestAnimationFrame(() => {
        messages.scrollTop = Math.max(
          0,
          messages.scrollHeight - messages.clientHeight - prevDistanceFromBottom
        );
      });
    } else {
      scrollToBottom(true);
    }
  } catch (error) {
    console.warn("聊天记录加载失败：", error);
    setSoftStatus("聊天记录暂时没能加载，请重启应用后再试；这不会清空已保存的记录。");
  } finally {
    isLoadingHistory = false;
  }
}

function renderHistoryItem(item) {
  if (!item) return;

  if (item.recalled) {
    appendSystemMessage(
      item.role === "user"
        ? "你撤回了一条消息"
        : "",
      item.role === "user"
        ? { createdAt: item.createdAt }
        : { createdAt: item.createdAt, companionSuffix: "撤回了一条消息" }
    );
    return;
  }

  if (item.role === "user") {
    renderUserHistory(item);
    return;
  }

  if (item.role === "assistant") {
    if (item.reasoning) {
      appendReasoningMessage(item.reasoning, item.createdAt);
    }
    if (Array.isArray(item.parts)) {
      renderAiParts(item.parts, {
        autoplayVoice: false,
        parentMessageId: item.id,
        createdAt: item.createdAt,
        floor: item.floor,
        durationMs: item.durationMs,
        immediate: true
      });
    } else {
      appendTextMessage("ai", item.content || "", {
        id: item.id,
        favorite: item.favorite,
        replyTo: item.replyTo,
        createdAt: item.createdAt,
        floor: item.floor,
        durationMs: item.durationMs
      });
    }
  }
}

function renderUserHistory(item) {
  const content = item.content;

  if (item.type === "sticker" || item.sticker) {
    appendStickerMessage("user", item.sticker?.path || item.path || "", {
      id: item.id,
      favorite: item.favorite,
      createdAt: item.createdAt,
      floor: item.floor,
      sticker: item.sticker
    });
    return;
  }

  if (item.type === "image" && item.image?.dataUrl) {
    appendImageMessage("user", item.image, item.text || item.content || "", {
      id: item.id,
      favorite: item.favorite,
      replyTo: item.replyTo,
      createdAt: item.createdAt,
      floor: item.floor
    });
    return;
  }

  appendTextMessage("user", normalizeHistoryContent(content), {
    id: item.id,
    favorite: item.favorite,
    replyTo: item.replyTo,
    createdAt: item.createdAt,
    floor: item.floor
  });
}

async function clearHistory() {
  const ok = confirm("确定要清空全部聊天记录吗？");
  if (!ok) return;

  try {
    stopAllVoicePlayback();

    await window.petAPI.clearChatHistory();

    selectedImage = null;
    previewRow = null;
    replyTarget = null;
    messages.innerHTML = "";
    lastRenderedRole = "";
    lastRenderedAt = 0;
    clearReply();
    clearNewMessagePill();

    setSoftStatus("聊天记录已清空。");
  } catch (error) {
    setSoftStatus(toChatError(error));
  }
}

async function selectImage() {
  try {
    const image = await window.petAPI.selectImage();

    if (!image) return;

    selectedImage = image;
    renderImagePreview(image);

    setSoftStatus(`已选择图片：${image.name}`);
  } catch (error) {
    setSoftStatus(toChatError(error));
  }
}

async function sendMessage(options = {}) {
  const retryRequest = options.retryRequest || null;
  const text = retryRequest ? retryRequest.text : input.value.trim();

  if ((!text && !selectedImage && !retryRequest?.image) || isSending) {
    return;
  }

  isSending = true;
  updateSendingState(true);

  const imageToSend = retryRequest?.image || selectedImage;
  const currentReply = retryRequest?.replyTo || replyTarget;

  if (!retryRequest) {
    input.value = "";
    selectedImage = null;
    removeImagePreview();
    clearReply();
  }

  const userMessageId = createMessageId("user");
  activeClientMessageId = userMessageId;

  if (!retryRequest && imageToSend) {
    appendImageMessage(
      "user",
      imageToSend,
      text || "看看这个。",
      {
        id: userMessageId,
        replyTo: currentReply
      }
    );
  } else if (!retryRequest) {
    appendTextMessage("user", text, {
      id: userMessageId,
      replyTo: currentReply
    });
  }

  setSoftStatus(`${companionName}正在输入…`);

  try {
    const request = {
      text,
      image: imageToSend,
      replyTo: currentReply
        ? {
            id: currentReply.id,
            role: currentReply.role,
            text: currentReply.text,
            recalled: currentReply.recalled
          }
        : null,
      clientMessageId: userMessageId
    };

    const result = await window.petAPI.sendChatMessage(request);

    await renderAiResult(result);
    lastFailedRequest = null;
    btnRetryLast.hidden = true;
    setSoftStatus("");
  } catch (error) {
    console.error(error);
    if (!/已停止/.test(error?.message || "")) {
      lastFailedRequest = {
        text,
        image: imageToSend,
        replyTo: currentReply
      };
      btnRetryLast.hidden = false;
    }
    setSoftStatus(toChatError(error));
  } finally {
    isSending = false;
    activeClientMessageId = "";
    updateSendingState(false);
  }
}

async function retryLastFailedRequest() {
  if (!lastFailedRequest || isSending) {
    return;
  }

  const request = lastFailedRequest;
  lastFailedRequest = null;
  btnRetryLast.hidden = true;
  await sendMessage({ retryRequest: request });
}

async function cancelCurrentGeneration() {
  if (!activeClientMessageId) {
    return;
  }

  btnStopGeneration.disabled = true;
  stopAllVoicePlayback();

  try {
    await window.petAPI.cancelChatMessage(activeClientMessageId);
    setSoftStatus("已停止本次回复。");
  } catch (error) {
    setSoftStatus(toChatError(error));
  } finally {
    btnStopGeneration.disabled = false;
  }
}

function updateSendingState(sending) {
  btnSend.disabled = sending;
  btnSend.textContent = sending ? "发送中" : "发送";
  btnStopGeneration.hidden = !sending;
}

async function renderAiResult(result) {
  if (typeof result === "string") {
    appendTextMessage("ai", result);
    return;
  }

  if (!result || typeof result !== "object") {
    return;
  }

  if (result.reasoning) {
    appendReasoningMessage(result.reasoning);
  }

  if (Array.isArray(result.messages)) {
    await renderAiParts(result.messages, {
      autoplayVoice: true,
      parentMessageId: result.id,
      floor: result.floor,
      durationMs: result.durationMs,
      immediate: false
    });
    return;
  }

  if (Array.isArray(result.parts)) {
    await renderAiParts(result.parts, {
      autoplayVoice: true,
      parentMessageId: result.id,
      floor: result.floor,
      durationMs: result.durationMs,
      immediate: false
    });
    return;
  }

  if (result.text) {
    appendTextMessage("ai", result.text, {
      id: result.id,
      floor: result.floor,
      durationMs: result.durationMs
    });
  }
}

async function renderAiParts(parts, options = {}) {
  const autoplayVoice = options.autoplayVoice !== false;
  const immediate = Boolean(options.immediate);

  for (const [partIndex, part] of (parts || []).entries()) {
    if (!part || typeof part !== "object") continue;

    if (!immediate) {
      await sleep(getPartDelay(part));
    }

    const meta = {
      id: part.id || createMessageId("ai"),
      favorite: part.favorite,
      replyTo: part.replyTo,
      parentMessageId: options.parentMessageId,
      createdAt: options.createdAt || part.createdAt || Date.now(),
      floor: partIndex === 0 ? (options.floor || part.floor) : undefined,
      durationMs: partIndex === 0 ? (options.durationMs || part.durationMs) : undefined
    };

    if (part.recalled) {
      appendSystemMessage("", { createdAt: meta.createdAt, companionSuffix: "撤回了一条消息" });
      continue;
    }

    if (part.type === "text") {
      appendTextMessage("ai", cleanDisplayText(part.text || ""), meta);
      continue;
    }

    if (part.type === "sticker") {
      appendStickerMessage("ai", part.path || "", {
        ...meta,
        sticker: part
      });
      continue;
    }

    if (part.type === "image") {
      appendImageMessage("ai", part.image || {}, part.text || "", meta);
      continue;
    }

    if (part.type === "voice") {
      /*
        语音还没合成完的历史占位，先按文字展示，避免出现"播不了"的空语音。
      */
      if (part._pending && !part.audioUrl) {
        appendTextMessage("ai", cleanDisplayText(part.text || ""), meta);
        continue;
      }

      appendVoiceMessage("ai", {
        id: meta.id,
        parentMessageId: meta.parentMessageId,
        text: cleanDisplayText(part.text || ""),
        duration:
          part.duration ||
          estimateVoiceDuration(part.text || ""),
        audioUrl: part.audioUrl || part.audioPath || "",
        volume:
          typeof part.volume === "number"
            ? part.volume
            : 1,
        autoplay:
          autoplayVoice &&
          part.autoplay !== false,
        favorite: part.favorite,
        createdAt: meta.createdAt,
        floor: meta.floor,
        durationMs: meta.durationMs,
        unread: autoplayVoice
      });
    }
  }
}

function getPartDelay(part) {
  if (!part) return 260;

  if (part.type === "sticker") {
    return 520 + Math.random() * 280;
  }

  if (part.type === "voice") {
    return 420 + Math.random() * 260;
  }

  const len = String(part.text || "").length;

  return Math.min(760, 260 + len * 8 + Math.random() * 180);
}

function appendTextMessage(role, text, meta = {}) {
  const value = cleanDisplayText(text);

  if (!value) return;

  maybeAppendTimeDivider(meta.createdAt || Date.now());

  const row = createMessageRow(role, meta.createdAt);

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = value;

  if (meta.replyTo) {
    bubble.prepend(createQuoteBlock(meta.replyTo));
  }

  row.appendChild(bubble);
  appendMessageMeta(row, meta);
  appendRow(row, role);

  bindMessageContextMenu(row, {
    id: meta.id || createMessageId(role),
    parentMessageId: meta.parentMessageId || "",
    role,
    type: "text",
    text: value,
    favorite: Boolean(meta.favorite),
    createdAt: meta.createdAt || Date.now()
  });
}

function appendSystemMessage(text, options = {}) {
  const createdAt = options.createdAt || Date.now();
  if (!options.noTime) {
    maybeAppendTimeDivider(createdAt);
  }

  const row = createMessageRow("system", createdAt);

  const item = document.createElement("div");
  item.className = "system-message";
  if (options.companionSuffix !== undefined) {
    setCompanionLabel(item, options.companionPrefix || "", options.companionSuffix);
  } else {
    item.textContent = text;
  }

  row.appendChild(item);
  messages.appendChild(row);

  applyScrollBehavior("system");
}

function appendTimeMessage(text) {
  if (messageDetails.showTimestamp === false) return;
  const row = document.createElement("div");
  row.className = "row system";

  const item = document.createElement("div");
  item.className = "time-message";
  item.textContent = text;

  row.appendChild(item);
  messages.appendChild(row);
}

function appendImageMessage(role, image, textValue, meta = {}) {
  const src = image?.dataUrl || image?.url || image?.src || "";

  if (!src) return;

  maybeAppendTimeDivider(meta.createdAt || Date.now());

  const row = createMessageRow(role, meta.createdAt);

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (meta.replyTo) {
    bubble.appendChild(createQuoteBlock(meta.replyTo));
  }

  const img = document.createElement("img");
  img.className = "message-image";
  img.src = src;
  img.alt = image.name || "image";
  img.addEventListener("click", () => openImagePreview(src));

  bubble.appendChild(img);

  const cleanText = cleanDisplayText(textValue || "");

  if (cleanText) {
    const text = document.createElement("div");
    text.textContent = cleanText;
    bubble.appendChild(text);
  }

  row.appendChild(bubble);
  appendMessageMeta(row, meta);
  appendRow(row, role);

  bindMessageContextMenu(row, {
    id: meta.id || createMessageId(role),
    parentMessageId: meta.parentMessageId || "",
    role,
    type: "image",
    text: cleanText,
    image: {
      ...image,
      dataUrl: src
    },
    favorite: Boolean(meta.favorite),
    createdAt: meta.createdAt || Date.now()
  });
}

function appendStickerMessage(role, pathValue, meta = {}) {
  if (!pathValue) return;

  maybeAppendTimeDivider(meta.createdAt || Date.now());

  const row = createMessageRow(role, meta.createdAt);

  const bubble = document.createElement("div");
  bubble.className = "bubble sticker-bubble";

  const img = document.createElement("img");
  img.className = "sticker-img";
  img.src = normalizeAssetPath(pathValue);
  img.alt = meta.sticker?.name || "sticker";

  bubble.appendChild(img);
  row.appendChild(bubble);
  appendMessageMeta(row, meta);
  appendRow(row, role);

  bindMessageContextMenu(row, {
    id: meta.id || createMessageId(role),
    parentMessageId: meta.parentMessageId || "",
    role,
    type: "sticker",
    path: pathValue,
    sticker: meta.sticker || null,
    text: "",
    favorite: Boolean(meta.favorite),
    createdAt: meta.createdAt || Date.now()
  });
}

function appendVoiceMessage(role, voice) {
  maybeAppendTimeDivider(voice.createdAt || Date.now());

  const row = createMessageRow(role, voice.createdAt);

  const bubble = document.createElement("div");
  bubble.className = "voice-bubble";
  bubble.title = voice.text || "语音消息";

  if (role === "ai" && voice.unread !== false) {
    bubble.classList.add("unread");
  }

  if (!voice.audioUrl) {
    bubble.classList.add("unavailable");
    bubble.title = "这条语音暂时播不了";
  }

  const icon = document.createElement("span");
  icon.className = "voice-icon";
  icon.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 9.5a7 7 0 0 1 0 5"></path>
      <path d="M8.5 7a10.5 10.5 0 0 1 0 10"></path>
      <path d="M12 4.8a13.5 13.5 0 0 1 0 14.4"></path>
    </svg>
  `;

  const wave = document.createElement("span");
  wave.className = "voice-wave";

  for (let i = 0; i < 4; i++) {
    wave.appendChild(document.createElement("span"));
  }

  const duration = document.createElement("span");
  duration.className = "voice-duration";
  duration.textContent = `${Math.max(1, Math.round(voice.duration || 1))}"`;

  bubble.append(icon, wave, duration);
  row.appendChild(bubble);
  appendMessageMeta(row, voice);
  appendRow(row, role);

  const messageMeta = {
    id: voice.id || createMessageId(role),
    parentMessageId: voice.parentMessageId || "",
    role,
    type: "voice",
    text: voice.text || "",
    audioUrl: voice.audioUrl || "",
    duration: voice.duration || estimateVoiceDuration(voice.text || ""),
    favorite: Boolean(voice.favorite),
    bubble,
    createdAt: voice.createdAt || Date.now()
  };

  bubble.dataset.messageId = messageMeta.id;

  bubble.addEventListener("click", () => {
    if (!voice.audioUrl) {
      setSoftStatus("这条语音暂时播不了。");
      return;
    }

    const key = getVoiceKey(messageMeta);

    if (
      currentVoiceBubble === bubble &&
      currentVoiceKey === key &&
      voicePlaying
    ) {
      stopAllVoicePlayback();
      return;
    }

    stopAllVoicePlayback();

    playVoiceBubble(bubble, messageMeta, {
      manual: true,
      onFinished: null
    });
  });

  bindMessageContextMenu(row, messageMeta);

  if (voice.autoplay && voice.audioUrl) {
    queueVoiceBubble(bubble, messageMeta);
  }
}

function createMessageRow(role, createdAt) {
  const row = document.createElement("div");
  row.className = `row ${role}`;

  const nowAt = createdAt || Date.now();

  if (lastRenderedRole === role && nowAt - lastRenderedAt < 90 * 1000) {
    row.classList.add("compact");
  } else if (lastRenderedRole && lastRenderedRole !== role) {
    row.classList.add("spaced");
  }

  row.dataset.role = role;
  row.dataset.createdAt = String(nowAt);

  lastRenderedRole = role;
  lastRenderedAt = nowAt;

  return row;
}

function appendRow(row, role) {
  messages.appendChild(row);
  applyScrollBehavior(role);
}

function applyScrollBehavior(role) {
  if (isLoadingHistory) {
    return;
  }

  const shouldStick = isNearBottom(80);

  requestAnimationFrame(() => {
    if (shouldStick || role === "user") {
      scrollToBottom();
      if (role === "user") {
        clearNewMessagePill();
      }
      return;
    }

    if (role === "ai") {
      showNewMessagePill();
    }
  });
}

function bindMessageContextMenu(element, message) {
  element.addEventListener("contextmenu", (event) => {
    event.preventDefault();

    contextTarget = {
      ...message,
      row: element
    };

    const copyItem = contextMenu.querySelector('[data-action="copy"]');
    const replyItem = contextMenu.querySelector('[data-action="reply"]');
    const favoriteItem = contextMenu.querySelector('[data-action="favorite"]');
    const saveStickerItem = contextMenu.querySelector('[data-action="save-sticker"]');
    const voiceTextItem = contextMenu.querySelector('[data-action="voice-text"]');
    const recallItem = contextMenu.querySelector('[data-action="recall"]');

    copyItem.style.display = message.text ? "block" : "none";
    replyItem.style.display = "block";

    /*
      更接近微信：只能撤回自己发的消息。
    */
    recallItem.style.display = message.role === "user"
      ? "block"
      : "none";

    if (message.type === "sticker") {
      favoriteItem.style.display = "none";
      saveStickerItem.style.display = "block";
    } else {
      favoriteItem.style.display = "block";
      saveStickerItem.style.display = "none";
      favoriteItem.textContent = message.favorite
        ? "取消收藏"
        : "收藏";
    }

    voiceTextItem.style.display =
      message.type === "voice" && message.text
        ? "block"
        : "none";

    const x = Math.min(event.clientX, window.innerWidth - 145);
    const y = Math.min(event.clientY, window.innerHeight - 210);

    contextMenu.style.left = `${Math.max(8, x)}px`;
    contextMenu.style.top = `${Math.max(8, y)}px`;
    contextMenu.classList.add("show");
  });
}

function hideContextMenu() {
  contextMenu.classList.remove("show");
  contextTarget = null;
}

async function copyMessage(message) {
  try {
    const value = message.text || "";

    if (!value) {
      setSoftStatus("这条没有可复制的文字。");
      return;
    }

    await navigator.clipboard.writeText(value);
    setSoftStatus("已复制。");
  } catch {
    setSoftStatus("复制失败。");
  }
}

function setReply(message) {
  replyTarget = {
    id: message.id,
    role: message.role,
    text:
      message.recalled
        ? "引用的消息已撤回"
        : message.text ||
          (message.type === "sticker"
            ? "表情包"
            : message.type === "image"
              ? "图片"
              : "消息"),
    recalled: Boolean(message.recalled)
  };

  renderReplyPreview();
  replyBar.classList.add("show");
  input.focus();
}

function renderReplyPreview() {
  if (!replyTarget) return;
  const name = replyTarget.role === "user" ? "你" : companionName;
  replyPreview.textContent = replyTarget.recalled
    ? "引用的消息已撤回"
    : `回复 ${name}：${replyTarget.text}`;
}

function clearReply() {
  replyTarget = null;
  replyPreview.textContent = "";
  replyBar.classList.remove("show");
}

async function toggleFavorite(message) {
  if (message.type === "sticker") {
    await saveStickerFromMessage(message);
    return;
  }

  try {
    const nextFavorite = !message.favorite;

    const result = await window.petAPI.setMessageFavorite(
      message.id,
      nextFavorite
    );

    if (result && result.success === false) {
      throw new Error(result.message || "收藏失败。");
    }

    message.favorite = nextFavorite;

    setSoftStatus(nextFavorite ? "已收藏。" : "已取消收藏。");

    if (favoritesPanel.classList.contains("show")) {
      await renderFavoriteMessages();
    }
  } catch (error) {
    setSoftStatus(toChatError(error));
  }
}

async function recallMessage(message) {
  if (message.role !== "user") {
    setSoftStatus("只能撤回自己发送的消息。");
    return;
  }

  const ok = confirm("确定撤回这条消息吗？");

  if (!ok) return;

  try {
    const result = await window.petAPI.recallChatMessage(message.id);

    if (!result?.success) {
      throw new Error(result?.message || "撤回失败。");
    }

    if (message.row?.parentNode) {
      message.row.parentNode.removeChild(message.row);
    }

    appendSystemMessage("你撤回了一条消息", { noTime: true });
    scrollToBottom(true);
  } catch (error) {
    setSoftStatus(toChatError(error));
  }
}
/* ---------- 收藏面板 ---------- */

async function openFavoritesPanel() {
  favoritesMask.classList.add("show");
  favoritesPanel.classList.add("show");

  await refreshFavoritesPanel();
}

function closeFavoritesPanel() {
  favoritesMask.classList.remove("show");
  favoritesPanel.classList.remove("show");
}

function setFavoriteTab(tab) {
  currentFavoriteTab = tab === "stickers" ? "stickers" : "messages";

  document.querySelectorAll(".favorite-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === currentFavoriteTab);
  });

  const showMessages = currentFavoriteTab === "messages";

  favoriteMessagesContent.style.display = showMessages ? "block" : "none";
  favoriteStickersContent.style.display = showMessages ? "none" : "block";
  favoriteFilterRow.style.display = showMessages ? "flex" : "none";

  refreshFavoritesPanel();
}

async function refreshFavoritesPanel() {
  if (currentFavoriteTab === "messages") {
    await renderFavoriteMessages();
  } else {
    await renderFavoriteStickers();
  }
}

async function renderFavoriteMessages() {
  try {
    const favorites = await window.petAPI.getFavorites();
    const list = (favorites || [])
      .map(normalizeFavoriteItem)
      .filter((item) => item.type !== "sticker")
      .filter((item) =>
        currentFavoriteFilter === "all"
          ? true
          : item.type === currentFavoriteFilter
      )
      .sort((a, b) => (b.favoriteAt || 0) - (a.favoriteAt || 0));

    favoriteMessagesContent.innerHTML = "";

    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "favorite-empty";
      empty.innerHTML =
        currentFavoriteFilter === "all"
          ? "还没有收藏消息。<br />右键文字、语音或图片就可以收藏。"
          : "这个分类还没有收藏。";
      favoriteMessagesContent.appendChild(empty);
      return;
    }

    for (const item of list) {
      favoriteMessagesContent.appendChild(createFavoriteCard(item));
    }
  } catch (error) {
    favoriteMessagesContent.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "favorite-empty";
    empty.textContent = toChatError(error);
    favoriteMessagesContent.appendChild(empty);
  }
}

function normalizeFavoriteItem(item) {
  const type = item?.type || "text";

  return {
    id: item.id || item.favoriteId || item.messageId || createMessageId("fav"),
    messageId: item.messageId || item.id || "",
    role: item.role || "assistant",
    type,
    text: cleanDisplayText(item.text || item.content || ""),
    image: item.image || null,
    audioUrl: item.audioUrl || item.audioPath || "",
    duration: item.duration || estimateVoiceDuration(item.text || ""),
    createdAt: item.createdAt || Date.now(),
    favoriteAt: item.favoriteAt || item.createdAt || Date.now(),
    recalled: Boolean(item.recalled)
  };
}

function createFavoriteCard(item) {
  const card = document.createElement("div");
  card.className = "favorite-card";

  const meta = document.createElement("div");
  meta.className = "favorite-meta";

  const left = document.createElement("span");
  if (item.role === "user") {
    left.textContent = `你 · ${typeName(item.type)}`;
  } else {
    setCompanionLabel(left, "", ` · ${typeName(item.type)}`);
  }

  const right = document.createElement("span");
  right.className = "favorite-time";
  right.textContent = formatTime(item.favoriteAt || item.createdAt);

  meta.append(left, right);
  card.appendChild(meta);

  if (item.recalled) {
    const recalled = document.createElement("div");
    recalled.className = "favorite-text";
    recalled.textContent = "原消息已撤回";
    card.appendChild(recalled);
  }

  if (item.type === "text") {
    const text = document.createElement("div");
    text.className = "favorite-text";
    text.textContent = item.text || "空消息";
    card.appendChild(text);
  }

  if (item.type === "image") {
    if (item.text) {
      const text = document.createElement("div");
      text.className = "favorite-text";
      text.textContent = item.text;
      card.appendChild(text);
    }

    const src = item.image?.dataUrl || item.image?.url || item.image?.src || "";

    if (src) {
      const img = document.createElement("img");
      img.className = "favorite-image";
      img.src = src;
      img.alt = item.image?.name || "image";
      img.addEventListener("click", () => openImagePreview(src));
      card.appendChild(img);
    } else {
      const text = document.createElement("div");
      text.className = "favorite-text";
      text.textContent = "图片文件暂时无法显示。";
      card.appendChild(text);
    }
  }

  if (item.type === "voice") {
    const voice = document.createElement("div");
    voice.className = "voice-bubble favorite-voice";
    voice.innerHTML = `
      <span class="voice-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 9.5a7 7 0 0 1 0 5"></path>
          <path d="M8.5 7a10.5 10.5 0 0 1 0 10"></path>
          <path d="M12 4.8a13.5 13.5 0 0 1 0 14.4"></path>
        </svg>
      </span>
      <span class="voice-wave"><span></span><span></span><span></span><span></span></span>
      <span class="voice-duration">${Math.max(1, Math.round(item.duration || 1))}"</span>
    `;

    voice.addEventListener("click", () => {
      if (!item.audioUrl) {
        setSoftStatus("这条收藏语音暂时播不了。");
        return;
      }

      stopAllVoicePlayback();
      playVoiceBubble(voice, {
        id: item.messageId || item.id,
        role: item.role,
        type: "voice",
        text: item.text,
        audioUrl: item.audioUrl,
        duration: item.duration,
        volume: 1
      }, {
        manual: true
      });
    });

    card.appendChild(voice);

    if (item.text) {
      const text = document.createElement("div");
      text.className = "favorite-text";
      text.style.marginTop = "7px";
      text.textContent = item.text;
      card.appendChild(text);
    }
  }

  const actions = document.createElement("div");
  actions.className = "favorite-card-actions";

  const remove = document.createElement("button");
  remove.textContent = "取消收藏";
  remove.addEventListener("click", async () => {
    await window.petAPI.setMessageFavorite(item.messageId, false);
    await renderFavoriteMessages();
    setSoftStatus("已取消收藏。");
  });

  actions.appendChild(remove);
  card.appendChild(actions);

  return card;
}

async function renderFavoriteStickers() {
  try {
    const stickers = await window.petAPI.getUserStickers();
    favoriteStickerGrid.innerHTML = "";

    if (!stickers?.length) {
      const empty = document.createElement("div");
      empty.className = "favorite-empty";
      empty.style.gridColumn = "1 / -1";
      empty.innerHTML = "表情库还是空的。<br />可以导入，也可以右键聊天里的表情保存。";
      favoriteStickerGrid.appendChild(empty);
      return;
    }

    stickers.forEach((sticker) => {
      favoriteStickerGrid.appendChild(createStickerLibraryCard(sticker));
    });
  } catch (error) {
    favoriteStickerGrid.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "favorite-empty";
    empty.style.gridColumn = "1 / -1";
    empty.textContent = toChatError(error);
    favoriteStickerGrid.appendChild(empty);
  }
}

function createStickerLibraryCard(sticker) {
  const card = document.createElement("div");
  card.className = "library-sticker-card";

  const img = document.createElement("img");
  img.src = normalizeAssetPath(sticker.path);
  img.alt = sticker.name || "sticker";

  const name = document.createElement("div");
  name.className = "library-sticker-name";
  name.textContent = sticker.name || "未命名";

  const actions = document.createElement("div");
  actions.className = "library-sticker-actions";

  const send = document.createElement("button");
  send.textContent = "发送";
  send.addEventListener("click", (event) => {
    event.stopPropagation();
    closeFavoritesPanel();
    sendUserSticker(sticker);
  });

  const edit = document.createElement("button");
  edit.textContent = "编辑";
  edit.addEventListener("click", (event) => {
    event.stopPropagation();
    openStickerEditor(sticker);
  });

  const del = document.createElement("button");
  del.textContent = "删除";
  del.className = "danger";
  del.addEventListener("click", async (event) => {
    event.stopPropagation();
    await deleteSticker(sticker.id);
  });

  actions.append(send, edit, del);
  card.append(img, name, actions);

  card.addEventListener("click", () => {
    closeFavoritesPanel();
    sendUserSticker(sticker);
  });

  return card;
}

async function saveStickerFromMessage(message) {
  try {
    const pathValue = message.path || message.sticker?.path || "";

    if (!pathValue) {
      setSoftStatus("这张表情暂时保存不了。");
      return;
    }

    const sticker = {
      id: createMessageId("user_sticker"),
      name:
        message.sticker?.name ||
        message.label ||
        "收藏表情",
      path: pathValue,
      tags: Array.isArray(message.sticker?.tags)
        ? message.sticker.tags
        : [],
      description: message.sticker?.description || "",
      createdAt: Date.now()
    };

    await window.petAPI.saveUserSticker(sticker);
    await loadUserStickers();

    if (favoritesPanel.classList.contains("show")) {
      await renderFavoriteStickers();
    }

    setSoftStatus("已存到表情库。");
  } catch (error) {
    setSoftStatus(toChatError(error));
  }
}

function openStickerEditor(sticker) {
  editingSticker = { ...sticker };

  editorStickerPreview.src = normalizeAssetPath(sticker.path);
  editorStickerName.value = sticker.name || "";
  editorStickerTags.value = Array.isArray(sticker.tags)
    ? sticker.tags.join("，")
    : String(sticker.tags || "");
  editorStickerDesc.value = sticker.description || "";

  stickerEditorMask.classList.add("show");
}

function closeStickerEditor() {
  stickerEditorMask.classList.remove("show");
  editingSticker = null;
}

async function saveStickerEditor() {
  if (!editingSticker) return;

  try {
    const next = {
      ...editingSticker,
      name: editorStickerName.value.trim() || "未命名表情",
      tags: splitTags(editorStickerTags.value),
      description: editorStickerDesc.value.trim()
    };

    await window.petAPI.saveUserSticker(next);
    closeStickerEditor();
    await loadUserStickers();
    await renderFavoriteStickers();

    setSoftStatus("表情信息已保存。");
  } catch (error) {
    setSoftStatus(toChatError(error));
  }
}

async function deleteSticker(stickerId) {
  const ok = confirm("确定删除这个表情吗？");

  if (!ok) return;

  try {
    await window.petAPI.deleteUserSticker(stickerId);
    await loadUserStickers();
    await renderFavoriteStickers();

    setSoftStatus("表情已删除。");
  } catch (error) {
    setSoftStatus(toChatError(error));
  }
}

/* ---------- 图片预览 ---------- */

function openImagePreview(src) {
  if (!src) return;

  previewImage.src = src;
  imagePreviewMask.classList.add("show");
}

function closeImagePreview() {
  imagePreviewMask.classList.remove("show");
  previewImage.src = "";
}

/* ---------- 表情库 / 表情发送 ---------- */

async function toggleStickerPicker() {
  stickerPicker.classList.toggle("show");

  if (stickerPicker.classList.contains("show")) {
    await loadUserStickers();
  }
}

async function loadUserStickers() {
  try {
    const stickers = await window.petAPI.getUserStickers();

    stickerGrid.innerHTML = "";

    if (!stickers?.length) {
      const empty = document.createElement("div");
      empty.className = "picker-empty";
      empty.textContent = "暂无表情";
      stickerGrid.appendChild(empty);
      return;
    }

    stickers.forEach((sticker) => {
      const button = document.createElement("button");
      button.className = "picker-sticker";
      button.title = sticker.name || "表情";

      const img = document.createElement("img");
      img.src = normalizeAssetPath(sticker.path);
      img.alt = sticker.name || "sticker";

      button.appendChild(img);

      button.addEventListener("click", () => {
        sendUserSticker(sticker);
      });

      stickerGrid.appendChild(button);
    });
  } catch (error) {
    setSoftStatus(toChatError(error));
  }
}

async function importSticker() {
  try {
    const sticker = await window.petAPI.importUserSticker();

    if (!sticker) return;

    await window.petAPI.saveUserSticker(sticker);
    await loadUserStickers();

    if (favoritesPanel.classList.contains("show")) {
      await renderFavoriteStickers();
    }

    setSoftStatus("表情已导入。");
  } catch (error) {
    setSoftStatus(toChatError(error));
  }
}

async function sendUserSticker(sticker) {
  if (isSending) return;

  stickerPicker.classList.remove("show");

  const messageId = createMessageId("user_sticker");

  appendStickerMessage("user", sticker.path, {
    id: messageId,
    sticker
  });

  isSending = true;
  updateSendingState(true);
  setSoftStatus(`${companionName}正在输入…`);

  try {
    const result = await window.petAPI.sendChatMessage({
      text: "",
      userSticker: {
        id: sticker.id,
        name: sticker.name || "",
        path: sticker.path,
        tags: sticker.tags || [],
        description: sticker.description || ""
      },
      clientMessageId: messageId
    });

    await renderAiResult(result);
    setSoftStatus("");
  } catch (error) {
    console.error(error);
    setSoftStatus(toChatError(error));
  } finally {
    isSending = false;
    updateSendingState(false);
  }
}

/* ---------- 语音输入 ---------- */

async function toggleVoiceInput() {
  if (isRecording) {
    stopVoiceRecording();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    recordingStream = stream;
    recordingChunks = [];

    const options = MediaRecorder.isTypeSupported("audio/webm")
      ? { mimeType: "audio/webm" }
      : undefined;

    mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data?.size > 0) {
        recordingChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      stopStreamTracks();

      const blob = new Blob(recordingChunks, {
        type: mediaRecorder.mimeType || "audio/webm"
      });

      recordingChunks = [];
      mediaRecorder = null;

      if (!blob.size) {
        setSoftStatus("没有录到语音。");
        return;
      }

      setSoftStatus("正在识别语音…");

      try {
        const base64 = await blobToBase64(blob);

        const result = await window.petAPI.transcribeAudio({
          dataUrl: base64,
          mimeType: blob.type || "audio/webm",
          fileName: `record_${Date.now()}.webm`
        });

        if (result?.text) {
          input.value = result.text;
          input.focus();
          setSoftStatus("");
        } else {
          if (result?.message) console.warn("语音识别未返回文字：", result.message);
          setSoftStatus("没听清，可以再说一次。");
        }
      } catch (error) {
        setSoftStatus(toChatError(error));
      }
    };

    mediaRecorder.start();

    isRecording = true;
    document.getElementById("btn-mic").classList.add("recording");
    setSoftStatus("正在录音，再点一下结束。");
  } catch (error) {
    setSoftStatus(
      "麦克风好像用不了：" +
      (toChatError(error))
    );
  }
}

function stopVoiceRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  isRecording = false;
  document.getElementById("btn-mic").classList.remove("recording");
}

function stopStreamTracks() {
  if (recordingStream) {
    recordingStream.getTracks().forEach((track) => {
      track.stop();
    });
  }

  recordingStream = null;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;

    reader.readAsDataURL(blob);
  });
}

/* ---------- 语音播放队列 ---------- */

let mouthAudioCtx = null;
let mouthTrackTimer = null;

function startMouthLevelTracking(audio) {
  stopMouthLevelTracking();

  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;

    if (!Ctx) {
      return;
    }

    const ctx = new Ctx();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();

    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(ctx.destination);

    const data = new Uint8Array(analyser.fftSize);
    let lastAt = 0;

    mouthTrackTimer = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;

      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }

      const rms = Math.sqrt(sum / data.length);
      const level = Math.min(1, rms * 4.2);
      const now = Date.now();

      if (now - lastAt >= 60) {
        lastAt = now;
        window.petAPI?.setPetMouthLevel?.(level);
      }
    }, 40);

    mouthAudioCtx = ctx;
  } catch (error) {
    console.warn("音频口型跟踪不可用：", error);
  }
}

function stopMouthLevelTracking() {
  if (mouthTrackTimer) {
    clearInterval(mouthTrackTimer);
    mouthTrackTimer = null;
  }

  if (mouthAudioCtx) {
    try {
      mouthAudioCtx.close();
    } catch {}

    mouthAudioCtx = null;
  }

  window.petAPI?.setPetMouthLevel?.(0);
}

function queueVoiceBubble(bubble, voice) {
  if (!voice?.audioUrl) {
    return;
  }

  voiceQueue.push({ bubble, voice });
  playNextVoiceInQueue();
}

function playNextVoiceInQueue() {
  if (voicePlaying) {
    return;
  }

  const next = voiceQueue.shift();

  if (!next) {
    setSpeakingState(false);
    return;
  }

  playVoiceBubble(next.bubble, next.voice, {
    manual: false,
    onFinished: () => {
      queueDelayTimer = setTimeout(() => {
        playNextVoiceInQueue();
      }, 360);
    }
  });
}

function playVoiceBubble(bubble, voice, options = {}) {
  if (!bubble || !voice?.audioUrl) {
    if (options.onFinished) {
      options.onFinished();
    }
    return;
  }

  const token = ++playbackSequence;
  const key = getVoiceKey(voice);

  /*
    用户点过语音，或者自动播放开始尝试播放，
    就认为这条语音已经被打开过。
    红点立即消失，不等播放完整结束。
  */
  bubble.classList.remove("unread");

  const finish = () => {
    if (token !== playbackSequence) {
      return;
    }

    bubble.classList.remove("playing");

    stopMouthLevelTracking();
    window.petAPI?.setVoicePlaying?.({ playing: false });

    currentAudio = null;
    currentVoiceBubble = null;
    currentVoiceKey = "";
    voicePlaying = false;
    setSpeakingState(false);

    if (options.onFinished) {
      options.onFinished();
    }
  };

  voicePlaying = true;
  currentVoiceBubble = bubble;
  currentVoiceKey = key;

  bubble.classList.add("playing");
  setSpeakingState(true);

  const audio = new Audio(voice.audioUrl);

  currentAudio = audio;
  audio.volume = clampNumber(voice.volume ?? 1, 0, 1);

  const audioDurationMs = Number.isFinite(audio.duration)
    ? Math.round(audio.duration * 1000)
    : (estimateVoiceDuration(voice.text || "") * 1000);

  window.petAPI?.setVoicePlaying?.({
    playing: true,
    durationMs: audioDurationMs || 5000,
    text: voice.text || ""
  });

  audio.onended = finish;

  audio.onerror = () => {
    if (token !== playbackSequence) {
      return;
    }

    setSoftStatus("这条语音播放失败了。");
    finish();
  };

  audio.play().catch(() => {
    if (token !== playbackSequence) {
      return;
    }

    setSoftStatus("系统拦截了自动播放，点一下语音就可以听。");
    finish();
  });

  audio.addEventListener("playing", () => {
    startMouthLevelTracking(audio);
  });
}

function stopAllVoicePlayback() {
  playbackSequence += 1;

  clearTimeout(queueDelayTimer);
  queueDelayTimer = null;

  stopMouthLevelTracking();
  window.petAPI?.setVoicePlaying?.({ playing: false });

  voiceQueue = [];

  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;

    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {}
  }

  if (currentVoiceBubble) {
    currentVoiceBubble.classList.remove("playing");
  }

  currentAudio = null;
  currentVoiceBubble = null;
  currentVoiceKey = "";
  voicePlaying = false;

  document.querySelectorAll(".voice-bubble.playing").forEach((item) => {
    item.classList.remove("playing");
  });

  setSpeakingState(false);
}

function getVoiceKey(voice) {
  return `${voice.id || ""}|${voice.audioUrl || ""}`;
}

function setSpeakingState(speaking) {
  speakingDot.classList.toggle("active", Boolean(speaking));

  if (window.petAPI.setPetSpeaking) {
    window.petAPI.setPetSpeaking(Boolean(speaking));
  }
}

function toggleVoiceTextPreview(message) {
  if (!message?.bubble || !message.text) {
    setSoftStatus(message?.text || "这条语音没有文字。");
    return;
  }

  const row = message.bubble.closest(".row");

  if (!row) {
    setSoftStatus(message.text);
    return;
  }

  const old = row.querySelector(".voice-text-preview");

  if (old) {
    old.remove();
    return;
  }

  const preview = document.createElement("div");
  preview.className = "voice-text-preview";
  preview.textContent = message.text;

  row.appendChild(preview);
}

/* ---------- 引用、预览、滚动 ---------- */

function createQuoteBlock(replyTo) {
  const block = document.createElement("div");
  block.className = "quote-block";

  if (replyTo.recalled) {
    block.textContent = "引用的消息已撤回";
    return block;
  }

  const text = cleanDisplayText(replyTo.text || "");
  if (!text) {
    block.textContent = "引用的消息";
  } else if (replyTo.role === "user") {
    block.textContent = `你：${text}`;
  } else {
    setCompanionLabel(block, "", `：${text}`);
  }
  return block;
}

function renderImagePreview(image) {
  removeImagePreview();

  previewRow = document.createElement("div");
  previewRow.className = "row user";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const img = document.createElement("img");
  img.className = "message-image";
  img.src = image.dataUrl;
  img.addEventListener("click", () => openImagePreview(image.dataUrl));

  const text = document.createElement("div");
  text.textContent = `已选择：${image.name}`;

  bubble.append(img, text);
  previewRow.appendChild(bubble);
  messages.appendChild(previewRow);

  scrollToBottom();
}

function removeImagePreview() {
  if (previewRow?.parentNode) {
    previewRow.parentNode.removeChild(previewRow);
  }

  previewRow = null;
}

function maybeAppendTimeDivider(createdAt) {
  const at = Number(createdAt || Date.now());

  if (!lastRenderedAt || at - lastRenderedAt > 8 * 60 * 1000) {
    appendTimeMessage(formatChatTime(at));
  }
}

function isNearBottom(threshold = 36) {
  return (
    messages.scrollTop + messages.clientHeight >=
    messages.scrollHeight - threshold
  );
}

function scrollToBottom(force = false) {
  if (force) {
    messages.scrollTop = messages.scrollHeight;
    return;
  }

  requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;
  });
}

function showNewMessagePill() {
  newMessageCount += 1;
  newMessageCountEl.textContent = `${newMessageCount} 条新消息`;
  newMessagePill.classList.add("show");
}

function clearNewMessagePill() {
  newMessageCount = 0;
  newMessagePill.classList.remove("show");
}

/* ---------- 文本与格式 ---------- */

function cleanDisplayText(text) {
  let value = String(text || "").trim();

  value = value.replace(
    /^\s*[（(][^）)]{0,120}[）)]\s*/g,
    ""
  );

  value = value.replace(
    /^\s*\*[^*]{0,120}\*\s*/g,
    ""
  );

  value = value.replace(
    /^\s*【[^】]{0,120}】\s*/g,
    ""
  );

  const escapedName = companionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const narrationPrefix = new RegExp(
    `^(?:${escapedName}|她|少女)?\\s*(轻声|小声|害羞地|认真地|温柔地|笑着|鼓起脸颊|扭过头去|眨了眨眼|低下头)?\\s*(说|说道|开口|嘀咕)[:：]\\s*`,
    "g"
  );
  value = value.replace(narrationPrefix, "");

  value = value
    .replace(/^\s*(内心|旁白)[:：].*$/gm, "")
    .replace(/^(我看到|我看到了|我注意到|我理解|我明白)(你发的)?(这张|这个)?(图片|表情包)[，,。.\s]*/u, "")
    .replace(/^(这张图片|图片里|这个表情包|表情包)(表达了|看起来是|显示|说明|传达了)[^。！？!?]*[。！？!?]?\s*/u, "")
    .replace(/^(根据|从)(图片|表情包)(内容)?(来看|判断)[，,。.\s]*/u, "")
    .replace(/\s+/g, " ")
    .trim();

  return value;
}

function normalizeHistoryContent(content) {
  if (typeof content === "string") {
    return cleanDisplayText(content);
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (item.type === "text") return item.text || "";
        if (item.type === "image_url") return "图片";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return String(content || "");
}

function normalizeAssetPath(pathValue) {
  const value = String(pathValue || "").trim();

  if (!value) return "";

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("file:")
  ) {
    return value;
  }

  if (value.startsWith("./") || value.startsWith("../")) {
    return value;
  }

  return `./${value}`;
}

function typeName(type) {
  if (type === "voice") return "语音";
  if (type === "image") return "图片";
  if (type === "sticker") return "表情";
  return "文字";
}

function formatTime(timestamp) {
  const date = new Date(Number(timestamp || Date.now()));

  const pad = (n) => String(n).padStart(2, "0");

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatChatTime(timestamp) {
  const date = new Date(Number(timestamp || Date.now()));
  const now = new Date();

  const pad = (n) => String(n).padStart(2, "0");

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) {
    return `昨天 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toChatError(error) {
  console.warn("聊天界面操作未完成：", error);
  const raw = error?.message || String(error || "");

  if (/已停止|AbortError/.test(raw)) {
    return "本次回复已停止，可以继续发送消息。";
  }

  if (/\b401\b|\b403\b|unauthorized|forbidden|invalid.*api.?key/i.test(raw)) {
    return "服务验证未通过，请到设置中检查对应服务的密钥和访问权限。";
  }

  if (/\b429\b|rate.?limit|insufficient.?quota/i.test(raw)) {
    return "服务请求过于频繁或可用额度不足，请稍后重试，或检查服务额度。";
  }

  if (/fetch failed|ECONNREFUSED|ENOTFOUND|timeout|超时|Failed to fetch/i.test(raw)) {
    return "暂时没能连接服务，请检查网络和服务是否开启，再试一次。";
  }

  if (/IndexTTS2|语音|音频|TTS/i.test(raw)) {
    return "这次语音没能完成，可以先打字聊，也可以到设置中检查语音服务。";
  }

  if (/API|密钥|模型|服务地址|baseUrl|apiKey|model/i.test(raw)) {
    return "对话设置需要检查，请确认服务地址、密钥和模型已填写正确。";
  }

  if (/AI 请求失败/i.test(raw)) {
    return "对话服务未能完成这次回复，请稍后重试，或到设置中检查服务状态。";
  }

  return "刚才没能完成，稍后再试一次吧。";
}

function setSoftStatus(text) {
  if (softStatusEl) {
    softStatusEl.textContent = text || "";
  }
}

function appendReasoningMessage(reasoning, createdAt) {
  const text = cleanDisplayText(reasoning);
  if (!text) return;
  maybeAppendTimeDivider(createdAt || Date.now());
  const row = createMessageRow("system", createdAt);
  const thought = document.createElement("div");
  thought.className = "inner-thought";
  thought.textContent = text;
  row.appendChild(thought);
  messages.appendChild(row);
  applyScrollBehavior("ai");
}

function appendMessageMeta(row, meta = {}) {
  const values = [];
  if (messageDetails.showFloor && meta.floor) {
    values.push(`第 ${meta.floor} 轮`);
  }
  if (messageDetails.showDuration && meta.durationMs) {
    values.push(`${(meta.durationMs / 1000).toFixed(1)} 秒`);
  }
  if (!values.length) return;
  const item = document.createElement("div");
  item.className = "message-meta";
  item.textContent = values.join(" · ");
  row.appendChild(item);
}

async function selectScreen() {
  try {
    let sources = await window.petAPI.getScreenSources();
    let source = await chooseScreenSource(sources || []);

    while (source?.action === "refresh") {
      sources = await window.petAPI.getScreenSources();
      source = await chooseScreenSource(sources || []);
    }

    if (!source) return;

    const image = await window.petAPI.captureScreenSource(source.id);

    if (!image) return;

    selectedImage = image;
    renderImagePreview(image);
    setSoftStatus("已附加屏幕快照，点击发送后才会交给 AI。" );
  } catch (error) {
    setSoftStatus(toChatError(error));
  }
}

function chooseScreenSource(sources) {
  return new Promise((resolve) => {
    if (!sources.length) {
      setSoftStatus("没有可用的屏幕或窗口。");
      resolve(null);
      return;
    }

    const mask = document.createElement("div");
    mask.className = "screen-picker-mask";

    const picker = document.createElement("section");
    picker.className = "screen-picker";

    const title = document.createElement("h2");
    title.className = "screen-picker-title";
    title.textContent = "选择要作为附件的屏幕或窗口";

    const list = document.createElement("div");
    list.className = "screen-source-list";

    const close = (value) => {
      mask.remove();
      resolve(value);
    };

    sources.forEach((source) => {
      const button = document.createElement("button");
      button.className = "screen-source";
      button.type = "button";
      button.disabled = source.available === false;

      if (source.available === false) {
        button.classList.add("screen-source-unavailable");
        button.title = source.unavailableReason || "此窗口无法采集画面";
      }

      const thumbnail = document.createElement("img");
      thumbnail.src = source.thumbnail;
      thumbnail.alt = "";

      const name = document.createElement("span");
      const kind = source.kind === "screen" ? "整个屏幕" : "窗口";
      name.textContent = source.available === false
        ? `${source.name || "未命名窗口"}（${source.unavailableReason || "无法采集"}）`
        : `${source.name || "未命名窗口"}（${kind}）`;

      button.append(thumbnail, name);
      button.addEventListener("click", () => {
        if (source.available !== false) close(source);
      });
      list.appendChild(button);
    });

    const note = document.createElement("p");
    note.className = "screen-picker-note";
    note.textContent = "仅截取一次预览；截图不会保存到本地，发送前仍可取消。";

    const cancel = document.createElement("button");
    cancel.className = "secondary";
    cancel.type = "button";
    cancel.textContent = "取消";
    cancel.addEventListener("click", () => close(null));

    const refresh = document.createElement("button");
    refresh.className = "secondary";
    refresh.type = "button";
    refresh.textContent = "刷新列表";
    refresh.addEventListener("click", () => close({ action: "refresh" }));

    picker.append(title, list, note, refresh, cancel);
    mask.appendChild(picker);
    mask.addEventListener("click", (event) => {
      if (event.target === mask) close(null);
    });
    document.body.appendChild(mask);
  });
}

async function initializeChat() {
  applyCompanionName(companionName);
  window.addEventListener("companion-profile-changed", updateChatTitle);
  window.addEventListener("focus", updateChatTitle);
  await Promise.all([loadMessageDetails(), updateChatTitle()]);
  await loadChatHistory();
  await Promise.all([loadUserStickers(), loadSessionUi(), refreshAffectionBadge()]);
}

// Start after playback state declarations have initialized; load history only once.
initializeChat();
