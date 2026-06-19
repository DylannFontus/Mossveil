// Export this project's Claude Code session(s) into a readable Markdown log.
//   node tools/export-conversation.js  ->  writes CONVERSATION-LOG.md
//
// It reads the raw .jsonl transcript(s) that Claude Code keeps under
// ~/.claude/projects/<this-project>/ and renders just the conversation:
// your messages, Claude's written answers, and a one-line note of the tools
// Claude ran each turn. Tool outputs, screenshots and internal "thinking" are
// left out to keep it readable. Re-run it any time to refresh the log.
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const OUT = path.resolve(__dirname, '..', 'CONVERSATION-LOG.md');
const projectsDir = path.join(os.homedir(), '.claude', 'projects');

// find the project folder that holds the most-recently-updated transcript
function findTranscripts() {
  if (!fs.existsSync(projectsDir)) return [];
  let best = null;
  for (const dir of fs.readdirSync(projectsDir)) {
    const full = path.join(projectsDir, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    const jsonls = fs.readdirSync(full).filter(f => f.endsWith('.jsonl'))
      .map(f => ({ file: path.join(full, f), mtime: fs.statSync(path.join(full, f)).mtimeMs }));
    for (const j of jsonls) if (!best || j.mtime > best.mtime) best = { mtime: j.mtime, dir: full };
  }
  if (!best) return [];
  return fs.readdirSync(best.dir).filter(f => f.endsWith('.jsonl'))
    .map(f => ({ file: path.join(best.dir, f), mtime: fs.statSync(path.join(best.dir, f)).mtimeMs }))
    .sort((a, b) => a.mtime - b.mtime).map(j => j.file);
}

function cleanUserText(t) {
  if (typeof t !== 'string') return '';
  t = t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  t = t.replace(/<\/?(command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat)>/g, '');
  t = t.replace(/<ide_selection>[\s\S]*?<\/ide_selection>/g, '');
  return t.trim();
}

async function readLines(file, onObj) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch (_) { continue; }
    onObj(o);
  }
}

(async () => {
  const files = findTranscripts();
  if (!files.length) { console.error('No transcript found under ' + projectsDir); process.exit(1); }

  const out = [];
  out.push('# MOSSVEIL — Build Conversation Log');
  out.push('');
  out.push('_A running trace of the design conversation with Claude Code. Generated from the_');
  out.push('_session transcript by `tools/export-conversation.js` — re-run it to refresh._');
  out.push('');
  out.push('_Last generated: ' + new Date().toISOString() + '_');
  out.push('');
  out.push('---');
  out.push('');

  let pendingTools = {};            // tool name -> count, flushed before the next message
  let turns = 0;

  function flushTools() {
    const names = Object.keys(pendingTools);
    if (!names.length) return;
    const parts = names.map(n => pendingTools[n] > 1 ? `${n} ×${pendingTools[n]}` : n);
    out.push('> 🔧 _Actions: ' + parts.join(', ') + '_');
    out.push('');
    pendingTools = {};
  }

  for (const file of files) {
    await readLines(file, o => {
      const role = o.message && o.message.role;
      const content = o.message && o.message.content;

      if (o.type === 'user' && role === 'user') {
        let text = '';
        let hadImage = false, onlyToolResult = true;
        if (typeof content === 'string') { text = content; onlyToolResult = false; }
        else if (Array.isArray(content)) {
          for (const c of content) {
            if (c.type === 'text') { text += (text ? '\n' : '') + c.text; onlyToolResult = false; }
            else if (c.type === 'image') { hadImage = true; onlyToolResult = false; }
          }
        }
        if (onlyToolResult) return;                  // a tool result, not something you typed
        text = cleanUserText(text);
        if (/This session is being continued from a previous conversation/.test(text)) {
          flushTools();
          out.push('## 👤 You'); out.push('');
          out.push('_[Automatic context summary from a compaction — omitted from this log.]_');
          out.push(''); out.push('---'); out.push('');
          return;
        }
        if (!text && hadImage) text = '_[screenshot attached]_';
        else if (hadImage) text += '\n\n_[screenshot attached]_';
        if (!text) return;
        flushTools();
        turns++;
        out.push('## 👤 You'); out.push('');
        out.push(text); out.push(''); out.push('---'); out.push('');
      } else if (o.type === 'assistant' && role === 'assistant' && Array.isArray(content)) {
        for (const c of content) {
          if (c.type === 'text' && c.text && c.text.trim()) {
            flushTools();
            out.push('## 🤖 Claude'); out.push('');
            out.push(c.text.trim()); out.push(''); out.push('---'); out.push('');
          } else if (c.type === 'tool_use') {
            pendingTools[c.name] = (pendingTools[c.name] || 0) + 1;
          }
        }
      }
    });
  }
  flushTools();

  fs.writeFileSync(OUT, out.join('\n'));
  console.log(`Wrote ${OUT}`);
  console.log(`  ${turns} of your messages · ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB · from ${files.length} transcript file(s)`);
})();
