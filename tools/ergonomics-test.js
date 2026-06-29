// Authoring ergonomics + generators + mod cookbook (roadmap #53 #48 #54 #42 #44 #43 #41, mods #98).
// One editor boot exercises all six new tools and the editor.js align seam, against injected scratch
// levels so asserts never depend on shipped content. Proves: registration / palette / roadmap / API for
// each; the template generators produce valid rooms + create/stamp; search indexes & jumps; find-replace
// scans + applies; the cross-room clipboard copies + pastes into another room; the mod cookbook lists
// examples and the dry-run sandbox compiles/reports WITHOUT touching the real project; and rulers/guides/
// align (alignOps left/distribute/snap-to-guide) + the overlay drawer run clean. Restores all scratch
// state + localStorage; never saves. Asserts zero outbound network and no page errors.
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
      const T = G.Tools, ED = G.__ed, out = {};
      const origId = ED.currentId();
      const realId = Object.keys(G.LEVELS)[0];
      const made = [];
      const modsBackup = (G.Mods && G.Mods.stored) ? G.Mods.stored() : [];
      const mkScratch = (id, def) => { G.LEVELS[id] = def; made.push(id); return def; };
      try {
        // =========================================================== TEMPLATES (#53)
        const TP = T.templates;
        out.tpl_reg = T._test.toolIds().includes('templates');
        out.tpl_pal = T._test.paletteSearch('templates').some(l => /template/i.test(l));
        out.tpl_road = T.ROADMAP.some(g => g.items.some(i => i[0] === 53 && i[2] === 'done'));
        out.tpl_api = !!(TP && TP.list && TP.gen && TP.validate && TP.createRoom && TP.stampInto);
        out.tpl_list = TP.list().length >= 8;
        const vA = TP.validate('arena'), vB = TP.validate('boss'), vP = TP.validate('platform');
        out.tpl_valid = vA.ok && vB.ok && vP.ok;
        const boss = TP.gen('boss');
        out.tpl_boss = boss.props.filter(p => p.type === 'gate').length === 2 && boss.props.some(p => p.type === 'bossTrigger');
        const arena = TP.gen('arena', { count: 4 });
        out.tpl_arena = arena.enemies.length === 4 && !!arena.spawns.P;
        // createRoom -> a real new level, opened
        const newId = TP.createRoom('arena', { id: '__tpl_new', count: 3 });
        if (newId) made.push(newId);
        const NL = G.LEVELS[newId];
        out.tpl_create = !!NL && Array.isArray(NL.tiles) && NL.tiles.length === NL.h && NL.enemies.length === 3 && !!NL.spawns.P && ED.currentId() === newId;
        // stampInto a scratch level (solids increase)
        mkScratch('__tpl_stamp', { title: 'Stamp', w: 40, h: 24, biome: 'gloom', tiles: new Array(24).fill('').map(() => ' '.repeat(40)), props: [], enemies: [], transitions: [], spawns: { P: { x: 3, y: 3 } } });
        const solidBefore = G.LEVELS['__tpl_stamp'].tiles.join('').replace(/[^#=^]/g, '').length;
        out.tpl_stamp = TP.stampInto('__tpl_stamp', 'blank', 2, 2, { w: 20, h: 12 }) === true;
        const solidAfter = G.LEVELS['__tpl_stamp'].tiles.join('').replace(/[^#=^]/g, '').length;
        out.tpl_stampGrew = solidAfter > solidBefore;

        // =========================================================== SEARCH (#48)
        const SR = T.search;
        out.srch_reg = T._test.toolIds().includes('search');
        out.srch_pal = T._test.paletteSearch('search').some(l => /search/i.test(l));
        out.srch_road = T.ROADMAP.some(g => g.items.some(i => i[0] === 48 && i[2] === 'done'));
        out.srch_api = !!(SR && SR.index && SR.query && SR.jump && SR.stats);
        mkScratch('__srch', { title: 'SearchTest', w: 30, h: 18, biome: 'gloom', tiles: new Array(18).fill(' '.repeat(30)), props: [{ type: 'sign', x: 5, y: 3, text: 'ZZUNIQUEMARK' }], enemies: [{ type: 'tumblebug', x: 9, y: 3 }], transitions: [], spawns: { P: { x: 2, y: 3 } } });
        const hits = SR.query('zzuniquemark');
        out.srch_find = hits.length === 1 && hits[0].level === '__srch' && hits[0].kind === 'prop';
        const st = SR.stats();
        out.srch_stats = st.prop > 0 && st.enemy > 0 && st.level > 0;
        out.srch_jump = SR.jump(hits[0]) === true && ED.currentId() === '__srch';

        // =========================================================== FIND & REPLACE (#54)
        const FR = T.findreplace;
        out.fr_reg = T._test.toolIds().includes('findreplace');
        out.fr_pal = T._test.paletteSearch('replace').some(l => /replace|find/i.test(l));
        out.fr_road = T.ROADMAP.some(g => g.items.some(i => i[0] === 54 && i[2] === 'done'));
        out.fr_api = !!(FR && FR.scan && FR.apply && FR.present);
        mkScratch('__fr', { title: 'FRTest', w: 30, h: 18, biome: 'gloom', tiles: new Array(18).fill(' '.repeat(30)), enemies: [{ type: 'tumblebug', x: 4, y: 3 }, { type: 'tumblebug', x: 8, y: 3 }], props: [{ type: 'decor', kind: 'fern', x: 6, y: 3 }, { type: 'lever', x: 10, y: 3, signal: 'oldsig' }, { type: 'door', x: 12, y: 3, signal: 'oldsig' }], transitions: [], spawns: { P: { x: 2, y: 3 } } });
        out.fr_scanEnemy = FR.scan({ mode: 'enemyType', from: 'tumblebug' }).filter(m => m.level === '__fr').length === 2;
        const beforeType = G.LEVELS['__fr'].enemies[0].type;
        const changed = FR.apply({ mode: 'enemyType', from: 'tumblebug', to: 'gnat' });
        out.fr_applyEnemy = changed >= 2 && G.LEVELS['__fr'].enemies.every(e => e.type === 'gnat') && beforeType === 'tumblebug';
        out.fr_signal = FR.scan({ mode: 'signal', from: 'oldsig' }).filter(m => m.level === '__fr').length === 2;
        FR.apply({ mode: 'signal', from: 'oldsig', to: 'newsig' });
        out.fr_signalApplied = G.LEVELS['__fr'].props.filter(p => p.signal === 'newsig').length === 2;
        out.fr_biome = FR.scan({ mode: 'biome', from: 'gloom' }).some(m => m.level === '__fr');

        // =========================================================== CROSS-ROOM CLIPBOARD (#42)
        const CB = T.clipboard;
        out.cb_reg = T._test.toolIds().includes('clipboard');
        out.cb_pal = T._test.paletteSearch('clipboard').some(l => /clipboard|paste|copy/i.test(l));
        out.cb_road = T.ROADMAP.some(g => g.items.some(i => i[0] === 42 && i[2] === 'done'));
        out.cb_api = !!(CB && CB.clip && CB.copyNow && CB.pasteInto && CB.stats);
        mkScratch('__cbA', { title: 'ClipA', w: 30, h: 18, biome: 'gloom', tiles: new Array(18).fill(' '.repeat(30)), props: [{ type: 'lamp', x: 4, y: 3 }, { type: 'bench', x: 8, y: 3 }], enemies: [], transitions: [], spawns: { P: { x: 2, y: 3 } } });
        mkScratch('__cbB', { title: 'ClipB', w: 30, h: 18, biome: 'gloom', tiles: new Array(18).fill(' '.repeat(30)), props: [], enemies: [], transitions: [], spawns: { P: { x: 2, y: 3 } } });
        ED.openLevel('__cbA'); ED.setSel({ kind: 'prop', i: 0 }); ED.setMulti([{ kind: 'prop', i: 1 }]);
        const clip = CB.copyNow();
        out.cb_copy = !!clip && clip.items && clip.items.length === 2;
        const bBefore = G.LEVELS['__cbB'].props.length;
        out.cb_paste = CB.pasteInto('__cbB', 10, 8, false) === true && G.LEVELS['__cbB'].props.length === bBefore + 2 && ED.currentId() === '__cbB';

        // =========================================================== MOD COOKBOOK + SANDBOX (#98)
        const MT = T.mods;
        out.mod_cook = !!(MT.cookbook && MT.dryRun && MT.addExample);
        out.mod_cookLen = MT.cookbook().length === 5;
        const lvBefore = Object.keys(G.LEVELS).length;
        const good = MT.dryRun(MT.cookbook().find(e => e.id === 'add-room').code);
        out.mod_dryGood = good.ok === true && good.registered.some(r => r.id === 'secret-room') && good.actions.some(a => /addLevel\("mod_vault"\)/.test(a));
        out.mod_drySafe = !G.LEVELS['mod_vault'] && Object.keys(G.LEVELS).length === lvBefore;   // sandbox did NOT mutate
        const bad = MT.dryRun('G.Mods.register({ oops');
        out.mod_dryBad = bad.ok === false && /Syntax error/.test(bad.error);
        const none = MT.dryRun('var x = 1;');
        out.mod_dryNone = none.ok === false && /No mod registered/.test(none.error);
        const addedId = MT.addExample('add-charm');
        out.mod_addEx = !!addedId && G.Mods.stored().some(m => m.id === addedId);
        G.Mods.saveStored(modsBackup);   // restore

        // =========================================================== RULERS / GUIDES / ALIGN (#44 #43 #41)
        const GD = T.guides;
        out.gd_reg = T._test.toolIds().includes('guides');
        out.gd_pal = T._test.paletteSearch('guides').some(l => /guide|ruler|align/i.test(l));
        out.gd_road = [41, 43, 44].every(n => T.ROADMAP.some(g => g.items.some(i => i[0] === n && i[2] === 'done')));
        out.gd_api = !!(GD && GD.addGuide && GD.align && GD.snapToGuides && typeof T.overlayDraw === 'function');
        // guides add/remove
        GD.clearGuides(); GD.addGuide('x', 10); GD.addGuide('y', 6);
        out.gd_guides = GD.guideCoords().xs.indexOf(10) >= 0 && GD.guideCoords().ys.indexOf(6) >= 0;
        // align: 3 props at distinct x in a scratch level
        mkScratch('__align', { title: 'Align', w: 30, h: 18, biome: 'gloom', tiles: new Array(18).fill(' '.repeat(30)), props: [{ type: 'lamp', x: 2, y: 5 }, { type: 'lamp', x: 5, y: 9 }, { type: 'lamp', x: 20, y: 4 }], enemies: [], transitions: [], spawns: { P: { x: 2, y: 3 } } });
        ED.openLevel('__align'); ED.setSel({ kind: 'prop', i: 0 }); ED.setMulti([{ kind: 'prop', i: 1 }, { kind: 'prop', i: 2 }]);
        const movedL = GD.align('left');
        out.gd_alignLeft = movedL === 3 && G.LEVELS['__align'].props.every(p => p.x === 2);
        // distribute: reset x then distH
        G.LEVELS['__align'].props[0].x = 2; G.LEVELS['__align'].props[1].x = 5; G.LEVELS['__align'].props[2].x = 20;
        ED.setSel({ kind: 'prop', i: 0 }); ED.setMulti([{ kind: 'prop', i: 1 }, { kind: 'prop', i: 2 }]);
        GD.align('distH');
        out.gd_distH = G.LEVELS['__align'].props[1].x === 11;   // (20-2)/2 = 9 -> 2,11,20
        // snap to guides: reset, one x-guide at 10, snap selection -> all x become 10
        GD.clearGuides(); GD.addGuide('x', 10);
        G.LEVELS['__align'].props.forEach((p, i) => { p.x = [3, 9, 14][i]; });
        ED.setSel({ kind: 'prop', i: 0 }); ED.setMulti([{ kind: 'prop', i: 1 }, { kind: 'prop', i: 2 }]);
        const snapped = GD.snapToGuides();
        out.gd_snap = snapped === 3 && G.LEVELS['__align'].props.every(p => p.x === 10);
        // overlayDraw runs clean with a real 2d ctx + a fake transform
        let drewOk = true;
        try {
          const cv = document.createElement('canvas'); cv.width = 200; cv.height = 120;
          const ctx = cv.getContext('2d'); const U = { toScreen: (x, y) => ({ x: x * 4, y: 110 - y * 4 }) };
          GD.setRuler(true); GD.setGhosts(true); GD.addGuide('y', 4);
          T.overlayDraw(ctx, U, G.LEVELS['__align']);
        } catch (e) { drewOk = false; out._drawErr = e.message; }
        out.gd_draw = drewOk;
        GD.clearGuides(); GD.setRuler(false); GD.setGhosts(false);

        // ---- UI smoke: each tool opens & renders without error ----
        out.ui_open = ['templates', 'search', 'findreplace', 'clipboard', 'mods', 'guides'].every(id => { const ok = T.openTool(id); const host = document.querySelector('.tc-host'); const has = host && host.textContent.length > 0; T.closeTool(); return ok && has; });
      } finally {
        made.forEach(id => { try { delete G.LEVELS[id]; } catch (_) { } });
        try { if (G.Mods && G.Mods.saveStored) G.Mods.saveStored(modsBackup); } catch (_) { }
        try { localStorage.removeItem('mossveil-ed-guides'); } catch (_) { }
        try { localStorage.removeItem('mossveil-ed-clip'); } catch (_) { }
        try { const back = G.LEVELS[origId] ? origId : realId; if (G.LEVELS[back]) ED.openLevel(back); } catch (_) { }
      }
      return out;
    });

    console.log('ERGONOMICS:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = Object.keys(o).filter(k => !k.startsWith('_'));
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'ERGONOMICS TEST: PASS' : 'ERGONOMICS TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
