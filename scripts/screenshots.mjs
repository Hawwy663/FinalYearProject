/**
 * 用 Chrome DevTools Protocol 截圖（需要已開 dev server）。
 * 只用嚟做本機視覺驗證，唔會部署。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.OUT_DIR || path.join(process.cwd(), 'shots');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(path.join(tmpdir(), 'fyp-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' });

async function waitForDebugger() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return r.json();
    } catch { /* 未起身 */ }
    await sleep(250);
  }
  throw new Error('Chrome debugger 未啟動');
}

let nextId = 1;
function makeClient(ws) {
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  });
  return {
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    events,
  };
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return makeClient(ws);
}

const evalJs = async (cdp, expression) => {
  const res = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text + ' ' + (res.exceptionDetails.exception?.description || ''));
  return res.result.value;
};

async function waitFor(cdp, expression, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evalJs(cdp, expression)) return true;
    await sleep(200);
  }
  throw new Error('等待逾時: ' + expression);
}

async function shot(cdp, file) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log('shot:', file);
}

await waitForDebugger();

const targetRes = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
const target = await targetRes.json();
const cdp = await connect(target.webSocketDebuggerUrl);

await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

async function goto(url) {
  await cdp.send('Page.navigate', { url });
  await sleep(1200);
}

// 登入頁
await goto(`${BASE}/login`);
await waitFor(cdp, `!!document.querySelector('input[type=email]')`);
await shot(cdp, path.join(OUT, '01-login.png'));

// 填表 + 登入
const fill = (selector, value) => `(() => {
  const el = document.querySelector('${selector}');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`;

await evalJs(cdp, fill('input[type=email]', 'admin@fyp.local'));
await evalJs(cdp, fill('input[type=password]', 'Admin1234!'));
await evalJs(cdp, `document.querySelector('form button[type=submit]').click()`);

await waitFor(cdp, `location.pathname === '/admin'`, 20000);
await sleep(2500);
await shot(cdp, path.join(OUT, '02-admin.png'));

// ArUco 貼紙頁
await goto(`${BASE}/admin/markers`);
await waitFor(cdp, `!!document.querySelector('.qr-cell svg, .qr-cell img')`, 20000);
await sleep(1500);
await shot(cdp, path.join(OUT, '06-markers.png'));

// AI 生成路線（收 API 費，預設唔跑；AI_DEMO=1 才開）
if (process.env.AI_DEMO === '1') {
  await evalJs(cdp, `(() => {
    const el = document.querySelector('textarea.ai-input');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, '一樓平台 1 同平台 2 都要巡查，跟住上二樓兩個平台，最後上三樓降落。每站前進 120cm，上樓 80cm。');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(300);
  await evalJs(cdp, `[...document.querySelectorAll('button')].find(b => b.innerText.includes('生成路線')).click()`);
  await waitFor(cdp, `!!document.querySelector('.card table tbody tr')`, 120000);
  await sleep(1200);
  await shot(cdp, path.join(OUT, '07-ai-route.png'));
}

// 詳情頁（用有相片嘅 e2e 紀錄）
const recordId = process.env.RECORD_ID;
if (recordId) {
  await goto(`${BASE}/admin/records/${recordId}`);
  await waitFor(cdp, `!!document.querySelector('.detail-photo')`, 20000);
  await sleep(2500);
  await shot(cdp, path.join(OUT, '03-detail.png'));

  await goto(`${BASE}/admin/records/${recordId}/notice`);
  await waitFor(cdp, `!!document.querySelector('.notice-paper')`, 20000);
  await sleep(1200);
  await shot(cdp, path.join(OUT, '04-notice.png'));

  await goto(`${BASE}/admin/records/${recordId}`);
  await waitFor(cdp, `!!document.querySelector('.status-options')`, 20000);
  await sleep(800);
}

// 員工端（手機 viewport）
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 414, height: 900, deviceScaleFactor: 2, mobile: true });
await goto(`${BASE}/staff`);
await waitFor(cdp, `!!document.querySelector('.floor-grid')`, 20000);
await sleep(2000);
await shot(cdp, path.join(OUT, '05-staff.png'));

chrome.kill();
process.exit(0);
