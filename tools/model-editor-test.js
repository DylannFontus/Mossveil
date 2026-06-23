// Model editor V2 smoke test: builds a parented, animated, flat-shaded model in the
// Models tab, verifies the rig hierarchy + clip sampling, saves it, then places it in
// the game and confirms it builds + animates.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 800));

  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const errs = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 860 });
    page.on('pageerror', e => errs.push('[editor] ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('[editor-console] ' + m.text()); });

    await page.goto('http://localhost:7707/editor/editor.html', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));

    // switch to Models tab and build a 2-bone rig: body (root) + head (child of body)
    const build = await page.evaluate(() => {
      const E = G.__ed; E.setTab('models');
      const doc = E.modelDoc();
      doc.name = 'rigtest'; doc.parts.length = 0; doc.clips = {}; doc.shaded = false;
      E.modelAdd('box');      // part 0 = body
      E.modelAdd('sphere');   // part 1 = head
      const body = doc.parts[0], head = doc.parts[1];
      body.name = 'body'; body.x = 0; body.y = 1; body.z = 0; body.sy = 1.4;
      head.name = 'head'; head.parent = body.id; head.x = 0; head.y = 1.2; head.z = 0; head.sx = head.sy = head.sz = 0.8;
      E.modelRebuild();
      const rig = E.modelRig();
      // is head's bone parented under body's bone?
      const headBone = rig.bones[head.id], bodyBone = rig.bones[body.id];
      const parented = headBone.parent === bodyBone;
      // flat-shading default => MeshBasicMaterial
      const mat = rig.meshes[head.id].material.type;
      // head bone world Y should be ~ body.y + head.y (parented offsets add up)
      headBone.updateWorldMatrix(true, false);
      const wy = new THREE.Vector3().setFromMatrixPosition(headBone.matrixWorld).y;
      return { parts: doc.parts.length, parented, mat, worldY: +wy.toFixed(2), bodyId: body.id, headId: head.id };
    });
    console.log('RIG:', JSON.stringify(build));

    // author a clip that rotates the head, verify sampling
    const anim = await page.evaluate((headId) => {
      const E = G.__ed, doc = E.modelDoc();
      doc.clips.nod = { dur: 1, loop: true, tracks: {} };
      doc.clips.nod.tracks[headId] = [
        { t: 0, rx: 0, ry: 0, rz: 0 },
        { t: 0.5, rx: 40, ry: 0, rz: 0 },
        { t: 1, rx: 0, ry: 0, rz: 0 }
      ];
      const mid = G.Models.clipPose(doc, 'nod', 0.25)[headId];      // halfway to the 0.5 key => ~20deg
      E.modelSave();
      return { saved: !!G.Models.get('rigtest'), midRx: +mid.rx.toFixed(1) };
    }, build.headId);
    console.log('ANIM:', JSON.stringify(anim));

    // pose via scrub-sync hook, screenshot the Models viewport
    await page.evaluate(() => { G.__ed.modelSetClip('nod'); G.__ed.modelSyncPose(0.5); });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(SHOTS, 'model-editor-v2.png') });

    // place the model in a level and confirm it builds + animates in-game
    const game = await browser.newPage();
    await game.setViewport({ width: 1280, height: 720 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));
    const place = await game.evaluate(() => {
      // model lib is per-origin localStorage; rebuild the same model here to be safe
      G.Models.save('rigtest', {
        name: 'rigtest', shaded: false,
        parts: [
          { id: 1, shape: 'box', parent: null, x: 0, y: 1, z: 0, sx: 1, sy: 1.4, sz: 1, color: '#888' },
          { id: 2, shape: 'sphere', parent: 1, x: 0, y: 1.2, z: 0, sx: 0.8, sy: 0.8, sz: 0.8, color: '#caa' }
        ],
        clips: { nod: { dur: 1, loop: true, tracks: { 2: [{ t: 0, rx: 0 }, { t: 0.5, rx: 40 }, { t: 1, rx: 0 }] } } }
      });
      const prop = G.World.mkProp.model({ x: 30, y: 8, model: 'rigtest', clip: 'nod', scale: 1 });
      const before = prop.group.children.length;
      const headBefore = (() => { let b; prop.group.traverse(o => { if (o.userData && o.userData.partId === 2) b = o.parent; }); return b ? b.rotation.x : null; })();
      for (let i = 0; i < 30; i++) prop.update(0.016);   // advance ~0.5s into the nod
      const headAfter = (() => { let b; prop.group.traverse(o => { if (o.userData && o.userData.partId === 2) b = o.parent; }); return b ? b.rotation.x : null; })();
      return { childGroups: before, headBefore: +headBefore.toFixed(3), headAfter: +headAfter.toFixed(3), animated: Math.abs(headAfter - headBefore) > 0.1 };
    });
    console.log('IN-GAME:', JSON.stringify(place));

    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = build.parented && build.mat === 'MeshBasicMaterial' && Math.abs(build.worldY - 2.2) < 0.01
      && anim.midRx === 20 && anim.saved && place.animated && place.childGroups > 0 && errs.length === 0;
    console.log(ok ? 'V2 TEST: PASS' : 'V2 TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) {
    console.error('FAILED', e); process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
  }
})();
