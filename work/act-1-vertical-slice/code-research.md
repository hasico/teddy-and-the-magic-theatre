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
