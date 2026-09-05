# Project Context

## Purpose
This file provides high-level project overview for AI agents. Helps agents understand WHAT we're building and WHY.

---

## Project Overview

**Name:** Teddy and the Magic Theatre (working title of the game: "Teddy's Way Home")

**Description:** A short narrative browser-based 2D game for children where a lost knitted teddy bear stages three magical theatre performances to find his way back to his owner.

Full game design is documented in [docs/game-passport.md](../../../docs/game-passport.md) — treat it as the source of truth for narrative, characters, scope and pacing. This file summarizes it for quick agent context.

---

## Target Audience

**Primary users:** Children aged 8-10, playing independently on PC or phone.

**Use case:** A calm, self-directed first "own" gaming experience — no reading-heavy text, no keyboard, no precise reflexes, no fail states. Mouse or touch only.

---

## Core Problem

Most games aimed at this age either require adult help (reading, complex controls) or use fail/punishment mechanics (timers, health, bad endings) that frustrate young children. Teddy and the Magic Theatre solves this by making every interaction low-stakes: any decoration choice produces a fun outcome, never a wrong one, so a child can play the whole ~45-minute story solo without getting stuck or scared.

---

## Key Features

- **Three magical theatre acts** - Player redresses and populates three themed stage sets (Lilac Garden, Candy Castle, Princess's Bedroom), each ending in a short staged performance based on their choices.
- **No-fail decoration gameplay** - Every valid prop placement produces a distinct, comedic outcome instead of a "correct/incorrect" result.
- **Memory comics** - After each act, a short 2-4 frame comic reveals part of the backstory between Teddy and his owner Angelina.
- **Comic-overlay effects** - Hand-drawn-style motion lines, emotion icons, sound-effect text and freeze-frame captions layered live over the puppet-theatre scene during play.
- **Optional meme easter eggs** - Four non-blocking, skippable comic moments (idle animation, POV freeze-frames, two joke characters, a dancing-kitten trio) that don't affect progression.

<!--
Feature backlog, detailed roadmap, and development phases live in the project backlog
(see CLAUDE.md for backlog path), not here. This file is a stable overview.
-->

---

## Out of Scope

Full v1 scope boundaries are in [docs/game-passport.md](../../../docs/game-passport.md) section 12. Summary:

- No platforming/physics, combat, health or lives.
- No timers or punishment for slow play; no fail states or bad endings.
- No free-roam large levels or complex inventory.
- No branching plot, full voice acting, or multiplayer.
- No level editor; no additional worlds beyond the three acts for v1.
- No backend/accounts - progress is stored locally per device.

**Not yet decided (raised during planning, not committed):** additional worlds, full voice acting, multiplayer, level editor — these were mentioned as unformed future ideas, not backlog items.
