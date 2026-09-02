#!/usr/bin/env node
/**
 * Deep feature screenshots — client 360, workspace tabs, admin details.
 * Reuses the proven cookie-auth flow from capture-crm-shots.mjs.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 9480 + Math.floor(Math.random() * 10);
const OUT = '/tmp/crm-shots';
mkdirSync(OUT, { recursive: true });

const session = JSON.parse(readFileSync('/tmp/supa-session-full.json', 'utf8'));
const ACCESS = session.access_token;
const BASE = 'http://localhost:3000';
const CLIENT = 'cmtgf8off0000ji04besxzxhh'; // Live Test

const SHOTS = [
  ['21-client-360', `/clients/${CLIENT}`],
  ['22-client-workspace-tasks', `/clients/${CLIENT}#strategy-tasks`],
  ['23-client-workspace-product-recs', `/clients/${CLIENT}#product-recs`],
  ['24-client-workspace-activity', `/clients/${CLIENT}#activity-notes`],
  ['25-client-strategy-planner', `/clients/${CLIENT}#strategy-planner`],
  ['26-admin-lead-preview', `/admin/leads`],
  ['27-client-interactions', `/clients/${CLIENT}`],
];

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--window-size=1680,1400',
  '--hide-scrollbars',
  '--no-first-run',
  '--user-data-dir=/tmp/crm-chrome-deep',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let ws;
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch {}
    await sleep(300);
  }
  if (!ws) throw new Error('no CDP');
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

  let id = 0;
  const pend = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id; pend.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');

  // Login page FIRST (it signs out on mount), then set cookie
  await send('Page.navigate', { url: BASE + '/login' });
  await sleep(3500);

  const sbToken = JSON.stringify(session);
  const cookieName = 'sb-itmfmqcznzogptvpxile-auth-token';
  const cookieSet = `document.cookie = ${JSON.stringify(cookieName + '=' + encodeURIComponent(sbToken) + '; path=/')};
    document.cookie = ${JSON.stringify('token=' + ACCESS + '; path=/')}; true;`;
  await send('Runtime.evaluate', { expression: cookieSet, returnByValue: true });
  await sleep(2500);

  for (const [name, path] of SHOTS) {
    await send('Page.navigate', { url: BASE + path });
    await sleep(5000);
    const after = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true }).catch(() => ({ result: { value: '?' } }));
    console.log(`  → ${name}: url=${after.result.value}`);
    // click the target workspace tab if present (hash may not auto-activate)
    if (path.includes('#strategy-tasks')) {
      await send('Runtime.evaluate', { expression: `[...document.querySelectorAll('nav button')].find(b=>b.textContent.includes('Strategy & Tasks'))?.click(); true`, returnByValue: true }).catch(() => {});
      await sleep(2500);
    }
    if (path.includes('#product-recs')) {
      await send('Runtime.evaluate', { expression: `[...document.querySelectorAll('nav button')].find(b=>b.textContent.includes('Product Recommendations'))?.click(); true`, returnByValue: true }).catch(() => {});
      await sleep(2500);
    }
    if (path.includes('#activity-notes')) {
      await send('Runtime.evaluate', { expression: `[...document.querySelectorAll('nav button')].find(b=>b.textContent.includes('Activity & Notes'))?.click(); true`, returnByValue: true }).catch(() => {});
      await sleep(2500);
    }
    if (path.includes('#strategy-planner')) {
      await send('Runtime.evaluate', { expression: `[...document.querySelectorAll('nav button')].find(b=>b.textContent.includes('Strategy Planner'))?.click(); true`, returnByValue: true }).catch(() => {});
      await sleep(3000);
    }
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'));
    console.log(`✓ ${name}.png`);
  }

  ws.close();
  chrome.kill();
  console.log('\nDone — deep shots in', OUT);
}

main().catch((e) => { console.error('ERR', e); chrome.kill(); process.exit(1); });
