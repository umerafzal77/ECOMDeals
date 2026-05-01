import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, 'temporary screenshots');

const url = process.argv[2];
const label = process.argv[3] || '';
const viewport = process.argv[4] === 'mobile'
  ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { width: 1440, height: 900, deviceScaleFactor: 1 };

if (!url) {
  console.error('Usage: node screenshot.mjs <url> [label] [mobile]');
  process.exit(1);
}

await fs.mkdir(SHOT_DIR, { recursive: true });

async function nextIndex() {
  const files = await fs.readdir(SHOT_DIR);
  let max = 0;
  for (const f of files) {
    const m = f.match(/^screenshot-(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

const idx = await nextIndex();
const suffix = label ? `-${label}` : '';
const file = path.join(SHOT_DIR, `screenshot-${idx}${suffix}.png`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  // gentle scroll to trigger any lazy-loads / animations, then return to top
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const step = 200;
      const t = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight) {
          clearInterval(t);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 80);
    });
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: file, fullPage: true });
  console.log(`Saved: ${file}`);
} finally {
  await browser.close();
}
