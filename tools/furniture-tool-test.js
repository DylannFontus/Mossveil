// Furniture & building kit (roadmap #19): editor-only tool over the full-colour furniture (W.FURN) +
// the building generator (W.genBuilding). Injects a deterministic scratch level so the asserts never
// depend on what the shipped levels contain, then proves: registration / palette / #19-done / API, the
// furniture catalog (kinds, usage, lint flags an unknown kind + unused kinds), the retype write path,
// that previews actually render (G.Thumb snapshot has painted pixels), the pure building footprint plan,
// the destructive stamp (genBuilding bakes walls into tiles + adds furniture props), and the UI (catalog
// cards + the Buildings tab's footprint canvas + params + stamp button). Restores everything; never saves.
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
      const T = G.Tools, MT = T.furniture, out = {};
      const SID = '__furntest__';
      const painted = (cv, bg) => {   // bg=null → look for any non-transparent pixel; else non-bg
        if (!cv) return false;
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        for (let i = 0; i < d.length; i += 4 * 53) {
          if (bg === null) { if (d[i + 3] > 8) return true; }
          else if (Math.abs(d[i] - bg[0]) > 10 || Math.abs(d[i + 1] - bg[1]) > 10 || Math.abs(d[i + 2] - bg[2]) > 10) return true;
        }
        return false;
      };
      try {
        // ---- registration / palette / roadmap / API ----
        out.registered = T._test.toolIds().includes('furniture');
        out.inPalette = T._test.paletteSearch('furniture').some(l => /furniture|building/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 19 && i[2] === 'done'));
        out.api = !!(MT && MT.kinds && MT.furnitureProps && MT.usage && MT.lint && MT.setKind && MT.preview && MT.buildingPlan && MT.stampBuilding);

        // ---- catalog: the full-colour furniture kinds ----
        const kinds = MT.kinds();
        out.kinds = kinds.length >= 8 && kinds.indexOf('sofa') >= 0 && kinds.indexOf('chandelier') >= 0 && kinds.indexOf('bookshelf') >= 0;

        // ---- inject a deterministic scratch level with furniture props (one unknown kind) ----
        G.LEVELS[SID] = {
          title: 'Furn Test', w: 40, h: 24, biome: 'gloom',
          tiles: new Array(24).fill(''),
          props: [
            { type: 'furniture', kind: 'sofa', x: 6, y: 2, scale: 1 },
            { type: 'furniture', kind: 'table', x: 10, y: 2, scale: 1 },
            { type: 'furniture', kind: 'zzznope', x: 14, y: 2, scale: 1 }   // unknown → renders as sofa
          ]
        };

        const props = MT.furnitureProps().filter(p => p.level === SID);
        out.props = props.length === 3 && props.find(p => p.raw === 'zzznope' && p.kind === 'sofa');
        const u = MT.usage();
        out.usage = u.sofa >= 1 && u.table >= 1;
        const issues = MT.lint();
        out.lintUnknown = issues.some(it => it.level === SID && /unknown kind "zzznope"/.test(it.msg));

        // ---- retype write path ----
        out.setKind = MT.setKind(SID, 2, 'chair') === true && G.LEVELS[SID].props[2].kind === 'chair';
        out.setKindBad = MT.setKind(SID, 0, 'notakind') === false && G.LEVELS[SID].props[0].kind === 'sofa';

        // ---- preview renders (G.Thumb snapshot has painted pixels) ----
        out.preview = painted(MT.preview('sofa', 74), null) && painted(MT.preview('fireplace', 74), null);

        // ---- pure building footprint plan (no mutation) ----
        const plan = MT.buildingPlan({ x: 8, y: 0, w: 24, h: 30, seed: 7, storeyH: 9 });
        out.plan = plan.bw === 24 && plan.bh === 30 && plan.floors.length === 3 && plan.slots >= 1;
        const before = JSON.stringify(G.LEVELS[SID].tiles) + '|' + G.LEVELS[SID].props.length;

        // ---- stamp (destructive): bakes walls into tiles + adds furniture props ----
        const tilesBefore = G.LEVELS[SID].tiles.join('').replace(/\s/g, '').length;
        const propsBefore = G.LEVELS[SID].props.length;
        out.stamp = MT.stampBuilding(SID, { x: 4, y: 0, w: 16, h: 18, seed: 3, storeyH: 9 }) === true;
        const tilesAfter = G.LEVELS[SID].tiles.join('').replace(/\s/g, '').length;
        out.stampTiles = tilesAfter > tilesBefore;   // walls/floors baked
        out.stampProps = G.LEVELS[SID].props.length > propsBefore && G.LEVELS[SID].props.some(p => p.type === 'furniture' && p.kind === 'rug');   // building adds a rug per storey
        out.stampBad = MT.stampBuilding('__nope__', { x: 0, y: 0, w: 8, h: 8 }) === false;

        // ---- UI: catalog cards + previews ----
        out.opened = T.openTool('furniture');
        const host = document.querySelector('.tc-host');
        out.cards = /sofa/.test(host.textContent) && /chandelier/.test(host.textContent) && host.querySelectorAll('canvas').length >= 1;
        // select a kind → detail pane + a retype <select>
        const cards = Array.prototype.slice.call(host.querySelectorAll('.tc-pal-item'));
        const sofaCard = cards.find(c => /sofa/.test(c.textContent)); if (sofaCard) sofaCard.click();
        out.detail = document.querySelector('.tc-host').querySelectorAll('select').length >= 1;

        // ---- UI: Buildings tab — footprint canvas + params + stamp button ----
        const tabBtn = Array.prototype.slice.call(document.querySelector('.tc-host').querySelectorAll('button')).find(b => /Buildings/.test(b.textContent));
        if (tabBtn) tabBtn.click();
        const host2 = document.querySelector('.tc-host');
        const fcv = Array.prototype.slice.call(host2.querySelectorAll('canvas')).find(c => c.width === 300 && c.height === 190);
        out.footprint = !!fcv && painted(fcv, [10, 16, 20]);
        out.params = host2.querySelectorAll('input[type=number]').length >= 6;
        out.stampBtn = Array.prototype.slice.call(host2.querySelectorAll('button')).some(b => /Stamp building/.test(b.textContent)) || /No level open/.test(host2.textContent);

        T.closeTool();
      } finally {
        delete G.LEVELS[SID];
      }
      return out;
    });

    console.log('FURNITURE-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'api', 'kinds', 'props', 'usage', 'lintUnknown', 'setKind', 'setKindBad', 'preview', 'plan', 'stamp', 'stampTiles', 'stampProps', 'stampBad', 'opened', 'cards', 'detail', 'footprint', 'params', 'stampBtn'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'FURNITURE-TOOL TEST: PASS' : 'FURNITURE-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
