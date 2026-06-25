// Music / Soundtrack editor (Edit ▸ Audio): the soundtrack dataset is externalised to
// data/music.js and authored in-editor — add/rename/edit tracks, edit the biome→track adaptive
// map, hot-apply to the running engine, and live-preview. Editor-only, offline (local server only).
// NOTE: deliberately does NOT call save() so it never overwrites the committed data/music files.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await wait(800);
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
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
      const T = G.Tools, M = G.Music, MT = T.music, out = {};
      // externalised dataset loaded from data/music.js and merged
      out.fromData = !!G.MUSIC && !!G.MUSIC.tracks;
      out.engineTracks = M.TRACK_IDS.length;             // 24 (excludes boss)
      out.exportCount = Object.keys(M.exportCurrent().tracks).length;  // 25 (incl boss)
      // tool registered + roadmap flagged
      out.registered = T._test.toolIds().includes('music');
      out.inPalette = T._test.paletteSearch('soundtrack').some(l => /soundtrack/i.test(l));
      const rm = T.roadmapStats(); out.roadmapDone = rm.done;          // >=7 (foundation 4 + music 3)
      // open the tool -> renders the track list
      out.opened = T.openTool('music');
      out.listCount = document.querySelectorAll('#toolHost .tc-pal-item').length;
      out.hasState = !!(MT.state.data && MT.state.selId);
      // author a new track and edit it, then hot-apply to the engine
      const id = MT.addTrack();
      out.renamed = MT.renameTrack(id, 'zzcustom');
      MT.setField('zzcustom', 'bpm', 123);
      MT.setField('zzcustom', 'scale', 'PHR');
      MT.setField('zzcustom', 'prog', [0, 6, 4, 1]);
      MT.applyToEngine();
      out.engineHasCustom = M.TRACK_IDS.includes('zzcustom');
      out.customBpm = M.exportCurrent().tracks.zzcustom.bpm === 123;
      // adaptive rules: map a biome to it, hot-apply, verify trackForBiome resolves
      MT.biomeSet('zzbiome', 'zzcustom');
      MT.applyToEngine();
      out.biomeResolves = M.trackForBiome('zzbiome') === 'zzcustom';
      out.biomeFallback = M.trackForBiome('nope-unknown') === 'gloom';
      // live preview: start audio, audition the track, drive the sequencer
      MT.select('zzcustom');
      MT.previewOn();
      out.preview = M.playing() === true && M.current() === '__preview';
      MT.setIntensity(0.9);                              // combat bed
      let stepErr = null;
      try { for (let i = 0; i < 60; i++) M.update(); } catch (e) { stepErr = String(e); }
      out.stepOK = stepErr === null;
      MT.previewOff();
      out.stopped = M.playing() === false;
      // delete guard: boss can't be removed
      out.bossProtected = MT.removeTrack('boss') === false;
      T.closeTool();
      return out;
    });

    console.log('MUSIC-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.fromData && o.engineTracks >= 24 && o.exportCount >= 25
      && o.registered && o.inPalette && o.roadmapDone >= 7
      && o.opened && o.listCount >= 20 && o.hasState
      && o.renamed && o.engineHasCustom && o.customBpm
      && o.biomeResolves && o.biomeFallback
      && o.preview && o.stepOK && o.stopped && o.bossProtected
      && netHits === 0 && !errs.length;
    console.log(ok ? 'MUSIC-TOOL TEST: PASS' : 'MUSIC-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
