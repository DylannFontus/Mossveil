// Lighting editor (roadmap #28): editor-only authoring tool over the `light` + `ray` props. Injects a
// deterministic scratch level (so asserts don't depend on shipped levels) and proves register / palette
// / #28-done / API, the per-level inventory (levelReport / allLights / allRays), the lint (invisible
// light + shaft, oversized light), the inline edits (setLight colour/radius/brightness/flicker + setRay),
// stats, and the UI — the light-map canvas actually PAINTS, and the LIGHTS / LIGHT SHAFTS editors render.
// Deletes the scratch level; never saves. Zero outbound network.
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
      const T = G.Tools, MT = T.lighting, out = {};
      const SID = '__lighttest__';
      const painted = cv => { if (!cv) return false; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 0; i < d.length; i += 4 * 41) if (Math.abs(d[i] - 5) > 12 || Math.abs(d[i + 1] - 8) > 12 || Math.abs(d[i + 2] - 10) > 12) return true; return false; };
      try {
        out.registered = T._test.toolIds().includes('lighting');
        out.inPalette = T._test.paletteSearch('lighting').some(l => /light|shaft|lamp/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 28 && i[2] === 'done'));
        out.api = !!(MT && MT.levelReport && MT.allLights && MT.allRays && MT.lint && MT.stats && MT.setLight && MT.setRay);

        G.LEVELS[SID] = {
          title: 'Light Test', w: 40, h: 24, biome: 'gloom',
          tiles: new Array(24).fill('').map((_, r) => r === 23 ? '#'.repeat(40) : ''),
          props: [
            { type: 'light', x: 5, y: 5, color: '#ff8800', scale: 8, opacity: 0.4, flicker: true },
            { type: 'light', x: 15, y: 5, color: '#88ccff', scale: 50, opacity: 0.3 },   // oversized → info
            { type: 'light', x: 20, y: 5, color: '#ffffff', scale: 6, opacity: 0 },       // invisible → warn
            { type: 'ray', x: 10, y: 15, w: 5, h: 18, opacity: 0.1, rot: -0.15 },
            { type: 'ray', x: 25, y: 15, w: 4, h: 16, opacity: 0 }                         // invisible → warn
          ]
        };

        const r = MT.levelReport(SID);
        out.report = r.lights.length === 3 && r.rays.length === 2 && r.w === 40 && r.h === 24;
        out.scan = MT.allLights().filter(l => l.level === SID).length === 3 && MT.allRays().filter(l => l.level === SID).length === 2;

        const L = MT.lint().filter(i => i.level === SID);
        out.lintInvisible = L.some(i => /0 brightness/.test(i.msg) && i.idx === 2);
        out.lintHuge = L.some(i => /very large/.test(i.msg) && i.idx === 1);
        out.lintRay = L.some(i => /0 opacity/.test(i.msg) && i.idx === 4);

        out.setColor = MT.setLight(SID, 0, 'color', '#00ff00') === true && G.LEVELS[SID].props[0].color === '#00ff00';
        out.setRadius = MT.setLight(SID, 0, 'scale', 12) === true && G.LEVELS[SID].props[0].scale === 12;
        out.setBright = MT.setLight(SID, 2, 'opacity', 0.7) === true && G.LEVELS[SID].props[2].opacity === 0.7;
        out.setFlicker = MT.setLight(SID, 1, 'flicker', true) === true && G.LEVELS[SID].props[1].flicker === true;
        out.setRayW = MT.setRay(SID, 3, 'w', 9) === true && G.LEVELS[SID].props[3].w === 9;
        out.setBad = MT.setLight(SID, 3, 'scale', 5) === false;   // idx 3 is a ray, not a light

        const s = MT.stats();
        out.stats = s.lights >= 3 && s.rays >= 2 && typeof s.lit === 'number' && typeof s.issues === 'number';

        // UI
        out.opened = T.openTool('lighting');
        const host = document.querySelector('.tc-host');
        out.statsBar = /levels lit/.test(host.textContent) && /shafts/.test(host.textContent);
        const row = Array.prototype.slice.call(host.querySelectorAll('.tc-row')).find(x => /Light Test/.test(x.textContent)); if (row) row.click();
        const host2 = document.querySelector('.tc-host');
        const cv = Array.prototype.slice.call(host2.querySelectorAll('canvas')).find(c => c.width === 400 && c.height === 230);
        out.lightmap = !!cv && painted(cv);
        out.editors = /LIGHTS/.test(host2.textContent) && /LIGHT SHAFTS/.test(host2.textContent) && host2.querySelectorAll('input[type=color]').length >= 1 && host2.querySelectorAll('input[type=number]').length >= 4;
        T.closeTool();
      } finally {
        delete G.LEVELS[SID];
      }
      return out;
    });

    console.log('LIGHTING-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'api', 'report', 'scan', 'lintInvisible', 'lintHuge', 'lintRay', 'setColor', 'setRadius', 'setBright', 'setFlicker', 'setRayW', 'setBad', 'stats', 'opened', 'statsBar', 'lightmap', 'editors'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'LIGHTING-TOOL TEST: PASS' : 'LIGHTING-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
