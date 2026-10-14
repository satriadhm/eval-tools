// Usage: node fullpage-diff.js <outDir> <label=url> [<label=url> ...]
// Takes a full-page screenshot (menus closed, animations settled) of each URL at each
// viewport and reports how many pixels differ from the first label (the baseline).
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const [,, outDir, ...pairs] = process.argv;
const targets = pairs.map(p => { const i = p.indexOf('='); return { label: p.slice(0, i), url: p.slice(i + 1) }; });
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const VIEWPORTS = [[1280, 800], [844, 390], [390, 844]];
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  for (const [w, h] of VIEWPORTS) {
    const shots = {};
    for (const t of targets) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await page.goto(t.url, { waitUntil: 'networkidle0' });
      // Freeze the typewriter text and hide the dev overlay so only layout/styling differences remain.
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important} #hero-typewriter{visibility:hidden!important} *{animation-play-state:paused!important;caret-color:transparent!important}' });
      await sleep(1500);
      const file = path.join(outDir, `${t.label}_${w}x${h}_fullpage.png`);
      await page.screenshot({ path: file, fullPage: true });
      shots[t.label] = { file, height: await page.evaluate(() => document.documentElement.scrollHeight) };
      await page.close();
    }
    // Pixel comparison in the browser via canvas
    const page = await browser.newPage();
    const toData = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const base = targets[0].label;
    for (const t of targets.slice(1)) {
      const res = await page.evaluate(async (a, b) => {
        const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const W = Math.min(ia.width, ib.width), H = Math.min(ia.height, ib.height);
        const get = img => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, W, H).data; };
        const da = get(ia), db = get(ib);
        let diff = 0; const rows = new Set();
        for (let p = 0; p < da.length; p += 4) {
          if (Math.abs(da[p] - db[p]) + Math.abs(da[p + 1] - db[p + 1]) + Math.abs(da[p + 2] - db[p + 2]) > 30) { diff++; rows.add(Math.floor(p / 4 / W)); }
        }
        const r = [...rows].sort((x, y) => x - y);
        return { sizeA: [ia.width, ia.height], sizeB: [ib.width, ib.height], diffPixels: diff, diffRowRange: r.length ? [r[0], r[r.length - 1]] : null };
      }, toData(shots[base].file), toData(shots[t.label].file));
      console.log(`${w}x${h} ${t.label} vs ${base}: ${JSON.stringify(res)}`);
    }
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
