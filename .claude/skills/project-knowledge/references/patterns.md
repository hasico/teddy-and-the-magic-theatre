# Patterns & Conventions

Coding conventions, development workflow, and project-specific practices.
For universal coding standards, see `~/.claude/skills/code-writing/references/universal-patterns.md`.

---

## Project-Specific Code Patterns

<!--
ADD PROJECT-SPECIFIC PATTERNS HERE:

1. Framework conventions (React hooks, Django patterns, FastAPI dependencies, etc.)
2. Domain naming (Order/Cart/Product vs Purchase/Basket/Item)
3. External integration patterns (Stripe webhooks, API retry logic, etc.)
4. Database patterns (transactions, query optimization, caching)

Only add patterns SPECIFIC to this project. Don't add generic advice.
Empty section is fine for simple projects.
-->

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

**Not yet set up** - planned for the base-infrastructure phase, not yet present in the repo:
- **Pre-commit:** Gitleaks scanning for secrets.
- **Pre-push:** Code review agent validation.

---

## Testing & Verification

<!--
SCALING HINT: If this section grows beyond ~60 lines, extract to references/testing.md.
This section stores proven verification approaches discovered during development.
Generic testing methodology lives in ~/.claude/skills/test-master/.
-->

### Test Infrastructure

Vitest for unit tests (game logic: decoration-combination outcomes, save/progress state). No test database - state is a localStorage JSON blob, mocked in tests. No E2E framework set up yet.

### Agent Verification Methods

None discovered yet - will be added as testing approaches emerge during development (e.g., once the `run` skill is used to launch and check the Phaser build in a browser).

### User Verification Methods

#### Visual/Gameplay Check
**What to check:** Scene visuals, animations, comic-overlay timing, and "feel" of decoration placement outcomes.
**How:** Open the built game in a browser (desktop and mobile viewport) and play through the scene.
**Why agent can't:** No visual rendering/gameplay-feel judgment capability.

