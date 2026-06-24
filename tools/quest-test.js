// Quests: dialogue choice starts a quest, tracker shows it, doneFlag auto-completes, log lists it.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await wait(800);
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errs = [];
  try {
    const game = await browser.newPage();
    await game.setViewport({ width: 1100, height: 680 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2200);

    const o = await game.evaluate(() => {
      const Q = G.Quests, o = {}; G.save.quests = {};
      // a dialogue choice starts a quest with a doneFlag
      const dlg = { name: 'Elder', lines: [{ speaker: 'Elder', text: 'Find the relic.', choices: [{ label: 'I will', quest: { id: 'relic', title: 'The Lost Relic', objective: 'Find the relic below', doneFlag: 'gotRelic' } }] }] };
      G.Dialogue.start(dlg);
      for (let i = 0; i < 60; i++) G.Dialogue.update(0.05);
      G.Dialogue.choose(0);
      o.started = Q.active().length === 1 && Q.active()[0].id === 'relic';
      o.tracked = Q.tracked() && Q.tracked().title === 'The Lost Relic';
      // set the done flag -> Quests.update should complete it
      G.save.flags = G.save.flags || {}; G.save.flags.gotRelic = true;
      Q.update();
      o.completed = Q.all().some(q => q.id === 'relic' && q.state === 'done');
      o.noActive = Q.active().length === 0;
      // direct start + complete API
      Q.start({ id: 'q2', title: 'Second', objective: 'Do it' });
      o.q2Active = Q.active().length === 1;
      Q.complete('q2');
      o.q2Done = Q.active().length === 0 && Q.all().length === 2;
      // show the quest log page
      G.Main.state = 'quests'; G.Main.questIndex = 0;
      return o;
    });
    await wait(300);
    await game.screenshot({ path: path.join(SHOTS, 'quests.png') });
    console.log('RESULT:', JSON.stringify(o));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.started && o.tracked && o.completed && o.noActive && o.q2Active && o.q2Done && !errs.length;
    console.log(ok ? 'QUEST TEST: PASS' : 'QUEST TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
