const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function freezeTree(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeTree);
    Object.freeze(value);
  }
  return value;
}

const config = freezeTree({
  baseUrl: "https://chat.example.test/v1",
  model: "chat-test",
  apiKey: "FAKE_CHAT_KEY_NOT_REAL",
  apiKeyEncrypted: "FAKE_CHAT_CIPHERTEXT_NOT_REAL",
  stt: {
    baseUrl: "https://listen.example.test/v1",
    model: "transcribe-test",
    apiKey: "FAKE_STT_KEY_NOT_REAL",
    apiKeyEncrypted: "FAKE_STT_CIPHERTEXT_NOT_REAL"
  },
  tts: {
    enabled: true,
    provider: "openai",
    baseUrl: "http://127.0.0.1:9000",
    edgeVoice: "zh-CN-XiaoxiaoNeural",
    openai: {
      baseUrl: "https://voice.example.test/v1",
      apiKey: "FAKE_TTS_KEY_NOT_REAL",
      apiKeyEncrypted: "FAKE_TTS_CIPHERTEXT_NOT_REAL",
      model: "tts-test",
      voice: "alloy",
      responseFormat: "mp3",
      speed: 1.2
    }
  },
  providerProfiles: [{ name: "Custom", apiKey: "FAKE_PROFILE_KEY_NOT_REAL", apiKeyEncrypted: "FAKE_PROFILE_CIPHERTEXT_NOT_REAL" }],
  character: { name: "白希" },
  memories: [{ text: "喜欢听音乐", tags: ["日常"], extra: null }]
});
const original = JSON.stringify(config);

// Read only the module's source. Electron, storage and application I/O are never loaded.
const denyIo = () => { throw new Error("Configuration export test must not access application data."); };
const forbiddenDependency = new Proxy({}, { get: () => denyIo });
const dependencies = {
  path,
  fs: forbiddenDependency,
  electron: { dialog: forbiddenDependency },
  "./storage.js": forbiddenDependency,
  "./utils.js": {},
  "./memory.js": {},
  "./sticker.js": {}
};
const context = vm.createContext({
  module: { exports: {} },
  fixture: config,
  require(name) {
    if (!Object.hasOwn(dependencies, name)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }
});
const filename = path.join(__dirname, "../src/main/ai-config.js");
vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
vm.runInContext("getAiConfig = () => fixture;", context);
const exported = context.module.exports.getExportableAiConfig();

assert.equal(exported.apiKey, "");
assert.equal(exported.stt.apiKey, "");
assert.equal(exported.tts.openai.apiKey, "", "TTS credentials must not be exported");
assert.equal(exported.providerProfiles[0].apiKey, "", "Nested provider credentials must not be exported");
const serialized = JSON.stringify(exported);
assert.equal(serialized.includes("FAKE_"), false, "Plaintext and encrypted credential copies must be removed");
assert.equal(serialized.includes("apiKeyEncrypted"), false, "Encrypted credential fields must be omitted");

const expected = JSON.parse(original);
for (const provider of [expected, expected.stt, expected.tts.openai, expected.providerProfiles[0]]) {
  provider.apiKey = "";
  delete provider.apiKeyEncrypted;
}
assert.deepEqual(JSON.parse(serialized), expected, "Voice, endpoint and other noncredential settings must be preserved");
assert.equal(JSON.stringify(config), original, "Export must not modify its source config");
exported.tts.openai.voice = "different-voice";
assert.equal(config.tts.openai.voice, "alloy", "Exported nested settings must be independent copies");

context.fixture = freezeTree({ baseUrl: "", apiKey: "", stt: {}, tts: { openai: {} } });
const emptyExport = context.module.exports.getExportableAiConfig();
assert.equal(emptyExport.apiKey, "");
assert.deepEqual(JSON.parse(JSON.stringify(emptyExport)), context.fixture, "Empty optional settings must remain usable");
console.log("PASS: config export strips plaintext/encrypted credentials, preserves settings and never mutates source data.");
