// Humanoid auto-rig: classifies torso/head/arms/legs, parents them, generates idle + walk clips.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errs = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 860 });
    page.on('pageerror', e => errs.push('[editor] ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await page.goto('http://localhost:7707/editor/editor.html', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 3000));

    const out = await page.evaluate(() => {
      const E = G.__ed; E.setTab('models');
      const doc = E.modelDoc();
      doc.name = 'humanoid'; doc.clips = {};
      doc.parts = [
        { id: 1, shape: 'box', parent: null, x: 0, y: 2, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1.4, sz: 0.6, ox: 0, oy: 0, oz: 0, color: '#888', name: 'torso' },
        { id: 2, shape: 'sphere', parent: null, x: 0, y: 3.2, z: 0, rx: 0, ry: 0, rz: 0, sx: 0.7, sy: 0.7, sz: 0.7, ox: 0, oy: 0, oz: 0, color: '#caa', name: 'head' },
        { id: 3, shape: 'box', parent: null, x: -0.9, y: 2.2, z: 0, rx: 0, ry: 0, rz: 0, sx: 0.25, sy: 1, sz: 0.25, ox: 0, oy: 0, oz: 0, color: '#88a', name: 'armL' },
        { id: 4, shape: 'box', parent: null, x: 0.9, y: 2.2, z: 0, rx: 0, ry: 0, rz: 0, sx: 0.25, sy: 1, sz: 0.25, ox: 0, oy: 0, oz: 0, color: '#88a', name: 'armR' },
        { id: 5, shape: 'box', parent: null, x: -0.3, y: 0.6, z: 0, rx: 0, ry: 0, rz: 0, sx: 0.3, sy: 1.1, sz: 0.3, ox: 0, oy: 0, oz: 0, color: '#585', name: 'legL' },
        { id: 6, shape: 'box', parent: null, x: 0.3, y: 0.6, z: 0, rx: 0, ry: 0, rz: 0, sx: 0.3, sy: 1.1, sz: 0.3, ox: 0, oy: 0, oz: 0, color: '#585', name: 'legR' }
      ];
      E.modelRebuild();
      E.modelAutoRig();
      const byName = {}; doc.parts.forEach(p => byName[p.name] = p);
      const o = {};
      o.roots = doc.parts.filter(p => p.parent == null).length;     // only torso
      o.headParented = byName.head.parent === byName.torso.id;
      o.armParented = byName.armL.parent === byName.torso.id && byName.armR.parent === byName.torso.id;
      o.legParented = byName.legL.parent === byName.torso.id && byName.legR.parent === byName.torso.id;
      o.limbPivots = [byName.armL, byName.legL].every(p => p.oy < 0);  // pivot moved to the joint
      o.walkTracks = Object.keys((doc.clips.walk || {}).tracks || {}).length;
      o.hasIdle = !!doc.clips.idle;
      return o;
    });
    console.log('RESULT:', JSON.stringify(out));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = out.roots === 1 && out.headParented && out.armParented && out.legParented
      && out.limbPivots && out.walkTracks >= 4 && out.hasIdle && !errs.length;
    console.log(ok ? 'AUTO-RIG TEST: PASS' : 'AUTO-RIG TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
