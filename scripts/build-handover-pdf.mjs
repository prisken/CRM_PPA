#!/usr/bin/env node
/**
 * Build DEVELOPER_HANDOVER.pdf from DEVELOPER_HANDOVER.md.
 * Inlines the screenshot images as base64 so the PDF is self-contained.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const docsDir = join(root, 'docs');
const shotsDir = '/tmp/crm-shots';

const INPUT = join(docsDir, 'DEVELOPER_HANDOVER.md');
const OUTPUT = join(docsDir, 'DEVELOPER_HANDOVER.pdf');
const CSS = readFileSync(join(docsDir, 'manual-pdf.css'), 'utf8');

function buildHtml(markdown, title) {
  const body = marked.parse(markdown);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>${CSS}</style>
</head>
<body>${body}</body>
</html>`;
}

async function main() {
  const puppeteer = await import('puppeteer');
  const CHROME_PATHS = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  const executablePath = CHROME_PATHS.find((p) => {
    try { return require('node:fs').existsSync(p); } catch { return false; }
  });
  const existsSync = (await import('node:fs')).existsSync;
  const exe = CHROME_PATHS.find(existsSync);

  let markdown = readFileSync(INPUT, 'utf8');
  // inline images: ![alt](name.png) -> base64 data URI
  const imgRe = /!\[([^\]]*)\]\(([^)]+\.png)\)/g;
  let m;
  const replacements = [];
  while ((m = imgRe.exec(markdown)) !== null) {
    const [full, alt, file] = m;
    const path = join(shotsDir, file);
    let dataUri = null;
    try {
      const b64 = readFileSync(path).toString('base64');
      dataUri = `data:image/png;base64,${b64}`;
    } catch (e) {
      console.log(`  MISSING IMG: ${file}`);
    }
    replacements.push([full, alt, dataUri]);
  }
  for (const [full, alt, dataUri] of replacements) {
    if (dataUri) {
      markdown = markdown.replace(full, `![${alt}](${dataUri})`);
    } else {
      markdown = markdown.replace(full, `*[screenshot missing: ${alt}]*`);
    }
  }

  const html = buildHtml(markdown, 'Profit Pulse Ally CRM — Developer Handover');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: exe,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: OUTPUT,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
  });
  await browser.close();
  console.log(`Created ${OUTPUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
