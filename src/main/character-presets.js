/*
  character-presets.js —— 角色卡应用

  一键切换整套人设：角色设定 + 系统提示词 + 对话预设模板。
  也支持把当前自定义配置"另存为"新角色卡。
*/

const {
  getDefaultCharacterPresets,
  normalizeCharacterPresets
} = require("./ai-config.js");

function applyCharacterPreset(ai, presetId) {
  const presets = normalizeCharacterPresets(ai?.characterPresets);
  const preset = presets.find((item) => item.id === presetId);

  if (!preset) {
    return null;
  }

  const template = preset.promptTemplate
    ? {
        ...preset.promptTemplate,
        id: `${preset.id}_tpl`,
        name: preset.promptTemplate.name || preset.name
      }
    : null;

  return {
    ...ai,
    character: {
      ...(preset.character || {})
    },
    systemPrompt: preset.systemPrompt ||
      ai?.systemPrompt ||
      "",
    promptTemplates: template
      ? [template, ...(Array.isArray(ai?.promptTemplates) ? ai.promptTemplates : [])]
      : ai?.promptTemplates,
    activePromptTemplateId: template
      ? template.id
      : ai?.activePromptTemplateId || "",
    activePresetId: preset.id
  };
}

function createPresetFromCurrent(ai, name, description = "") {
  const presets = normalizeCharacterPresets(ai?.characterPresets);
  const id =
    `custom_${Date.now().toString(36)}`;
  const template = Array.isArray(ai?.promptTemplates)
    ? ai.promptTemplates.find(
        (item) => item?.id === ai.activePromptTemplateId
      ) || ai.promptTemplates[0] || null
    : null;

  const preset = {
    id,
    name: String(name || "自定义角色").trim(),
    description: String(description || "").trim(),
    character: ai?.character || {},
    systemPrompt: ai?.systemPrompt || "",
    promptTemplate: template
      ? {
          id: template.id,
          name: template.name || "自定义模板",
          prompt: template.prompt || ""
        }
      : null
  };

  return {
    preset,
    presets: [...presets, preset]
  };
}

function getBuiltinPresetIds() {
  return getDefaultCharacterPresets().map((item) => item.id);
}

module.exports = {
  applyCharacterPreset,
  createPresetFromCurrent,
  getBuiltinPresetIds
};
