/*
  state.js —— 主进程共享运行时状态（贴纸冷却、语音播放互斥、忙碌标记等）
  从 main.js 拆分出的独立模块。
*/


const runtimeState = {
  stickerCooldowns: {},
  lastStickerAt: -999,
  assistantMessageCount: 0,
  lastPetInteractionAt: 0,
  lastUserMessageAt: 0,
  lastSpontaneousAt: 0,
  lastInitiativeAt: 0,
  isAiBusy: false,
  isVoicePlaying: false
};

module.exports = {
  runtimeState
};
