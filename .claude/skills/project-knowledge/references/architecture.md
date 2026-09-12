# Architecture

## Purpose

Technical architecture overview for AI agents. Helps agents understand HOW the system is built.

---

## Tech Stack

**Game engine:** Phaser 3 with TypeScript, bundled by Vite

- **Why:** Purpose-built 2D browser game framework. Its Scene system maps directly onto the game's structure (Prologue / Act I / Act II / Act III / Finale), it unifies mouse and touch input, and its tween system covers both the variable staging outcomes and the comic-overlay effects without a second rendering layer.

**Backend:** None - fully client-side game

- **Why:** No accounts, no multiplayer, no server-authoritative state needed (single-player, local progress only per game-passport.md).

**Database:** None - progress saved to browser `localStorage`

- **Why:** Single-player, single-device save is sufficient for v1; no cross-device sync requirement.

**Mobile packaging (planned, later phase):** Capacitor, wrapping the same Vite/Phaser web build into a native Android app for Google Play

- **Why:** Reuses the existing codebase instead of a native rewrite; bundles assets offline for app-store distribution. See deployment.md for release-process details and timing.

---

## Project Structure

```
/
├── src/
│   ├── scenes/         [Phaser Scene classes: Boot, Preload, Act1LilacGarden; per-act controllers in scenes/act1/]
│   ├── logic/          [Pure Phaser-free game logic: placement/snap/scheme resolution, InputGate - unit-tested]
│   ├── audio/          [Synthesized WebAudio SFX (oscillators, no audio files)]
│   ├── ui/             [DOM-level UI helpers: landscape orientation guard]
│   ├── save/           [localStorage save/load logic]
│   ├── config/         [Phaser game config; per-act content config (act1.ts: props, points, outcomes, reactions)]
│   ├── types/          [TypeScript types/interfaces]
│   ├── objects/        [Reusable game objects - planned, empty placeholder]
│   └── comics/         [Comic-overlay effect system - planned, empty placeholder]
├── public/assets/      [Art, audio, comic assets]
├── scripts/            [Dev-only tooling: sprite cutout prep from concept art (sharp)]
├── docs/               [Game design docs - game-passport.md is source of truth for content]
├── tests/              [Vitest unit tests]
└── .claude/            [AI agent context]
```

---

## Key Dependencies

**Critical packages:**

- `phaser` - core 2D game engine: scene management, sprite rendering, tweens, input, audio
- `vite` - dev server and production bundler
- `vitest` - unit tests for game logic (decoration-combination outcomes, save/progress state), not for visual/animation correctness
- `sharp` (devDependency) - used only by scripts/prepare-sprites.mjs to cut sprites out of concept art (flood fill + alpha ramp); not shipped in the bundle

<!-- Add @capacitor/core and @capacitor/android here once the Android packaging phase starts -->

---

## External Integrations

None currently - no external API dependencies. Google Play Console will be a distribution channel in a later phase, not a runtime integration.

---

## Data Flow

Player interacts with the active Phaser Scene (placing decorations/props) → placement decisions resolve in the pure functions of `src/logic/` (snap targets, scheme resolution, scene readiness - no Phaser imports, fully unit-tested) → the scene triggers the matching animation/tween sequence plus any comic-overlay effect → on scene completion, the player's choices are written to `localStorage` → the Finale scene reads all saved choices to assemble the closing performance.

---

## Data Model

<!--
This section describes database/storage architecture.
SCALING HINT: If this section grows beyond ~80 lines, extract to a separate references/database.md and link from here.
-->

**Database:** Not applicable - no server-side database. State lives in browser `localStorage` as a single JSON save blob.

### Save Data (localStorage)

**Purpose:** Stores game progress so a session can resume after closing the browser/app.

- Key: `teddy-save`. Shape (v1, written by Act I): version field + per-act results; Act I stores `{ completed: true, scheme: 'main' | 'hidden' }` - which of the two staging schemes the child built (the secret outcome path).
- Act I is deliberately write-only: nothing reads the blob yet (no resume screen in the vertical slice); the Finale scene will read all acts' results later.
- Relationships: Finale scene reads the full blob to assemble the closing performance from all three acts' choices.

### Key Constraints

- Save format must include a version field from the start, so future acts/content changes can migrate or reset old saves without crashing.

### Migration Strategy

**Tool:** None (manual versioning of the save blob shape)

**Process:** Bump the save-format version field when the save shape changes; on load, unreadable/old-version saves fall back to a fresh save rather than erroring (no punishment for the player).

### Sensitive Data

No PII stored - no accounts, no personal data collected. Save data contains only in-game choices.
