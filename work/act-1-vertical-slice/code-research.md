# Code Research — act-1-vertical-slice

Date: 2026-09-06
Scope: input for `user-spec.md`. Facts and structure only, no implementation plan.

---

## 0. Codebase state (verified)

Everything under `src/` is scaffolding. There is **no gameplay code at all**.

| File                                        | State                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/main.ts`                               | 4 lines: `new Phaser.Game(gameConfig)`                                                                                         |
| `src/config/gameConfig.ts`                  | `GAME_WIDTH=1280`, `GAME_HEIGHT=720`, `Phaser.AUTO`, parent `game-root`, `Scale.FIT` + `CENTER_BOTH`, `scene: [Boot, Preload]` |
| `src/scenes/Boot.ts`                        | `create()` → `this.scene.start('Preload')`                                                                                     |
| `src/scenes/Preload.ts`                     | empty `preload()`, `create()` draws one centered text label                                                                    |
| `src/save/index.ts`                         | one line: `export const SAVE_FORMAT_VERSION = 1;`                                                                              |
| `src/objects/`, `src/comics/`, `src/types/` | `.gitkeep` only                                                                                                                |
| `public/assets/`                            | `.gitkeep` only                                                                                                                |
| `tests/unit/gameConfig.test.ts`             | 2 assertions (see §5 — one of them will break)                                                                                 |

`npm test` currently passes (1 file, 2 tests, ~3.3 s). Phaser imports cleanly under jsdom.

---

## 1. Phaser 3.90 pattern for drag + "snap to nearest named point"

### Recommendation: plain distance check over a hand-authored point list. Do **not** use Zones or Arcade Physics.

Phaser does have `Phaser.GameObjects.Zone` + `setRectangleDropZone()` and the `drop` / `dragenter` / `dragleave` / `dragover` events, but they are the wrong fit here:

- Drop zones are AABB rectangles tested against the **pointer**, not against the dragged object's centre — the "magnetic pull while dragging" feel of `placement-mechanics.md` §4.2 cannot be expressed through them.
- There is no "nearest of N candidates" arbitration: with overlapping zones Phaser resolves by display-list order, not distance.
- Scheme switching (main/hidden) would mean creating/destroying zone objects at runtime, versus flipping a boolean in a config array.
- Zones are Phaser objects → any unit test of "which point wins" would need a live Scene. A plain function over a point array is testable with zero Phaser (see §5).

Arcade Physics overlap is strictly worse: it adds a physics world, a fixed step, and body sync, for a problem that is one `Math.hypot`.

### The idiomatic minimal shape

```ts
prop.setInteractive({ draggable: true, useHandCursor: true });
// equivalent: prop.setInteractive(); this.input.setDraggable(prop);
```

Scene-level events (string constants mirrored by `Phaser.Input.Events.DRAG_START` / `.DRAG` / `.DRAG_END`):

- `this.input.on('dragstart', (pointer, gameObject) => …)` — lift: `y -= 4..8`, `setScale(1.05)`, stronger contact shadow (`placement-mechanics.md` §4.1).
- `this.input.on('drag', (pointer, gameObject, dragX, dragY) => …)` — this is where the magnet lives:
  1. `const target = nearestActivePoint(dragX, dragY)` — pure function, `Phaser.Math.Distance.Between` or `Phaser.Math.Distance.BetweenPoints`.
  2. if `dist < point.snapRadius`, bias the position: `gameObject.x = Phaser.Math.Linear(dragX, target.x, pull)` where `pull = (1 - dist / snapRadius) * STRENGTH` (STRENGTH ≈ 0.35). That single line produces the whole "slight magnetic attraction" described in §4.2.
  3. same frame: apply the wobble/rotation tell for the point (and the hidden-point-specific petal cue, `act-01-lilac-garden.md` §5).
- `this.input.on('dragend', (pointer, gameObject, dropped) => …)` — settle: if a target was within radius, `this.tweens.add({ x: target.x, y: target.y, duration: 150, ease: 'Cubic.easeOut' })` (matches the 120–180 ms in §4.3, followed by the squash/return-to-scale tween); otherwise tween back to the theatre box.

Note the `dragend` signature carries a third `dropped: boolean` argument (added for documentation in Phaser 3.80) — only meaningful with real drop zones, ignorable here.

### Hold-to-drag for the key prop (`placement-mechanics.md` §6.1, ~0.5 s)

`this.input.dragTimeThreshold` is a **global** InputPlugin setting — setting it to 500 would make every prop require a half-second hold, which contradicts §6.1 ("short tap only selects" applies to the key prop only). Per-object approach instead: leave the key prop non-draggable, and on its `pointerdown` start `this.time.delayedCall(500, () => this.input.setDraggable(prop, true))`, cancelled on `pointerup`/`pointermove`-beyond-threshold. `setDraggable(obj, false)` on drop restores the guard.

(There is a known-fixed Phaser bug — `Input.dragDistanceThreshold` misbehaved from 3.18 until 3.21 unless the time threshold was also set. 3.90 is well past that, but it is another reason to avoid the global knobs.)

### Coordinate note

`Scale.FIT` + `CENTER_BOTH` means Phaser already reports pointer/drag coordinates in the 1280×720 design space. Drop points can be hand-authored as literal `{x, y}` numbers in that space with no conversion — important, since the whole config is hand-authored.

### Mutually-exclusive schemes

No engine feature needed. Keep one piece of scene state, `activeScheme: 'main' | 'hidden' | null`, derived from where the key prop actually landed. `nearestActivePoint()` filters candidate points by `point.scheme === 'both' || point.scheme === activeScheme`. Before the key prop is placed, `activeScheme === null` and dependent props are simply not dispensed from the box yet — which is already the required behaviour (cats appear after the bush). That satisfies `placement-mechanics.md` §5 ("points of the inactive scheme do not attract") and §8 ("mixed state is impossible") without any dependency-graph machinery — consistent with §11's explicit "no arbitrary dependency graph".

---

## 2. Proposed config shape (`src/types/` + `src/config/`)

Source of truth: `docs/act-01-lilac-garden.md` §4 (prop table), §5 (key choice), §6 (linked group), §§10–11 (the two performances).

### Types (`src/types/placement.ts` — description, not final code)

- `SchemeId = 'main' | 'hidden'`
- `PropRole = 'common' | 'key' | 'dependent'`
- `PropVisual` — discriminated union so placeholders and real art coexist without touching game logic (interview constraint: "data-driven config so art can be swapped later"):
  - `{ kind: 'placeholder', shape: 'rect' | 'ellipse', width, height, fill: number, label: string }`
  - `{ kind: 'sprite', texture: string, scale?: number }`
- `DropPoint` — `{ id, x, y, scheme: SchemeId | 'both', snapRadius: number, isHidden?: boolean }`. `isHidden` marks the bush's secret point so the auto-hint never targets it (`act-01-lilac-garden.md` §7).
- `PropDef` — `{ id, order: number, visual: PropVisual, role: PropRole, required: boolean, points: DropPoint[], holdToDragMs?: number }`.
- `OutcomeDef` — `{ scheme, title, durationMs, beats: { atMs: number, description: string }[] }`. For this slice the beats drive placeholder tweens/labels, not final animation.
- `ActConfig` — `{ id: 'act1', keyPropId: string, dependentPropIds: string[], props: PropDef[], outcomes: Record<SchemeId, OutcomeDef>, autoHintDelayMs: number }`.

The key/dependent link is two string fields on the act config — the "manual, per-act" wiring `placement-mechanics.md` §6 asks for.

### Data (`src/config/act1.ts`) — 8 draggable entities

The §4 table has 7 rows but row 6 is "Two lanterns — appear **sequentially**", so it becomes two `PropDef`s:

| id              | role          | required | points                                                                                                      |
| --------------- | ------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `path-segments` | common        | yes      | 1 (`both`)                                                                                                  |
| `fountain`      | common        | yes      | 1 (`both`)                                                                                                  |
| `low-bush`      | common        | yes      | 1 (`both`)                                                                                                  |
| `arch`          | common        | yes      | 1 (`both`)                                                                                                  |
| `tall-bush`     | **key**       | yes      | 2 — `main` (beside the arch), `hidden` (centre, behind the fountain, `isHidden: true`), `holdToDragMs: 500` |
| `lantern-a`     | common        | yes      | 1 (`both`)                                                                                                  |
| `lantern-b`     | common        | yes      | 1 (`both`)                                                                                                  |
| `stone-cats`    | **dependent** | yes      | 2 — `main` (side pedestals), `hidden` (fountain rim)                                                        |

Derived pure functions (Phaser-free, the unit-test surface):

- `resolveScheme(config, placements): SchemeId | null`
- `activePointsFor(config, propId, scheme): DropPoint[]`
- `findSnapTarget(points, x, y): { point, distance } | null`
- `isSceneReady(config, placements): boolean` → gates the console (`act-01-lilac-garden.md` §8)

Static environment (bench, nest swing, scooter — `act-01-storyboard-playground.md` §2) is deliberately **not** in `props`: it has no points, no drag, no readiness contribution. If it appears in the slice at all it belongs in a separate flat `environment` array, or is skipped entirely.

### Two ordering discrepancies to settle in the user-spec

1. **Box dispense order.** `act-01-lilac-garden.md` §4 numbers the arch as #5 (after the tall bush #4); `act-01-storyboard-playground.md` frames 6→7 show the arch installed **before** the tall bush. The `order` field must pick one. The storyboard order (path → fountain → low bush → arch → tall bush → lantern A → lantern B → cats) is the more deliberate of the two — it lets the arch establish the space before the key choice — but this needs a call.
2. **Are the cats one prop or two?** §4 calls them "one linked item" ("Один связанный предмет"), the storyboard frame 11 shows two figurines emerging together. Modelling them as a single `PropDef` with a two-figurine visual is the cheaper reading and matches §4.

### Hints — scope check against the interview

Read from `logs/userspec/interview.yml`:

- **Auto-hint IS in scope.** `phase1_feature_overview.success_criteria` item (b) reads "с учётом автоподсказки через 10–15 сек, как описано в placement-mechanics.md". So `autoHintDelayMs` (12 000 per `act-01-lilac-garden.md` §7) belongs in the config, plus a per-prop "fired once" flag, timer reset on successful placement, and the rule that it never points at `isHidden` points.
- **The hint _button_ (`placement-mechanics.md` §8.2 / `act-01-lilac-garden.md` §7 "По кнопке") is NOT mentioned anywhere in the interview** — not in `constraints`, not in `success_criteria`. It is neither explicitly in nor explicitly out. **Open question for the user-spec.** Default assumption: out of scope for the slice.

### Other scope conflicts worth flagging in the user-spec

- `constraints` says "без комикс-оверлеев, без пасхалок", but Performance 2 (`act-01-lilac-garden.md` §11 step 6, storyboard frame 20C) has a **POV freeze-frame** as one of its seven beats. Is the POV frame cut, or kept as a plain static caption?
- `constraints` says "без комикс-воспоминания (временная текстовая заглушка)", so `src/comics/` stays empty this slice.
- The maze is out, so `act-01-lilac-garden.md` §9 collapses to: scene ready → console lights up → one click → performance. The §12 "переставить" flow stays in (it is in `feature_description`).
- The static reactive environment (bench / nest swing / scooter reactions, storyboard §2 table) is **not mentioned in the interview at all**. Likely out for the slice; confirm.

---

## 3. Artbook model sheets

**Filename correction:** the file is `artbook/character-art-ogonek.png`, not `character-art-ogonyok.png`. Any spec text should use the real name.

**`artbook/` is listed in `.gitignore`** (last line: "Concept art / design reference - not versioned"), and commit `0d99e2c` "Stop tracking artbook/ in git" removed it from history. Consequences: the source sheets exist only on this machine; the **prepared sprites must be committed under `public/assets/`** (which is tracked), and no CI step can regenerate them.

Both sheets: **1672 × 941 px**, ~2.1–2.2 MB PNG.

### `character-art-teddy.png` — model sheet, 10 poses

Two rows on a flat cream paper texture:

- Top row (4): turnaround — front, left profile, 3/4, back. All standing, neutral, arms down, red ribbon, exactly two ears.
- Bottom row (6): expressive poses — waving, arms-crossed shy, walking/waving, walking (with motion strokes), arms-crossed grumpy, shrug.

Each pose is fully separated with generous margins; a small hatched cast shadow sits under each. **No overlap between poses.**

### `character-art-ogonek.png` — model sheet, 10 poses

Two rows, same cream ground. Top row: idle glow, drifting with dotted trail, big flare/happy, squinting, spiky-alert. Bottom row: dim/sad, comet-streak (long trail, overlaps its own trail only), pointing with a little hand, holding a phone, cheering with both arms. Also fully separated, cast-shadow strokes beneath each.

### Assessment: **straightforward, not hard.** One caveat.

- Picking a single game-ready pose is easy. Recommended crops: Teddy = top-left front-facing standing pose (roughly x 200–440, y 40–470); Ogonyok = top-left idle glow (roughly x 70–290, y 140–360). Both are clean rectangular crops with no neighbouring art intruding.
- **The one real cost is alpha.** The background is a _textured_ cream paper, not a flat key colour, and Ogonyok's art is a soft glow with feathered edges — a naive colour-key will leave a halo, and hard-thresholding will chew the glow. This matters because the Act I stage is a dark night-blue scene (`act-01-lilac-garden.md` §2 palette), so a leftover cream rectangle would be glaringly visible.
- Practical path: crop the bounding box, then remove the paper by luminance-based masking rather than colour key, and hand-check the glow edge on Ogonyok. Budget it as a small dedicated image-prep task (the interview already anticipates this: "Если вырезать спрайт из модельного листа нетривиально — решается отдельной задачей внутри фичи (image prep), не блокирует остальную механику"). It should not need to fall back to a placeholder.
- Also note the hatched cast shadows are drawn art, not a rendered shadow — crop above them or keep them, but be consistent between the two characters.

---

## 4. localStorage save shape

Current: `src/save/index.ts` is `export const SAVE_FORMAT_VERSION = 1;` and nothing else.

Constraints from `.claude/skills/project-knowledge/references/architecture.md` (Data Model): single JSON blob, version field present from the start, unreadable/old-version saves **fall back to a fresh save rather than erroring** ("no punishment for the player"), no PII.

Minimal shape for this slice — narrow now, but shaped so Acts II/III and the Finale (which "reads the full blob to assemble the closing performance") only add keys:

```
{
  version: 1,                       // === SAVE_FORMAT_VERSION
  acts: {
    act1?: {
      completed: boolean,           // player pressed "продолжить" after a performance
      scheme: 'main' | 'hidden'     // which performance was accepted
    }
  }
}
```

Module surface (three functions, zero Phaser — see §5 on testability):

- `loadSave(): SaveData` — read one localStorage key (suggest `teddy-save`), `JSON.parse`, and return `defaultSave()` on **any** of: key absent, parse failure, `version !== SAVE_FORMAT_VERSION`, shape mismatch. Wrap in `try/catch`: `localStorage` access itself throws in private-mode / storage-blocked browsers, which matters because the target is children on arbitrary phones.
- `saveAct1Result(scheme: SchemeId): void` — merge-and-write; swallow quota errors (progress loss is acceptable, a crash is not).
- `clearSave(): void` — needed for the manual browser check and for tests.

Note the design intent difference: `scheme` records the **accepted** performance, so re-staging ("переставить", `act-01-lilac-garden.md` §12) overwrites it only after the player accepts again.

---

## 5. Vitest / Vite setup — what a new test file needs

**Nothing. It is automatic.** Confirmed by running the suite.

- `vite.config.ts:25-36` — `test.environment: 'jsdom'`, `setupFiles: ['tests/setup.ts']`, `include: ['tests/**/*.test.ts']`. Any new `tests/**/*.test.ts` is picked up with no registration step.
- `tests/setup.ts` is a single `import 'vitest-canvas-mock';` — applied globally, nothing to opt into per file.
- `vite.config.ts:15-24` — the `define` block stubs Phaser's `typeof CANVAS_RENDERER` / `WEBGL_DEBUG` / `PLUGIN_3D` / … flags. `vite.config.ts:31-35` (`test.server.deps.inline: ['phaser']`) forces Phaser through Vite's transform so those defines actually substitute. Without them Phaser would unconditionally `require('phaser3spectorjs')`. `phaser3spectorjs@0.0.8` is installed as a devDependency belt-and-braces; do not remove it.
- Verified: `npm test` → 1 file, 2 tests, passing. `import Phaser from 'phaser'` inside a test works today (`tests/unit/gameConfig.test.ts` pulls it in transitively via `gameConfig`).

### Three concrete gotchas for this feature

1. **`tests/unit/gameConfig.test.ts:12` will break.** It asserts `expect(gameConfig.scene).toHaveLength(2)`. Registering the Act I scene in `gameConfig.scene` fails this test. It must be updated in the same change.
2. **Import ≠ instantiate.** Importing Phaser under jsdom works; booting a `Phaser.Game` or running a Scene lifecycle under jsdom is fragile (no WebGL, RAF loop, canvas mock gaps). This directly supports the interview's `testing_strategy`: put scheme resolution, scene readiness, snap-target selection and save/load in **Phaser-free modules** (`src/types/`, `src/config/act1.ts`, `src/save/index.ts`) and unit-test those; keep `Act1LilacGarden.ts` a thin Phaser shell covered by the mandatory manual browser check. If a module needs `Phaser.Math.Distance`, prefer a local `Math.hypot` in the pure layer so the test never imports Phaser at all.
3. **`tsc --noEmit` runs before every build.** `package.json:8` → `"build": "tsc --noEmit && vite build"`, and `tsconfig.json` has `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`. Placeholder/stub code with unused params fails CI, not just lint. `tsconfig.json` `include` is `["src", "tests", "vite.config.ts"]` — no change needed for new files.

Pre-commit (`.husky/pre-commit`): `gitleaks protect --staged` (warns and skips if gitleaks is not on PATH) then `npx lint-staged` → `eslint --fix` on `*.{ts,tsx,js}` and `prettier --write` on `*.{ts,tsx,js,json,md,html,css}`. Markdown in `work/` gets reformatted on commit; PNGs are untouched.

---

## 6. CI / GitHub Pages

### `.github/workflows/ci.yml`

Triggers: `push` to `dev` and `main`, and `pull_request` targeting `dev` or `main`.
Steps: `actions/checkout@v4` with `fetch-depth: 0` → **gitleaks scan** (`gitleaks/gitleaks-action@v2`) → Node **24** with npm cache → `npm ci` → `npm run lint` → `npm run build` → `npm test`.

### `.github/workflows/deploy.yml`

Trigger: **`push` to `main` only.** No `workflow_dispatch`, so a merge/push to `main` is the only way to publish — which matches the interview's requirement that the merge be explicitly approved first.
`build` job: `npm ci` → `npm test` → `npm run build` → `configure-pages@v5` → `upload-pages-artifact@v3` with `path: dist`. `deploy` job: `actions/deploy-pages@v4`, environment `github-pages`. Concurrency group `pages`, `cancel-in-progress: true`.

Note: the deploy workflow runs `npm test` and `npm run build` but **not** `npm run lint` — lint is only enforced by `ci.yml`, which does also run on `main`.

### Base path — the one deploy-only trap

`vite.config.ts:5` sets `base: '/teddy-and-the-magic-theatre/'` (project-page Pages URL). Implications for new files under `public/assets/`:

- `public/` is copied verbatim into `dist/`, so `public/assets/teddy.png` is served at `https://<user>.github.io/teddy-and-the-magic-theatre/assets/teddy.png`. **No config change is needed to add asset files.**
- But Phaser loader paths are resolved by the browser, not by Vite — `base` does not rewrite strings inside `this.load.image(...)`. An **absolute** path such as `this.load.image('teddy', '/assets/teddy.png')` works on `localhost:8080` and **404s on Pages**. This is the most likely "works locally, broken after deploy" failure for this feature.
- Safe options, pick one and apply it consistently in `Preload.preload()`: call `this.load.setBaseURL(import.meta.env.BASE_URL)` once, or prefix every path with `` `${import.meta.env.BASE_URL}assets/…` ``. (`import.meta.env.BASE_URL` is `'/teddy-and-the-magic-theatre/'` in build and `'/teddy-and-the-magic-theatre/'` in dev too, since `base` is set unconditionally.)
- Because manual browser verification is a required acceptance step and `npm run preview` honours `base`, the check should be run against `npm run build && npm run preview`, not only `npm run dev`.
- Bundle size: the two model sheets are ~2 MB each. Only the **cropped** sprites should land in `public/assets/`; committing the full sheets would bloat both the repo and the Pages artifact (and `artbook/` is gitignored precisely to avoid this).

---

## 7. Open questions for the user-spec

1. Hint **button** — in or out? (auto-hint is confirmed in; the button is unmentioned in the interview)
2. Box dispense order — table §4 order or storyboard order (arch before the tall bush)?
3. POV freeze-frame in Performance 2 — cut (per "no comic overlays / no easter eggs") or kept as a static caption?
4. Static environment (bench / nest swing / scooter and their two reaction states) — in the slice or deferred?
5. Stone cats as one prop or two?

---

## 8. Exact current file contents (verbatim, for tech-spec line-level accuracy)

All quoted in full; nothing paraphrased.

### `src/main.ts` (4 lines)

```ts
import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';

new Phaser.Game(gameConfig);
```

### `src/config/gameConfig.ts` (19 lines)

```ts
import Phaser from 'phaser';
import { Boot } from '../scenes/Boot';
import { Preload } from '../scenes/Preload';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1a1a2e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [Boot, Preload],
};
```

### `src/scenes/Boot.ts` (11 lines)

```ts
import Phaser from 'phaser';

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.start('Preload');
  }
}
```

### `src/scenes/Preload.ts` (22 lines)

```ts
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';

export class Preload extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    // Real assets are loaded here once Act scenes are implemented (see docs/act-01-storyboard-playground.md).
  }

  create(): void {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Teddy and the Magic Theatre', {
        fontFamily: 'sans-serif',
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }
}
```

Note: `Preload.create()` currently just draws a static label — it never transitions anywhere. There is **no existing `this.scene.start(...)` call to a third scene** to hook into; a new Act I scene start has to be added to this method from scratch, it's not replacing an existing transition line.

### `src/save/index.ts` (2 lines, both quoted)

```ts
// Save/load logic against localStorage. Implemented alongside Act I (see docs/placement-mechanics.md).
export const SAVE_FORMAT_VERSION = 1;
```

### `tests/unit/gameConfig.test.ts` (15 lines)

```ts
import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH, gameConfig } from '../../src/config/gameConfig';

describe('gameConfig', () => {
  it('defines a valid render surface size', () => {
    expect(GAME_WIDTH).toBeGreaterThan(0);
    expect(GAME_HEIGHT).toBeGreaterThan(0);
  });

  it('registers the Boot and Preload scenes', () => {
    expect(Array.isArray(gameConfig.scene)).toBe(true);
    expect(gameConfig.scene).toHaveLength(2);
  });
});
```

### `vite.config.ts` (37 lines, full file)

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/teddy-and-the-magic-theatre/',
  server: {
    port: 8080,
  },
  // Phaser's unbundled source guards optional features (WebGL debug via
  // SpectorJS, 3D plugins, etc.) behind `typeof FLAG` checks meant to be
  // dead-code-eliminated by a bundler define. Without these, `typeof
  // WEBGL_DEBUG` on an undeclared identifier still evaluates to the (truthy)
  // string "undefined", so Phaser unconditionally requires optional deps
  // like `phaser3spectorjs` that aren't installed.
  define: {
    'typeof CANVAS_RENDERER': JSON.stringify(true),
    'typeof WEBGL_RENDERER': JSON.stringify(true),
    'typeof WEBGL_DEBUG': JSON.stringify(false),
    'typeof EXPERIMENTAL': JSON.stringify(false),
    'typeof PLUGIN_3D': JSON.stringify(false),
    'typeof PLUGIN_CAMERA3D': JSON.stringify(false),
    'typeof PLUGIN_FBINSTANT': JSON.stringify(false),
    'typeof FEATURE_SOUND': JSON.stringify(true),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Force Phaser through Vite's transform pipeline (not Node's native
    // require) so the `define` flags above actually get substituted.
    server: {
      deps: {
        inline: ['phaser'],
      },
    },
  },
});
```

### `tsconfig.json` (full file)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

### `eslint.config.js` (flat config, full file — **no `.eslintrc*` exists in this repo**)

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
);
```

### `.prettierrc.json` (full file)

```json
{
  "singleQuote": true,
  "semi": true,
  "printWidth": 100,
  "trailingComma": "all"
}
```

### `package.json` — scripts + dependencies/devDependencies only

```json
"scripts": {
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "lint": "eslint .",
  "format": "prettier --write .",
  "prepare": "husky"
},
"dependencies": {
  "phaser": "3.90.0"
},
"devDependencies": {
  "@eslint/js": "10.0.1",
  "@types/node": "26.4.1",
  "eslint": "10.10.0",
  "eslint-config-prettier": "10.1.8",
  "husky": "9.1.7",
  "jsdom": "30.0.1",
  "lint-staged": "17.5.0",
  "phaser3spectorjs": "0.0.8",
  "prettier": "3.9.6",
  "typescript": "6.0.3",
  "typescript-eslint": "8.69.0",
  "vite": "8.2.2",
  "vitest": "5.0.0",
  "vitest-canvas-mock": "1.2.0"
}
```

### `index.html` (root, full file — relevant because of the orientation-overlay question in §11)

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Teddy and the Magic Theatre</title>
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        background: #000;
        overflow: hidden;
      }
    </style>
  </head>
  <body>
    <div id="game-root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

There is exactly one element in the DOM outside the canvas: `#game-root` (the Phaser parent). No pre-existing overlay `<div>`, no other markup, no inline script beyond the module entry point.

---

## 9. Scene registration mechanics

`Phaser.Types.Core.GameConfig.scene` (declared in `node_modules/phaser/types/phaser.d.ts:72363`):

```ts
scene?: Phaser.Types.Scenes.SceneType | Phaser.Types.Scenes.SceneType[];
```

where (same file, `:78989`):

```ts
type SceneType =
  | Phaser.Scene
  | Phaser.Types.Scenes.SettingsConfig
  | Phaser.Types.Scenes.CreateSceneFromObjectConfig
  | Function;
```

So the array holds **scene classes themselves** (not instances) — exactly the pattern already used: `scene: [Boot, Preload]` passes the `Boot` and `Preload` class references. Registering a new `Act1LilacGarden` scene is mechanically identical to how `Preload` was added:

1. Create `src/scenes/Act1LilacGarden.ts` exporting a class extending `Phaser.Scene`, with a scene-key string passed to `super('...')` in the constructor (both existing scenes follow this — `super('Boot')`, `super('Preload')`).
2. Import it in `src/config/gameConfig.ts` next to the other two scene imports.
3. Append it to the `scene: [Boot, Preload, Act1LilacGarden]` array. First array element is auto-started by Phaser on boot; every other element only starts if `{ active: true }` is set on it (per the GameConfig scene doc comment) **or** something calls `this.scene.start('<key>')` at runtime — which is the mechanism already used by `Boot.create()`.
4. The actual transition point: `Preload.create()` (currently just draws the placeholder text label, quoted in full in §8) is where a `this.scene.start('Act1LilacGarden')` call needs to be added — there is no existing transition call there to modify, it's a net-new line.
5. `tests/unit/gameConfig.test.ts:12` (`expect(gameConfig.scene).toHaveLength(2)`) must be updated to `toHaveLength(3)` in the same change, per §5 gotcha #1 already on file.

No other registration step exists — no separate scene registry, no manifest file, no `SceneManager.add()` call needed anywhere else in the codebase (`this.scene.add(...)` is a valid runtime alternative to the config array per the Scene Manager API, but is not the pattern used here; the array approach is the only one this repo currently exercises).

---

## 10. Non-interactive props: `disableInteractive()` vs never calling `setInteractive()`

Checked against `node_modules/phaser/types/phaser.d.ts` (Phaser 3.90.0 typings, GameObject-level API, lines ~20166–20201):

```ts
setInteractive(hitArea?: Phaser.Types.Input.InputConfiguration | any, callback?: Phaser.Types.Input.HitAreaCallback, dropZone?: boolean): this;

/**
 * If this Game Object has previously been enabled for input, this will disable it.
 * An object that is disabled for input stops processing or being considered for
 * input events, but can be turned back on again at any time by simply calling
 * `setInteractive()` with no arguments provided.
 * If want to completely remove interaction from this Game Object then use `removeInteractive` instead.
 */
disableInteractive(resetCursor?: boolean): this;

/**
 * If this Game Object has previously been enabled for input, this will queue it
 * for removal, causing it to no longer be interactive. The removal happens on
 * the next game step, it is not immediate.
 * The Interactive Object that was assigned to this Game Object will be destroyed,
 * removed from the Input Manager and cleared from this Game Object.
 * If you wish to re-enable this Game Object at a later date you will need to
 * re-create its InteractiveObject by calling `setInteractive` again.
 * If you wish to only temporarily stop an object from receiving input then use
 * `disableInteractive` instead, as that toggles the interactive state, where-as
 * this erases it completely.
 */
removeInteractive(resetCursor?: boolean): this;
```

Three distinct states, per the typings' own doc comments:

- **Never call `setInteractive()` at all** — the object was never enabled for input, no `InteractiveObject` was ever created for it, cheapest at creation time, nothing to toggle later.
- **`disableInteractive()`** — was interactive, now temporarily isn't; the `InteractiveObject` is kept around; re-enabling later is just `setInteractive()` with no args (cheap toggle back on).
- **`removeInteractive()`** — was interactive, now permanently isn't; the `InteractiveObject` is destroyed; removal is deferred to "the next game step" (not synchronous); re-enabling requires calling `setInteractive()` again with fresh arguments (since the old hit area/config is gone).

For "already-placed non-key prop simply doesn't respond to pointer/drag" (a prop that is static scenery/environment and never needs to become interactive again): **never calling `setInteractive()` on it in the first place** is the cheapest and simplest option if the prop's non-interactive state is permanent and known at creation time. If a prop starts interactive (draggable during placement) and then must stop responding once correctly placed (e.g. common props after they snap), `disableInteractive()` is the fit — it is synchronous, toggle-able, and doesn't destroy the input config in case the "переставить" (re-place) flow (`act-01-lilac-garden.md` §12) needs to make it draggable again later via a bare `setInteractive()` call.

---

## 11. Orientation / resize detection with `Scale.FIT` + `CENTER_BOTH`

Current `gameConfig.scale` (quoted in §8) sets `mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH` and nothing else — no `orientation` lock option is configured in Phaser's own scale config (Phaser 3.90 has no scale-level "lock to landscape" flag; only `mode`/`autoCenter`/`width`/`height`/`min`/`max`/`zoom` etc. are used here).

Two independent Phaser 3.90 APIs are available, confirmed in `node_modules/phaser/types/phaser.d.ts`:

**A. `Phaser.Scale.Events` (namespace, `:101605`)**

```ts
namespace Events {
  const ENTER_FULLSCREEN: string;
  const FULLSCREEN_FAILED: string;
  const FULLSCREEN_UNSUPPORTED: string;
  const LEAVE_FULLSCREEN: string;

  /** Dispatched whenever the Scale Manager detects an orientation change event from the browser. */
  const ORIENTATION_CHANGE: string;

  /**
   * Dispatched whenever the Scale Manager detects a resize event from the browser.
   * It sends three parameters to the callback, each of them being Size components.
   */
  const RESIZE: string;
}
```

**B. `Phaser.Scale.ScaleManager` instance properties (`:101740` onward, reachable in any Scene as `this.scale`)**

```ts
/** Is the device in a portrait orientation as reported by the Orientation API? Usually only available on mobile devices. */
readonly isPortrait: boolean;

/** Is the device in a landscape orientation as reported by the Orientation API? Usually only available on mobile devices. */
readonly isLandscape: boolean;

/** Are the game dimensions portrait? (i.e. taller than they are wide) — different from the device's own orientation. */
readonly isGamePortrait: boolean;

/** Are the game dimensions landscape? (i.e. wider than they are tall) — different from the device's own orientation. */
readonly isGameLandscape: boolean;
```

Idiomatic minimal wiring, given this repo's fixed 1280×720 design space (`isGamePortrait`/`isGameLandscape` will always read `landscape` here since the game's own config dimensions never change — they answer "is the _design surface_ portrait", not "is the _device_ portrait"; the relevant signal for this feature is `isPortrait`/`isLandscape`, which reflect the _device_/viewport):

```ts
this.scale.on('orientationchange', (orientation) => { /* Phaser.Scale.Orientation enum value */ });
// or, listening on the manager's own EventEmitter surface directly:
this.scale.on(Phaser.Scale.Events.ORIENTATION_CHANGE, (orientation) => { ... });
this.scale.on(Phaser.Scale.Events.RESIZE, (gameSize, baseSize, displaySize, previousWidth, previousHeight) => { ... });
```

`this.scale.isPortrait` can also just be polled synchronously inside either handler rather than relying on the `orientation` argument's shape.

**Browser-native alternative:** `window.matchMedia('(orientation: portrait)')` is standard Web API, unrelated to Phaser, and works independently of the canvas/game state — it can drive a plain DOM overlay (e.g. a `<div>` sibling of `#game-root` in `index.html`, toggled via `.hidden`/`style.display`) without going through Phaser's event system at all. **No precedent for `matchMedia` exists anywhere in this repo** (confirmed via full-repo grep, zero matches outside `node_modules`).

Given the constraint "must stay strictly landscape design-space 1280×720 with no camera scroll" and that the overlay is DOM chrome (not game content), the DOM-level `matchMedia` route avoids coupling the rotate-prompt to Phaser scene lifecycle (it can show/hide even before `Phaser.Game` finishes booting, and doesn't need a Scene reference at all) — but the Scale Manager's `ORIENTATION_CHANGE`/`RESIZE` events are still the correct thing to listen to if the overlay is instead implemented as a Phaser scene/`DOMElement` GameObject and needs to be an authoritative part of scene state (e.g. gating drag input while the overlay is shown, which the input-blocking would need to read `this.scale.isPortrait` for). Both are documented, available options; the codebase has zero precedent either way — this is a first implementation.

---

## 12. AudioContext access via Phaser Sound API

Confirmed in `node_modules/phaser/types/phaser.d.ts:105634` — `WebAudioSoundManager`:

```ts
class WebAudioSoundManager extends Phaser.Sound.BaseSoundManager {
  constructor(game: Phaser.Game);

  /** The AudioContext being used for playback. */
  context: AudioContext;

  /** Gain node responsible for controlling global muting. */
  masterMuteNode: GainNode;

  /** Gain node responsible for controlling global volume. */
  masterVolumeNode: GainNode;

  /** Destination node for connecting individual sounds to. */
  destination: AudioNode;

  createAudioContext(game: Phaser.Game): AudioContext;
  setAudioContext(context: AudioContext): this;
  // ...
}
```

`this.sound.context` **does exist** at runtime under `Phaser.AUTO`/default config (Web Audio is used whenever the browser supports it — virtually all targets), but there is a **type-level catch**: `Phaser.Scene.sound` (declared at `phaser.d.ts:103429` and `:5439`) is typed as a union:

```ts
sound: Phaser.Sound.NoAudioSoundManager |
  Phaser.Sound.HTML5AudioSoundManager |
  Phaser.Sound.WebAudioSoundManager;
```

`NoAudioSoundManager` and `HTML5AudioSoundManager` have **no `.context` property** (confirmed — grepping their class bodies finds no `context` field). Under this repo's `strict: true` `tsconfig.json`, `this.sound.context` will **not compile** without narrowing/casting, e.g.:

```ts
const ctx = (this.sound as Phaser.Sound.WebAudioSoundManager).context;
```

or an `instanceof Phaser.Sound.WebAudioSoundManager` guard first.

Minimal oscillator "beep" using that context (no audio file, no `this.load.audio(...)` call needed):

```ts
const ctx = (this.sound as Phaser.Sound.WebAudioSoundManager).context;
const osc = ctx.createOscillator();
const gain = ctx.createGain();
osc.frequency.value = 880; // Hz
gain.gain.setValueAtTime(0.2, ctx.currentTime);
osc.connect(gain).connect(ctx.destination);
osc.start();
osc.stop(ctx.currentTime + 0.15); // 150ms beep
```

Note: browsers require a user-gesture to resume/unlock an `AudioContext` — Phaser's own sound manager already handles the "unlock on first input" dance for its own sounds; a raw oscillator created via `this.sound.context` rides on that same already-unlocked context as long as it's triggered from inside a pointer/input handler (which drag/drop interactions already are), so no separate unlock code should be needed for this feature's use case (button-press/snap-confirmation beeps).

---

## 13. `public/assets/` and `BASE_URL` precedent

- `public/assets/` contains **only** `.gitkeep` (confirmed via glob `public/assets/**` — single result). No existing asset files, no subfolder structure, no naming convention to infer.
- Full-repo grep for `BASE_URL` (excluding `node_modules`) returns exactly two hits: `work/act-1-vertical-slice/user-spec.md` and `work/act-1-vertical-slice/code-research.md` itself (i.e. this document's own §6, which already documents the trap). **There is no actual code precedent anywhere in `src/`, `tests/`, or config files** for `import.meta.env.BASE_URL` usage — the guidance in §6 is a recommendation, not something to copy from an existing call site.
- Full-repo grep for `matchMedia` (excluding `node_modules`): zero hits. No precedent either way (see §11).
- `index.html` (quoted in full in §8) has one static entry script tag, `<script type="module" src="/src/main.ts"></script>`, using an absolute root path. This is a Vite-rewritten HTML asset reference (Vite's HTML transform automatically prefixes it with `base` at build time), which is a **different mechanism** from a runtime `this.load.image('key', '/assets/x.png')` string inside `Preload.preload()` — the latter is a literal string Phaser hands to the browser's `fetch`/`Image()` at runtime and is **not** rewritten by Vite, which is exactly the trap already flagged in §6.

---

## 14. ESLint / Prettier rules relevant to placeholder Phaser.Graphics code

Read directly from `node_modules/@typescript-eslint/eslint-plugin/dist/configs/flat/recommended.js` (this is the config object `eslint.config.js` spreads via `...tseslint.configs.recommended` — confirmed this resolves to the **flat**, non-type-checked `recommended` preset, not `recommended-type-checked`):

```js
rules: {
  '@typescript-eslint/ban-ts-comment': 'error',
  'no-array-constructor': 'off',
  '@typescript-eslint/no-array-constructor': 'error',
  '@typescript-eslint/no-duplicate-enum-values': 'error',
  '@typescript-eslint/no-empty-object-type': 'error',
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-extra-non-null-assertion': 'error',
  '@typescript-eslint/no-misused-new': 'error',
  '@typescript-eslint/no-namespace': 'error',
  '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
  '@typescript-eslint/no-require-imports': 'error',
  '@typescript-eslint/no-this-alias': 'error',
  '@typescript-eslint/no-unnecessary-type-constraint': 'error',
  '@typescript-eslint/no-unsafe-declaration-merging': 'error',
  '@typescript-eslint/no-unsafe-function-type': 'error',
  'no-unused-expressions': 'off',
  '@typescript-eslint/no-unused-expressions': 'error',
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': 'error',
  '@typescript-eslint/no-wrapper-object-types': 'error',
  '@typescript-eslint/prefer-as-const': 'error',
  '@typescript-eslint/prefer-namespace-keyword': 'error',
  '@typescript-eslint/triple-slash-reference': 'error',
},
```

Concretely bites placeholder Phaser code as follows:

- **`@typescript-eslint/no-explicit-any: 'error'`** — the Phaser typings themselves use `any` in places (e.g. `setInteractive(hitArea?: Phaser.Types.Input.InputConfiguration | any, ...)`, confirmed at `phaser.d.ts:20166`), but that's inside `.d.ts` and not linted; **new code must not write `: any`** for placeholder config objects, prop payloads, etc. — this is a hard error, not a warning. Per the rule source (`no-explicit-any.js`), the `unknown`/`never` replacements are listed under `suggest` (manual, editor-only fixes), and the rule only auto-fixes via `--fix` when the `fixToUnknown` option is explicitly enabled — it is not enabled in this config (`eslint.config.js` passes no rule-options override). So `eslint --fix` in the pre-commit `lint-staged` step (§5) will **not** silently rewrite an `any`; it fails the commit and fails `npm run lint` in `ci.yml`.
- **`@typescript-eslint/no-unused-vars: 'error'`** (base ESLint's `no-unused-vars` is explicitly turned `'off'` in favor of this) — combined with `tsconfig.json`'s `noUnusedLocals: true` / `noUnusedParameters: true` (already flagged in §5 gotcha #3 as a `tsc --noEmit` build-time failure), an unused parameter in a placeholder callback (e.g. `(pointer, gameObject) => {}` where `pointer` is unused) is a **double failure**: both `eslint` and `tsc --noEmit` (which runs before `vite build` per `package.json:8`) will reject it independently. Prefix genuinely-unused parameters with `_` only helps if the specific rule option `argsIgnorePattern` is set — it is **not** set in this config (default options are used, no override block for `@typescript-eslint/no-unused-vars` exists in `eslint.config.js`), so check the default: `@typescript-eslint/no-unused-vars` default options do **not** ignore `_`-prefixed args unless `argsIgnorePattern` is explicitly configured, which it isn't here — so unused placeholder callback params must be actually removed or the whole parameter list restructured, not just prefixed with underscore, to satisfy this specific config.
- **No naming-convention rule** (`@typescript-eslint/naming-convention`) is configured anywhere — `eslint.config.js` only pulls `js.configs.recommended` + `tseslint.configs.recommended` + `prettierConfig` (which only disables stylistic rules that conflict with Prettier). So there is **no enforced naming style** (camelCase/PascalCase) beyond what TypeScript itself requires.
- **Prettier** (`.prettierrc.json`, quoted in full in §8): `singleQuote: true`, `semi: true`, `printWidth: 100`, `trailingComma: "all"`. Placeholder `Phaser.Graphics` draw-call chains (`.fillStyle(...).fillRect(...).fillCircle(...)`) are exactly the kind of long fluent chain that will get reformatted by `prettier --write` in `lint-staged` on commit if a line exceeds 100 chars — expect method-chain code to be auto-wrapped, not rejected (Prettier reformats, it does not error the commit).
- No `eslint-disable` comments exist anywhere in `src/` currently (nothing to model an exception pattern on) — any placeholder that needs to bypass a rule will be a first precedent, not a copy of an existing pattern.
