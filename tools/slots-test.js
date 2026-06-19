// Headless test for the save-slot system: menu state, slots screen rendering,
// new-game-into-slot, continue, and delete. Captures console errors + screenshots.
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
const URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--window-size=1280,720']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));

  const out = [];
  const log = (...a) => { const s = a.join(' '); out.push(s); console.log(s); };

  // ---- 1. fresh start: clear all saves ----
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => {
    ['mossveil-save-v1', 'mossveil-active-slot', 'mossveil-slot-0', 'mossveil-slot-1',
     'mossveil-slot-2', 'mossveil-slot-3', 'mossveil-slot-4'].forEach(k => localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: 'load' });
  await sleep(1800);

  let menu = await page.evaluate(() => (G.Main.menuItems || []).map(i => i.label + (i.enabled ? '' : '(off)')));
  log('FRESH MENU:', JSON.stringify(menu));   // Continue should be off

  // ---- 2. open the slots screen via the menu (navigate to "Load Save") ----
  for (let i = 0; i < 6; i++) {
    const idx = await page.evaluate(() => G.Main.menuIndex);
    const lbl = await page.evaluate(() => G.Main.menuItems[G.Main.menuIndex].label);
    if (lbl === 'Load Save') break;
    await page.keyboard.press('ArrowDown'); await sleep(120);
  }
  await page.keyboard.press('Enter'); await sleep(500);
  log('AFTER LOAD SAVE -> state:', await page.evaluate(() => G.Main.state));
  await page.screenshot({ path: path.join(SHOTS, 'slots-empty.png') });

  // ---- 3. start a new run in slot III (index 2) from an empty slot ----
  await page.keyboard.press('ArrowDown'); await sleep(100);
  await page.keyboard.press('ArrowDown'); await sleep(100);
  log('slotIndex before choose:', await page.evaluate(() => G.Main.slotIndex));
  await page.keyboard.press('Enter'); await sleep(1500);
  const afterNew = await page.evaluate(() => ({ state: G.Main.state, active: G.activeSlot, slot2: !!localStorage.getItem('mossveil-slot-2') }));
  log('AFTER NEW-IN-SLOT-2:', JSON.stringify(afterNew));   // state cutscene/transition, active 2, slot2 written

  // ---- 4. inject varied saves into several slots, reload, inspect summaries ----
  await page.evaluate(() => {
    const mk = (data, ago) => JSON.stringify({ data, updatedAt: Date.now() - ago, createdAt: Date.now() - ago });
    localStorage.setItem('mossveil-slot-0', mk({ bench: { room: 'gloom', x: 5, y: 2 }, wings: true, bosses: { mossSovereign: true, thornback: true } }, 90 * 1000));
    localStorage.setItem('mossveil-slot-1', mk({ bench: { room: 'rest', x: 1, y: 1 } }, 3 * 3600 * 1000));
    localStorage.removeItem('mossveil-slot-2');
    localStorage.removeItem('mossveil-slot-3');
    localStorage.removeItem('mossveil-slot-4');
    localStorage.setItem('mossveil-active-slot', '0');
  });
  await page.reload({ waitUntil: 'load' });
  await sleep(1600);
  menu = await page.evaluate(() => (G.Main.menuItems || []).map(i => i.label + (i.enabled ? '' : '(off)')));
  log('MENU WITH SAVES:', JSON.stringify(menu));   // Continue should be ON

  // navigate to Load Save again
  for (let i = 0; i < 6; i++) {
    const lbl = await page.evaluate(() => G.Main.menuItems[G.Main.menuIndex].label);
    if (lbl === 'Load Save') break;
    await page.keyboard.press('ArrowDown'); await sleep(120);
  }
  await page.keyboard.press('Enter'); await sleep(500);
  const infos = await page.evaluate(() => (G.Main.slots || []).map(s => G.Main.slotInfo(s)));
  log('SLOT INFOS:', JSON.stringify(infos));
  await page.screenshot({ path: path.join(SHOTS, 'slots-filled.png') });

  // ---- 5. delete slot I (index 0): open confirm, cancel, then confirm ----
  await page.evaluate(() => { G.Main.slotIndex = 0; });
  await page.keyboard.press('Delete'); await sleep(300);
  log('CONFIRM UP?', await page.evaluate(() => !!G.Main.confirm));
  await page.screenshot({ path: path.join(SHOTS, 'slots-delete-confirm.png') });
  await page.keyboard.press('Enter'); await sleep(250);   // default sel=No -> cancels
  log('AFTER CANCEL slot0 exists?', await page.evaluate(() => !!localStorage.getItem('mossveil-slot-0')));
  await page.keyboard.press('Delete'); await sleep(250);
  await page.keyboard.press('ArrowLeft'); await sleep(150);  // select Yes
  await page.keyboard.press('Enter'); await sleep(350);      // confirm delete
  const afterDel = await page.evaluate(() => ({ slot0: !!localStorage.getItem('mossveil-slot-0'), slot1: !!localStorage.getItem('mossveil-slot-1') }));
  log('AFTER DELETE slot0:', JSON.stringify(afterDel));   // slot0 false, slot1 true
  await page.screenshot({ path: path.join(SHOTS, 'slots-after-delete.png') });

  // ---- 6. back to title ----
  await page.keyboard.press('Escape'); await sleep(300);
  log('AFTER ESC -> state:', await page.evaluate(() => G.Main.state));

  log(errors.length ? 'ERRORS:\n' + errors.slice(0, 30).join('\n') : 'NO CONSOLE ERRORS');
  await browser.close();
})().catch(e => { console.error('SLOTS TEST FAILED:', e); process.exit(1); });
