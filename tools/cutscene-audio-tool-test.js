// Cutscene audio cues (Edit ▸ Narrative, roadmap #24): adds sfx/music/stinger cue events to the
// cutscene timeline. Verifies the new CS_EVENTS entries, the runtime handlers (a music cue
// crossfades the score; stinger/sfx fire without error), the doc/audit tool, registration/palette,
// zero outbound network and no page errors. In-memory only.
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
      const T = G.Tools, MT = T.cutsceneAudio, out = {};
      out.registered = T._test.toolIds().includes('cutsceneAudio');
      out.inPalette = T._test.paletteSearch('cutscene').some(l => /cutscene/i.test(l));
      out.roadmap = T.roadmapStats().done >= 31;

      // CS_EVENTS gained music + stinger (read via the editor's companion bridge)
      const ce = G.__ed.companion.csEvents();
      out.eventTypes = !!ce.music && !!ce.stinger && !!ce.sfx;
      out.musicFields = ce.music.fields.some(f => f[0] === 'track' && f[1] === 'sel') && ce.music.fields.some(f => f[0] === 'intensity');

      // cue docs pull live engine values
      const cues = MT.cueTypes();
      out.cueDocs = cues.length === 3 && cues.find(c => c.type === 'music').options.length > 0 && cues.find(c => c.type === 'stinger').options.join() === 'boss,item,secret';

      // ---- runtime: a music cue crossfades the score; stinger/sfx fire without throwing ----
      const cur0 = G.Music.current();
      const pick = (G.Music.TRACK_IDS || []).find(t => t !== cur0) || (G.Music.TRACK_IDS || [])[0];
      G.CUTSCENES = G.CUTSCENES || {};
      G.CUTSCENES.__audtest = { id: '__audtest', name: 'Audio Test', skippable: true, events: [
        { t: 0, dur: 0.1, type: 'music', track: pick, intensity: 0.5 },
        { t: 0.15, dur: 0.1, type: 'stinger', name: 'item' },
        { t: 0.25, dur: 0.1, type: 'sfx', name: 'chime' }
      ] };
      let ranNoError = true;
      try {
        G.Cutscene.start('__audtest', {});
        for (let i = 0; i < 30; i++) G.Cutscene.step(1 / 60);   // ~0.5s — fires all three cues
        if (G.Cutscene.active) G.Cutscene.finish();
      } catch (e) { ranNoError = false; out.runErr = e.message; }
      out.ranNoError = ranNoError;
      out.musicCrossfaded = G.Music.current() === pick;

      // audit sees the audio cues
      const row = MT.audit().find(r => r.id === '__audtest');
      out.audit = !!row && row.audio === 3 && row.counts.music === 1 && row.counts.stinger === 1 && row.counts.sfx === 1;
      delete G.CUTSCENES.__audtest;

      // tool opens
      out.opened = T.openTool('cutsceneAudio');
      T.closeTool();
      return out;
    });

    console.log('CUTSCENE-AUDIO-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'eventTypes', 'musicFields', 'cueDocs', 'ranNoError', 'musicCrossfaded', 'audit', 'opened'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'CUTSCENE-AUDIO-TOOL TEST: PASS' : 'CUTSCENE-AUDIO-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
