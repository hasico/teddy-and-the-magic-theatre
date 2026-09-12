# Patterns & Conventions

Coding conventions, development workflow, and project-specific practices.
For universal coding standards, see `~/.claude/skills/code-writing/references/universal-patterns.md`.

---

## Project-Specific Code Patterns

Patterns below are demonstrated Act I code; follow for Acts II-III.

1. **Pure logic / Phaser glue split.** All gameplay decisions (snap targeting, scheme resolution, scene readiness, hint targets, hidden-point dwell states) live in `src/logic/` as pure functions with no Phaser imports - unit-testable under Vitest/jsdom. Phaser scenes and controllers orchestrate input/tweens/visuals only and are deliberately not unit-tested.
2. **InputGate counting lock** (`src/logic/inputGate.ts`). Overlapping transitions (settle tween, cats returning, outcome playback, choice/end screens, orientation flips) each take their own lock on one shared gate; gameplay input handlers check `gate.isLocked`. Locks nest; the counter clamps at zero so an extra unlock is harmless.
3. **Per-act content as data.** Props, drop points, outcomes (caption beats), and environment reactions are declarative config in `src/config/act1.ts`, not scene code. Unit tests pin the design-space constants (1280×720 canvas, snapRadius 70, hitboxes ≥100×100 design px, timing constants) so accidental UX drift fails CI.
4. **Assets under the Pages base path.** Load with `${import.meta.env.BASE_URL}assets/...` - never root-absolute `/assets/`, which 404s on GitHub Pages' subpath.
5. **Placeholder-first visuals.** Props are Graphics-drawn shapes with explicit hit areas until real art lands; sprite prep from concept art is a dev-time script (scripts/prepare-sprites.mjs), never runtime code.

---

## Git Workflow

<!--
SCALING HINT: If this section grows beyond ~80 lines, extract to references/git-workflow.md.
-->

### Branch Structure

- **`main`** - Production-ready code (protected). Only merge from `dev` after full testing. Triggers the GitHub Pages deployment (see deployment.md) once that workflow is set up.
- **`dev`** - Active development. All work happens here. No automatic deployment - there is no staging environment for v1 (see deployment.md).

### Testing Requirements

- **On commit:** Code changed → Unit tests (Vitest). Docs only → Skip tests.
- **On merge to dev:** Unit tests (auto, once CI is set up).
- **On merge to main:** Unit tests (auto, once CI is set up).

### Security & Quality Gates

**Pre-commit** (`.husky/pre-commit`, via husky + lint-staged):

- Gitleaks secret scan (`gitleaks protect --staged`) - requires the `gitleaks` binary on PATH locally; if missing, the hook warns and continues rather than silently skipping. CI's `gitleaks-action` in `ci.yml` is the enforced backstop regardless of local setup.
- ESLint (`--fix`) and Prettier on staged `.ts`/`.js`/`.json`/`.md`/`.html`/`.css` files.

**Pre-push:** Not yet set up - code review agent validation is a planned future addition, not part of base infrastructure.

---

## Testing & Verification

<!--
SCALING HINT: If this section grows beyond ~60 lines, extract to references/testing.md.
This section stores proven verification approaches discovered during development.
Generic testing methodology lives in ~/.claude/skills/test-master/.
-->

### Test Infrastructure

Vitest for unit tests (pure logic in `src/logic/`, per-act config pins, save/progress state, SFX and orientation-guard helpers). Scene/controller Phaser glue is intentionally not unit-tested. No test database - state is a localStorage JSON blob, mocked in tests. No E2E framework set up yet.

Importing `phaser` under Vitest needs `vite.config.ts`'s `test.environment: 'jsdom'` + `tests/setup.ts` (`vitest-canvas-mock`, since jsdom's canvas has no real `getContext`) + `phaser3spectorjs` as a devDependency (Phaser's raw source unconditionally requires it due to an unguarded `typeof WEBGL_DEBUG` check meant for bundler dead-code elimination, not runtime use). Any test that imports a scene or the game config needs this setup already in place.

### Agent Verification Methods

**Build smoke check (proven in Act I):** `npm run build && npm run preview`, then curl the page and each `assets/*.png` for HTTP 200. Use `preview`, never `dev` - the dev server serves from the site root and hides base-path asset bugs that only appear on GitHub Pages' subpath. Gameplay feel (magnet, timings, hint readability) is verified by the user in a browser, per the act's user-spec «Как проверить» section.

### User Verification Methods

#### Visual/Gameplay Check

**What to check:** Scene visuals, animations, comic-overlay timing, and "feel" of decoration placement outcomes.
**How:** Open the built game in a browser (desktop and mobile viewport) and play through the scene.
**Why agent can't:** No visual rendering/gameplay-feel judgment capability.
