"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "..", "chat.js"), "utf8");

function createChat() {
  const element = () => ({
    className: "",
    dataset: {},
    children: [],
    classList: { add() {} },
    appendChild(child) { this.children.push(child); }
  });
  const messages = element();
  const context = vm.createContext({
    messages,
    document: { createElement: element },
    cleanDisplayText: value => String(value || ""),
    normalizeHistoryContent: value => String(value || ""),
    formatChatTime: value => String(value),
    createMessageId: () => "generated-id",
    appendMessageMeta() {},
    bindMessageContextMenu() {},
    applyScrollBehavior() {},
    setCompanionLabel(node, prefix, suffix) { node.textContent = prefix + "伙伴" + suffix; }
  });
  vm.runInContext("let lastRenderedRole = ''; let lastRenderedAt = 0; const messageDetails = { showTimestamp: true };", context);
  for (const name of [
    "renderHistoryItem", "renderUserHistory", "renderAiParts", "appendTextMessage",
    "appendSystemMessage", "appendReasoningMessage", "appendTimeMessage",
    "maybeAppendTimeDivider", "createMessageRow", "appendRow"
  ]) {
    const match = source.match(new RegExp("(?:async )?function " + name + "\\([^]*?^}", "m"));
    assert.ok(match, `${name} is available`);
    vm.runInContext(match[0], context);
  }
  return {
    context,
    messages,
    render(item) { context.renderHistoryItem(item); },
    dividers() {
      return messages.children.flatMap(row => row.children)
        .filter(node => node.className === "time-message")
        .map(node => node.textContent);
    }
  };
}

const firstTime = new Date("2024-04-02T08:50:00Z").getTime();

test("continuous history has one divider and preserves saved message times", () => {
  const chat = createChat();
  chat.render({ id: "one", role: "user", content: "你好", createdAt: firstTime });
  chat.render({ id: "two", role: "assistant", content: "你来啦", createdAt: firstTime + 1000 });
  assert.deepEqual(chat.dividers(), [String(firstTime)]);
  const userRow = chat.messages.children.find(row => row.dataset.role === "user");
  assert.equal(userRow.dataset.createdAt, String(firstTime));
});

test("an eight-minute gap starts one new divider", () => {
  const chat = createChat();
  chat.render({ role: "user", content: "上午好", createdAt: firstTime });
  chat.render({ role: "assistant", content: "还在呢", createdAt: firstTime + 9 * 60000 });
  assert.deepEqual(chat.dividers(), [String(firstTime), String(firstTime + 9 * 60000)]);
});

test("recalled history and recalled parts retain their original timeline", () => {
  const chat = createChat();
  chat.render({ role: "user", recalled: true, createdAt: firstTime });
  chat.render({ role: "assistant", parts: [{ recalled: true }], createdAt: firstTime + 1000 });
  chat.render({ role: "user", content: "重新说", createdAt: firstTime + 2000 });
  assert.deepEqual(chat.dividers(), [String(firstTime)]);
  const recalledRows = chat.messages.children.filter(row => row.dataset.role === "system");
  assert.deepEqual(recalledRows.map(row => row.dataset.createdAt), [String(firstTime), String(firstTime + 1000)]);
});

test("reasoning and its answer share one divider, and empty messages add none", () => {
  const chat = createChat();
  chat.render({ role: "user", content: "", createdAt: firstTime - 60000 });
  chat.render({ role: "assistant", reasoning: "想一想", content: "答案", createdAt: firstTime });
  assert.deepEqual(chat.dividers(), [String(firstTime)]);
});
