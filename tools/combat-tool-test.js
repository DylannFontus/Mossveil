// Combat stem (roadmap #81): the classic-style battle groove (pad + arpeggio + kick + hat that swell with
// danger) externalised into audio.js DEFAULT_COMBAT -> data/combat.js (G.COMBAT_DATA), authored by the
// Combat editor (Edit ▸ Audio). This test asserts the overlay loaded + byte-identical defaults, applyData
// clamps/validates (incl. the arp pattern), the _combatStep maths reproduce the scheduled groove, and the
// tool registers/opens/edits a working copy (fields + pattern + wave) + applies + auditions + draws its
// sequencer — WITHOUT the real save(). Engine restored in finally. Offline, no errors.
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
      const out = {}, T = G.Tools, A = G.Audio, MT = T.combat;
      const saved = A.combatExportCurrent();
      const near = (a, b) => Math.abs(a - b) < 1e-9;
      try {
        out.fromData = !!G.COMBAT_DATA && G.COMBAT_DATA.busLevel === 0.22 && Array.isArray(G.COMBAT_DATA.arp.pattern);
        out.hooks = !!(A.combatApplyData && A.combatExportDefaults && A.combatExportCurrent && A.combatParams && A.setCombat && A._combatStep);
        out.defaults = JSON.stringify(A.combatExportCurrent()) === JSON.stringify(A.combatExportDefaults());
        out.curEqData = JSON.stringify(A.combatExportCurrent()) === JSON.stringify(G.COMBAT_DATA);
        // _combatStep reproduces the scheduled groove at defaults
        A.combatApplyData(null);
        const s0 = A._combatStep(0.5, 0), s1 = A._combatStep(0.5, 1), s2 = A._combatStep(1, 2);
        out.stepMix = near(s0.interval, 0.2 - 0.5 * 0.07) && near(s0.busGain, 0.5 * 0.22) && s0.gate === 0.12;
        out.stepArp = s0.arp.type === 'triangle' && near(s0.arp.t, 0.13) && near(s0.arp.vol, 0.05 + 0.5 * 0.11) && near(s0.arp.a, 0.004);
        out.stepKick = !!s0.kick && s0.kick.f0 === 92 && s0.kick.f1 === 46 && near(s0.kick.vol, 0.10 + 0.5 * 0.12) && !s0.hat;
        out.stepHat = !s1.kick && !!s1.hat && s1.hat.f0 === 4200 && s1.hat.f1 === 6500 && near(s1.hat.vol, 0.02 + 0.5 * 0.04) && s1.hat.q === 0.7;
        out.stepPitch = near(s2.arp.f0 / s0.arp.f0, 2);          // note 2 is an octave above note 1 (areaRoot-independent)
        // clamp + pattern validation
        A.combatApplyData({ busLevel: 9, gate: -1, stepFast: 0, kick: { every: 2 }, arp: { pattern: [1, -2, 'x', 3] } });
        const c = A.combatExportCurrent();
        out.clamp = c.busLevel === 1 && c.gate === 0 && c.stepFast === 0.02 && c.kick.every === 2;
        out.patternClean = JSON.stringify(c.arp.pattern) === JSON.stringify([1, 3]);
        A.combatApplyData(null);
        // ---- tool ----
        out.registered = T._test.toolIds().indexOf('combat') >= 0;
        out.inPalette = T._test.paletteSearch('combat').some(l => /combat|groove|stem|battle/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 81 && i[2] === 'done'));
        out.opened = T.openTool('combat');
        MT.load();
        MT.setField('busLevel', 0.4); MT.setField('kick.f0', 70); MT.setType('arp', 'square');
        out.toolEdit = MT.getWorking().busLevel === 0.4 && MT.getWorking().kick.f0 === 70 && MT.getWorking().arp.type === 'square' && MT.state.dirty === true;
        const pat = MT.setPattern('1, 2, 4, junk, 3');
        out.toolPattern = JSON.stringify(pat) === JSON.stringify([1, 2, 4, 3]);
        MT.setField('kick.every', 3); out.everyInt = MT.getWorking().kick.every === 3;
        MT.applyToEngine();
        out.applied = A.combatExportCurrent().busLevel === 0.4 && A.combatExportCurrent().kick.f0 === 70;
        // audition must not throw (headless ctx suspended)
        let threw = false; try { if (A.init) A.init(); MT.setAudIntensity(0.8); MT.audition(); MT.stopAudition(); } catch (e) { threw = true; } out.noThrow = !threw;
        // sequencer preview drawn
        const cv = document.querySelector('canvas[width="350"][height="170"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { nz = 1; break; } out.previewDrawn = !!nz; }
        T.closeTool();
      } finally { A.combatApplyData(saved); if (A.setMusicStyle) A.setMusicStyle('score'); if (A.setIntensity) A.setIntensity(0); }
      out.restored = JSON.stringify(A.combatExportCurrent()) === JSON.stringify(saved);
      return out;
    });

    console.log('COMBAT:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqData', 'stepMix', 'stepArp', 'stepKick', 'stepHat', 'stepPitch', 'clamp', 'patternClean', 'registered', 'inPalette', 'roadmap', 'opened', 'toolEdit', 'toolPattern', 'everyInt', 'applied', 'noThrow', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'COMBAT TOOL TEST: PASS' : 'COMBAT TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
