// Encounter / DPS simulator (Edit ▸ Tools, roadmap #65): an editor-only QA scanner over G.LEVELS that
// models each room's fight — clear time at the current nail DPS, incoming pressure, and expected masks
// lost — from grounded combat constants (ATK_CD, INVULN, nail dmg, enemy/boss HP). This verifies
// registration + the engine API, the documented model, the real world, then injects deterministic
// rooms (a foe pack, a boss room, a custom-HP enemy) to assert EXACT maths (ttc, threat, masks lost,
// risk + difficulty tiers, boss/custom HP paths) and that the loadout knob makes the fight easier.
// Restores the loadout + removes the scratch rooms. Zero outbound network, no page errors. Never save()s.
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
      const T = G.Tools, MT = T.dps, out = {};
      const savedProfile = MT && MT.profile();
      const near = (a, b, eps) => Math.abs(a - b) < (eps || 0.01);
      try {
        out.registered = T._test.toolIds().includes('dps');
        out.inPalette = T._test.paletteSearch('dps').some(l => /dps|encounter|simulator|difficulty/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 65 && i[2] === 'done'));
        out.engineApi = !!(MT && MT.rooms && MT.stats && MT.roomSim && MT.profile && MT.setProfile && MT.model && MT.loadout);

        // ---- documented model ----
        const m = MT.model();
        out.model = m.ATK_CD === 0.36 && m.INVULN === 1.3 && m.AVOID === 0.08 && m.ENEMY.tumblebug.hp === 2 && m.ENEMY.mortarbug.threat === 1.4 && m.BOSS.eff === 3;

        // ---- real world shape ----
        const real = MT.rooms();
        out.realRooms = Array.isArray(real) && real.length > 0 && typeof real[0].difficulty === 'number' && Array.isArray(real[0].byType) && typeof real[0].risk === 'string';

        // base loadout (nail 0 -> dmg 1, masks 5)
        MT.setProfile(0, 5);

        // ---- deterministic scratch rooms ----
        G.LEVELS['DPS_TEST'] = { title: 'Pack', w: 20, h: 12, biome: 'verdant', enemies: [{ type: 'tumblebug' }, { type: 'tumblebug' }, { type: 'tumblebug' }, { type: 'mortarbug' }, { type: 'mortarbug' }] };
        G.LEVELS['DPS_BOSS'] = { title: 'Arena', w: 30, h: 16, biome: 'gloom', props: [{ type: 'bossTrigger', boss: 'mossSovereign' }], enemies: [] };
        G.LEVELS['DPS_CUSTOM'] = { title: 'Custom', w: 14, h: 10, biome: 'verdant', enemies: [{ type: 'custom', spec: { hp: 7 } }] };

        const A = MT.roomSim('DPS_TEST'), B = MT.roomSim('DPS_BOSS'), C = MT.roomSim('DPS_CUSTOM');

        // ---- pack room exact maths ----  3×tumblebug(hp2) + 2×mortarbug(hp3); dps = 1/0.36
        const tb = A.byType.find(x => x.type === 'tumblebug'), mb = A.byType.find(x => x.type === 'mortarbug');
        out.packShape = A.foes === 5 && A.totalHp === 12 && A.effHp === 12 && tb.count === 3 && mb.count === 2;
        out.packTtc = near(A.ttc, 4.32);                 // 12 effHp / (1/0.36) = 4.32 s
        out.packThreat = A.threat === 5.8;               // 3×1.0 + 2×1.4
        out.packMasks = near(A.hitsTaken, 1.5419, 0.005);// 5.8 × (4.32/1.3) × 0.08
        out.packRisk = A.risk === 'safe' && A.survives === true;
        out.packDiff = A.difficulty === 23 && A.tier === 'Light';

        // ---- boss room: live boss HP + lethal verdict ----
        out.bossShape = B.hasBoss === true && B.bossId === 'mossSovereign' && B.bossHp === 30 && B.foes === 0;
        out.bossMaths = B.effHp === 90 && near(B.ttc, 32.4) && B.threat === 6;   // 30×3 effHp
        out.bossRisk = B.risk === 'lethal' && B.survives === false && B.difficulty === 100 && B.tier === 'Lethal';

        // ---- custom enemy reads spec HP ----
        out.customHp = C.byType.length === 1 && C.byType[0].hp === 7 && C.totalHp === 7;

        // ---- loadout knob makes the pack easier ----
        const baseDiff = A.difficulty, baseTtc = A.ttc;
        MT.setProfile(6, 12);                            // nail 7 dmg, 12 masks
        const A2 = MT.roomSim('DPS_TEST');
        out.knob = A2.ttc < baseTtc && A2.difficulty < baseDiff && A2.survives === true;
        MT.setProfile(0, 5);

        // ---- stats aggregate ----
        const st = MT.stats();
        out.statsOk = st.combatRooms >= 2 && st.foes >= 6 && st.bosses >= 1 && st.maxDifficulty === 100 && !!st.hardest;

        // ---- render ----
        out.opened = T.openTool('dps');
        out.tableRows = document.querySelectorAll('.tc-host table tbody tr').length > 0;
        T.closeTool();
      } finally {
        delete G.LEVELS['DPS_TEST'];
        delete G.LEVELS['DPS_BOSS'];
        delete G.LEVELS['DPS_CUSTOM'];
        if (savedProfile) MT.setProfile(savedProfile.nail, savedProfile.masks);
      }
      out.cleaned = !MT.rooms().some(r => /^DPS_/.test(r.id));
      out.profileRestored = JSON.stringify(MT.profile()) === JSON.stringify(savedProfile);
      return out;
    });

    console.log('DPS-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'engineApi', 'model', 'realRooms', 'packShape', 'packTtc', 'packThreat', 'packMasks', 'packRisk', 'packDiff', 'bossShape', 'bossMaths', 'bossRisk', 'customHp', 'knob', 'statsOk', 'opened', 'tableRows', 'cleaned', 'profileRestored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'DPS-TOOL TEST: PASS' : 'DPS-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
