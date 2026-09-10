/*
  emotion.js —— 情绪检测与组合、撒娇内心戏生成
  从 main.js 拆分出的独立模块。
*/


const USER_EMOTION_GUIDANCE = {
  sad: "用户现在心情低落：先安抚、多陪伴，少说教，不要急着给建议。",
  angry: "用户现在很烦躁/生气：先顺着ta的情绪让ta发泄，别讲道理，别反问为什么生气。",
  tired: "用户现在很累：先心疼、劝休息，别让ta费神。",
  happy: "用户现在心情很好：一起开心，接住ta的高兴，可以适当闹一闹。",
  love: "用户正在撒娇/表达亲密：甜甜地回应，可以更亲近一点。",
  anxious: "用户现在焦虑不安：稳住ta，先给安全感，再轻轻问发生了什么。",
  neutral: ""
};

function detectUserEmotion(text) {
  const value = String(text || "");
  const scores = {
    sad: 0,
    angry: 0,
    tired: 0,
    happy: 0,
    love: 0,
    anxious: 0,
    neutral: 0.6
  };

  addEmotionScore(scores, "sad", value, [
    "难过", "伤心", "不开心", "委屈", "想哭", "哭了", "难受", "孤独", "寂寞", "失落"
  ], 2);
  addEmotionScore(scores, "angry", value, [
    "生气", "气死", "烦死", "好烦", "烦躁", "讨厌", "气人", "崩溃", "无语", "受不了"
  ], 2);
  addEmotionScore(scores, "tired", value, [
    "好累", "累死", "累死了", "加班", "熬夜", "没睡好", "困死", "疲惫", "辛苦"
  ], 2);
  addEmotionScore(scores, "happy", value, [
    "开心", "高兴", "哈哈", "太好啦", "爽", "嘿嘿", "棒", "耶", "哈哈哈哈"
  ], 2);
  addEmotionScore(scores, "love", value, [
    "想你", "喜欢你", "爱你", "抱抱", "亲亲", "贴贴", "宝贝", "老婆", "老公"
  ], 2);
  addEmotionScore(scores, "anxious", value, [
    "焦虑", "紧张", "担心", "害怕", "压力好大", "压力大", "怎么办", "不安"
  ], 2);

  let best = "neutral";
  let bestScore = scores.neutral;

  for (const [emotion, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = emotion;
      bestScore = score;
    }
  }

  return best;
}

function getUserEmotionLabel(emotion) {
  return {
    sad: "低落",
    angry: "烦躁/生气",
    tired: "疲惫",
    happy: "开心",
    love: "亲密撒娇",
    anxious: "焦虑不安",
    neutral: "平静"
  }[emotion] || "平静";
}

function resolvePetEmotion(userEmotion, replyEmotion) {
  if (userEmotion === "sad" || userEmotion === "tired" || userEmotion === "anxious") {
    return replyEmotion === "sad" || replyEmotion === "comfort" ? replyEmotion : "comfort";
  }

  if (userEmotion === "angry") {
    return replyEmotion === "angry" || replyEmotion === "comfort" ? replyEmotion : "comfort";
  }

  if (userEmotion === "happy") {
    return replyEmotion === "love" ? "love" : "happy";
  }

  if (userEmotion === "love") {
    return "love";
  }

  return replyEmotion;
}

function toCuteInnerThought(rawReasoning, emotion) {
  const value = String(rawReasoning || "").trim();

  if (!value) {
    return "";
  }

  const pools = {
    love: [
      "（唔…想着怎么哄你才最甜 uwu）",
      "（心里小鹿乱撞了一下…要先说什么好呢）"
    ],
    happy: [
      "（嘿嘿，先在心里乐了一下再回你！）",
      "（高兴得转了个圈，然后假装镇定回你）"
    ],
    shy: [
      "（啊…这种话要怎么说出口啦 >///<）",
      "（脸有点烫，先想好再小声说）"
    ],
    comfort: [
      "（先抱抱你，再想想怎么说能让你好受点…）",
      "（心疼坏了，要把话想得软一点）"
    ],
    sad: [
      "（心里酸酸的…但不想让你担心，先整理好情绪）",
      "（呜…先憋住眼泪，好好回你）"
    ],
    angry: [
      "（哼！先气一下，但还是舍不得真的凶你）",
      "（气得跺脚，然后还是想好好说话）"
    ],
    confused: [
      "（诶？让我想想…这个问题有点难！）",
      "（脑袋转了好几圈，选了个最不笨的回答）"
    ],
    neutral: [
      "（嗯…让我想想怎么说最自然）",
      "（心里过了好几个版本，挑了个最顺口的）"
    ]
  };

  const pool = pools[emotion] || pools.neutral;

  return pool[Math.floor(Math.random() * pool.length)];
}

/*
  显示层转换：把「原始推理」或历史里残留的英文/超长推理，
  统一换成白希的撒娇内心戏；已经是内心戏的短句则原样保留。
*/
function toDisplayReasoning(rawReasoning, emotion = "neutral") {
  const value = String(rawReasoning || "").trim();

  if (!value) {
    return "";
  }

  const hasEnglish = /[A-Za-z]{3,}/.test(value);
  const tooLong = value.length > 60;

  if (tooLong || hasEnglish) {
    return toCuteInnerThought(value, emotion);
  }

  return value;
}

function detectEmotion(text) {
  const value = String(text || "");

  const scores = {
    love: 0,
    happy: 0,
    shy: 0,
    comfort: 0,
    sad: 0,
    angry: 0,
    confused: 0,
    neutral: 1
  };

  addEmotionScore(
    scores,
    "love",
    value,
    ["喜欢你", "最喜欢", "贴贴", "抱抱", "想你", "陪你"],
    3
  );

  addEmotionScore(
    scores,
    "happy",
    value,
    ["开心", "高兴", "好耶", "哈哈", "太好了", "棒", "嘿嘿"],
    2
  );

  addEmotionScore(
    scores,
    "shy",
    value,
    ["害羞", "脸红", "不好意思", "诶嘿", "才不是", "唔"],
    2
  );

  addEmotionScore(
    scores,
    "comfort",
    value,
    ["辛苦", "没关系", "我陪你", "别怕", "慢慢来", "休息", "在呢"],
    2
  );

  addEmotionScore(
    scores,
    "sad",
    value,
    ["难过", "伤心", "呜", "委屈", "哭", "心疼"],
    2
  );

  addEmotionScore(
    scores,
    "angry",
    value,
    ["生气", "讨厌", "哼", "不理你", "气死", "坏", "笨蛋"],
    2
  );

  addEmotionScore(
    scores,
    "confused",
    value,
    ["欸", "诶", "为什么", "不知道", "疑惑", "问号"],
    2
  );

  let best = "neutral";
  let bestScore = scores.neutral;

  for (const [emotion, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = emotion;
      bestScore = score;
    }
  }

  return best;
}

function addEmotionScore(scores, emotion, text, keywords, score) {
  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      scores[emotion] += score;
    }
  }
}

function isSeriousOrTechnical(text, context) {
  const value = String(text || "");

  if (context?.hasImage && value.length > 120) {
    return true;
  }

  if (/```|`[^`]+`/.test(value)) {
    return true;
  }

  if (
    /function\s*\(|const\s+|let\s+|var\s+|require\(|ipcMain|BrowserWindow|preload|renderer|settings\.json/i.test(
      value
    )
  ) {
    return true;
  }

  if (
    /报错|Error|TypeError|ReferenceError|SyntaxError|接口|API|路径|文件|代码|函数|配置|覆盖|替换/.test(
      value
    )
  ) {
    return true;
  }

  if (/^\s*[-*]\s+/m.test(value)) {
    return true;
  }

  return value.length > 260;
}

module.exports = {
  USER_EMOTION_GUIDANCE,
  detectUserEmotion,
  getUserEmotionLabel,
  resolvePetEmotion,
  toCuteInnerThought,
  toDisplayReasoning,
  detectEmotion,
  addEmotionScore,
  isSeriousOrTechnical
};
