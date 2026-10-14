// Usage: node stakes-keyboard.js <url> <outDir> <label>
// Keyboard/interaction checks for the wager-calculator "Stakes" selector.
// Each scenario starts from a fresh page load; results + screenshots go to outDir.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const [,, url = 'http://localhost:3301/', outDir = './out', label = 'run'] = process.argv;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Find the stakes trigger (button or input) under the "Stakes" label, whatever component is used.
const STATE = `(() => {
  const labelEl = [...document.querySelectorAll('label,div,span,h2,h3')].find(e => e.textContent.trim() === 'Stakes');
  let section = labelEl; for (let i = 0; i < 4 && section && !section.querySelector('button,input'); i++) section = section.parentElement;
  const trigger = section && (section.querySelector('button') || section.querySelector('input'));
  const input = section && section.querySelector('input[type=text], input:not([type])');
  const opts = [...document.querySelectorAll('[role=option]')];
  const active = opts.find(o => o.getAttribute('data-focus') !== null || o.getAttribute('data-active') !== null || o.getAttribute('aria-selected') === 'true' && o.matches('[data-focus]'));
  const ae = document.activeElement;
  const searchInput = [...document.querySelectorAll('input')].find(i => /search/i.test(i.placeholder || '') || i.getAttribute('role') === 'combobox');
  return {
    triggerText: trigger ? (trigger.value || trigger.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40) : null,
    open: opts.length > 0,
    optionCount: opts.length,
    highlighted: active ? active.textContent.trim().replace(/\\s+/g, ' ').slice(0, 40) : null,
    searchValue: searchInput ? searchInput.value : null,
    focus: ae ? (ae.tagName.toLowerCase() + (ae.getAttribute('role') ? '[' + ae.getAttribute('role') + ']' : '') + (ae.placeholder ? '(' + ae.placeholder + ')' : '') + ' ' + (ae.textContent || ae.value || '').trim().replace(/\\s+/g, ' ').slice(0, 30)) : null,
  };
})()`;

async function fresh(browser, w = 1280, h = 800) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await sleep(500);
  return page;
}
const state = page => page.evaluate(STATE);
async function openWithMouse(page) {
  const box = await page.evaluate(() => {
    const labelEl = [...document.querySelectorAll('label,div,span,h2,h3')].find(e => e.textContent.trim() === 'Stakes');
    let s = labelEl; for (let i = 0; i < 4 && s && !s.querySelector('button,input'); i++) s = s.parentElement;
    const t = s.querySelector('button') || s.querySelector('input');
    t.scrollIntoView({ block: 'center' });
    const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await sleep(400);
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const results = [];
  const rec = async (name, page, extra = {}) => {
    const s = await state(page);
    results.push({ scenario: name, ...s, ...extra });
    await page.screenshot({ path: path.join(outDir, `${label}_${name}.png`) });
    console.log(`${name.padEnd(34)} ${JSON.stringify({ ...s, ...extra })}`);
  };

  // S1: open with mouse, type a query, ArrowDown, Enter -> expect the matching option selected.
  let p = await fresh(browser);
  await openWithMouse(p); await rec('s1a_opened', p);
  await p.keyboard.type('eur', { delay: 60 }); await sleep(300); await rec('s1b_typed_eur', p);
  await p.keyboard.press('ArrowDown'); await sleep(200); await rec('s1c_arrowdown', p);
  await p.keyboard.press('ArrowDown'); await sleep(200); await rec('s1d_arrowdown2', p);
  await p.keyboard.press('Enter'); await sleep(400); await rec('s1e_enter', p);
  await p.close();

  // S2: a query containing a space must stay in the search box and not select anything.
  p = await fresh(browser);
  await openWithMouse(p);
  await p.keyboard.type('hong kong', { delay: 60 }); await sleep(300); await rec('s2_typed_hong_kong', p);
  await p.close();

  // S3: keyboard-only from the previous field: Tab into the control, open, search, choose.
  p = await fresh(browser);
  // Focus the tabbable element immediately before the Stakes control, then press Tab.
  await p.evaluate(() => {
    const labelEl = [...document.querySelectorAll('label,div,span,h2,h3')].find(e => e.textContent.trim() === 'Stakes');
    let s = labelEl; for (let i = 0; i < 4 && s && !s.querySelector('button,input'); i++) s = s.parentElement;
    const t = s.querySelector('button') || s.querySelector('input');
    const tabbables = [...document.querySelectorAll('a[href],button,input,textarea,select,[tabindex]')].filter(e => e.tabIndex >= 0 && !e.disabled && e.getClientRects().length);
    const prev = tabbables[tabbables.indexOf(t) - 1];
    (prev || document.body).focus();
  });
  await p.keyboard.press('Tab'); await sleep(200); await rec('s3a_tab_into_stakes', p);
  await p.keyboard.press('ArrowDown'); await sleep(400); await rec('s3b_arrowdown_opens', p);
  await p.keyboard.type('yen', { delay: 60 }); await sleep(300); await rec('s3c_typed_yen', p);
  await p.keyboard.press('ArrowDown'); await sleep(200);
  await p.keyboard.press('Enter'); await sleep(400); await rec('s3d_enter', p);
  await p.close();

  // S4: Tab while open (from search) — where does focus go, does the list stay usable?
  p = await fresh(browser);
  await openWithMouse(p);
  await p.keyboard.press('Tab'); await sleep(300); await rec('s4_tab_while_open', p);
  await p.close();

  // S5: Escape closes and returns focus to the control; selection unchanged.
  p = await fresh(browser);
  await openWithMouse(p); await p.keyboard.type('gbp', { delay: 60 }); await sleep(200);
  await p.keyboard.press('Escape'); await sleep(300); await rec('s5_escape', p);
  await p.close();

  // S6: mouse selection still works (regression check).
  p = await fresh(browser);
  await openWithMouse(p);
  await p.keyboard.type('cookie', { delay: 60 }); await sleep(300);
  const clicked = await p.evaluate(() => { const o = [...document.querySelectorAll('[role=option]')][0]; if (!o) return null; o.scrollIntoView({ block: 'center' }); const r = o.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: o.textContent.trim().slice(0, 30) }; });
  if (clicked) { await p.mouse.click(clicked.x, clicked.y); await sleep(400); }
  await rec('s6_mouse_click_first_filtered', p, { clickedOption: clicked && clicked.text });
  await p.close();

  // S7: mobile viewport open state (visual)
  p = await fresh(browser, 390, 844);
  await openWithMouse(p); await rec('s7_mobile_open', p);
  await p.close();

  await browser.close();
  fs.writeFileSync(path.join(outDir, `${label}_keyboard_report.json`), JSON.stringify(results, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
