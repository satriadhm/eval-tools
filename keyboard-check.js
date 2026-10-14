// Usage: node keyboard-check.js <label=url> [...]
// For each "Build Your Portfolio" trigger: focus it, open with Enter, then press Tab and
// report where focus goes (into the menu or past it), and whether Enter on the first
// menu item works. Records keyboard reachability of the menu options.
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TRIGGERS = { nav: 'button.nav-cta', hero: '.hero button.btn-primary', cta: '.cta-inner button.btn-primary' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const targets = process.argv.slice(2).map(p => { const i = p.indexOf('='); return { label: p.slice(0, i), url: p.slice(i + 1) }; });

const describe = () => {
  const el = document.activeElement;
  if (!el || el === document.body) return 'body';
  const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  return `${el.tagName.toLowerCase()} "${t}"`;
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  for (const t of targets) {
    for (const [id, sel] of Object.entries(TRIGGERS)) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(t.url, { waitUntil: 'networkidle0' });
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await sleep(800);
      await page.focus(sel);
      await page.keyboard.press('Enter');
      await sleep(400);
      const open = await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('I already have a portfolio') && b.getBoundingClientRect().height > 0));
      const tabs = [];
      for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); await sleep(150); tabs.push(await page.evaluate(describe)); }
      const reachedMenu = tabs.some(s => s.includes("I'm new here") || s.includes('I already have'));
      console.log(`${t.label.padEnd(8)} ${id.padEnd(5)} openedByEnter=${open} reachedMenuWithTab=${reachedMenu} tabSequence=${JSON.stringify(tabs)}`);
      await page.close();
    }
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
