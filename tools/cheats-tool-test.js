// Playtest cheats (roadmap #63): the editor half. The Cheats tool (Edit ▸ Tools) is a remote for the
// running game's G.Cheats, reached across the Play-here iframe. This injects a stand-in target (so the
// test needs no live game), opens the tool, and asserts it registers / is in the palette / marks #63
// done, that every control (toggles + favours) calls through and the reported status follows, that the
// UI renders the toggles + favours, that clicking a toggle / favour drives the target and updates the
// banner, and that with no game it shows the "no game running" state. Zero outbound network.
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
    await ed.setRequestInterception(true);
    ed.on('request', r => { const u = r.url(); if (/^https?:\/\//.test(u) && !u.includes('localhost') && !u.includes('127.0.0.1')) { netHits++; r.abort(); } else r.continue(); });
    await ed.goto('http://localhost:7707/editor/editor.html', { waitUntil: 'load' });
    await wait(2800);

    const o = await ed.evaluate(async () => {
      const T = G.Tools, MT = T.cheats, out = {};

      // ---- registration / palette / roadmap / API surface ----
      out.registered = T._test.toolIds().includes('cheats');
      out.inPalette = T._test.paletteSearch('cheat').some(l => /cheat|god|charm/i.test(l));
      out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 63 && i[2] === 'done'));
      out.engineApi = !!(MT && MT.toggle && MT.set && MT.reset && MT.heal && MT.fillSoul && MT.giveGlimmer && MT.unlockCharms && MT.clearCharms && MT.unlockAbilities && MT.killEnemies && MT.status && MT.available);

      // ---- with NO game, controls fail gracefully and status reports unavailable ----
      MT._target = () => null;
      out.unavailable = MT.available() === false && MT.status().available === false && MT.toggle('god') === false && MT.heal() === false && MT.unlockCharms() === false && MT.killEnemies() === false;
      out.openedEmpty = T.openTool('cheats');
      const emptyTxt = document.querySelector('.tc-host').textContent;
      out.emptyState = /No game is running/i.test(emptyTxt) && /Play here/i.test(emptyTxt);
      T.closeTool();

      // ---- inject a stand-in target that mimics G.Cheats; assert the remote drives it ----
      const TG = ['god', 'infiniteSoul', 'infiniteDash', 'infiniteAir'];
      const fake = {
        god: false, infiniteSoul: false, infiniteDash: false, infiniteAir: false,
        _glimmer: 50, _owned: 2, _total: 10, _killed: 0, _healed: 0, _filled: 0, _cleared: 0, _abil: 0,
        status() { return { god: this.god, infiniteSoul: this.infiniteSoul, infiniteDash: this.infiniteDash, infiniteAir: this.infiniteAir, any: this.god || this.infiniteSoul || this.infiniteDash || this.infiniteAir, inGame: true, hp: 3, maxHp: 5, soul: 42, glimmer: this._glimmer, charmsOwned: this._owned, totalCharms: this._total, foes: 4 }; },
        set(k, on) { if (TG.indexOf(k) >= 0) { this[k] = !!on; return true; } return false; },
        toggle(k) { if (TG.indexOf(k) >= 0) { this[k] = !this[k]; return this[k]; } return false; },
        reset() { this.god = this.infiniteSoul = this.infiniteDash = this.infiniteAir = false; },
        heal() { this._healed++; return true; }, fillSoul() { this._filled++; return true; },
        giveGlimmer(n) { this._glimmer += n; return true; },
        unlockCharms() { this._owned = this._total; return this._total; },
        clearCharms() { this._cleared++; return true; }, unlockAbilities() { this._abil++; return true; },
        killEnemies() { this._killed++; return 3; }
      };
      MT._target = () => fake;

      out.available = MT.available() === true && MT.status().available === true;
      out.setThru = MT.set('god', true) === true && fake.god === true && MT.status().god === true;
      out.toggleThru = MT.toggle('infiniteDash') === true && fake.infiniteDash === true; MT.toggle('infiniteDash');
      out.toggleOff = fake.infiniteDash === false;
      out.resetThru = MT.reset() === true && fake.god === false && MT.status().any === false;
      out.healThru = MT.heal() === true && fake._healed === 1;
      out.fillThru = MT.fillSoul() === true && fake._filled === 1;
      const g0 = fake._glimmer; out.glimmerThru = MT.giveGlimmer(100) === true && fake._glimmer === g0 + 100;
      out.charmsThru = MT.unlockCharms() === fake._total && fake._owned === fake._total;
      out.clearThru = MT.clearCharms() === true && fake._cleared === 1;
      out.abilThru = MT.unlockAbilities() === true && fake._abil === 1;
      out.killThru = MT.killEnemies() === 3 && fake._killed === 1;

      // ---- UI: toggles + favours render, and clicking them drives the target ----
      fake.reset();
      out.opened = T.openTool('cheats');
      const host = document.querySelector('.tc-host');
      const btns = () => Array.prototype.slice.call(host.querySelectorAll('button'));
      out.hasToggles = btns().some(b => /God mode/.test(b.textContent)) && btns().some(b => /Infinite soul/.test(b.textContent));
      out.hasFavours = btns().some(b => /Full heal/.test(b.textContent)) && btns().some(b => /Kill room foes/.test(b.textContent));

      const godBtn = btns().find(b => /God mode/.test(b.textContent)); if (godBtn) godBtn.click();
      out.toggleClick = fake.god === true && /CHEATS ON/i.test(document.querySelector('.tc-host').textContent);

      const k0 = fake._killed;
      const killBtn = btns().find(b => /Kill room foes/.test(b.textContent)); if (killBtn) killBtn.click();
      out.favourClick = fake._killed === k0 + 1;

      T.closeTool();
      MT._target = null;   // restore
      return out;
    });

    console.log('CHEATS-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'engineApi', 'unavailable', 'openedEmpty', 'emptyState', 'available', 'setThru', 'toggleThru', 'toggleOff', 'resetThru', 'healThru', 'fillThru', 'glimmerThru', 'charmsThru', 'clearThru', 'abilThru', 'killThru', 'opened', 'hasToggles', 'hasFavours', 'toggleClick', 'favourClick'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'CHEATS-TOOL TEST: PASS' : 'CHEATS-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
