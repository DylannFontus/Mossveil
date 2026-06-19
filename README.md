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
  host finishes its redeploy (seconds).

## Game controls

| Action | Keys |
|---|---|
| Move | `A` `D` or `←` `→` |
| Jump (hold = higher) | `Z` or `SPACE` |
| Strike (combine with `↑`/`↓`) | `X` or `J` |
| Dash | `C` / `K` / `SHIFT` |
| Focus (hold, mends a mask) / Soul-wisp (tap) | `F` or `L` |
| Interact / rest at bench | `↑` or `E` |
| **World map** | `M` (arrows pan, `+`/`−` zoom) |
| Drop through platforms | `↓` + jump |
| Pause / Mute | `ESC` / `U` |

The map fills in as you discover rooms. Rest at benches to record your journey.

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
  - *Markers*: spawn points and **portals/transitions** (edge-based like the original
    rooms, or free rectangles) — pick the destination level and arrival spawn in the
    Inspector.
- **Levels tab** — open, create, duplicate, delete levels. New levels pick a size and one
  of **13 biomes** (verdant, gloom, hearth, pale, dusk, crown, ember, frost, marsh,
  sunken, ossuary, fungal, aurora) — each with its own palette, backdrop assets,
  ambient particles and music key.
- **Map tab** — the whole world drawn in dark-cartography style; drag rooms to arrange,
  double-click to open one.
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
- **Test** — `▶ Test Level` saves and launches the game directly in the room you're
  editing (or, on the Scenes tab, previews the selected cutscene); `▶ From Start` plays
  from the title screen.
- Undo/redo (`Ctrl+Z`/`Ctrl+Y`), snap, duplicate (`Ctrl+D`), delete, focus (`F`),
  save (`Ctrl+S`). Saves write `data/levels.json` (+ a `.js` mirror so the game runs from
  `file://`) with rolling backups in `data/backups/`.

## The bestiary

14 enemies: tumblebug, gnatling, bulbil, bramblehog, lurcher (leaper), spinemaw
(ceiling dropper), driftwisp (phases through walls), shellback (armored front — hit it
from behind or above), skimmer (dive-bomber), sporeling (swarmer), mortarbug
(artillery with cluster shells), blastcap (mine fungus), hookworm (burrower),
sentine (turret eye).

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
- `src/` — engine: util, input, audio (procedural WebAudio), physics, fx, world (13 biomes,
  props, builders), map (world-map renderer), player, enemies, bosses, cutscene
  (cinematic timeline runtime), ui, main
- `tools/` — editor server + headless test harnesses (`smoke.js`, `systems.js`,
  `editor-smoke.js`, `boss-test.js`; they use puppeteer-core + your installed Edge)

Headless tests run in software-rendered slow motion; on real hardware the game runs at
full speed.

*An original homage — all names, designs, code and assets are original.*
