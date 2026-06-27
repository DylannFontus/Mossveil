// MOSSVEIL — mods.js : a small MOD API (G.Mods). Lets external mods extend the game without editing the
// source: a mod calls G.Mods.register({ id, apply(api) }) and, on boot (after the engine + data load but
// BEFORE the first room), every registered mod's apply() runs with a safe api (add/override levels, patch
// any data overlay, hook lifecycle events, or reach G directly). Mods can be dropped in as <script>s that
// register, or stored as code in localStorage (mossveil_mods) and loaded each boot. Inert by default —
// with no mods registered/stored, boot() is a no-op. Hooked into main.js with one guarded line.
(function () {
  const M = G.Mods = {};
  const KEY = 'mossveil_mods';
  let LIST = [], applied = {}, handlers = {};
  M.LIST = LIST;

  function deepMerge(a, b) {
    if (!a || typeof a !== 'object') a = {};
    for (const k in b) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) a[k] = deepMerge(a[k] && typeof a[k] === 'object' ? a[k] : {}, b[k]);
      else a[k] = b[k];
    }
    return a;
  }

  // ---- registration ----
  M.register = function (mod) {
    if (!mod || mod.id == null || typeof mod.apply !== 'function') return false;
    const id = String(mod.id);
    if (LIST.some(m => m.id === id)) return false;   // dedupe by id
    LIST.push({ id, name: mod.name || id, version: mod.version || '1.0.0', apply: mod.apply });
    return true;
  };
  M.get = id => LIST.find(m => m.id === id) || null;

  // ---- the api handed to each mod's apply() ----
  function makeApi() {
    return {
      G: G,
      on(evt, fn) { if (evt && typeof fn === 'function') (handlers[evt] = handlers[evt] || []).push(fn); return this; },
      addLevel(id, def) { if (!id || !def) return false; G.LEVELS = G.LEVELS || {}; G.LEVELS[id] = def; return true; },
      removeLevel(id) { if (G.LEVELS && G.LEVELS[id]) { delete G.LEVELS[id]; return true; } return false; },
      patch(global, obj) { if (!global || !obj) return false; G[global] = deepMerge(G[global] || {}, obj); return true; },
      reapply(moduleName) { try { if (G[moduleName] && typeof G[moduleName].applyData === 'function') { G[moduleName].applyData(); return true; } } catch (e) { } return false; },
      log() { try { console.log('[mod]', ...arguments); } catch (e) { } }
    };
  }
  M.api = makeApi();

  // ---- lifecycle events ----
  M.emit = function (evt) {
    const args = Array.prototype.slice.call(arguments, 1), hs = handlers[evt] || [];
    for (const h of hs) { try { h.apply(null, args); } catch (e) { try { console.error('[mod] handler error:', e.message); } catch (_) { } } }
    return hs.length;
  };

  // ---- external mods stored in localStorage: [{ id, name, code, enabled }] ----
  M.stored = function () { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  M.saveStored = function (list) { try { localStorage.setItem(KEY, JSON.stringify(list || [])); return true; } catch (e) { return false; } };
  M.loadStored = function () {
    let n = 0;
    for (const s of M.stored()) {
      if (!s || s.enabled === false || !s.code) continue;
      try { (new Function('G', s.code))(G); n++; }   // the code calls G.Mods.register(...)
      catch (e) { try { console.error('[mod] load failed:', s.id, e.message); } catch (_) { } }
    }
    return n;
  };

  // ---- apply registered mods (once each) ----
  M.applyAll = function () {
    let n = 0;
    for (const m of LIST) {
      if (applied[m.id]) continue;
      try { m.apply(M.api); applied[m.id] = true; n++; }
      catch (e) { applied[m.id] = true; try { console.error('[mod] apply failed:', m.id, e.message); } catch (_) { } }
    }
    return n;
  };

  // ---- the ONE boot hook (main.js): load external mods, apply everything, announce ready ----
  M.boot = function () { M.loadStored(); M.applyAll(); M.emit('ready'); };

  M.status = function () { return { registered: LIST.length, applied: Object.keys(applied).length, stored: M.stored().length, mods: LIST.map(m => ({ id: m.id, name: m.name, version: m.version, applied: !!applied[m.id] })) }; };
  M.reset = function () { LIST.length = 0; applied = {}; handlers = {}; M.api = makeApi(); };   // test/teardown helper
})();
