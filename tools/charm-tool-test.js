// Charm designer (Edit ▸ Content): charms externalised to data/charms.js, authored in-editor
// with data-driven effects (additive masks/damage, multiplicative dash/focus/soul) + synergies,
// hot-applied to the engine and reflected in the player's derived stats. Offline (local server only).
// Deliberately does NOT save() so it never overwrites the committed data/charms files.
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
      const T = G.Tools, C = G.Charms, MT = T.charms, out = {};
      out.fromData = !!G.CHARMS && Array.isArray(G.CHARMS.list);
      out.count = C.LIST.length;                                  // 6 defaults
      out.dataDriven = !!(C.get('stoneheart') && C.get('stoneheart').effects && C.get('stoneheart').effects.hp === 1);
      out.registered = T._test.toolIds().includes('charms');
      out.inPalette = T._test.paletteSearch('charm designer').some(l => /charm designer/i.test(l));
      out.roadmap = T.roadmapStats().done >= 8;                   // foundation 4 + music 3 + charms 1
      out.opened = T.openTool('charms');
      out.listCount = document.querySelectorAll('#toolHost .tc-pal-item').length;
      // author a new charm with effects and hot-apply
      const id = MT.addCharm();
      MT.setCharm(MT.state.selI, 'id', 'zztest');
      MT.setCharm(MT.state.selI, 'cost', 2);
      MT.setEffect(MT.state.selI, 'hp', 2);
      MT.setEffect(MT.state.selI, 'soulMul', 1.5);
      MT.applyToEngine();
      const zc = C.get('zztest');
      out.charmStored = !!zc && zc.effects.hp === 2 && zc.effects.soulMul === 1.5;
      // a synergy referencing it
      MT.addSynergy();
      const si = MT.getWorking().synergies.length - 1;
      MT.getWorking().synergies[si].need = ['zztest', 'keenedge'];
      MT.setSynEffect(si, 'nail', 5);
      MT.applyToEngine();
      // derived player stats reflect the effects: base 5hp, +2 from zztest; nail 1 +1 keenedge +5 synergy
      G.save = { charmsOwned: ['zztest', 'keenedge'], charmsEquipped: ['zztest', 'keenedge'], nailLevel: 0 };
      const p = { hp: 5 }; C.apply(p);
      out.maskEffect = p.maxHp === 7;
      out.soulEffect = Math.abs(p.soulMul - 1.5) < 1e-9;
      out.synergyEffect = p.nailDmg === 7;                        // 1 + keenedge(1) + synergy(5)
      // delete cleans up dangling synergy need
      out.removed = MT.removeCharm(MT.state.selI);                // remove zztest
      T.closeTool();
      out.minusOne = C.exportCurrent().list.length;               // back to default count after applyToEngine? (not applied yet)
      return out;
    });

    console.log('CHARM-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.fromData && o.count === 6 && o.dataDriven && o.registered && o.inPalette && o.roadmap
      && o.opened && o.listCount >= 6 && o.charmStored
      && o.maskEffect && o.soulEffect && o.synergyEffect && o.removed
      && netHits === 0 && !errs.length;
    console.log(ok ? 'CHARM-TOOL TEST: PASS' : 'CHARM-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
