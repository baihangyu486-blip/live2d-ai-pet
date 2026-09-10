"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "src/renderer/home-stage.js"), "utf8");
const settle = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(runtimeReady = true) {
  const scripts = [], loads = [], apps = [], warnings = [];
  const elements = new Map();
  const events = {}, documentEvents = {};
  const reducedMotion = { matches: false, addEventListener: (_name, fn) => { events.motion = fn; } };
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      clientWidth: 500, clientHeight: 600, dataset: {}, hidden: false,
      addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0 })
    });
    return elements.get(id);
  }
  class Application {
    constructor() {
      this.children = new Set();
      this.running = false;
      this.stage = { addChild: (model) => this.children.add(model), removeChild: (model) => this.children.delete(model) };
      this.ticker = { deltaMS: 16.7, add() {} };
      this.renderer = { resize() {} };
      apps.push(this);
    }
    start() { this.running = true; }
    stop() { this.running = false; }
    render() {}
    destroy() { this.running = false; this.destroyed = true; }
  }
  const live2d = { Live2DModel: { from(target, options) { const pending = deferred(); loads.push({ target, options, ...pending }); return pending.promise; } } };
  const window = { matchMedia: () => reducedMotion, devicePixelRatio: 1, addEventListener: (name, fn) => { events[name] = fn; } };
  const document = {
    hidden: false, getElementById: element, createElement: () => ({ remove() {} }),
    head: { append: (script) => scripts.push(script) },
    addEventListener: (name, fn) => { documentEvents[name] = fn; }
  };
  const context = vm.createContext({ window, document, ResizeObserver: class { observe() {} }, console: { warn: (...args) => warnings.push(args) } });
  if (runtimeReady) {
    window.Live2DCubismCore = {};
    window.PIXI = context.PIXI = { Application, live2d };
  }
  vm.runInContext(source, context);
  function finishScript(index) {
    const script = scripts[index];
    if (script.src.includes("live2dcubismcore")) window.Live2DCubismCore = {};
    else if (script.src.includes("pixi.min")) window.PIXI = context.PIXI = { Application };
    else window.PIXI.live2d = live2d;
    script.onload();
  }
  function model(name) {
    return {
      name, anchor: { set() {} }, scale: { set() {} }, position: { set() {} },
      getLocalBounds: () => ({ width: 1000, height: 1800 }), update() {}, focus() {},
      destroy(options) { this.destroyed = true; this.destroyOptions = options; }
    };
  }
  return { api: window.homeStage, window, document, reducedMotion, documentEvents, events, elements, scripts, loads, apps, warnings, finishScript, model };
}

test("Home without a model never loads Live2D vendors or creates Pixi; chat page keeps a selected preview lazy", async () => {
  const f = fixture(false);
  f.api.setPage("room");
  f.api.load("");
  await settle();
  assert.equal(f.scripts.length, 0);
  assert.equal(f.apps.length, 0);
  f.api.setPage("home");
  f.api.load("file:///models/avatar.model3.json");
  await settle();
  assert.equal(f.scripts.length, 0);
  assert.equal(f.apps.length, 0);
});

test("disabling during lazy vendor loading cannot create a preview after initialization completes", async () => {
  const f = fixture(false);
  f.api.load("file:///models/avatar.model3.json");
  f.api.setPage("room");
  assert.equal(f.scripts.length, 1);
  f.api.load("");
  for (let index = 0; index < 3; index++) { f.finishScript(index); await settle(); }
  assert.equal(f.apps.length, 0);
  assert.equal(f.loads.length, 0);
  assert.equal(f.elements.get("home-live2d").hidden, true);
});

test("selected preview respects page visibility and reduced motion, and disable releases it", async () => {
  const f = fixture();
  f.api.load("file:///models/avatar.model3.json");
  f.api.setPage("room");
  await settle();
  const model = f.model("avatar");
  f.loads[0].resolve(model);
  await settle();
  assert.equal(f.loads[0].options.autoUpdate, false);
  assert.equal(f.apps[0].running, true);
  f.api.setPage("home");
  assert.equal(f.apps[0].running, false);
  f.api.setPage("room");
  f.api.setVisible(false);
  assert.equal(f.apps[0].running, false);
  f.api.setVisible(true);
  f.reducedMotion.matches = true;
  f.events.motion();
  assert.equal(f.apps[0].running, false);
  f.api.load("");
  assert.equal(model.destroyed, true);
  assert.notEqual(model.destroyOptions.texture, true);
  assert.equal(f.apps[0].destroyed, true);
  assert.equal(f.elements.get("home-live2d").dataset.ready, "false");
});

test("out-of-order preview loads and disabling a pending replacement cannot revive stale models", async () => {
  const f = fixture();
  f.api.setPage("room");
  f.api.load("file:///models/first.model3.json");
  await settle();
  f.api.load("file:///models/second.model3.json");
  await settle();
  const second = f.model("second");
  f.loads[1].resolve(second);
  await settle();
  const first = f.model("first");
  f.loads[0].resolve(first);
  await settle();
  assert.equal(first.destroyed, true);
  assert.deepEqual([...f.apps[0].children], [second]);
  f.api.load("file:///models/third.model3.json");
  await settle();
  f.api.load("");
  const third = f.model("third");
  f.loads[2].resolve(third);
  await settle();
  assert.equal(third.destroyed, true);
  assert.equal(f.apps[0].destroyed, true);
  assert.equal(f.elements.get("home-live2d").hidden, true);
  assert.equal(f.elements.get("model-fallback").hidden, true);
});

test("returning to a loaded preview ignores failure from an abandoned replacement", async () => {
  const f = fixture();
  const firstUrl = "file:///models/first.model3.json";
  f.api.setPage("room");
  f.api.load(firstUrl);
  await settle();
  const first = f.model("first");
  f.loads[0].resolve(first);
  await settle();
  f.api.load("file:///models/second.model3.json");
  await settle();
  f.api.load(firstUrl);
  f.loads[1].reject(new Error("Abandoned replacement failed"));
  await settle();
  assert.deepEqual([...f.apps[0].children], [first]);
  assert.equal(f.elements.get("model-fallback").hidden, true);
  assert.equal(f.warnings.length, 0);
});
