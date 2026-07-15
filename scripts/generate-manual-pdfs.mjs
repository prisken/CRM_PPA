#!/usr/bin/env node
/**
 * Generate PDF user manuals from markdown using system Chrome.
 * Usage: node scripts/generate-manual-pdfs.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const docsDir = join(root, 'docs');

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const manuals = [
  {
    input: join(docsDir, 'USER_MANUAL_STANDARD_USER.md'),
    output: join(docsDir, 'USER_MANUAL_STANDARD_USER.pdf'),
    title: 'Profit Pulse Ally CRM — Standard User Manual',
  },
  {
    input: join(docsDir, 'USER_MANUAL_SUPER_ADMIN.md'),
    output: join(docsDir, 'USER_MANUAL_SUPER_ADMIN.pdf'),
    title: 'Profit Pulse Ally CRM — Super Admin Manual',
  },
];

const css = readFileSync(join(docsDir, 'manual-pdf.css'), 'utf8');

function buildHtml(markdown, title) {
  const body = marked.parse(markdown);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>${css}</style>
</head>
<body>${body}</body>
</html>`;
}

function resolveChrome() {
  for (const path of CHROME_PATHS) {
    if (existsSync(path)) {
      return path;
    }
  }
  return undefined;
}

async function main() {
  const puppeteer = await import('puppeteer');
  const executablePath = resolveChrome();

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    for (const manual of manuals) {
      const markdown = readFileSync(manual.input, 'utf8');
      const html = buildHtml(markdown, manual.title);
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.pdf({
        path: manual.output,
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
      });
      await page.close();
      console.log(`Created ${manual.output}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
