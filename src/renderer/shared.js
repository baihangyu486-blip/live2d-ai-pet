/*
  shared.js —— 渲染层共享工具（chat 与 panel 通用）

  避免在多个页面脚本里重复定义 clampNumber / sleep / toFriendlyError，
  由 chat.html 与 panel.html 在各自业务脚本之前引入。
*/

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toFriendlyError(error) {
  const raw = error?.message || String(error || "");

  if (/AI 请求失败|fetch failed|ECONNREFUSED|ENOTFOUND|timeout|超时|Failed to fetch/i.test(raw)) {
    return "刚刚好像没连上，等一下再试试。";
  }

  if (/IndexTTS2|语音|音频|TTS/i.test(raw)) {
    return "这次语音没顺利生成，但聊天还在。";
  }

  if (/API|密钥|模型|服务地址|baseUrl|apiKey|model/i.test(raw)) {
    return "设置好像还没配对，可以去设置里看一下。";
  }

  if (/Error invoking remote method|ReferenceError|TypeError|not defined|is not a function|Cannot read properties/i.test(raw)) {
    return "这个功能刚刚没有初始化成功，关闭桌宠后重新打开再试。";
  }

  if (/[\u4e00-\u9fff]/.test(raw)) {
    return raw;
  }

  return "操作没有完成，请稍后再试。";
}

function estimateVoiceDuration(text) {
  const value = String(text || "").trim();

  if (!value) {
    return 2;
  }

  return Math.max(
    2,
    Math.min(36, Math.ceil(value.length / 4.5))
  );
}

function createMessageId(prefix) {
  return `${prefix || "msg"}_${Date.now()}_${Math.random()
    .toString(16)
    .slice(2)}`;
}

function splitTags(value) {
  return String(value || "")
    .split(/[,，;；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function percentToChance(value) {
  return clampChance(Number(value || 0) / 100);
}

function chanceToPercent(value) {
  return Math.round(Number(value || 0) * 100);
}

function clampChance(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}
