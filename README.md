# MOSSVEIL — Echoes Beneath

A fully playable 2.5D metroidvania built from scratch, **plus a Unity-style level editor**
to build your own world with. Everything — art, animation, sound, music, levels — is
original and generated procedurally in code. No image or audio files exist in this project.

## Play the game

**Double-click `index.html`.** No server, no build step. Chrome, Edge or Firefox.

## Open the editor

**Double-click `MOSSVEIL Editor.cmd`.** It starts a tiny local server (needs
[Node.js](https://nodejs.org), which you already have if you can run `node`) and opens
the editor in your browser. Close the server's console window to stop it.

### Edit from your iPad (or any device on the same Wi-Fi)

The server listens on your whole network, so you can run the editor on the PC and
**work from an iPad, phone or laptop** on the same Wi-Fi. When it starts, the console
window prints the address to open, e.g.:

```
On your iPad / phone / other device (same Wi-Fi):
  http://192.168.x.x:7707/editor/editor.html
```

Type that into Safari/Chrome on the other device. Saves still write to the PC's project
files (the device is just the screen + touch input).

- **The editor is fully touch-friendly.** One finger places / selects / drags / paints;
  **two fingers pan and pinch-zoom** the viewport; double-tap a room on the Map tab to open
  it. Buttons and fields are enlarged for touch, and an Apple Pencil works too.
- **First-time connection:** if the iPad can't reach it, Windows Firewall is blocking
  Node. Allow it once — when you first run the server Windows usually pops a *"Allow access"*
  prompt; tick **Private networks** and accept. (If you dismissed it: Windows Security →
  Firewall & network protection → *Allow an app through firewall* → ensure **Node.js** is
  checked for Private. Both devices must be on the same network, and "client isolation"/
  guest Wi-Fi must be off.)

### Edit from anywhere — host the editor online (no PC needed)

The editor can also run as a **static site** (GitHub Pages / Cloudflare Pages / Netlify —
all free, permanent HTTPS), so you can open it from any device, anywhere, with your PC off.
There's no server in that case, so **Save commits straight to your GitHub repo** instead of
writing local files.

**The editor auto-detects where to save:**

| You open it via… | "Save" does… |
|---|---|
| `MOSSVEIL Editor.cmd` / `localhost` / your Wi-Fi IP | writes to local project files (then you `git push`) — unchanged |
| the hosted static URL (no local server) | commits `data/levels.*` + `data/cutscenes.*` to GitHub in one commit |

You can also force a mode with the **`→ …`** button in the toolbar (Auto / Local / GitHub).

**One-time setup to host it:**

1. Push this repo to GitHub (already done if you followed the steps above).
2. Turn on a static host pointed at the repo's production branch (`main`):
   - **GitHub Pages:** repo *Settings → Pages →* Deploy from branch → `main` / root. Your
     URLs become `https://<user>.github.io/<repo>/editor/editor.html` (and `/index.html`
     for the game). A `.nojekyll` file is included so every folder serves as-is.
   - **Cloudflare Pages / Netlify:** "Add project → connect repo", no build command, output
     directory = repo root. You get `https://<name>.pages.dev/…` (or `.netlify.app`).
   - Either way, **every push to `main` auto-redeploys** the site.
3. On the device, open the hosted `…/editor/editor.html`, click **`→ …`**, and enter your
   **owner / repo / branch** and a **GitHub token**. Use **Test connection** to confirm.

**The token** is a *fine-grained* [Personal Access Token](https://github.com/settings/personal-access-tokens/new)
scoped to **only this repo** with **Contents: Read and write** (nothing else). It's stored
only in that device's browser. Revoke/rotate it anytime from GitHub's token settings.

**Workflow notes (so local + hosted stay in sync):**

- A hosted Save lands as a commit on GitHub. To see those edits on your PC, run **`git pull`**
  (it doesn't sync automatically). Setting `git.autofetch` in VS Code flags when you're behind.
- Genuine merge conflicts are unlikely: the editor only ever writes the four `data/` files,
  while code/features touch `src/`, `editor/`, etc. — different files merge cleanly. Just
  avoid editing the **same** level data both locally and online without pulling in between.
- After a hosted Save, the *deployed* game (the `▶ Test` buttons) reflects the change once the
  host finishes its redeploy.

**Why a hosted edit can take a minute or two to show up:**

- The host has to **rebuild and redeploy** after each push (GitHub Pages is typically
  ~1–2 min; you can watch it in the repo's **Actions** tab). That's the main delay, and it's
  inherent to the host — there's no way around the build itself.
- **Caching is handled automatically.** `index.html` / `editor.html` load all the code and
  data with a per-visit cache-buster when served over http(s), so **a normal reload always
  pulls the freshest deployed version** — no hard-refresh needed, and **your saved progress
  is untouched** (it lives in `localStorage`, which caching never affects). The big vendored
  `three.js` is the one file left cached since it never changes. (Double-clicking the local
  file still loads normally — no busting there, since there's no cache problem locally.)
- The editor no longer makes a **redundant commit** when nothing changed: if you Save and then
  hit *Test* / *From Start* without further edits, it won't re-commit (it shows "already saved").
  So one round of edits = one commit = one redeploy, not several.

> So the realistic flow after a hosted edit: Save → wait ~1–2 min for the Pages build → reload
> the page (which now auto-fetches the fresh version). The only unavoidable wait is the build.

## Game controls

| Action | Keys |
|---|---|
| Move | `A` `D` or `←` `→` |
| Jump (hold = higher) | `Z` or `SPACE` |
| Strike (combine with `↑`/`↓`) | `X` or `J` |
| **Great Slash** (charged nail art) | hold Strike, release |
| Dash | `C` / `K` / `SHIFT` |
| Focus (hold, mends a mask) / Soul-wisp (tap) | `F` or `L` |
| Interact / rest at bench | `↑` or `E` |
| **World map** (drop / clear a pin) | `M` (arrows pan, `+`/`−` zoom, `Z`/`X` pin) |
| Cast spell (aim with `↑` / `↓`) | `F` or `L` (in air for `↓`) |
| Drop through platforms | `↓` + jump |
| Pause / Mute | `ESC` / `U` |
| Debug inspector (dev) | `F4` |

The map fills in as you discover rooms (with an exploration-% readout); drop pins to
mark spots, and an on-screen compass points to the nearest bench when it's off-screen.
Rest at benches to record your journey.

**Gamepad supported** — Xbox / PlayStation controllers work out of the box (sticks move/aim,
face buttons + d-pad map to the actions, `Start`/`Back` for pause/map), with **rumble** on
impacts. Buttons show the right glyphs and are rebindable too.

**Rebind any control** — *Settings → Controls / key bindings* opens a menu of every action and
its current key/button; select one and press a new key **or gamepad button** to rebind it (or
*Reset to defaults*). Bindings are saved and persist across sessions. (Rumble has its own toggle.)

**Spells** — cast with `F`/`L`. Aim it: hold `↑` for an upward **Wraith Cry**, hold `↓` in the
air for an **Abyss Dive** slam, or neither for a forward **Soul Bolt**. Learn and empower spells
(two tiers each) at a **soul well**.

**Progression** — spend **Glimmer** at a **nailsmith** to forge a stronger nail, and at a soul
well to grow your spells. **Charms** can **synergise** in pairs for bonus effects, and you can
**overcharm** (one charm over your notches) for an extra slot at the cost of double damage taken.

**Combat feel** — strikes land a real crescent slash that sweeps and follows through.
**Hold Strike** to charge a **Great Slash** nail art (a lunging heavy blow that staggers
and knocks back). Enemies build **poise** and stagger when it breaks; time a swing into an
incoming hit to **clash/parry** it (no damage). Defeat a boss and the final blow drops into
**slow-motion**.

**The shade** — when you fall you drop your **Glimmer** and a shade appears where you died;
return to that room and destroy it to reclaim what you lost.

**Hunter's Journal** (pause → **Journal**) — a bestiary that fills in as you defeat each
creature, with kill counts, lore and a live 3D portrait. The first kill of a type pops a
"Journal entry added" notice.

**NPCs, dialogue & quests** — speak with the folk you meet for **branching dialogue** (a
typewriter box with portraits and choices). Choices can set flags, fire Logic signals, or
**start quests** — tracked by an on-screen objective and a **Quests** log (pause → Quests),
and auto-completed when their goal flag is met.

**On a touch device (iPad), on-screen controls appear automatically:** a directional pad
on the bottom-left, an action cluster (Jump / Strike / Dash / Focus) on the bottom-right,
and Pause + Map buttons top-right. Hold the D-pad up (▲) to interact / rest at a bench, hold
down (▼) + Jump to drop through platforms, and cutscenes show a **Skip** button. The controls
are hidden on desktop/keyboard. (Menus respond to taps directly.)

## Presentation, charms, currency & options

- **Cinematic rendering** — a post-processing pass adds **bloom, per-biome colour grading,
  vignette, film grain and chromatic aberration**, plus a living camera (look-ahead +
  zoom-punch on impacts), squash-&-stretch juice, a lantern glow, and per-biome atmosphere
  (drifting haze, fireflies, wind). Visual quality is adjustable in **Settings** (Low/Med/High).
- **Composed adaptive soundtrack** — a from-scratch synth **score**: ~24 themes (6 biome
  defaults + standalone moods from **radiant / triumph** to **abyss / void**), each a chord
  progression driving a pad, bassline, arpeggio, stepwise lead and drums. Exploration is
  sparse; **the instant an enemy that can see you engages, the theme turns menacing** — a low
  tritone drone, driving four-on-the-floor kick, hard snare and a harsher, chromatic lead make
  a fight feel *threatening* from the start, then it relaxes when the room clears. When a **boss
  fight begins the biome music does a full stop**; after a beat of silence a dedicated **boss
  theme** (harmonic-minor, sawtooth lead, relentless drums) drives the fight, then the **biome
  music fades back in once the boss is beaten**. It hushes during the new-game prologue, and the
  old theme **fades out under a second** when you change rooms. A
  **Classic** setting restores the original ambient drones, and each level picks its **Score
  track** (or Auto-by-biome) in the editor. All synthesised live — no files.
- Reverb **changes per biome** (ringing stone halls vs dry forges) and per **reverb zone**;
  footsteps and impacts are **surface-aware** (wood / grass / stone / metal), positioned and
  panned by distance. Short **stingers** punctuate boss reveals, item pickups and quests.
- **Bosses** get a named **health bar** with **phase pips**, a cinematic **name-card + epithet**
  intro, a phase-transition, attack telegraphs, and a **slow-motion final blow**.
- **Charms** — equip up to your **notch** budget (which grows as you fell bosses) for effects
  like extra masks, harder strikes, faster focus, quicker dashes. Find them in the world
  (charm pickups) or **buy them from a Vendor** with Glimmer.
- **Glimmer** — currency dropped by enemies and bosses (shown in the HUD).
- **The pause screen is a menu:** Resume / **Charms** / **Settings** (volume, screen-shake,
  visual quality) / Quit to Title. Rest at a **bench** to open its hub: **Travel** (fast-travel
  to any bench you've rested at), **Charms**, or Leave.

The **title menu** has New Game, Continue, Load Save, and Exit — navigate with the
arrows + Enter/Z, or the mouse.

- **New Game** drops you into the first free **save slot** (there are five) and plays the
  intro. If every slot is full it sends you to the slots screen to clear one first.
- **Continue** resumes your most recently saved slot.
- **Load Save** opens the **save slots** screen — up to five independent saves kept in your
  browser, each showing where you rested, your progress and when. Pick one to load it,
  pick an empty slot to start a fresh run there, or hit the **trash button** (top-right of
  a slot, or the `Del` key) to delete it — with a confirm so you can't wipe one by accident.

Saves are stored locally in your browser; resting at a bench records to whichever slot
that run belongs to. (Open `reset-save.html` the same way you launch the game to wipe all
slots at once.)

## The editor

Unity-style layout: **Hierarchy** (left), **Scene viewport** (center — rendered by the
game's actual engine, so what you see is exactly what plays), **Inspector** (right),
**Asset browser** (bottom), and a **Map** tab where you drag rooms around to arrange
the world map (the same map shown in-game on `M`).

- **Terrain** — paint Solid / One-way / Spikes / Erase tiles straight into the viewport.
- **Assets** — click an asset, then click in the scene to place it (hold `Shift` to place
  many). Categories:
  - *Props*: bench (rest & save), tutorial sign, **lore readable** (tablet / effigy / totem
    with your own title + text), **text trigger zone** (pops text up when the player walks
    through), lamp, glow crystal, Moth Wings pickup, ending shrine, boss gate.
  - *Decor*: 19 environment silhouettes (trees, mushrooms, columns, icicles, coral, ribs,
    arches, kelp, thorns...) placeable on any depth layer — gameplay, three background
    parallax layers, or foreground — with scale, flip, colour, and an optional
    **collision box toggle**.
  - *Lights*: glow lights (colour / size / intensity / flicker) and god rays.
  - *Enemies*: all 14 creature types.
  - *Bosses*: all 15 — place a boss trigger, pick the boss, and pair it with gates.
  - *Markers*: spawn points, **portals/transitions** (edge-based like the original rooms, or
    free rectangles), cutscene / set-active / biome-change triggers, and **Audio zones** — an
    ambient emitter (positional looping sound), a reverb zone (swaps the room reverb while
    you're inside), or a music trigger (sets the adaptive-music mood).
  - *Furniture / Build*: full-colour Victorian furniture and a procedural **building generator**
    (multi-storey shell + wood floors + furnishings), plus tileable interior **wall backdrops**.
  - *Dynamic*: interactive elements — **moving platforms** (carry the rider), **crushers**,
    **conveyors**, **wind currents**, **collapsing floors**, **timed spikes**, **breakable
    walls** (reveal secrets), and **levers / pressure plates → doors** wired by a switch name
    (which also fires as a Logic signal).
  - *Props* also include an **NPC** (author its branching dialogue inline), a **Nailsmith**, a
    **Soul well** (spell tree), and the existing vendor / benches / pickups.
  - *Enemies* include a **Custom (behavior)** type whose AI you author from a spec — health,
    speed, sight, flies/walks, idle pattern, on-sight reaction and attack — no code.
  - *My Models*: custom models you built in the **Models tab** (see below).

  The asset browser renders a **live 3D thumbnail** for every item; **search** by name and
  **★ favourite** the ones you use most (favourites sort first / filter-only).
- **Levels tab** — open, create, duplicate, delete levels. New levels pick a size and one
  of **20 biomes** (verdant, gloom, hearth, pale, dusk, crown, ember, frost, marsh, sunken,
  ossuary, fungal, aurora, **City of Tears**, forge, mine, village, archive, garden, tombs) —
  each with its own palette, backdrop assets, ambient particles, **reverb character** and
  music key.
- **Map tab** — the whole world drawn in dark-cartography style; drag rooms to arrange,
  double-click to open one. It doubles as a **world-graph diagnostic**: room thumbnails +
  door links, a ▶START badge, dimmed **unreachable** rooms, and red/amber outlines on rooms
  the **lint** flags (broken links, missing spawns/refs, dead-ends, unreachable-from-start).
- **Logic tab** — a node-graph **visual-scripting** canvas per room: events (room-enter,
  timer, zone, signal, boss-death…) wired to conditions and actions (set flag, set-active,
  play sound/cutscene/FX, weather, text…), all driven by the universal **object-id** system.
- **Models tab** — build characters or props from primitives (box, sphere, capsule, cone…),
  **parent** parts into a rig, set pivots, recolour, and author **animation clips** (pose +
  keyframe). **🦴 Auto-rig (humanoid)** guesses a torso/head/arms/legs skeleton from the layout
  and generates **idle + walk** clips. Models are flat-shaded to match the art; place a saved
  model from *Props → Model* (with an Animation dropdown), and it animates in-game.
- **Scenes tab** — author **cutscenes** on a timeline. Each cutscene is a list of timed
  events you add, reorder by start time, and edit in the Inspector. Event types:
  - *Screen/camera*: `fade`, `letterbox` (cinematic bars), `blur`, `flash`, `text`
    (centred caption), `camera` (move/zoom), `cameraRestore` (smooth dolly back to the
    gameplay framing — put it last), `shakePulse`, `sfx`.
  - *Protagonist*: `riseFromGround`, `wake`, `stand`, `look`, `walk`, `collapse`, and a
    set of **emotive animations** — `talk`, `confused`, `surprised`, `nod`, `shakeHead`,
    `laugh`, `sad`, `fear`, `excited`, plus `emote` to float a symbol (`!`, `?`, `…`, `♪`,
    `♥`, `z`) over the head, and `hold` for a beat.

  Two ways to play a cutscene in-game:
  1. **Intro cutscene** — set on a level (Level settings) to play once when a new game
     starts there. The shipped **"Awakening"** intro does the rise-wake-stand-look-"Who am
     I?" sequence then dollies back into gameplay.
  2. **Cutscene trigger** — a placeable zone (Markers → *Cutscene trigger*, like a
     transition zone): walking into it plays the chosen cutscene *in place* (no teleport),
     then returns control. "Only once" is remembered in the save.

  `▶ Test` previews the selected cutscene in the game. An **"Expressions (demo)"** sample
  cutscene is included as a reference for all the emotive animations (delete it freely).
- **Test / Play here** — `▶ Play here` saves and launches the game directly in the room
  you're editing, inside the editor; the playtest overlay has a **↻ Reload** (hot-reload)
  that saves your latest edits and reloads the running room in place. Press **`F4`** in play
  for a **debug inspector** — click any entity to see its live state (hp/aggro/pos/vel…), with
  teleport/kill shortcuts. `▶ From Start` plays from the title screen.
- **Prefabs** — marquee-drag or `Shift`-click objects and save them as a reusable prefab
  (`Ctrl+G`). Prefabs can be **nested** (⊕ on a prefab card embeds another prefab; stamping
  expands them recursively), and stamped copies are edited freely for per-instance variants.
- Undo/redo (`Ctrl+Z`/`Ctrl+Y`), snap, duplicate (`Ctrl+D`), delete, focus (`F`),
  save (`Ctrl+S`). Saves write `data/levels.json` (+ a `.js` mirror so the game runs from
  `file://`) with rolling backups in `data/backups/`. The left panel's **Guide** tab is a
  searchable dictionary of every node, concept and tool.

## The bestiary

14 enemies: tumblebug, gnatling, bulbil, bramblehog, lurcher (leaper), spinemaw
(ceiling dropper), driftwisp (phases through walls), shellback (armored front — hit it
from behind or above), skimmer (dive-bomber), sporeling (swarmer), mortarbug
(artillery with cluster shells), blastcap (mine fungus), hookworm (burrower),
sentine (turret eye). Each is recorded in the in-game **Hunter's Journal** as you defeat it,
with lore and a 3D portrait.

15 bosses built on five rig archetypes (beetle, mantis, moth, serpent, golem) with a
shared move library (leap-slam + shockwaves, scythe rushes, projectile rains, volleys,
radial bursts, minion summons, ground eruptions, dive swoops, homing orbs, burrow
strikes), two-phase fights, and per-boss palettes: Moss Sovereign, Thornback Alpha,
Sporefather, Cindershell, Marshfiend, Gloom Tyrant, Pale Magistrate, The Crownless
King, Ashwing Matriarch, Duskweaver, Frostbound Warden, Bonelord Erevax, Auric
Sentinel, Tidemaw, Veilserpent Yssa.

## The 2.5D rendering

The world is true 3D (Three.js): gameplay on the z = 0 plane, silhouette layers at
z = −9 / −18 / −30, a painted cavern wall at −48, a gradient sky at −80, foreground at +5.
A perspective camera at z = 30 follows the player, so the parallax falls out of the
geometry naturally. Depth fog tints each layer toward the biome palette.

## Project layout

- `index.html` — the game · `editor/` — the editor app · `MOSSVEIL Editor.cmd` — launcher
- `data/levels.json` / `data/cutscenes.json` — levels and cutscenes (the editor's save
  targets); the matching `.js` files are generated mirrors so the game runs from `file://`
- `src/` — engine: util, input (keyboard + gamepad + rebinds), audio (procedural WebAudio +
  reverb/stingers, Score/Classic switch), music (composed adaptive soundtrack engine),
  physics, fx, post, lights, world (20 biome looks, props,
  dynamic elements, builders), map (world-map renderer), models (custom-model rig + clips),
  thumb (3D→portrait snapshotter), eventgraph (visual-scripting runtime), dialogue (branching
  NPC dialogue), quests, debug (in-play inspector), player, enemies (incl. data-driven custom
  AI), bosses, cutscene (cinematic timeline runtime), ui, main
- `tools/` — editor server + headless test harnesses (`smoke.js`, `systems.js`,
  `editor-smoke.js`, `boss-test.js`, plus per-feature tests: `combat-texture-test.js`,
  `audio-smoke.js`, `shade-test.js`, `journal-test.js`, `boss-cinematic-test.js`,
  `map-depth-test.js`, `world-graph-test.js`, `autorig-test.js`, …; they use puppeteer-core
  + your installed Edge)

Headless tests run in software-rendered slow motion; on real hardware the game runs at
full speed.

*An original homage — all names, designs, code and assets are original.*
