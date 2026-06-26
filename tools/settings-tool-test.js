// Settings menu (roadmap #87): the player-facing Settings screen schema & defaults externalised from
// main.js into src/settings.js -> data/settings.js, authored by the Settings menu editor (Edit ▸
// Systems) with a live preview. This test asserts the overlay loaded, defs()/defaults() are
// byte-identical to the old SETTINGS_DEFS / G.settings, applyData (hide / relabel / reorder / opts /
// default-value) behaves, and the tool registers / opens / edits a working copy + applies to the
// engine + draws its preview — WITHOUT the real save() (which would clobber data/settings.js).
// Engine state is restored at the end. Offline, no errors.
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
      const out = {}, T = G.Tools, S = G.Settings, MT = T.settingsMenu;
      const saved = S.exportCurrent();
      try {
        out.fromData = !!G.SETTINGS_DATA && Array.isArray(G.SETTINGS_DATA.defs) && !!G.SETTINGS_DATA.values;
        out.hooks = !!(S.defs && S.allDefs && S.defaults && S.applyData && S.exportDefaults && S.exportCurrent);
        // the old main.js SETTINGS_DEFS (key/label/type/opts) and G.settings, verbatim
        const OLD_DEFS = [
          { key: 'controls', label: 'Controls / key bindings', type: 'action' },
          { key: 'volume', label: 'Sound volume', type: 'slider' },
          { key: 'soundtrack', label: 'Soundtrack', type: 'cycle', opts: ['Score', 'Classic'] },
          { key: 'shake', label: 'Screen shake', type: 'toggle' },
          { key: 'rumble', label: 'Controller rumble', type: 'toggle' },
          { key: 'quality', label: 'Visual quality', type: 'cycle', opts: ['low', 'medium', 'high'] },
          { key: 'tonemap', label: 'Tone mapping', type: 'cycle', opts: ['Off', 'ACES', 'AgX'] },
          { key: 'lighting', label: 'Dynamic lighting', type: 'toggle' },
          { key: 'bloom', label: 'Bloom glow', type: 'toggle' },
          { key: 'dof', label: 'Depth of field', type: 'toggle' },
          { key: 'reflections', label: 'Water reflections', type: 'toggle' },
          { key: 'weather', label: 'Weather effects', type: 'toggle' },
          { key: 'aberration', label: 'Chromatic aberration', type: 'toggle' },
          { key: 'motionblur', label: 'Motion blur', type: 'toggle' },
          { key: 'vignette', label: 'Vignette', type: 'toggle' }
        ];
        const OLD_VALS = { volume: 0.8, soundtrack: 'Score', shake: true, rumble: true, quality: 'high', tonemap: 'ACES', lighting: true, bloom: true, dof: true, reflections: true, weather: true, aberration: true, motionblur: true, vignette: true };
        const slim = d => { const o = { key: d.key, label: d.label, type: d.type }; if (d.opts) o.opts = d.opts; return o; };
        out.defsIdentical = JSON.stringify(S.defs().map(slim)) === JSON.stringify(OLD_DEFS);
        out.valsIdentical = JSON.stringify(S.defaults()) === JSON.stringify(OLD_VALS);
        out.curEqDefault = JSON.stringify(S.exportCurrent()) === JSON.stringify(S.exportDefaults());
        // applyData: hide a row, relabel one, change a default, edit opts
        const d2 = S.exportDefaults();
        d2.defs[3].show = false;                 // hide 'shake'
        d2.defs[1].label = 'Master Volume';      // relabel volume
        d2.values.quality = 'medium';
        d2.defs[5].opts = ['low', 'high'];       // quality opts
        S.applyData(d2);
        const vis = S.defs();
        out.hidden = !vis.some(d => d.key === 'shake') && S.allDefs().some(d => d.key === 'shake');
        out.relabel = vis.find(d => d.key === 'volume').label === 'Master Volume';
        out.defaultChanged = S.defaults().quality === 'medium';
        out.optsChanged = JSON.stringify(vis.find(d => d.key === 'quality').opts) === JSON.stringify(['low', 'high']);
        S.applyData(null);
        out.reapply = S.defs().length === 15 && S.defaults().volume === 0.8;
        // tool
        out.registered = T._test.toolIds().indexOf('settings') >= 0;
        out.inPalette = T._test.paletteSearch('settings menu').some(l => /settings/i.test(l));
        out.roadmap = T.roadmapStats().done >= 50;
        out.opened = T.openTool('settings');
        MT.load();
        MT.setShow(4, false);                    // hide 'rumble'
        MT.setValue('volume', 0.5);
        MT.setLabel(2, 'Music style');           // relabel soundtrack
        MT.applyToEngine();
        out.toolApplied = !S.defs().some(d => d.key === 'rumble') && S.defaults().volume === 0.5 && S.allDefs().find(d => d.key === 'soundtrack').label === 'Music style';
        out.dirty = MT.state.dirty === true;
        out.previewRows = document.querySelectorAll('.setPrevRow').length > 0;
        T.closeTool();
      } finally { S.applyData(saved); }
      out.restored = S.defs().length === 15 && S.defaults().volume === 0.8 && S.defs()[3].label === 'Screen shake';
      return out;
    });

    console.log('SETTINGS:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defsIdentical', 'valsIdentical', 'curEqDefault', 'hidden', 'relabel', 'defaultChanged', 'optsChanged', 'reapply', 'registered', 'inPalette', 'roadmap', 'opened', 'toolApplied', 'dirty', 'previewRows', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'SETTINGS TOOL TEST: PASS' : 'SETTINGS TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
