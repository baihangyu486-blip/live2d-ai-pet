const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '..');
const windows = [];
const invokes = new Map();
const app = new EventEmitter();
let ready;
let tray;
let writeCount = 0;
let selectedModelUrl = '';
const settings = {
  ai: { character: { name: '白希', personality: 'private-personality' }, apiKey: 'private-api-key', messageDetails: { showFloor: true } },
  panelPinned: true, chatPinned: true
};
const modelStatus = () => ({ path: selectedModelUrl ? 'models/a.model3.json' : '', fileUrl: selectedModelUrl, status: selectedModelUrl ? 'ready' : 'none', name: selectedModelUrl ? 'a' : '', expressionFiles: [] });
Object.assign(app, { isPackaged: false, isReady: () => true, requestSingleInstanceLock: () => true, whenReady: () => ({ then(fn) { ready = fn; } }), quit() { app.emit('before-quit'); } });
class BrowserWindow extends EventEmitter {
  constructor(options) { super(); this.options = options; this.visible = options.show !== false; this.minimized = false; this.webContents = new EventEmitter(); this.sent = []; this.webContents.send = (...args) => this.sent.push(args); this.webContents.setWindowOpenHandler = handler => { this.openHandler = handler; }; windows.push(this); }
  loadFile(file) { this.file = path.basename(file); }
  setAlwaysOnTop(...args) { this.atop = args; }
  isDestroyed() { return false; }
  isVisible() { return this.visible; }
  isMinimized() { return this.minimized; }
  restore() { this.minimized = false; this.emit('restore'); }
  minimize() { this.minimized = true; this.emit('minimize'); }
  show() { this.visible = true; this.emit('show'); }
  hide() { this.visible = false; this.emit('hide'); }
  focus() { this.focused = true; }
  getBounds() { return this.options; }
  setBounds() {}
}
const ipcMain = new EventEmitter();
ipcMain.handle = (channel, fn) => { assert.equal(invokes.has(channel), false); invokes.set(channel, fn); };
const noop = () => {};
// Main runs inside a VM: no real Electron, storage, network or filesystem I/O.
const deniedIo = new Proxy({}, { get: (_target, name) => () => {
  throw new Error(`Main startup test attempted filesystem I/O: ${String(name)}`);
} });
const stubs = {
  './src/main/storage.js': { loadSettings: () => settings, saveSettings: () => writeCount++ },
  './src/main/tray.js': { setupTray: options => { tray = options; }, updateProactiveState: noop, updateTrayName: noop, destroyTray: noop },
  './src/main/ai-config.js': { getAiConfig: () => settings.ai, normalizeProactiveConfig: () => ({ enabled: false }), normalizeInitiativeConfig: () => ({ enabled: false }) },
  './src/main/model-manager.js': {
    getCurrentModelPath: () => modelStatus().path,
    getModelFileUrl: () => selectedModelUrl,
    getModelStatus: modelStatus,
    listImportedModels: () => [],
    resetLive2dModel: () => { selectedModelUrl = ''; return modelStatus(); },
    selectLive2dModel: () => { selectedModelUrl = 'file:///C:/models/a.model3.json'; return modelStatus(); }
  },
  './src/main/mood.js': { getMoodState: () => ({ value: 3, energy: 5, label: '甜甜的' }) },
  './src/main/affection.js': { getAffectionState: () => ({ score: 5 }), getCheckinState: () => ({ doneToday: false }) }
};
const context = vm.createContext({
  require(request) {
    if (request === 'electron') return { app, BrowserWindow, ipcMain, screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1366, height: 768 } }), getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1366, height: 768 } }) } };
    if (stubs[request]) return new Proxy(stubs[request], { get: (target, key) => target[key] || noop });
    if (['./src/main/home.js', './src/main/utils.js', './src/main/bubble-layout.js'].includes(request)) return require(path.join(root, request));
    if (request.startsWith('./')) return new Proxy({}, { get: () => noop });
    if (request === 'fs') return deniedIo;
    if (request === 'path' || request === 'url') return require(request);
    throw new Error(`Unexpected dependency: ${request}`);
  },
  console, process: { platform: 'win32' }, __dirname: root,
  setTimeout: () => 1, clearTimeout: noop, setInterval: () => 1, clearInterval: noop,
  URL, Buffer, AbortController
});
vm.runInContext(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), context);
ready();
assert.deepEqual(windows.map(win => win.file), ['index.html', 'panel.html', 'chat.html', 'bubble.html', 'home.html']);
const [pet, panel, chat, bubble, home] = windows;
home.emit('ready-to-show');
assert.equal(home.visible, true);
assert.equal(home.options.alwaysOnTop, false);
assert.equal(home.options.transparent, false);
assert.equal(home.options.webPreferences.sandbox, true);
assert.equal(home.options.height, 768);
assert.equal(home.atop, undefined);
assert.equal(home.openHandler().action, 'deny');
const event = { sender: home.webContents };
for (let n = 0; n < 2; n++) {
  ipcMain.emit('home:open-chat', event);
  ipcMain.emit('home:open-settings', event);
}
assert.equal(chat.visible, false, 'chat navigation remains inside the main companion window');
assert.equal(home.sent.some(([channel, route]) => channel === 'home:navigate' && route === 'home'), true);
assert.equal(panel.visible, true);
const dto = invokes.get('home:get-snapshot')(event);
assert.equal(dto.character.name, '白希');
assert.equal(dto.mood.value, 3);
assert.equal(dto.model.status, 'none');
assert.equal(dto.model.fileUrl, '');
assert.equal(pet.visible, false, 'a fresh install never shows an empty desktop pet');
assert.equal(invokes.get('toggle-pet-visibility')(), false);
assert.equal(invokes.get('home:get-snapshot')({ sender: chat.webContents }), null);
const chatConfig = invokes.get('home:get-chat-config')(event);
assert.deepEqual(JSON.parse(JSON.stringify(chatConfig)), {
  character: { name: '白希' },
  messageDetails: { showTimestamp: true, showFloor: true, showDuration: false }
});
assert.equal(JSON.stringify(chatConfig).includes('private-'), false);
assert.equal(invokes.get('home:get-chat-config')({ sender: chat.webContents }), null);
ipcMain.emit('home:minimize', event);
assert.equal(home.minimized, true);
assert.equal(home.sent.at(-1)[1], false);
app.emit('second-instance');
assert.equal(home.minimized, false);
assert.equal(home.visible, true);
assert.equal(home.sent.at(-1)[1], true);
let prevented = false;
home.emit('close', { preventDefault() { prevented = true; } });
assert.equal(prevented, true);
assert.equal(home.visible, false);
assert.equal(pet.visible, false);
tray.onOpenHome();
assert.equal(home.visible, true);
tray.onOpenChat();
assert.equal(home.sent.at(-1)[0], 'home:navigate');
assert.equal(chat.visible, false);
tray.onToggleProactive(false);
assert.equal(invokes.get('home:get-snapshot')(event).proactivePaused, true);
tray.onToggleProactive(true);
assert.equal(invokes.get('home:get-snapshot')(event).proactivePaused, false);
assert.equal(writeCount, 0, 'Home startup, navigation and snapshots do not persist settings');
invokes.get('select-live2d-model')(event, 'catalog-model');
assert.equal(pet.visible, true);
assert.equal(invokes.get('home:get-snapshot')(event).model.status, 'ready');
invokes.get('disable-live2d-model')(event);
assert.equal(pet.visible, false);
assert.equal(bubble.visible, false);
assert.equal(pet.sent.at(-1)[1].path, '');
assert.equal(invokes.get('home:get-snapshot')(event).model.status, 'none');
assert.equal(home.visible, true, 'disabling Live2D keeps the companion window usable');
console.log('PASS: model-free main startup, Home chat navigation, model selection/disable, settings, pause, visibility, sender isolation and restricted chat config.');

const bridges = {};
const renderer = new EventEmitter();
renderer.invoke = (channel, ...args) => ({ channel, args });
renderer.send = (channel, ...args) => ({ channel, args });
vm.runInNewContext(fs.readFileSync(path.join(root, 'preload-home.js'), 'utf8'), {
  require: () => ({ contextBridge: { exposeInMainWorld: (name, api) => { bridges[name] = api; } }, ipcRenderer: renderer })
});
assert.equal(bridges.homeAPI.getModels().channel, 'get-live2d-model-info');
assert.equal(bridges.homeAPI.disableModel().channel, 'disable-live2d-model');
assert.equal(bridges.chatAPI.getAiConfig().channel, 'home:get-chat-config');
for (const forbidden of ['saveAiConfig', 'exportAiConfig', 'importAiConfig', 'sendPanelCommand', 'closeApp']) {
  assert.equal(bridges.chatAPI[forbidden], undefined);
}
let received = 0;
const unsubscribe = bridges.chatAPI.onChatAppendParts(() => received++);
renderer.emit('chat-append-parts', {}, { parts: [] });
unsubscribe();
renderer.emit('chat-append-parts', {}, { parts: [] });
assert.equal(received, 1);
assert.equal(renderer.listenerCount('chat-append-parts'), 0);
console.log('PASS: restricted Home model/chat bridge and removable embedded-chat subscriptions.');

const chatHostSource = fs.readFileSync(path.join(root, 'src/renderer/chat-host.js'), 'utf8');
const hostEvents = {};
const chatDocument = { body: { dataset: {} }, getElementById: () => ({}) };
const embeddedWindow = {
  parent: {
    chatAPI: bridges.chatAPI,
    petAPI: { saveAiConfig() { throw new Error('The embedded chat must never reach the parent settings API'); } },
    apiKey: 'private-parent-field'
  },
  addEventListener: (name, fn) => { hostEvents[name] = fn; }
};
vm.runInNewContext(chatHostSource, {
  window: embeddedWindow, document: chatDocument, location: { search: '?embedded=1' }, URLSearchParams
});
assert.equal(chatDocument.body.dataset.embedded, 'true');
assert.equal(Object.isFrozen(embeddedWindow.petAPI), true);
assert.deepEqual(Object.keys(embeddedWindow.petAPI).sort(), Object.keys(bridges.chatAPI).sort());
assert.equal(embeddedWindow.petAPI.saveAiConfig, undefined);
assert.equal(embeddedWindow.petAPI.apiKey, undefined);
assert.equal(embeddedWindow.petAPI.getAiConfig().channel, 'home:get-chat-config');
const subscriptionChannels = [
  ['onChatAppendParts', 'chat-append-parts'],
  ['onCheckinNotice', 'checkin-notice'],
  ['onLevelUpNotice', 'level-up-notice']
];
let embeddedReceived = 0;
for (const [method, channel] of subscriptionChannels) {
  embeddedWindow.petAPI[method](() => embeddedReceived++);
  renderer.emit(channel, {}, {});
  assert.equal(renderer.listenerCount(channel), 1);
}
hostEvents.beforeunload();
for (const [, channel] of subscriptionChannels) {
  assert.equal(renderer.listenerCount(channel), 0, `${channel} must detach when the chat frame unloads`);
  renderer.emit(channel, {}, {});
}
assert.equal(embeddedReceived, 3);

const disconnectedElements = new Map();
const disconnectedWindow = { parent: { petAPI: { saveAiConfig() {} } }, addEventListener() {} };
vm.runInNewContext(chatHostSource, {
  window: disconnectedWindow,
  document: {
    body: { dataset: {} },
    getElementById(id) { if (!disconnectedElements.has(id)) disconnectedElements.set(id, {}); return disconnectedElements.get(id); }
  },
  location: { search: '?embedded=1' }, URLSearchParams
});
assert.equal(disconnectedWindow.petAPI, undefined, 'missing restricted bridge must not fall back to the parent settings bridge');
assert.equal(disconnectedElements.get('input').disabled, true);
assert.equal(disconnectedElements.get('btn-send').disabled, true);

const standaloneApi = { existingConversationMethod() {} };
const standaloneWindow = { petAPI: standaloneApi };
standaloneWindow.parent = standaloneWindow;
vm.runInNewContext(chatHostSource, { window: standaloneWindow });
assert.equal(standaloneWindow.petAPI, standaloneApi);
console.log('PASS: embedded chat inherits only the restricted conversation bridge, detaches all event subscriptions on unload, and preserves standalone chat.');
