#!/usr/bin/env node
/**
 * CRM feature screenshots — drives headless Chrome with an authenticated
 * Supabase session (access token from /tmp/supa-session.json) and captures
 * every major page into /tmp/crm-shots/.
 *
 * Usage: node capture-crm-shots.mjs
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 9455 + Math.floor(Math.random() * 10);
const OUT = '/tmp/crm-shots';
mkdirSync(OUT, { recursive: true });

const session = JSON.parse(readFileSync('/tmp/supa-session-full.json', 'utf8'));
const ACCESS = session.access_token;
const BASE = 'http://localhost:3000';

const SHOTS = [
  // Auth + shell
  ['01-login', '/login'],
  // Standard user dashboard
  ['02-dashboard-home', '/dashboard'],
  ['03-dashboard-clients', '/dashboard?view=clients'],
  ['04-dashboard-tasks', '/dashboard?view=tasks'],
  ['05-dashboard-activity', '/dashboard?view=activity'],
  ['06-dashboard-calendar', '/dashboard?view=calendar'],
  ['07-dashboard-deals', '/dashboard?view=deals'],
  ['08-dashboard-commission', '/dashboard?view=commission'],
  ['09-my-statements', '/my-statements'],
  // Product recommendations
  ['10-products', '/products'],
  // Admin
  ['11-admin-home', '/admin'],
  ['12-admin-leads', '/admin/leads'],
  ['13-admin-pipeline', '/admin?view=pipeline'],
  ['14-admin-calendar', '/admin?view=calendar'],
  ['15-admin-activity', '/admin?view=activity'],
  ['16-admin-analytics', '/admin?view=analytics'],
  ['17-admin-revenue', '/admin?view=revenue'],
  ['18-admin-leaderboards', '/admin?view=leaderboards'],
  ['19-admin-reconciliation', '/admin/reconciliation'],
  ['20-admin-users', '/admin/users'],
];

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--window-size=1680,1200',
  '--hide-scrollbars',
  '--no-first-run',
  '--user-data-dir=/tmp/crm-chrome-profile',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let ws;
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        break;
      }
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

  // Seed the session: correct Supabase storage key + proper session shape
  const sbToken = JSON.stringify(session);
  const seed = `localStorage.setItem('token', ${JSON.stringify(ACCESS)});
    localStorage.setItem('supabase.auth.token', ${JSON.stringify(sbToken)});
    localStorage.setItem('sb-itmfmqcznzogptvpxile-auth-token', ${JSON.stringify(sbToken)});
    document.cookie = 'token=' + ${JSON.stringify(ACCESS)} + '; path=/';
    true;`;

  // Middleware reads the Supabase cookie server-side. Use supabase.auth.setSession
  // in-page AFTER landing on the origin — it writes the correct chunked cookie.
  const sessionJs = JSON.stringify(session);
  const setSessionScript = `(async () => {
    const { createClient } = await import('/node_modules/@supabase/supabase-js/dist/module/index.js');
    return 'import-ok';
  })().catch(e => 'import-fail:' + e.message)`;
  const cookieName = 'sb-itmfmqcznzogptvpxile-auth-token';
  const rawCookieValue = sbToken;

  // 1) Capture the login page FIRST (login page signs out any session on mount,
  //    so the cookie must be set AFTER this shot).
  await send('Page.navigate', { url: BASE + '/login' });
  await sleep(3500);
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, '01-login.png'), Buffer.from(shot.data, 'base64'));
  console.log('✓ 01-login.png');

  // 2) Set the Supabase cookie (proven flow), then capture everything else.
  const cookieSet = `document.cookie = ${JSON.stringify(cookieName + '=' + encodeURIComponent(rawCookieValue) + '; path=/')};
    document.cookie = ${JSON.stringify('token=' + ACCESS + '; path=/')}; true;`;
  await send('Runtime.evaluate', { expression: cookieSet, returnByValue: true });
  await sleep(2500);
  // Establish the session: navigate to /dashboard once — it should now pass middleware.
  await send('Page.navigate', { url: BASE + '/dashboard' });
  await sleep(4000);
  const probe = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
  console.log('session probe /dashboard →', probe.result.value);

  for (const [name, path] of SHOTS.filter(([n]) => n !== '01-login')) {
    const pre = await send('Runtime.evaluate', { expression: 'document.cookie', returnByValue: true }).catch(() => ({ result: { value: '' } }));
    console.log(`  pre-${name}: cookieHas=${String(pre.result.value).includes(cookieName)}`);
    await send('Page.navigate', { url: BASE + path });
    await sleep(4500);
    const after = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true }).catch(() => ({ result: { value: '?' } }));
    console.log(`  → ${name}: url=${after.result.value}`);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'));
    const title = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true }).catch(() => ({ result: { value: '' } }));
    console.log(`✓ ${name}.png (${title.result.value?.slice(0, 50) || ''})`);
  }

  ws.close();
  chrome.kill();
  console.log('\nDone — shots in', OUT);
}

main().catch((e) => { console.error('ERR', e); chrome.kill(); process.exit(1); });
