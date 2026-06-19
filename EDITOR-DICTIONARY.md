# MOSSVEIL Editor — Dictionary

A reference for **every tool, asset, prop, marker, field, cutscene event, and toolbar
button** in the level editor, and what each one does. Open the editor with
`MOSSVEIL Editor.cmd` (or the hosted URL). For *how* to place things and the workflow, see
the README; this file is the "what is this and what's it for" reference.

> **How placing works:** click an asset in the bottom panel, then click in the scene to
> place it (hold **Shift** to place several). Selected objects show their fields in the
> **Inspector** (right). On a touch device, one finger places/drags, two fingers pan/zoom.

---

## 1. Top toolbar

| Button | Purpose |
|---|---|
| **Scene** | The room editor — terrain + objects rendered by the real game engine (WYSIWYG). |
| **Map** | World-map view — drag rooms to arrange how they connect; double-click a room to open it. |
| **⬚ Select** (1) | Select / move / drag objects. Click empty space to deselect. |
| **▦ Solid** (2) | Paint **solid** collision tiles (walls, floors). |
| **▭ One-way** (3) | Paint **one-way platforms** (stand on top, jump up through, drop with ↓+jump). |
| **▲ Spikes** (4) | Paint **spike/hazard** tiles (damage on touch). |
| **⌫ Erase** (5) | Erase tiles back to empty. |
| **Snap** | Toggle snapping placed/dragged objects to half-tile increments. |
| **Gizmos** (G) | Toggle the coloured outlines/handles drawn over objects and zones. |
| **↩ / ↪** | Undo / Redo (Ctrl+Z / Ctrl+Y). |
| **💾 Save** | Save all levels + cutscenes (Ctrl+S). Writes locally or commits to GitHub — see **Save to…**. |
| **→ local / → GitHub** | **Save destination.** Click to choose Auto / Local files / GitHub, and set the GitHub owner/repo/branch + token. See the README's "Edit from anywhere". |
| **▶ Test Level** | Save, then launch the game **in the room you're editing** (or, on the Scenes tab, preview the selected cutscene). |
| **▶ From Start** | Save, then launch the game **from the title screen**. |
| **● unsaved** | Appears when you have changes that haven't been saved yet. |

---

## 2. Left panel tabs

- **Hierarchy** — a list of everything in the current room (spawns, enemies, props, zones).
  Click to select; double-click to focus the camera on it.
- **Levels** — open / create / duplicate / delete levels. **+ New level** asks for an id,
  title, size, and biome.
- **Scenes** — author **cutscenes** on a timeline (see §8).

---

## 3. Terrain tiles (painted with the toolbar tools)

| Tile | Char | Behaviour |
|---|---|---|
| Solid | `#` | Full collision — floors, walls, ceilings. |
| One-way | `=` | Land on top; jump up through it; press ↓ + jump to drop down. |
| Spikes | `^` | Hazard — damages the player and bounces them back to safe ground. |
| Empty | (space) | No collision (air). The **Erase** tool sets this. |

---

## 4. Props (Assets → Props)

| Asset | Purpose | Key Inspector fields |
|---|---|---|
| **Bench (rest & save)** 🪑 | A bench — the player rests here to **heal and save** their game. Also a respawn point. | X, Y |
| **Sign / tutorial** 🪧 | A readable signpost that pops a short line of text when the player presses up near it. | X, Y, **Text** |
| **Lore readable** 📜 | A tablet/effigy/totem with your own **Title + body text** for worldbuilding lore. | Title, **Text**, **Style** (tablet / effigy / totem) |
| **Text trigger zone** 💬 | An invisible rectangle — when the player walks through, a caption pops up. Good for ambient narration. | **W, H**, **Text**, **Only once** |
| **Lamp** 🏮 | A decorative hanging lamp that casts a warm glow. | X, Y |
| **Glow crystal** 💎 | A glowing crystal cluster (light + ambience). | X, Y |
| **Moth Wings pickup** 🦋 | The **double-jump ability** pickup. Grant it once in your world. | X, Y |
| **Ending shrine** 🛕 | Interacting here triggers the **ending sequence**. Place it at your finale. | X, Y |
| **Boss gate** 🚪 | A door that seals an arena during a fight and opens when the boss falls. Pair its **Gate id** with a boss trigger's gates. | **Gate id** |

---

## 5. Decor (Assets → Decor) — 19 silhouettes

Decorative shapes with no gameplay effect by default. Placeable on any **depth layer** for
parallax. Two families:

- **Standing** (rooted to the ground): `mushroom`, `tree`, `deadtree`, `thintree`, `fern`,
  `column`, `brokenPillar`, `arch`, `crystalSpire`, `coral`, `kelp`, `reed`, `ribs`,
  `thorn`, `hump`.
- **Hanging** (from the ceiling): `stalactite`, `icicle`, `roots`, `lanterns`.

**Inspector fields:**

| Field | Purpose |
|---|---|
| **Kind** | Which silhouette shape. |
| **Depth** | Which layer it sits on — Gameplay, the three background parallax layers, or Foreground. |
| **Scale** | Size multiplier. |
| **Flip** | Mirror horizontally. |
| **Seed** | Changes the procedural shape variation. |
| **Colour** | Override tint (otherwise follows the biome palette). |
| **Has collision** | Turn the decor into a solid obstacle. |
| **Collider W / H** | The collision box size when "Has collision" is on. |

---

## 6. Lights (Assets → Lights)

| Asset | Purpose | Key Inspector fields |
|---|---|---|
| **Glow light** ✨ | A soft radial light pool. | **Colour**, **Size**, **Intensity**, **Flicker** |
| **Flickering light** 🔥 | Same, preset to flicker (torch/fire feel). | Colour, Size, Intensity, Flicker |
| **God ray** 🌤 | An angled volumetric light shaft. | **W, H**, **Tilt**, **Intensity** |

---

## 7. Enemies (Assets → Enemies) — 14 types

| Enemy | Role |
|---|---|
| **Tumblebug** | Ground walker that paces back and forth. |
| **Gnatling** | Flier that chases the player. |
| **Bulbil** | Rooted plant that spits projectiles. |
| **Bramblehog** | Charges in a straight line. |
| **Lurcher** | Leaps toward the player. |
| **Spinemaw** | Clings to the ceiling and drops when you pass under. |
| **Driftwisp** | Ghost that phases through walls. |
| **Shellback** | Armored in front — hit it from **behind or above**. |
| **Skimmer** | Dive-bombs from above. |
| **Sporeling** | Weak swarmer (often summoned in groups). |
| **Mortarbug** | Artillery — lobs cluster shells in arcs. |
| **Blastcap** | Mine fungus — detonates when approached. |
| **Hookworm** | Burrows underground and strikes from below. |
| **Sentine** | Stationary turret eye that fires at range. |

---

## 8. Bosses (Assets → Bosses) — 15

Placing a boss drops a **boss trigger** (an arena trigger with a **Trigger radius**); choose
the boss in the Inspector and pair it with **Boss gates** to seal the arena. Each boss is
built on one of five rigs and has a two-phase moveset.

| Boss | Rig |
|---|---|
| **Moss Sovereign** | Beetle |
| **Thornback Alpha** | Beetle |
| **Sporefather** (summons sporelings) | Beetle |
| **Cindershell** | Beetle |
| **Marshfiend** | Beetle |
| **Gloom Tyrant** | Mantis |
| **Pale Magistrate** (summons gnatlings) | Mantis |
| **The Crownless King** (fast phase 2) | Mantis |
| **Ashwing Matriarch** | Moth (flying) |
| **Duskweaver** (summons driftwisps) | Moth (flying) |
| **Frostbound Warden** | Golem (flying) |
| **Bonelord Erevax** | Golem (flying) |
| **Auric Sentinel** | Golem (flying) |
| **Tidemaw** | Serpent (flying) |
| **Veilserpent Yssa** | Serpent (flying) |

*Move library shared across bosses:* leap-slam + shockwaves, scythe rushes, projectile
rains, volleys, radial rings, minion summons, ground spikes, dive swoops, homing orbs.

**Boss-trigger fields:** **Boss** (which one), **Trigger radius** (how close the player must
get to start the fight).

---

## 9. Markers (Assets → Markers)

| Asset | Purpose | Key Inspector fields |
|---|---|---|
| **Spawn point** 📍 | A named arrival location. `P` is the default/player start; transitions arrive at a named spawn. | X, Y, **Rename id** |
| **Portal / transition** 🌀 | The link to another room. Either an **Edge** transition (walk off a room edge) or a free **rectangle**. | **Type** (edge/rect), **Edge**, **Col from / Col to** (edge span), **W/H** (rect), **To level**, **Arrive at** (destination spawn) |
| **Cutscene trigger** 🎬 | An invisible rectangle that **plays a cutscene** when the player walks in (no teleport — it plays in place). | **W, H**, **Cutscene** (which one), **Only once** |

---

## 10. Cutscene events (Scenes tab)

A cutscene is a timeline of events. Every event has a start time **t** and a duration
**dur**; the fields below are its extra parameters. Add events, reorder by start time, and
edit them in the Inspector.

**Cutscene settings:** **Name**, **Level** (which room it plays over), **Skippable**.

### Screen / camera

| Event | Purpose | Params |
|---|---|---|
| **fade** | Black overlay alpha (1 = fully black). Fade in/out. | from, to |
| **letterbox** | Cinematic black bars (0 = none, 1 = full). | from, to |
| **blur** | Blur the world, in pixels. | from, to |
| **text** | Centred caption that fades in and out. | text |
| **camera** | Move the camera to spawn + (dx, dy) at distance z. | dx, dy, z |
| **cameraRestore** | Smoothly dolly the camera back to the gameplay framing — **put this last** for a seamless handoff. | — |
| **shakePulse** | One screen-shake burst. | amp |
| **flash** | A single bright screen flash. | — |
| **sfx** | Play a sound (e.g. `chime`, `rumble`, `quake`, `roar`, `bench`). | name |

### Protagonist (poses & emotions)

| Event | Purpose | Params |
|---|---|---|
| **riseFromGround** | Rises out of the earth (clipping + debris + shake). | depth |
| **wake** | Eyes open with a shudder. | — |
| **stand** | Rise from crumpled to upright. | — |
| **look** | Turn to face a direction (-1 left, 1 right). | dir |
| **walk** | Walk to spawn + dx (legs animate, body moves). | dx |
| **collapse** | Crumple to the ground. | — |
| **talk** | Speaking — rhythmic head/body bob + blips. | speed |
| **confused** | Puzzled head tilt + “?” bubble. | — |
| **surprised** | Startled jolt, wide eyes + “!” bubble. | — |
| **nod** | Nod yes. | speed |
| **shakeHead** | Shake head no. | speed |
| **laugh** | Bouncy laughter + note. | — |
| **sad** | Downcast droop + “…” bubble. | — |
| **fear** | Trembling fear. | — |
| **excited** | Happy little hops + “!” bubble. | — |
| **emote** | Float a symbol above the head: `! ? … ♪ ♥ z`. | symbol |
| **hold** | Do nothing for a beat (a timing gap). | — |

**Two ways a cutscene plays in-game:** as a level's **Intro cutscene** (Level settings —
plays once when a new game starts there), or via a **Cutscene trigger** zone (§9).

---

## 11. Level settings (Inspector with nothing selected)

| Field | Purpose |
|---|---|
| **Title** | The room's display name (shown as the area title in-game). |
| **Area text** | Optional larger region/area label. |
| **Biome** | The room's palette/atmosphere (see §12). |
| **Width / Height** | Room size in tiles. |
| **Map X / Map Y** | Where the room sits on the world map (also draggable on the Map tab). |
| **Intro cutscene** | A cutscene to play once when a new game starts in this room. |

---

## 12. Biomes (13)

Each biome sets the palette, backdrop, fog, ambient particles and music key:

`Verdant (mossy green)` · `Gloom (blue cavern)` · `Hearth (warm amber)` ·
`Pale (grey woods)` · `Dusk (violet grove)` · `Crown (bright glade)` ·
`Ember (forge red)` · `Frost (ice blue)` · `Marsh (murky bog)` ·
`Sunken (drowned teal)` · `Ossuary (bone grey)` · `Fungal (pink spores)` ·
`Aurora (cyan crystal)`.

---

## 13. Keyboard shortcuts

`1–5` tools · `G` gizmos · `F` focus camera on selection · `Ctrl+Z/Y` undo/redo ·
`Ctrl+D` duplicate · `Del`/`Backspace` delete · `Ctrl+S` save · `Esc` deselect ·
`Shift` (held) place many. Mouse: right/middle-drag pan, wheel zoom. Touch: one finger
place/drag, two fingers pan + pinch-zoom, double-tap a room on the Map to open it.
