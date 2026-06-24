// Offline Editor Companion: builds a KB from the editor's own data + recipes, answers
// natural-language "how do I…" questions with the right topic, and its act-buttons drive
// the editor (switch asset category, arm placement). Fully offline — no network calls.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await wait(800);
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errs = [];
  let netHits = 0;
  try {
    const ed = await browser.newPage();
    ed.on('pageerror', e => errs.push('[editor] ' + e.message));
    ed.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    // catch any outbound network the companion might attempt (must stay fully offline)
    await ed.setRequestInterception(true);
    ed.on('request', r => { const u = r.url(); if (/^https?:\/\//.test(u) && !u.includes('localhost') && !u.includes('127.0.0.1')) { netHits++; r.abort(); } else r.continue(); });
    await ed.goto('http://localhost:7707/editor/editor.html', { waitUntil: 'load' });
    await wait(2800);

    const o = await ed.evaluate(() => {
      const C = G.Companion, out = {};
      out.exists = !!C; out.kb = C.kbSize();
      // top-1 topic for a set of natural questions (with synonyms + a typo)
      const top = q => { const r = C.search(q); return r[0] ? r[0].id : null; };
      out.lever = top('how do I make a door open with a lever');
      out.lava = top('i want to add lava');                       // synonym -> hazard recipe or lava asset
      out.connect = top('connect two rooms together');
      out.boss = top('set up a bossfight');                       // 'bossfight' synonym
      out.weather = top('change the rain and snow');
      out.flora = top('glowing mushrooom that can die');          // typo 'mushrooom'
      out.rotate = top('rotate an objects collision box');
      // answer() renders steps + act buttons into the log
      C.ask('how do I make a door open with a lever?');
      const log = document.getElementById('cpLog');
      out.rendered = !!log && /Signal/i.test(log.textContent) && log.querySelectorAll('.cpAct').length > 0;
      // an act-button: arm placement of a lever
      out.armed = G.__ed.companion.armPlace('dynamic', 'lever');
      out.openedCat = (() => { G.__ed.companion.openAssetCat('dynamic'); return true; })();
      return out;
    });

    console.log('COMPANION:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.exists && o.kb > 40
      && o.lever === 'rec:lever-door' && o.connect === 'rec:portal' && o.boss === 'rec:boss'
      && o.weather === 'rec:weather' && /flora/.test(String(o.flora)) && o.rotate === 'rec:rotate'
      && /lava|hazard/.test(String(o.lava))
      && o.rendered === true && o.armed === true && netHits === 0 && !errs.length;
    console.log(ok ? 'COMPANION TEST: PASS' : 'COMPANION TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
