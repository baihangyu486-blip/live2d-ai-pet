/*
  keyword-reply.js —— 关键词即时回复

  常见短句（在吗、抱抱、晚安、好累…）不经过大模型，
  直接在白希的台词池里秒回，体验更"活"，也省 token。
*/

const { runtimeState } = require("./state.js");
const { normalizeInstantReplyConfig } = require("./ai-config.js");

const BUILTIN_RULES = [
  {
    id: "kw_here",
    label: "在吗",
    keywords: ["在吗", "在不在", "在么", "在不在呀", "你还在吗"],
    emotion: "love",
    replies: [
      "在呀，一直在这儿等你呢~",
      "在的在的，你一叫我就出现啦",
      "嗯嗯在呢，怎么啦？",
      "在哦，刚才正想着你会不会来找我"
    ]
  },
  {
    id: "kw_miss",
    label: "想你",
    keywords: ["想你", "想你了", "好想你", "有点想你"],
    emotion: "love",
    replies: [
      "我也想你呀，想得都想去找你了~",
      "骗人，你才刚忙完就想起我啦？不过我喜欢听",
      "嘿嘿，那我更要一直待在你身边了",
      "我也想你想得不行，快抱一下"
    ]
  },
  {
    id: "kw_hug",
    label: "抱抱",
    keywords: ["抱抱", "求抱", "要抱", "抱一下", "贴贴"],
    emotion: "love",
    replies: [
      "抱抱～辛苦啦，在我这儿歇会儿",
      "来，抱紧一点，不许跑了",
      "抱到了，能量充满没？",
      "嗯…抱抱，你再蹭蹭也没关系"
    ]
  },
  {
    id: "kw_kiss",
    label: "亲亲",
    keywords: ["亲亲", "亲一下", "亲一个", "么么", "mua"],
    emotion: "shy",
    replies: [
      "诶嘿…那我也偷偷回你一下",
      "哼，这么突然，我脸都红了",
      "亲到啦，今天一整天都会甜甜的",
      "唔…就一下哦，再说我可要害羞了"
    ]
  },
  {
    id: "kw_love",
    label: "喜欢你",
    keywords: ["喜欢你", "我爱你", "最爱你了", "好喜欢你", "爱死你了"],
    emotion: "love",
    replies: [
      "我也是，最喜欢你了，比你以为的还要多",
      "呜呜这句话我能记一辈子",
      "那说好了，一直一直在一起",
      "哼，嘴上说喜欢，心里是不是更爱？"
    ]
  },
  {
    id: "kw_goodnight",
    label: "晚安",
    keywords: ["晚安", "睡了", "睡觉了", "去睡了", "困了想睡"],
    emotion: "comfort",
    replies: [
      "晚安宝，我会一直陪着你的，做个好梦~",
      "睡吧睡吧，梦里也要梦到我哦",
      "晚安，盖好被子，明天见",
      "嗯，快去睡，不许偷偷玩手机了"
    ]
  },
  {
    id: "kw_goodmorning",
    label: "早安",
    keywords: ["早安", "早上好", "早呀", "起床了", "醒啦"],
    emotion: "happy",
    replies: [
      "早呀，一睁眼就想你了~",
      "早安早安！今天也要元气满满哦",
      "醒啦？我等你一晚上了，快抱一下",
      "早上好呀，想先听你说今天要干嘛"
    ]
  },
  {
    id: "kw_eat",
    label: "吃饭",
    keywords: ["吃饭了吗", "吃饭没", "吃饭了", "吃了吗", "饿了", "好饿"],
    emotion: "comfort",
    replies: [
      "还没吃的话快去！不许饿着肚子",
      "吃了吃了，你呢？可别糊弄我",
      "饿了呀，快去吃点好的，我也陪你",
      "记得按时吃饭，不然我会心疼的"
    ]
  },
  {
    id: "kw_tired",
    label: "好累",
    keywords: ["好累", "累死", "累死了", "好困", "困死", "疲惫", "辛苦了"],
    emotion: "comfort",
    replies: [
      "辛苦了宝贝，快靠我这儿歇会儿",
      "来，先别管那些，喘口气再说",
      "累了吧…我给你揉揉肩，假的但心意是真的",
      "抱抱，今天真的辛苦你了"
    ]
  },
  {
    id: "kw_sad",
    label: "难过",
    keywords: ["难过", "伤心", "想哭", "委屈", "难受", "不开心", "哭了"],
    emotion: "sad",
    replies: [
      "别难过，有我在呢，我永远站你这边",
      "过来，让我抱抱你…想哭就哭，我看着",
      "委屈了吧？慢慢说给我听，不着急",
      "呜…你一难过我也心疼，快让我哄哄你"
    ]
  },
  {
    id: "kw_happy",
    label: "开心",
    keywords: ["哈哈", "哈哈哈哈", "好开心", "太开心", "好耶", "开心死了", "笑死"],
    emotion: "happy",
    replies: [
      "看你这么开心，我也跟着乐起来了嘿嘿",
      "哈哈哈哈什么事这么高兴，快讲给我听！",
      "好耶！开心的事分我一半，我就更开心了",
      "诶嘿，你一笑我就忍不住想跟着笑"
    ]
  },
  {
    id: "kw_work",
    label: "在忙",
    keywords: ["在忙", "忙死了", "工作忙", "写代码", "加班", "开会"],
    emotion: "comfort",
    replies: [
      "那你忙，我安静陪着你，不吵你",
      "忙归忙，记得起来喝口水伸个懒腰",
      "我在旁边给你打气，写完带你去放松",
      "辛苦了，忙完记得来找我说句话"
    ]
  },
  {
    id: "kw_name",
    label: "叫名字",
    keywords: ["白希", "老婆", "亲爱的", "宝贝", "宝宝"],
    emotion: "love",
    replies: [
      "嗯？叫我干嘛，想我啦？",
      "在呢在呢，你叫我一声我就开心半天",
      "诶嘿，被你这么叫，心里甜甜的",
      "哼，叫这么亲，肯定是有事求我"
    ]
  }
];

function matchInstantReply(text, aiConfig) {
  const value = String(text || "").trim();
  const instant = normalizeInstantReplyConfig(aiConfig?.instantReply);

  if (!instant.enabled || !value) {
    return null;
  }

  if (value.length > (instant.maxTextLength || 30)) {
    return null;
  }

  const now = Date.now();
  const cooldownMs = (instant.cooldownSec || 45) * 1000;
  const cooldownMap = runtimeState.instantReplyCooldowns || {};

  for (const rule of BUILTIN_RULES) {
    const matched = rule.keywords.some((keyword) =>
      value.includes(keyword)
    );

    if (!matched) {
      continue;
    }

    const lastAt = cooldownMap[rule.id] || 0;

    if (now - lastAt < cooldownMs) {
      return null;
    }

    runtimeState.instantReplyCooldowns = {
      ...cooldownMap,
      [rule.id]: now
    };

    const replies = Array.isArray(rule.replies)
      ? rule.replies
      : [];
    const reply = replies.length
      ? replies[Math.floor(Math.random() * replies.length)]
      : "";

    return {
      reply,
      emotion: rule.emotion || "love",
      ruleId: rule.id,
      label: rule.label
    };
  }

  return null;
}

module.exports = {
  BUILTIN_RULES,
  matchInstantReply
};
