"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildHomeSnapshot, getHomeBounds } = require("./home.js");

test("Home DTO whitelists nested data and never serializes AI configuration", () => {
  const secret = "must-never-cross-the-home-bridge";
  const snapshot = buildHomeSnapshot({
    settings: {
      ai: {
        apiKey: secret,
        apiKeyEncrypted: secret,
        systemPrompt: secret,
        character: { name: "白希", personality: secret },
        memories: [{ id: "m1", type: "like", text: "喜欢音乐", debug: secret }]
      },
      chatHistory: [{ text: secret }],
      events: [{ id: "e1", summary: "一起聊天", at: 10, rawCapture: secret }],
      diaries: [{ dateKey: "2026-09-10", text: "今天很开心", internal: secret }]
    },
    mood: { value: 3, label: "甜甜的", private: secret },
    affection: { score: 35, milestones: [{ title: "熟悉", private: secret }] },
    checkin: { today: "2026-09-10", private: secret },
    modelFileUrl: "file:///C:/models/white.model3.json",
    generatedAt: 123
  });
  assert.equal(JSON.stringify(snapshot).includes(secret), false);
  assert.equal(snapshot.character.name, "白希");
  assert.equal(snapshot.model.fileUrl, "file:///C:/models/white.model3.json");
  assert.equal(snapshot.generatedAt, 123);
  assert.deepEqual(Object.keys(snapshot.memories[0]), ["id", "type", "text", "pinned", "lastSeenAt"]);
});

test("reads old and malformed records without fabricating memories or mutating settings", () => {
  const memories = Object.freeze([
    Object.freeze({ id: "recent", text: "最近的事", lastSeenAt: 20 }),
    "旧版记忆",
    null,
    Object.freeze({ id: "pinned", text: "重要的事", pinned: true, lastSeenAt: 1 })
  ]);
  const settings = Object.freeze({ ai: Object.freeze({ memories }), events: null, diaries: [null, {}] });
  const snapshot = buildHomeSnapshot({ settings });
  assert.deepEqual(snapshot.memories.map((entry) => entry.id), ["pinned", "recent", ""]);
  assert.equal(snapshot.memories[2].lastSeenAt, 0);
  assert.equal(memories[0].id, "recent");
  assert.deepEqual(snapshot.events, []);
  assert.deepEqual(snapshot.diaries, []);
  snapshot.memories[0].text = "display-only edit";
  assert.equal(memories[3].text, "重要的事");
  assert.deepEqual(buildHomeSnapshot(null).memories, []);
});

test("bounds hostile display values and rejects remote model URLs", () => {
  const snapshot = buildHomeSnapshot({
    settings: { ai: { memories: [{ text: "x".repeat(1000) }] } },
    mood: { value: Infinity, baseline: -100, energy: 999 },
    affection: { score: -5 },
    checkin: { today: "invalid", streak: NaN },
    modelFileUrl: "https://example.com/remote.model3.json"
  });
  assert.equal(snapshot.mood.value, 0);
  assert.equal(snapshot.mood.baseline, -10);
  assert.equal(snapshot.mood.energy, 10);
  assert.equal(snapshot.affection.score, 0);
  assert.equal(snapshot.checkin.streak, 0);
  assert.equal(snapshot.checkin.today, "");
  assert.equal(snapshot.memories[0].text.length, 160);
  assert.equal(snapshot.model.fileUrl, "");
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test("life records remain newest first and long histories have a bounded payload", () => {
  const snapshot = buildHomeSnapshot({ settings: {
    events: Array.from({ length: 300 }, (_, i) => ({ id: String(i), summary: "事件", at: i })),
    storySummaries: [{ summary: "早", at: 1 }, { summary: "晚", at: 2 }],
    diaries: [{ dateKey: "2026-09-09", text: "昨天" }, { dateKey: "2026-09-10", text: "今天" }]
  } });
  assert.equal(snapshot.events.length, 120);
  assert.equal(snapshot.events[0].id, "299");
  assert.equal(snapshot.summaries[0].summary, "晚");
  assert.equal(snapshot.diaries[0].text, "今天");
});

test("Home fits small displays and monitors with negative origins", () => {
  const small = getHomeBounds({ x: -640, y: -400, width: 640, height: 400 });
  assert.deepEqual(small, { width: 640, height: 400, minWidth: 640, minHeight: 400, x: -640, y: -400 });
  const large = getHomeBounds({ x: -1920, y: 0, width: 1920, height: 1080 });
  assert.equal(large.width, 1180);
  assert.equal(large.height, 800);
  assert.ok(large.x >= -1920 && large.x + large.width <= 0);
  assert.ok(large.y >= 0 && large.y + large.height <= 1080);
});
