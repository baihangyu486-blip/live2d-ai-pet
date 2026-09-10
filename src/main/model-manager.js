"use strict";

const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const { app, dialog } = require("electron");
const { pathToFileURL } = require("url");
const { loadSettings, saveSettings } = require("./storage.js");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const MAX_IMPORT_BYTES = 512 * 1024 * 1024;

function getImportedModelsDir() {
  return path.join(app.getPath("userData"), "models", "imported");
}

function getDefaultModelPath() {
  return "";
}

function getCurrentModelPath() {
  const selected = loadSettings().modelPath;
  return typeof selected === "string" ? selected.trim() : "";
}

function resolveModel3File(selected) {
  if (!selected || !fs.existsSync(selected)) return null;
  const stat = fs.statSync(selected);
  if (stat.isFile() && /\.model3\.json$/i.test(selected)) return selected;
  if (!stat.isDirectory()) return null;
  const candidates = fs.readdirSync(selected).filter((name) => /\.model3\.json$/i.test(name));
  return candidates.length === 1 ? path.join(selected, candidates[0]) : null;
}

function isInside(directory, target) {
  const relative = path.relative(directory, target);
  return relative !== "" && !path.isAbsolute(relative) && relative !== ".."
    && !relative.startsWith(`..${path.sep}`);
}

function validateModel(modelFile) {
  if (!/\.model3\.json$/i.test(modelFile) || !fs.statSync(modelFile).isFile()) {
    throw new Error("请选择有效的 .model3.json 模型文件。");
  }
  if (fs.statSync(modelFile).size > 2 * 1024 * 1024) throw new Error("模型清单过大。");
  let model;
  try {
    model = JSON.parse(fs.readFileSync(modelFile, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("模型清单不是有效的 JSON 文件。");
  }
  const refs = model?.FileReferences;
  if (model?.Version !== 3 || !refs || typeof refs.Moc !== "string"
    || !Array.isArray(refs.Textures) || !refs.Textures.length) {
    throw new Error("模型需要 Version 3、Moc 和至少一张纹理。");
  }
  const references = [refs.Moc, ...refs.Textures];
  for (const key of ["Physics", "Pose", "DisplayInfo", "UserData"]) {
    if (refs[key] != null) references.push(refs[key]);
  }
  if (refs.Expressions != null) {
    if (!Array.isArray(refs.Expressions)) throw new Error("模型表情清单无效。");
    for (const expression of refs.Expressions) references.push(expression?.File);
  }
  if (refs.Motions != null) {
    if (typeof refs.Motions !== "object" || Array.isArray(refs.Motions)) throw new Error("模型动作清单无效。");
    for (const motions of Object.values(refs.Motions)) {
      if (!Array.isArray(motions)) throw new Error("模型动作清单无效。");
      for (const motion of motions) {
        references.push(motion?.File);
        if (motion?.Sound != null) references.push(motion.Sound);
      }
    }
  }
  const sourceDir = fs.realpathSync(path.dirname(modelFile));
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.isFile() && /\.exp3\.json$/i.test(entry.name)) references.push(entry.name);
  }
  let totalBytes = fs.statSync(modelFile).size;
  const files = [];
  for (const reference of new Set(references)) {
    // Live2D fetches these paths as URLs; keep filesystem and URL resolution local.
    if (typeof reference !== "string" || !reference || /[\u0000-\u001f:%?#]/.test(reference)
      || path.posix.isAbsolute(reference) || path.win32.isAbsolute(reference)
      || reference.split(/[\\/]/).includes("..")) {
      throw new Error("模型资源必须使用模型文件夹内的相对路径。");
    }
    const relative = reference.replace(/[\\/]/g, path.sep);
    const source = path.resolve(sourceDir, relative);
    if (!isInside(sourceDir, source) || !fs.existsSync(source)
      || !isInside(sourceDir, fs.realpathSync(source)) || !fs.statSync(source).isFile()) {
      throw new Error(`模型资源缺失或超出模型文件夹：${reference}`);
    }
    const size = fs.statSync(source).size;
    if (!size) throw new Error(`模型资源为空：${reference}`);
    totalBytes += size;
    if (totalBytes > MAX_IMPORT_BYTES) throw new Error("模型资源超过 512 MB，请精简后再导入。");
    files.push({ source, relative });
  }
  return { modelFile, files, model };
}

function getModelStatus() {
  const selected = getCurrentModelPath();
  if (!selected) return { path: "", fileUrl: "", name: "", status: "none", expressionFiles: [], expressions: [], motions: {} };
  const absolute = path.resolve(PROJECT_ROOT, selected);
  const name = path.basename(absolute).replace(/\.model3\.json$/i, "");
  try {
    const validated = validateModel(absolute);
    return {
      path: selected, fileUrl: pathToFileURL(absolute).href, name, status: "ready",
      expressionFiles: validated.files.filter((file) => /\.exp3\.json$/i.test(file.relative))
        .map((file) => file.relative.split(path.sep).join("/")),
      expressions: (validated.model.FileReferences.Expressions || [])
        .map((expression) => ({ name: expression.Name || "", file: expression.File })),
      motions: validated.model.FileReferences.Motions || {}
    };
  } catch {
    return { path: selected, fileUrl: "", name, status: "missing", expressionFiles: [], expressions: [], motions: {} };
  }
}

function getModelFileUrl() {
  return getModelStatus().fileUrl;
}

function activateModel(modelFile) {
  validateModel(modelFile);
  const settings = loadSettings();
  settings.modelPath = modelFile;
  settings.modelImportedAt = Date.now();
  saveSettings(settings);
  return { canceled: false, ...getModelStatus() };
}

async function importLive2dModel() {
  const result = await dialog.showOpenDialog({
    title: "选择 Live2D 模型文件",
    properties: ["openFile"],
    filters: [{ name: "Live2D 模型（.model3.json）", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePaths?.length) return { canceled: true };
  const modelFile = resolveModel3File(result.filePaths[0]);
  if (!modelFile) throw new Error("请选择 .model3.json，或只包含一个模型清单的文件夹。");
  const validated = validateModel(modelFile);
  const name = path.basename(modelFile).replace(/\.model3\.json$/i, "")
    .replace(/[^\w\u4e00-\u9fff-]+/g, "_").slice(0, 40) || "model";
  const importedRoot = getImportedModelsDir();
  const importDir = path.join(importedRoot, `${Date.now()}_${name}_${randomUUID().slice(0, 8)}`);
  const importedFile = path.join(importDir, path.basename(modelFile));
  try {
    fs.mkdirSync(importDir, { recursive: true });
    fs.copyFileSync(modelFile, importedFile);
    for (const file of validated.files) {
      const target = path.join(importDir, file.relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(file.source, target);
    }
    return { ...activateModel(importedFile), dir: importDir };
  } catch (error) {
    // Only remove the fresh import created by this call; the source stays untouched.
    if (isInside(path.resolve(importedRoot), path.resolve(importDir))) {
      fs.rmSync(importDir, { recursive: true, force: true });
    }
    throw error;
  }
}

function disableLive2dModel() {
  const settings = loadSettings();
  settings.modelPath = "";
  settings.modelImportedAt = 0;
  saveSettings(settings);
  return getModelStatus();
}

function listImportedModels() {
  const root = getImportedModelsDir();
  if (!fs.existsSync(root)) return [];
  const activePath = getCurrentModelPath();
  return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      try {
        const modelFile = resolveModel3File(path.join(root, entry.name));
        if (!modelFile) return [];
        validateModel(modelFile);
        return [{
          name: path.basename(modelFile).replace(/\.model3\.json$/i, ""),
          path: modelFile,
          active: Boolean(activePath) && path.resolve(PROJECT_ROOT, activePath) === path.resolve(modelFile)
        }];
      } catch { return []; }
    });
}

function selectLive2dModel(selected) {
  if (typeof selected !== "string") throw new Error("请选择已导入的模型。");
  const match = listImportedModels().find((model) => model.path === selected);
  if (!match) throw new Error("这个模型不在已导入列表中，请重新导入。");
  return activateModel(match.path);
}

module.exports = {
  getImportedModelsDir,
  getDefaultModelPath,
  getCurrentModelPath,
  getModelStatus,
  getModelFileUrl,
  importLive2dModel,
  disableLive2dModel,
  resetLive2dModel: disableLive2dModel,
  selectLive2dModel,
  listImportedModels
};
