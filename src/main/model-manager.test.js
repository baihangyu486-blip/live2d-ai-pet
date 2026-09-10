"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");

const projectRoot = path.resolve(__dirname, "..", "..");
const scratch = path.join(projectRoot, "work");
fs.mkdirSync(scratch, { recursive: true });

function fixture(t, settings = {}) {
  const directory = fs.mkdtempSync(path.join(scratch, "model-manager-test-"));
  const userData = path.join(directory, "isolated-user-data");
  let dialogResult = { canceled: true, filePaths: [] };
  let writes = 0;
  const context = vm.createContext({
    require(request) {
      if (request === "electron") return {
        app: { getPath: (key) => { assert.equal(key, "userData"); return userData; } },
        dialog: { showOpenDialog: async () => dialogResult }
      };
      if (request === "./storage.js") return {
        loadSettings: () => settings,
        saveSettings: (next) => { settings = next; writes++; }
      };
      return require(request);
    },
    module: { exports: {} }, __dirname
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "model-manager.js"), "utf8"), context);
  t.after(() => {
    const relative = path.relative(path.resolve(scratch), path.resolve(directory));
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  function model(name = "avatar", overrides = {}) {
    const folder = path.join(directory, name);
    fs.mkdirSync(path.join(folder, "textures"), { recursive: true });
    fs.writeFileSync(path.join(folder, "avatar.moc3"), "fixture-moc");
    fs.writeFileSync(path.join(folder, "textures", "avatar.png"), "fixture-texture");
    fs.writeFileSync(path.join(folder, "smile.exp3.json"), '{"Type":"Live2D Expression","Parameters":[]}');
    const file = path.join(folder, `${name}.model3.json`);
    fs.writeFileSync(file, JSON.stringify({
      Version: 3,
      FileReferences: { Moc: "avatar.moc3", Textures: ["textures/avatar.png"], ...overrides }
    }));
    return file;
  }
  return {
    api: context.module.exports, directory, userData, settings, model,
    select: (file) => { dialogResult = { canceled: false, filePaths: [file] }; },
    writes: () => writes
  };
}

test("new installation has no mandatory model and performs no storage write", (t) => {
  const f = fixture(t, { ai: { character: { name: "保留角色" } } });
  assert.equal(f.api.getDefaultModelPath(), "");
  assert.equal(f.api.getCurrentModelPath(), "");
  assert.equal(f.api.getModelFileUrl(), "");
  assert.equal(f.api.getModelStatus().status, "none");
  assert.equal(f.api.listImportedModels().length, 0);
  assert.equal(f.writes(), 0);
  assert.equal(fs.existsSync(f.userData), false);
});

test("explicit existing selection remains active; missing resources never load a fallback", (t) => {
  const f = fixture(t);
  const model = f.model();
  f.settings.modelPath = model;
  assert.equal(f.api.getModelFileUrl(), pathToFileURL(model).href);
  assert.equal(f.api.getModelStatus().status, "ready");
  assert.equal(f.api.getModelStatus().expressionFiles[0], "smile.exp3.json");
  fs.unlinkSync(path.join(path.dirname(model), "avatar.moc3"));
  assert.equal(f.api.getCurrentModelPath(), model);
  assert.equal(f.api.getModelStatus().status, "missing");
  assert.equal(f.api.getModelFileUrl(), "");
  assert.equal(f.writes(), 0);
});

test("disabling only clears model selection and keeps character, history and source assets", (t) => {
  const f = fixture(t, { ai: { character: { name: "用户角色" } }, chatHistory: [{ text: "记住我" }] });
  const model = f.model();
  f.settings.modelPath = model;
  assert.equal(f.api.resetLive2dModel().status, "none");
  assert.equal(f.api.getModelFileUrl(), "");
  assert.equal(f.settings.ai.character.name, "用户角色");
  assert.equal(f.settings.chatHistory[0].text, "记住我");
  assert.equal(fs.existsSync(model), true);
  assert.equal(f.writes(), 1);
});

test("canceling import keeps the selection and creates no import directory", async (t) => {
  const f = fixture(t, { modelPath: "keep-this-choice.model3.json" });
  assert.equal((await f.api.importLive2dModel()).canceled, true);
  assert.equal(f.settings.modelPath, "keep-this-choice.model3.json");
  assert.equal(f.writes(), 0);
  assert.equal(fs.existsSync(f.userData), false);
});

test("import activates a contained model, preserves expressions, and only catalog models can be selected", async (t) => {
  const f = fixture(t);
  const source = f.model();
  fs.writeFileSync(path.join(path.dirname(source), "private-notes.txt"), "not a model asset");
  f.select(source);
  const imported = await f.api.importLive2dModel();
  assert.equal(imported.status, "ready");
  assert.notEqual(imported.path, source);
  assert.equal(fs.existsSync(path.join(imported.dir, "textures", "avatar.png")), true);
  assert.equal(fs.existsSync(path.join(imported.dir, "smile.exp3.json")), true);
  assert.equal(fs.existsSync(path.join(imported.dir, "private-notes.txt")), false);
  assert.equal(f.api.listImportedModels()[0].active, true);
  f.api.disableLive2dModel();
  assert.equal(f.api.listImportedModels()[0].active, false);
  assert.equal(f.api.selectLive2dModel(imported.path).status, "ready");
  assert.throws(() => f.api.selectLive2dModel(source), /不在已导入列表/);
  assert.equal(fs.existsSync(source), true);
});

test("invalid manifests and remote or escaping resource references cannot alter the selected model", async (t) => {
  const f = fixture(t, { modelPath: "original.model3.json" });
  for (const [index, reference] of ["../outside.moc3", "https://example.com/a.moc3", "file:///C:/a.moc3", "C:\\a.moc3", "%2e%2e/a.moc3", "missing.moc3"].entries()) {
    f.select(f.model(`invalid-${index}`, { Moc: reference }));
    await assert.rejects(f.api.importLive2dModel());
  }
  const malformed = path.join(f.directory, "bad.model3.json");
  fs.writeFileSync(malformed, "{}");
  f.select(malformed);
  await assert.rejects(f.api.importLive2dModel(), /Version 3/);
  assert.equal(f.settings.modelPath, "original.model3.json");
  assert.equal(f.writes(), 0);
  assert.equal(fs.existsSync(f.userData), false);
});
