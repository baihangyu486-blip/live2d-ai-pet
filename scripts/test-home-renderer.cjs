const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const { buildHomeSnapshot } = require(path.join(root, 'src/main/home.js'));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const settle = () => new Promise(resolve => setImmediate(resolve));
class Element {
  constructor() { this.events={}; this.dataset={}; this.children=[]; this.classList={ toggle(){} }; this.value='auto'; }
  setAttribute(){} removeAttribute(){}
  addEventListener(name, fn) { this.events[name]=fn; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children=items; }
}
const ids = new Map([...fs.readFileSync(path.join(root,'home.html'),'utf8').matchAll(/id="([^"]+)"/g)].map(match => [match[1],new Element()]));
const requests=[];
const mutations=[];
const warnings=[];
// The renderer sees only a fake DOM and deferred IPC; no application data is read.
const api={
  getSnapshot(){ const item=deferred();requests.push(item);return item.promise; },
  setProactivePaused(paused){ const item=deferred(); mutations.push({ ...item, paused }); return item.promise; },
  onVisibilityChange(){ return ()=>{}; }
};
const document={ hidden:false, documentElement:{}, getElementById:id=>ids.get(id), createElement:()=>new Element(), querySelectorAll:()=>[], querySelector:()=>new Element(), addEventListener(){} };
const window={ homeAPI:api, homeStage:{ load(){},setVisible(){},setPage(){} }, addEventListener(){} };
const context=vm.createContext({ window,document,console:{ warn(...args){ warnings.push(args); } },setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){} });
vm.runInContext(fs.readFileSync(path.join(root,'src/renderer/home.js'),'utf8'),context);
(async()=>{
  const old=buildHomeSnapshot({ proactivePaused:false });
  requests[0].resolve(old);
  await settle();
  ids.get('refresh').events.click();
  ids.get('pause-proactive').events.click();
  assert.equal(ids.get('pause-proactive').disabled,true);
  requests[1].resolve(old);
  await settle();
  assert.equal(mutations.length,1);
  assert.equal(mutations[0].paused,true);
  mutations[0].resolve(true);
  await settle();
  assert.equal(requests.length,3,'Mutation must read a fresh snapshot after an older poll settles');
  requests[2].resolve(buildHomeSnapshot({ proactivePaused:true }));
  await settle();
  assert.equal(ids.get('presence-label').textContent,'安静陪伴中');
  assert.equal(ids.get('pause-proactive').disabled,false);

  // A failed follow-up read must preserve the last snapshot and permit a retry.
  ids.get('pause-proactive').events.click();
  assert.equal(mutations[1].paused,false);
  mutations[1].resolve(false);
  await settle();
  assert.equal(requests.length,4);
  requests[3].reject(new Error('Simulated read failure'));
  await settle();
  assert.equal(ids.get('load-error').hidden,false);
  assert.equal(ids.get('pause-proactive').disabled,false);
  assert.equal(ids.get('presence-label').textContent,'安静陪伴中');
  assert.equal(warnings.length,1);
  ids.get('refresh').events.click();
  requests[4].resolve(buildHomeSnapshot({ proactivePaused:false }));
  await settle();
  assert.equal(ids.get('load-error').hidden,true);
  assert.equal(ids.get('presence-label').textContent,'今天，也在这里');
  console.log('PASS: renderer refresh/mutation ordering and failed-read recovery preserve usable state.');
})().catch(error=>{console.error(error);process.exitCode=1;});
