import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const window = new Window({ url: 'https://example.com', settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
try {
  const doc = window.document;
  doc.write(readFileSync('site/index.html', 'utf8'));
  window.eval(readFileSync('site/report-viewer.js', 'utf8'));
  const root = doc.querySelector('#report-viewer');
  const viewer = window.GravScopeReportViewer.current;
  const report = { schemaVersion: 1, version: '0.1.2', createdAt: '2026-11-04T00:00:00Z', logs: [
    { id: 1, time: 1, level: 'log', args: ['group'], kind: 'group', collapsed: true, groupIds: [] },
    { id: 2, time: 2, level: 'error', args: ['<img src=x onerror=alert(1)>'], groupIds: [1] },
  ], network: [{ method: 'GET', url: 'https://example.com/fail', status: 500 }] };
  await viewer.load(new window.File([JSON.stringify(report)], 'report.json', { type: 'application/json' }));
  assert.equal(root.querySelectorAll('.report-record').length, 1);
  assert.equal(root.querySelector('img'), null);
  assert.equal(root.querySelector('.report-group').open, false);
  const search = root.querySelector('[data-report-search]'); search.value = 'onerror'; search.dispatchEvent(new window.Event('input'));
  assert.equal(root.querySelector('.report-group').open, true);
  const mode = root.querySelector('[data-report-mode]'); mode.value = 'network'; search.value = ''; mode.dispatchEvent(new window.Event('change'));
  assert.ok(root.querySelector('[data-report-output]').textContent.includes('/fail'));
  const withActivity = { ...report, frame: { type: 'iframe', path: [0] }, performance: { scope: 'current-document', metrics: { load: { value: 123, unit: 'ms', state: 'available' } } }, activity: [{ time: 1, type: 'websocket', action: 'receive', url: 'wss://example.com', detail: { message: '<img src=x onerror=alert(1)>' } }] };
  await viewer.load(new window.File([JSON.stringify(withActivity)], 'activity.json'));
  assert.ok(root.querySelector('[data-report-meta]').textContent.includes('current-document'));
  assert.ok(root.querySelector('[data-report-meta]').textContent.includes('123'));
  assert.ok(root.querySelector('[data-report-meta]').textContent.includes('iframe'));
  mode.value = 'activity'; mode.dispatchEvent(new window.Event('change'));
  assert.ok(root.querySelector('[data-report-output]').textContent.includes('websocket'));
  assert.ok(root.querySelector('[data-report-output]').textContent.includes('onerror'));
  assert.equal(root.querySelector('img'), null);
  assert.throws(() => window.GravScopeReportViewer.parse(JSON.stringify({ ...report, activity: [{ type: 'invalid' }] })));
  mode.value = 'logs'; mode.dispatchEvent(new window.Event('change'));
  assert.throws(() => window.GravScopeReportViewer.parse('{broken'));
  assert.throws(() => window.GravScopeReportViewer.parse(JSON.stringify({ ...report, schemaVersion: 99 })));
  const trimmed = { ...report, logs: [{ ...report.logs[1], groupIds: [1] }] };
  assert.doesNotThrow(() => window.GravScopeReportViewer.parse(JSON.stringify(trimmed)));
  await viewer.load(new window.File(['{broken'], 'broken.json'));
  assert.equal(root.querySelector('[data-report-output]').children.length, 0);
  assert.ok(root.querySelector('[data-report-status]').textContent.includes('无法导入'));
  await viewer.load(new window.File(['x'.repeat(5 * 1024 * 1024 + 1)], 'huge.json'));
  assert.ok(root.querySelector('[data-report-status]').textContent.includes('5 MB'));
  const many = { ...report, logs: Array.from({ length: 101 }, (_, index) => ({ id: index + 1, time: 1, level: 'log', args: ['row ' + index], groupIds: [] })) };
  mode.value = 'logs';
  await viewer.load(new window.File([JSON.stringify(many)], 'many.json'));
  assert.equal(root.querySelectorAll('.report-record').length, 100);
  root.querySelector('[data-report-more]').click();
  assert.equal(root.querySelectorAll('.report-record').length, 101);
  viewer.clear();
  assert.equal(root.querySelector('[data-report-output]').children.length, 0);
  console.log('Report import, group filtering, network view, malformed input, safe text rendering and clear passed.');
} finally { await window.happyDOM.close(); }
