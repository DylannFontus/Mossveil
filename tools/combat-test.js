// Combat stem — GAME-SIDE seam test (roadmap #81). The classic-style combat groove (pad + arpeggio +
// kick + hat that swell with danger) had its tuning hardcoded in audio.js's update loop; it's now
// overlaid from data/combat.js (G.COMBAT_DATA). This boots the REAL game and proves: (1) the defaults are
// byte-identical to the OLD hardcoded values (a literal snapshot), (2) the _combatStep hook reproduces the
// exact scheduled groove the old code emitted (interval/busGain/gate + arp/kick/hat specs) so the classic
// groove is unchanged, (3) a retune changes what every step would schedule, and (4) running the engine in
// classic style doesn't throw and score style is unaffected. (Audio can't truly play headless — no
// AudioContext gesture — so the proof is the data + the _combatStep maths + clean updates.)
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
    const game = await browser.newPage();
    await game.setViewport({ width: 1100, height: 680 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.setRequestInterception(true);
    game.on('request', r => { const u = r.url(); if (/^https?:\/\//.test(u) && !u.includes('localhost') && !u.includes('127.0.0.1')) { netHits++; r.abort(); } else r.continue(); });
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2300);

    const o = await game.evaluate(() => {
      const out = {}, A = G.Audio;
      const near = (a, b) => Math.abs(a - b) < 1e-9;
      out.hasModule = !!(A.combatExportCurrent && A.combatApplyData && A._combatStep);
      // the OLD hardcoded combat tuning, captured verbatim — the defaults must match this exactly
      const OLD = {
        busLevel: 0.22, gate: 0.12, stepSlow: 0.20, stepFast: 0.13,
        pad: { level: 0.28, cutoff: 900, q: 0.6, type: 'triangle', rootMult: 0.5, fifthMult: 0.75 },
        arp: { pattern: [1, 1.5, 2, 3, 2, 1.5], type: 'triangle', t: 0.13, volBase: 0.05, volInt: 0.11, attack: 0.004 },
        kick: { every: 4, type: 'sine', f0: 92, f1: 46, t: 0.13, volBase: 0.10, volInt: 0.12 },
        hat: { f0: 4200, f1: 6500, t: 0.04, volBase: 0.02, volInt: 0.04, q: 0.7 }
      };
      out.defaultsOld = JSON.stringify(A.combatExportDefaults()) === JSON.stringify(OLD);
      out.dataIdentical = JSON.stringify(A.combatExportCurrent()) === JSON.stringify(A.combatExportDefaults());
      out.overlayIdentical = JSON.stringify(G.COMBAT_DATA) === JSON.stringify(OLD);
      // _combatStep reproduces the EXACT groove the old update() emitted, at a sample intensity
      A.combatApplyData(null);
      const inten = 0.6;
      const s0 = A._combatStep(inten, 0), s1 = A._combatStep(inten, 1), s3 = A._combatStep(inten, 3);
      out.oldBus = near(s0.busGain, inten * 0.22) && s0.gate === 0.12 && near(s0.interval, 0.2 - inten * 0.07);
      out.oldArp = s0.arp.type === 'triangle' && near(s0.arp.t, 0.13) && near(s0.arp.vol, 0.05 + inten * 0.11) && near(s0.arp.a, 0.004) && s0.arp.f0 > 0;
      out.oldKick = !!s0.kick && s0.kick.type === 'sine' && s0.kick.f0 === 92 && s0.kick.f1 === 46 && near(s0.kick.t, 0.13) && near(s0.kick.vol, 0.10 + inten * 0.12);
      out.oldHat = !s1.kick && !!s1.hat && s1.hat.f0 === 4200 && s1.hat.f1 === 6500 && near(s1.hat.t, 0.04) && near(s1.hat.vol, 0.02 + inten * 0.04) && s1.hat.q === 0.7 && !!s3.hat;
      out.octave = near(A._combatStep(inten, 2).arp.f0 / s0.arp.f0, 2);    // pattern[2]=2 is an octave over pattern[0]=1
      // a retune changes what every step schedules
      A.combatApplyData({ busLevel: 0.5, arp: { volBase: 0.2 } });
      const r0 = A._combatStep(0.6, 0);
      out.retune = near(r0.busGain, 0.6 * 0.5) && near(r0.arp.vol, 0.2 + 0.6 * 0.11);
      A.combatApplyData(null);
      // running the engine in classic style (where the groove lives) must not throw...
      let threw = false;
      try {
        A.init(); A.setMusicStyle('classic'); A.setIntensity(0.8);
        for (let i = 0; i < 30; i++) A.update(0.06);
        A.setMusicStyle('score'); A.setIntensity(0);
        for (let i = 0; i < 10; i++) A.update(0.05);     // ...and score style still runs cleanly
      } catch (e) { threw = true; }
      out.noThrow = !threw;
      out.styleBack = A.musicStyle() === 'score';
      return out;
    });

    console.log('RESULT:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasModule', 'defaultsOld', 'dataIdentical', 'overlayIdentical', 'oldBus', 'oldArp', 'oldKick', 'oldHat', 'octave', 'retune', 'noThrow', 'styleBack'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'COMBAT GAME TEST: PASS' : 'COMBAT GAME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
