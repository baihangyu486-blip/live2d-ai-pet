"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "renderer.js"), "utf8");

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture() {
  const elements = new Map();
  const events = {};
  const loads = [];
  const fetches = [];
  const apps = [];
  const notices = [];
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        style: {}, addEventListener() {},
        classList: { add: (...names) => names.forEach((name) => classes.add(name)), remove: (...names) => names.forEach((name) => classes.delete(name)), toggle(name, on) { on ? classes.add(name) : classes.delete(name); } }
      });
    }
    return elements.get(id);
  }
  class Application {
    constructor(options) {
      this.options = options;
      this.running = false;
      this.children = new Set();
      this.ticks = new Set();
      this.stage = { addChild: (model) => this.children.add(model), removeChild: (model) => this.children.delete(model) };
      this.ticker = { deltaMS: 16.7, add: (fn) => this.ticks.add(fn), remove: (fn) => this.ticks.delete(fn) };
      apps.push(this);
    }
    start() { this.running = true; }
    stop() { this.running = false; }
  }
  const context = vm.createContext({
    document: { getElementById: element, body: element("body") },
    window: {
      innerWidth: 430, innerHeight: 700, devicePixelRatio: 1, Live2DCubismCore: {}, addEventListener() {},
      petAPI: {
        onInitSettings: (fn) => { events.init = fn; }, onPetCommand: (fn) => { events.command = fn; }, onCursorScreenPoint() {},
        sendModelInfo: (info) => notices.push(info), reportPetVisualBounds() {}, saveVisualState() {}, sendVisualState() {}
      }
    },
    PIXI: {
      Application, settings: {}, SCALE_MODES: { LINEAR: 1 },
      live2d: { Live2DModel: { from(target, options) { const pending = deferred(); loads.push({ target, options, ...pending }); return pending.promise; } } }
    },
    fetch(url) { const pending = deferred(); fetches.push({ url, ...pending }); return pending.promise; },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame() {}, performance: { now: () => 1 },
    console: { log() {}, warn() {}, error() {} }, Math: Object.assign(Object.create(Math), { random: () => 0 })
  });
  vm.runInContext(source, context);
  function model(name) {
    const parameters = [];
    return {
      name, parameters, scale: { set() {} }, anchor: { set() {} },
      internalModel: { settings: { expressions: [], motions: {} }, coreModel: { getParameterValueById: () => 0, setParameterValueById: (id, value) => parameters.push([id, value]) } },
      getBounds: () => ({ x: 50, y: 80, width: 300, height: 600 }),
      update() {},
      destroy(options) { this.destroyed = true; this.destroyOptions = options; }
    };
  }
  return { events, loads, fetches, apps, elements, model, notices };
}

test("no model selection creates no Pixi application, requests no assets and hides pet controls", async () => {
  const f = fixture();
  assert.equal(f.loads.length, 0, "no renderer bootstrap fallback");
  await f.events.init({ modelFileUrl: "", expressionFiles: [] });
  assert.equal(f.apps.length, 0);
  assert.equal(f.fetches.length, 0);
  assert.equal(f.elements.get("panel-button").style.display, "none");
});

test("explicit model initializes once and disabling disposes the model and stops its ticker", async () => {
  const f = fixture();
  const ready = f.events.init({ modelFileUrl: "file:///models/chosen.model3.json", expressionFiles: [] });
  assert.equal(f.loads[0].target, "file:///models/chosen.model3.json");
  assert.equal(f.loads[0].options.autoUpdate, false);
  const model = f.model("chosen");
  f.loads[0].resolve(model);
  await ready;
  assert.equal(f.apps[0].children.has(model), true);
  assert.equal(f.apps[0].running, true);
  assert.equal(f.apps[0].ticks.size, 3);
  await f.events.command({ type: "model-imported", path: "", expressionFiles: [] });
  assert.equal(model.destroyed, true);
  assert.equal(model.destroyOptions.texture, false);
  assert.equal(model.destroyOptions.baseTexture, false);
  assert.equal(f.apps[0].children.size, 0);
  assert.equal(f.apps[0].running, false);
  assert.equal(f.apps[0].ticks.size, 0);
});

test("disabling during a load cannot revive the old model", async () => {
  const f = fixture();
  const loading = f.events.init({ modelFileUrl: "file:///models/slow.model3.json" });
  await f.events.command({ type: "model-imported", path: "" });
  const stale = f.model("slow");
  f.loads[0].resolve(stale);
  await loading;
  assert.equal(stale.destroyed, true);
  assert.equal(f.apps[0].children.size, 0);
  assert.equal(f.apps[0].running, false);
  assert.equal(f.elements.get("model-load-error").style.display, "none");
});

test("out-of-order model loads retain only the newest selected model", async () => {
  const f = fixture();
  const first = f.events.init({ modelFileUrl: "file:///models/first.model3.json" });
  const second = f.events.command({ type: "model-imported", path: "file:///models/second.model3.json" });
  const winner = f.model("second");
  f.loads[1].resolve(winner);
  await second;
  const stale = f.model("first");
  f.loads[0].resolve(stale);
  await first;
  assert.equal(stale.destroyed, true);
  assert.equal(winner.destroyed, undefined);
  assert.deepEqual([...f.apps[0].children], [winner]);
  assert.equal(f.apps[0].ticks.size, 3);
});

test("generic models skip unavailable character expressions and old outfit settings", async () => {
  const f = fixture();
  const ready = f.events.init({
    modelFileUrl: "file:///models/generic.model3.json", expressionFiles: [],
    visualState: { poseFile: "跪姿.exp3.json", lookFiles: ["短发.exp3.json"] }
  });
  f.loads[0].resolve(f.model("generic"));
  await ready;
  await f.events.command({ type: "ai-emotion", emotion: "love" });
  await f.events.command({ type: "toggle-expression", fileName: "比心.exp3.json", groupType: "face", enabled: true });
  await f.events.command({ type: "pet-interaction-reaction", expression: "未知.exp3.json", motion: "missing", emotion: "happy" });
  assert.equal(f.fetches.length, 0);
});

test("available expressions still work and an old expression response cannot alter a replacement model", async () => {
  const f = fixture();
  const ready = f.events.init({ modelFileUrl: "file:///models/first.model3.json", expressionFiles: ["比心.exp3.json"] });
  const original = f.model("first");
  f.loads[0].resolve(original);
  await ready;
  const expression = f.events.command({ type: "toggle-expression", fileName: "比心.exp3.json", groupType: "face", enabled: true });
  assert.equal(f.fetches[0].url, "file:///models/比心.exp3.json");
  f.fetches[0].resolve({ ok: true, json: async () => ({ Parameters: [{ Id: "ParamSmile", Value: 1, Blend: "Overwrite" }] }) });
  await expression;
  assert.equal(original.parameters.some(([id, value]) => id === "ParamSmile" && value === 1), true);
  const pending = f.events.command({ type: "toggle-expression", fileName: "比心.exp3.json", groupType: "face", enabled: false });
  const replace = f.events.command({ type: "model-imported", path: "file:///models/new.model3.json", expressionFiles: [] });
  const next = f.model("new");
  f.loads[1].resolve(next);
  await replace;
  f.fetches[1].resolve({ ok: true, json: async () => ({ Parameters: [{ Id: "ParamSmile", Value: 1 }] }) });
  await pending;
  assert.equal(next.parameters.length, 0);
});
