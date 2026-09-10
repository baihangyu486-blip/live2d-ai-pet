/*
  bubble-layout.js —— 气泡/辅助窗口布局纯几何算法
  从 main.js 拆分出的独立模块。
*/

const { clampNumber } = require("./utils.js");

const DEFAULT_BUBBLE_SIZE = { width: 330, height: 170 };

/*
  气泡布局的运行时状态（原来散在 main.js 顶层，随函数一起搬到这里）：
  - layout：bubble.js 回传的实际气泡主体与尾巴尖端位置
  - petVisualBounds：renderer.js 上报的 Live2D 可见范围
  - stableTail / lastTailSwitchAt：尾巴方向稳定逻辑
*/
const bubbleState = {
  layout: null,
  petVisualBounds: null,
  stableTail: "tail-right",
  lastTailSwitchAt: 0
};

function calcSideRect(pet, work, size, side, gap) {
  return clampRectToWorkArea(
    {
      x: side === "left"
        ? pet.x - size.width - gap
        : pet.x + pet.width + gap,
      y: pet.y + Math.round((pet.height - size.height) / 2),
      width: size.width,
      height: size.height
    },
    work
  );
}

function calcStackedRectNear(anchorRect, pet, work, size, gap) {
  const below = clampRectToWorkArea(
    {
      x: anchorRect.x,
      y: anchorRect.y + anchorRect.height + gap,
      width: size.width,
      height: size.height
    },
    work
  );

  if (!rectsIntersect(anchorRect, below)) {
    return below;
  }

  const above = clampRectToWorkArea(
    {
      x: anchorRect.x,
      y: anchorRect.y - size.height - gap,
      width: size.width,
      height: size.height
    },
    work
  );

  if (!rectsIntersect(anchorRect, above)) {
    return above;
  }

  return calcSideRect(
    pet,
    work,
    size,
    pet.x + pet.width / 2 > work.x + work.width / 2
      ? "right"
      : "left",
    gap
  );
}

function createBubbleCandidate(
  tail,
  x,
  y,
  width,
  height,
  target = null,
  localTailPoint = null
) {
  return {
    tail,
    x,
    y,
    width,
    height,
    target,
    localTailPoint
  };
}

function getSafeBubbleLayout() {
  const fallback = {
    tail: "tail-right",
    bubble: {
      x: 12,
      y: 0,
      width: 292,
      height: 92
    },
    tailPoint: {
      x: 314,
      y: 57
    }
  };

  if (!bubbleState.layout?.bubble) {
    return fallback;
  }

  const bubble = bubbleState.layout.bubble;
  const tailPoint = bubbleState.layout.tailPoint || fallback.tailPoint;

  if (
    !Number.isFinite(bubble.x) ||
    !Number.isFinite(bubble.y) ||
    !Number.isFinite(bubble.width) ||
    !Number.isFinite(bubble.height)
  ) {
    return fallback;
  }

  return {
    tail: bubbleState.layout.tail || fallback.tail,
    bubble: {
      x: clampNumber(bubble.x, -20, DEFAULT_BUBBLE_SIZE.width),
      y: clampNumber(bubble.y, -20, DEFAULT_BUBBLE_SIZE.height),
      width: clampNumber(
        bubble.width,
        30,
        DEFAULT_BUBBLE_SIZE.width + 30
      ),
      height: clampNumber(
        bubble.height,
        20,
        DEFAULT_BUBBLE_SIZE.height + 30
      )
    },
    tailPoint: {
      x: clampNumber(
        tailPoint.x,
        -30,
        DEFAULT_BUBBLE_SIZE.width + 30
      ),
      y: clampNumber(
        tailPoint.y,
        -30,
        DEFAULT_BUBBLE_SIZE.height + 30
      )
    }
  };
}

function estimateBubbleTailPoint(layout, tail) {
  const bubble = layout.bubble;

  if (tail === "tail-left") {
    return {
      x: bubble.x - 10,
      y: bubble.y + bubble.height - 35
    };
  }

  if (tail === "tail-bottom") {
    return {
      x: bubble.x + bubble.width / 2,
      y: bubble.y + bubble.height + 10
    };
  }

  return {
    x: bubble.x + bubble.width + 10,
    y: bubble.y + bubble.height - 35
  };
}

function getVisibleBubbleRect(rect, layout) {
  const bubble = layout.bubble;

  return {
    x: rect.x + bubble.x,
    y: rect.y + bubble.y,
    width: bubble.width,
    height: bubble.height
  };
}

function getPetVisualRect(pet) {
  const bounds = bubbleState.petVisualBounds;
  const fresh = bounds && Date.now() - Number(bounds.at || 0) < 1800;

  if (
    fresh &&
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width > 30 &&
    bounds.height > 30
  ) {
    const result = {
      x: pet.x + bounds.x,
      y: pet.y + bounds.y,
      width: bounds.width,
      height: bounds.height
    };

    /*
      如果 renderer.js 上报了说话锚点，就直接使用。
      这个点会随着模型缩放、站姿、蹲姿、动作 bounds 改变而变化。
    */
    if (
      Number.isFinite(bounds.speechAnchorX) &&
      Number.isFinite(bounds.speechAnchorY)
    ) {
      result.speechAnchorX = pet.x + bounds.speechAnchorX;
      result.speechAnchorY = pet.y + bounds.speechAnchorY;
    }

    return result;
  }

  /*
    兜底值只在 renderer.js 暂时没有上报真实 bounds 时使用。
  */
  return {
    x: pet.x + pet.width * 0.25,
    y: pet.y + pet.height * 0.12,
    width: pet.width * 0.50,
    height: pet.height * 0.78,
    speechAnchorX: pet.x + pet.width * 0.5,
    speechAnchorY: pet.y + pet.height * 0.29
  };
}

function getPetAvoidRect(petVisual) {
  /*
    避让区域可以稍微比真实人物大一点。
    但它只负责防止气泡盖住人物，不参与尾巴锚点计算。
  */
  const paddingX = Math.max(8, petVisual.width * 0.045);
  const paddingTop = Math.max(6, petVisual.height * 0.035);
  const paddingBottom = Math.max(10, petVisual.height * 0.05);

  return {
    x: petVisual.x - paddingX,
    y: petVisual.y - paddingTop,
    width: petVisual.width + paddingX * 2,
    height: petVisual.height + paddingTop + paddingBottom
  };
}

function getPetBubbleAnchorRect(petVisual) {
  /*
    Bubble 锚点区域不再用整个人物 bounds。
    整个人物 bounds 会包含手、裙摆、尾巴、头发，
    姿势一变就会把气泡带偏。

    这里使用 speechAnchor：
    - x：身体中轴附近
    - y：脸下半区 / 脖子 / 肩膀附近
  */
  const centerX = Number.isFinite(petVisual.speechAnchorX)
    ? petVisual.speechAnchorX
    : petVisual.x + petVisual.width * 0.5;

  const centerY = Number.isFinite(petVisual.speechAnchorY)
    ? petVisual.speechAnchorY
    : petVisual.y + petVisual.height * 0.32;

  /*
    锚点区域不要太宽。
    太宽会又被手、裙摆、动作带偏。
  */
  const anchorWidth = clampNumber(
    petVisual.width * 0.28,
    80,
    165
  );

  const anchorHeight = clampNumber(
  petVisual.height * 0.15,
  52,
  100
);

  return {
    x: centerX - anchorWidth / 2,
    y: centerY - anchorHeight / 2,
    width: anchorWidth,
    height: anchorHeight,

    speechAnchorX: centerX,
    speechAnchorY: centerY
  };
}

function getBubbleTailTarget(tail, pet) {
  /*
    pet 这里已经不是整个人物框，
    而是围绕脸侧 / 脖子 / 肩膀的小锚点区域。
  */
  const anchorX = Number.isFinite(pet.speechAnchorX)
    ? pet.speechAnchorX
    : pet.x + pet.width * 0.5;

  const anchorY = Number.isFinite(pet.speechAnchorY)
    ? pet.speechAnchorY
    : pet.y + pet.height * 0.5;

  if (tail === "tail-right") {
    return {
      x: anchorX - pet.width * 0.48,
      y: anchorY
    };
  }

  if (tail === "tail-left") {
    return {
      x: anchorX + pet.width * 0.48,
      y: anchorY
    };
  }

  return {
    x: anchorX,
    y: anchorY - pet.height * 0.35
  };
}

function getBubblePreferredTailOrder(pet, work) {
  const petCenterX = pet.x + pet.width / 2;
  const workCenterX = work.x + work.width / 2;
  const petOnRight = petCenterX > workCenterX;

  return petOnRight
    ? ["tail-right", "tail-left", "tail-bottom"]
    : ["tail-left", "tail-right", "tail-bottom"];
}

function scoreBubbleCandidate({
  candidate,
  visibleRect,
  actualTailPoint,
  target,
  pet,
  work,
  avoidRects
}) {
  let score = 0;

  const tailDistance = Math.hypot(
    actualTailPoint.x - target.x,
    actualTailPoint.y - target.y
  );

  score += tailDistance * 3.4;

  const petCenterX = pet.x + pet.width / 2;
  const workCenterX = work.x + work.width / 2;
  const petOnRight = petCenterX > workCenterX;

  if (
    (petOnRight && candidate.tail === "tail-right") ||
    (!petOnRight && candidate.tail === "tail-left")
  ) {
    score -= 36;
  }

  if (candidate.tail === "tail-bottom") {
    score += 82;
  }

  if (rectsIntersect(visibleRect, avoidRects[0])) {
    score += 1000000;
  }

  for (let index = 1; index < avoidRects.length; index++) {
    if (rectsIntersect(visibleRect, avoidRects[index])) {
      score += 430000;
    }
  }

  const faceCenter = {
    x: pet.x + pet.width * 0.5,
    y: pet.y + pet.height * 0.26
  };

  const faceDistance = Math.hypot(
    actualTailPoint.x - faceCenter.x,
    actualTailPoint.y - faceCenter.y
  );

  if (faceDistance < 56) {
    score += (56 - faceDistance) * 76;
  }

  const bubbleCenter = {
    x: visibleRect.x + visibleRect.width / 2,
    y: visibleRect.y + visibleRect.height / 2
  };

  const upperBodyCenter = {
    x: pet.x + pet.width / 2,
    y: pet.y + pet.height * 0.32
  };

  const bodyDistance = Math.hypot(
    bubbleCenter.x - upperBodyCenter.x,
    bubbleCenter.y - upperBodyCenter.y
  );

  const comfortableDistance = clampNumber(
  pet.width * 1.15,
  105,
  175
);

if (bodyDistance > comfortableDistance) {
  score += (bodyDistance - comfortableDistance) * 15;
}
  if (candidate.tail !== "tail-bottom") {
    const idealY = pet.y + pet.height * 0.06;
    score += Math.abs(visibleRect.y - idealY) * 0.62;
  }

  if (tailDistance > 24) {
  score += (tailDistance - 24) * 58;
}

if (tailDistance > 80) {
  score += (tailDistance - 80) * 180;
}

  if (
    visibleRect.x < work.x ||
    visibleRect.y < work.y ||
    visibleRect.x + visibleRect.width > work.x + work.width ||
    visibleRect.y + visibleRect.height > work.y + work.height
  ) {
    score += 50000;
  }

  return score;
}

function clampRectToWorkArea(rect, work) {
  let x = rect.x;
  let y = rect.y;

  x = Math.max(work.x + 10, x);
  y = Math.max(work.y + 10, y);

  x = Math.min(
    x,
    work.x + work.width - rect.width - 10
  );

  y = Math.min(
    y,
    work.y + work.height - rect.height - 10
  );

  return {
    x,
    y,
    width: rect.width,
    height: rect.height
  };
}

function rectsIntersect(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function expandRect(rect, padding) {
  const value = Number(padding || 0);

  return {
    x: rect.x - value,
    y: rect.y - value,
    width: rect.width + value * 2,
    height: rect.height + value * 2
  };
}

module.exports = {
  DEFAULT_BUBBLE_SIZE,
  bubbleState,
  calcSideRect,
  calcStackedRectNear,
  createBubbleCandidate,
  getSafeBubbleLayout,
  estimateBubbleTailPoint,
  getVisibleBubbleRect,
  getPetVisualRect,
  getPetAvoidRect,
  getPetBubbleAnchorRect,
  getBubbleTailTarget,
  getBubblePreferredTailOrder,
  scoreBubbleCandidate,
  clampRectToWorkArea,
  rectsIntersect,
  expandRect
};
