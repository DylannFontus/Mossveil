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
      out.charm = top('place a charm to find');                  // -> rec:charm-pickup
      out.prefab = top('save a group of objects as a prefab');   // -> rec:prefab
      out.water = top('add reflective water to my level');       // -> rec:water
      out.nail = top('upgrade my nail');                         // -> rec:nailsmith
      // newly-added recipe coverage
      out.zone = top('logic trigger when the player enters a zone');   // -> rec:logic-zone
      out.wings = top('add a double jump ability');                    // -> rec:wings
      out.biome = top('change the biome of this room');                // -> rec:biome
      out.elements = top('freeze enemies with a frost bolt');          // -> rec:elements
      out.del = top('how do I duplicate and delete objects');          // -> rec:select
      out.godray = top('add a god ray light shaft');                   // -> rec:godray
      out.timer = top('do something after a delay on a timer');        // -> rec:logic-timer
      // harvested charm / enemy / boss / cutscene knowledge
      out.charmInfo = top('what does the stoneheart charm do');        // -> charm:stoneheart
      out.enemyInfo = top('tell me about the tumblebug');              // -> enemy:tumblebug
      out.bossInfo = top('tell me about the moss sovereign');          // -> boss:mossSovereign
      out.csCam = top('add a camera move to a cutscene');              // -> rec:cs-camera
      // answer() renders steps + act buttons into the log
      C.ask('how do I make a door open with a lever?');
      const log = document.getElementById('cpLog');
      out.rendered = !!log && /Signal/i.test(log.textContent) && log.querySelectorAll('.cpAct').length > 0;
      // an act-button: arm placement of a lever; focus an object
      out.armed = G.__ed.companion.armPlace('dynamic', 'lever');
      out.openedCat = (() => { G.__ed.companion.openAssetCat('dynamic'); return true; })();
      out.focus = (() => { try { G.__ed.companion.focusSel({ kind: 'prop', i: 0 }); return true; } catch (e) { return false; } })();
      // diagnostics: a door wired to a signal nobody emits should be flagged
      const id = G.__ed.companion.currentId(); const L = G.LEVELS[id]; L.props = L.props || [];
      L.props.push({ type: 'door', x: 6, y: 6, signal: 'gate9' });
      const before = log.textContent.length;
      C.ask('check this room for problems');
      out.diag = /gate9|listens for|to check|⚠|⛔/.test(log.textContent.slice(before));
      // follow-up: "more" yields a Related list
      C.ask('how do I add lava'); const m1 = log.textContent.length; C.ask('more');
      out.followup = /Related/.test(log.textContent.slice(m1));
      // catalog: "describe all the charms" enumerates EVERY charm...
      const c1 = log.textContent.length; C.ask('give me a description of all the charms and what they do');
      const ct = log.textContent.slice(c1);
      out.charmCatalog = /Stoneheart/.test(ct) && /Keen Edge/.test(ct) && /Glass Heart/.test(ct);
      // ...but a specific charm still answers specifically (not the whole list)
      const c2 = log.textContent.length; C.ask('what does the stoneheart charm do');
      const st = log.textContent.slice(c2);
      out.charmSpecific = /Stoneheart/.test(st) && !/Keen Edge/.test(st);
      // enemies / spells catalogs
      const c3 = log.textContent.length; C.ask('list all the enemies'); const et = log.textContent.slice(c3);
      out.enemyCatalog = /Tumblebug/.test(et) && /Gnatling/.test(et);
      const c4 = log.textContent.length; C.ask('what spells are there'); const sp = log.textContent.slice(c4);
      out.spellCatalog = /Frost Bolt/.test(sp) && /Wraith Cry/.test(sp);
      // proactive badge reflects the broken door we pushed
      out.issueCount = C.issueCount();
      out.badge = C.refreshBadge();
      // field walkthrough: select a prop so the inspector populates, then walk it
      G.__ed.companion.focusSel({ kind: 'prop', i: 0 });
      out.walk = C.walkFields();
      // a paraphrase the token index alone might miss (semantic trigram nudge)
      out.para = top('how can i set a foe on fire');
      out.kb2 = C.kbSize();
      return out;
    });

    console.log('COMPANION:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.exists && o.kb > 200
      && o.lever === 'rec:lever-door' && o.connect === 'rec:portal' && o.boss === 'rec:boss'
      && o.weather === 'rec:weather' && /flora/.test(String(o.flora)) && o.rotate === 'rec:rotate'
      && /lava|hazard/.test(String(o.lava))
      && o.charm === 'rec:charm-pickup' && o.prefab === 'rec:prefab' && o.water === 'rec:water' && o.nail === 'rec:nailsmith'
      && o.zone === 'rec:logic-zone' && o.wings === 'rec:wings' && o.biome === 'rec:biome'
      && o.elements === 'rec:elements' && o.del === 'rec:select' && o.godray === 'rec:godray' && o.timer === 'rec:logic-timer'
      && o.charmInfo === 'charm:stoneheart' && /tumblebug/.test(String(o.enemyInfo)) && /mossSovereign/.test(String(o.bossInfo)) && o.csCam === 'rec:cs-camera'
      && o.rendered === true && o.armed === true && o.focus === true
      && o.diag === true && o.followup === true
      && o.charmCatalog === true && o.charmSpecific === true && o.enemyCatalog === true && o.spellCatalog === true
      && o.issueCount >= 1 && o.badge === 'block' && o.walk > 0
      && netHits === 0 && !errs.length;
    console.log(ok ? 'COMPANION TEST: PASS' : 'COMPANION TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
