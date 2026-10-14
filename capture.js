// Usage: node capture.js <baseUrl> <outDir> <label>
// Opens each "Build Your Portfolio" dropdown (nav / hero / cta) at fixed viewports,
// measures how much of the dropdown is actually visible (topmost at sampled points),
// checks both options are clickable, checks anchoring after scroll and outside-click
// dismissal, and saves screenshots + a JSON report. Run it identically for the
// baseline, Astra's result and Gemini's result so the comparison is like-for-like.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const [,, baseUrl = 'http://localhost:3123/', outDir = './out', label = 'run'] = process.argv;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const VIEWPORTS = [
  { name: 'desktop-1280x800', width: 1280, height: 800, isMobile: false },
  { name: 'landscape-844x390', width: 844, height: 390, isMobile: true, hasTouch: true },
  { name: 'mobile-390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
];
const TRIGGERS = {
  nav: 'button.nav-cta',
  hero: '.hero button.btn-primary',
  cta: '.cta-inner button.btn-primary',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Hide the Next.js dev error badge (a pre-existing hydration warning unrelated to this bug)
// so it neither clutters screenshots nor intercepts elementFromPoint sampling.
async function load(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle0' });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await sleep(800);
}

// Find the open dropdown: the element that contains both option buttons.
const FIND_DROPDOWN = `(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('I already have a portfolio'));
  if (!btn) return null;
  let el = btn.parentElement;
  while (el && !el.textContent.includes("I'm new here") && !el.textContent.includes('I\\u2019m new here')) el = el.parentElement;
  return el;
})()`;

async function measure(page, triggerSel) {
  return page.evaluate((triggerSel, FIND) => {
    const dd = eval(FIND);
    const trig = document.querySelector(triggerSel);
    if (!dd) return { open: false };
    const r = dd.getBoundingClientRect();
    const t = trig.getBoundingClientRect();
    let total = 0, visible = 0;
    const coveredBy = {};
    for (let fx = 0.05; fx < 1; fx += 0.1) for (let fy = 0.05; fy < 1; fy += 0.1) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      total++;
      const el = document.elementFromPoint(x, y);
      if (el && dd.contains(el)) visible++;
      else { const k = el ? (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : '')) : 'null'; coveredBy[k] = (coveredBy[k] || 0) + 1; }
    }
    const options = [...dd.querySelectorAll('button')].map(b => {
      const br = b.getBoundingClientRect();
      const el = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
      return { text: b.textContent.trim().slice(0, 30), clickableAtCenter: !!el && b.contains(el), inViewport: br.bottom <= innerHeight && br.top >= 0 };
    });
    return {
      open: true,
      rect: { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) },
      gapBelowTrigger: Math.round(r.top - t.bottom),
      rightEdgeDeltaVsTrigger: Math.round(r.right - t.right),
      fullyInsideViewportHorizontally: r.left >= 0 && r.right <= innerWidth,
      visibleFraction: total ? +(visible / total).toFixed(2) : null,
      sampledPoints: total,
      coveredBy,
      options,
      position: getComputedStyle(dd).position,
    };
  }, triggerSel, FIND_DROPDOWN);
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const report = { label, baseUrl, capturedAt: new Date().toISOString(), results: [] };

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: 1 });

    // Closed-state capture of the CTA card (checks its glow/rounded clipping is not regressed).
    await load(page);
    const cta = await page.$('.cta-inner');
    if (cta) {
      await cta.evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 60));
      await sleep(300);
      await page.screenshot({ path: path.join(outDir, `${label}_${vp.name}_cta-closed.png`) });
    }

    for (const [id, sel] of Object.entries(TRIGGERS)) {
      await load(page);
      const trig = await page.$(sel);
      if (!trig) { report.results.push({ viewport: vp.name, trigger: id, error: 'trigger not found' }); continue; }
      // Put the trigger ~35% down the viewport so there is room below for the menu.
      await trig.evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - innerHeight * 0.35));
      await sleep(300);
      await trig.click();
      await sleep(400);
      const opened = await measure(page, sel);
      await page.screenshot({ path: path.join(outDir, `${label}_${vp.name}_${id}-open.png`) });

      // Anchoring: scroll the page a bit while the menu is open.
      await page.evaluate(() => window.scrollBy(0, 120));
      await sleep(400);
      const afterScroll = await measure(page, sel);
      await page.screenshot({ path: path.join(outDir, `${label}_${vp.name}_${id}-after-scroll.png`) });

      // Dismissal: click an empty area outside the menu.
      await page.evaluate(() => window.scrollBy(0, -120));
      await sleep(200);
      if (!(await measure(page, sel)).open) { await trig.click(); await sleep(300); }
      await page.mouse.click(5, Math.round(vp.height / 2));
      await sleep(300);
      const afterOutsideClick = (await measure(page, sel)).open;

      // Escape key (not in the original code; recorded for information only).
      await trig.click(); await sleep(300);
      await page.keyboard.press('Escape'); await sleep(300);
      const afterEscape = (await measure(page, sel)).open;

      report.results.push({ viewport: vp.name, trigger: id, opened, afterScroll, stillOpenAfterOutsideClick: afterOutsideClick, stillOpenAfterEscape: afterEscape });
    }
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, `${label}_report.json`), JSON.stringify(report, null, 2));

  // Short console summary
  for (const r of report.results) {
    if (r.error) { console.log(`${r.viewport.padEnd(18)} ${r.trigger.padEnd(5)} ERROR ${r.error}`); continue; }
    const o = r.opened;
    console.log(`${r.viewport.padEnd(18)} ${r.trigger.padEnd(5)} visible=${o.visibleFraction} options=${o.options.map(x => x.clickableAtCenter ? 'ok' : 'BLOCKED').join('/')} pos=${o.position} gap=${o.gapBelowTrigger} | afterScroll: ${r.afterScroll.open ? 'open gap=' + r.afterScroll.gapBelowTrigger : 'closed'} | outsideClickCloses=${!r.stillOpenAfterOutsideClick} escCloses=${!r.stillOpenAfterEscape}${Object.keys(o.coveredBy).length ? ' coveredBy=' + JSON.stringify(o.coveredBy) : ''}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
