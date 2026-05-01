import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, 'temporary screenshots');

const url = process.argv[2];
const label = process.argv[3] || 'section';

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
const file = path.join(SHOT_DIR, `screenshot-${idx}-${label}.png`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  // scroll to load lazy content
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const step = 300;
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
  await new Promise(r => setTimeout(r, 1000));

  // Try to find a "What We Do Best" / services section heading and capture surrounding area
  const clip = await page.evaluate(() => {
    const headings = [...document.querySelectorAll('h1,h2,h3,h4')];
    const target = headings.find(h => /what we do best|services|platforms/i.test(h.textContent));
    if (!target) return null;
    const section = target.closest('section') || target.parentElement.parentElement;
    const rect = section.getBoundingClientRect();
    section.scrollIntoView({ block: 'start' });
    const r2 = section.getBoundingClientRect();
    return { x: 0, y: window.scrollY + r2.top, width: document.documentElement.clientWidth, height: r2.height };
  });

  if (clip) {
    await page.screenshot({ path: file, clip: { x: clip.x, y: clip.y, width: clip.width, height: Math.min(clip.height, 2400) } });
  } else {
    await page.screenshot({ path: file, fullPage: true });
  }
  console.log(`Saved: ${file}`);
} finally {
  await browser.close();
}
