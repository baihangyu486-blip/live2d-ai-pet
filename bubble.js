const bubble = document.getElementById("bubble");

let currentTail = "tail-right";
let layoutTimer = null;

window.petAPI.onBubbleText((payload) => {
  const text = cleanBubbleText(payload?.text || "");
  const tail = normalizeTail(payload?.tail);
  const zoom = clampZoom(Number(payload?.scale) || 1);

  if (!text) {
    bubble.classList.remove("show");
    return;
  }

  document.getElementById("bubble-area").style.zoom = String(zoom);

  currentTail = tail;
  setTail(currentTail);

  bubble.textContent = trimBubbleText(text);

  requestAnimationFrame(() => {
    bubble.classList.add("show");
    scheduleLayoutReport();
  });
});

window.petAPI.onBubbleTail((payload) => {
  currentTail = normalizeTail(payload?.tail);
  setTail(currentTail);
  scheduleLayoutReport();
});

function normalizeTail(tail) {
  if (
    tail === "tail-left" ||
    tail === "tail-right" ||
    tail === "tail-bottom"
  ) {
    return tail;
  }

  return "tail-right";
}

function setTail(tail) {
  bubble.classList.remove(
    "tail-left",
    "tail-right",
    "tail-bottom"
  );

  bubble.classList.add(normalizeTail(tail));
}

/*
  气泡的粉白主体是随文字长度变化的，
  透明 Electron 窗口却是固定大小。

  因此不能把固定窗口 330 × 170 当成气泡尺寸。
  此函数读取 #bubble 的真实屏幕内位置，
  并计算 CSS 小尾巴的尖端坐标，回传主进程。
*/
function scheduleLayoutReport() {
  clearTimeout(layoutTimer);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      layoutTimer = setTimeout(reportBubbleLayout, 20);
    });
  });
}

function reportBubbleLayout() {
  if (
    !bubble ||
    !bubble.classList.contains("show") ||
    !window.petAPI?.reportBubbleLayout
  ) {
    return;
  }

  const rect = bubble.getBoundingClientRect();

  if (!rect.width || !rect.height) {
    return;
  }

  const tailPoint = getTailPoint(rect, currentTail);

  window.petAPI.reportBubbleLayout({
    tail: currentTail,

    /*
      实际粉白气泡主体相对于透明窗口左上角的位置。
    */
    bubble: {
      x: round(rect.left),
      y: round(rect.top),
      width: round(rect.width),
      height: round(rect.height)
    },

    /*
      小尾巴尖端相对于透明窗口左上角的位置。
      main.js 会让此点指向人物头部/脸部附近。
    */
    tailPoint: {
      x: round(tailPoint.x),
      y: round(tailPoint.y)
    }
  });
}

function getTailPoint(rect, tail) {
  /*
    CSS 中小尾巴是 14px 正方形旋转 45°，
    旋转后最外侧尖端约比气泡边缘多伸出 10px。

    侧边尾巴：
    bottom: 28px；
    尾巴中心大致在气泡底部向上 35px 的位置。

    底部尾巴：
    在气泡底部中心，下方约伸出 10px。
  */
  const tailOutset = 10;
  const sideTailY = rect.bottom - 35;

  if (tail === "tail-left") {
    return {
      x: rect.left - tailOutset,
      y: sideTailY
    };
  }

  if (tail === "tail-bottom") {
    return {
      x: rect.left + rect.width / 2,
      y: rect.bottom + tailOutset
    };
  }

  return {
    x: rect.right + tailOutset,
    y: sideTailY
  };
}

function cleanBubbleText(text) {
  let value = String(text || "").trim();

  /*
    清理常见开头动作、旁白、内心描述。
    主进程也会处理一次；此处作为桌面气泡的第二层保护。
  */
  value = value.replace(
    /^\s*[（(][^（）()]{0,120}[）)]\s*/g,
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

  value = value.replace(
    /^(白希|她|少女)?\s*(轻声|小声|害羞地|认真地|温柔地|笑着|鼓起脸颊|扭过头去|眨了眨眼|低下头)?\s*(说|说道|开口|嘀咕)[:：]\s*/g,
    ""
  );

  value = value
    .replace(/^\s*(内心|旁白)[:：].*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  return value;
}

function trimBubbleText(text) {
  const value = String(text || "").trim();

  if (value.length <= 90) {
    return value;
  }

  return `${value.slice(0, 90)}...`;
}

function round(value) {
  return Math.round(Number(value) || 0);
}

function clampZoom(value) {
  const zoom = Number(value) || 1;

  return Math.max(0.72, Math.min(1.55, zoom));
}
