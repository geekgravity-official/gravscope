import { Window } from 'happy-dom';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeHeapSnapshot } from 'node:v8';

const minutes = Number(process.argv[2] ?? 1);
if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 120) throw new Error('Duration must be > 0 and <= 120 minutes');
const output = process.argv[3] || '/tmp/gravscope-soak.json';
const window = new Window({ url: 'https://example.test/' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const started = performance.now();
const samples = [];
const counts = { logs: 0, requests: 0, messages: 0, cycles: 0 };
const activeTimers = new Set();
const nativeTimeout = window.setTimeout.bind(window);
const nativeClearTimeout = window.clearTimeout.bind(window);
window.setTimeout = (fn, ms, ...args) => {
  const id = nativeTimeout(() => { activeTimers.delete(id); fn(...args); }, ms);
  activeTimers.add(id); return id;
};
window.clearTimeout = id => { activeTimers.delete(id); return nativeClearTimeout(id); };
window.eval('window.WebSocket = class extends EventTarget { static OPEN = 1; constructor(url) { super(); this.url = url; this.readyState = 1; } send(data) { this.sent = data; } close() { this.readyState = 3; this.dispatchEvent(new CloseEvent("close", {code:1000})); } };');
for (const key of ['log', 'info', 'warn', 'error', 'debug']) window.console[key] = () => {};
window.fetch = async () => new window.Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
const originals = { fetch: window.fetch, log: window.console.log, socket: window.WebSocket, pushState: window.history.pushState, open: window.XMLHttpRequest.prototype.open };
window.eval(readFileSync('dist/gravscope.modern.iife.js', 'utf8'));
try {
  do {
    let panel = new window.GravScope({ lang: 'en', maxLogNumber: 200, maxNetworkNumber: 100 });
    let socket = new window.WebSocket('wss://example.test/messages');
    panel.showTab(counts.cycles % 2 ? 'network' : 'streams');
    const cycleStart = performance.now();
    do {
      for (let i = 0; i < 20; i++) {
        window.console.log('soak', counts.logs++, { count: counts.logs });
        socket.send('message-' + counts.messages++);
        socket.dispatchEvent(new window.MessageEvent('message', { data: 'response-' + counts.messages++ }));
      }
      await (await window.fetch('/data/' + counts.requests++)).text();
      await sleep(100);
    } while (performance.now() - cycleStart < 10000 && performance.now() - started < minutes * 60000);
    let report = panel.getReport();
    assert.ok(report.logs.length <= 200 && report.network.length <= 100 && report.activity.length <= 1000);
    let root = window.document.querySelector('gravscope-root').shadowRoot;
    assert.ok(root.querySelectorAll('.gc-row').length <= 300);
    assert.ok(root.querySelectorAll('.gc-net').length <= 100);
    panel.clearAll();
    assert.equal(panel.getReport().logs.length, 0);
    panel.destroy(); socket.close(); panel = null; socket = null; report = null; root = null;
    await sleep(80);
    assert.equal(window.document.querySelector('gravscope-root'), null);
    assert.equal(window.GravScope.current, null);
    assert.equal(window.fetch, originals.fetch); assert.equal(window.console.log, originals.log);
    assert.equal(window.WebSocket, originals.socket); assert.equal(window.history.pushState, originals.pushState);
    assert.equal(window.XMLHttpRequest.prototype.open, originals.open);
    assert.equal(activeTimers.size, 0, 'Diagnostic timers remain after destroy');
    global.gc?.(); counts.cycles++;
    samples.push({ seconds: +(performance.now() - started).toFixed(0) / 1000, heapMiB: +(process.memoryUsage().heapUsed / 1048576).toFixed(2) });
    if (counts.cycles % 6 === 0) console.log(`Soak: ${counts.cycles} clean lifecycle cycles, ${counts.logs} logs, ${counts.messages} messages.`);
  } while (performance.now() - started < minutes * 60000);
  const result = { checksPassed: true, memoryAssessment: 'Heap samples are diagnostic only; this is not proof of leak-free browser behavior.', scope: 'Node + happy-dom with synthetic fetch/WebSocket; not real WebView/native validation', durationSeconds: +(performance.now() - started).toFixed(0) / 1000, forcedGC: typeof global.gc === 'function', counts, samples };
  if (process.argv.includes('--snapshot')) writeHeapSnapshot(output + '.heapsnapshot');
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally { await window.happyDOM.close(); }
