// NPC dialogue: typewriter, advance, branching choices (set flag), end, and NPC-interact start.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await wait(800);
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errs = [];
  try {
    const game = await browser.newPage();
    await game.setViewport({ width: 1100, height: 680 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2200);

    const o = await game.evaluate(() => {
      const D = G.Dialogue, o = {};
      const dlg = {
        name: 'Elder', color: '#88aacc', lines: [
          { speaker: 'Elder', text: 'Hello.' },
          { speaker: 'Elder', text: 'Help me?', choices: [{ label: 'Yes', goto: 2, flag: 'helped' }, { label: 'No', goto: 3 }] },
          { speaker: 'Elder', text: 'Thank you.', end: true },
          { speaker: 'Elder', text: 'Coward.', end: true }
        ]
      };
      D.start(dlg);
      o.started = G.Main.state === 'dialogue' && D.active === dlg;
      const type = () => { for (let i = 0; i < 80; i++) D.update(0.05); };
      type(); o.line0 = !D.isTyping() && D.shownText() === 'Hello.';
      D.advance(); type(); o.atQuestion = D.line().text === 'Help me?';
      o.choices = !!D.choices();
      D.choose(0); o.flagSet = !!(G.save.flags && G.save.flags.helped); o.branchedThanks = D.line().text === 'Thank you.';
      type(); D.advance(); o.ended = G.Main.state === 'play' && !D.active;   // end:true terminates the Yes branch

      // NPC interact starts a dialogue
      const npc = G.World.mkProp.npc({ x: G.player.body.x + 1, y: G.player.body.y, name: 'Sage', color: '#9ad0b0', dialogue: { lines: [{ speaker: 'Sage', text: 'Mind the dark.' }] } });
      G.room.entities.push(npc); if (npc.group) G.room.group.add(npc.group);
      G.player.body.x = npc.x; G.player.body.y = npc.y;
      G.Input.virtualDown('interact'); npc.update(0.016); G.Input.virtualUp('interact');
      o.npcStarted = G.Main.state === 'dialogue';
      return o;
    });
    await wait(300);
    await game.screenshot({ path: path.join(SHOTS, 'dialogue.png') });
    console.log('RESULT:', JSON.stringify(o));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.started && o.line0 && o.atQuestion && o.choices && o.flagSet && o.branchedThanks && o.ended && o.npcStarted && !errs.length;
    console.log(ok ? 'DIALOGUE TEST: PASS' : 'DIALOGUE TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
