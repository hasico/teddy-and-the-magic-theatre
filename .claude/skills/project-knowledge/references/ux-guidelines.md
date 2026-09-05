# UX Guidelines

<!--
OPTIONAL FILE — DELETE if project has no significant UI (CLI tools, bots with minimal text, backend-only).
For projects with minimal UI, add a brief "UX" section in patterns.md instead.
-->

## Purpose
UX standards and user-facing communication for AI agents. Helps agents write consistent UI text and follow design patterns.

---

## Interface Language

**Primary language:** Russian

**Localization:** Single language - no i18n for v1. All in-game text (Ogonyok's lines, memory captions, comic sound-effects) is written directly in Russian.

---

## Tone of Voice

**Overall tone:** Playful, warm, gentle - never scary, never rushed, never punishing.

**Writing style:** Very short sentences a child of 8-10 can read alone at a glance. No long explanations, no tutorial-style instruction text - the game teaches through Ogonyok's brief reactions and visual cues, not paragraphs. Mistakes are never framed as failure ("wrong") - every outcome is described as a funny surprise.

**Voice characteristics:**
- **Formality level:** Informal, childlike - short exclamations and simple statements, not full formal sentences.
- **Emotional tone:** Warm and playful for Teddy and Ogonyok; energetic and a little self-important (comedic, trying to sound more grown-up than she is) for Angelina in comic/memory text.
- **Technical complexity:** None - no settings jargon, no technical terms exposed to the player.
- **Humor:** Central to the tone - unexpected/funny reactions are the reward for experimentation, per game-passport.md section 2 ("mistakes become a reason for a new funny scene, not a punishment").

**Example phrases by context:**

- ✅ Good: "Огонёк: Ой! Так тоже смешно получилось!"
- ❌ Avoid: "Неверная комбинация декораций. Попробуйте снова."


---

## Domain Glossary

- **Акт (Act)** — one of the three magical theatre worlds (Lilac Garden, Candy Castle, Princess's Bedroom). Not "level" or "stage" in code/content naming.
- **Ленточка (the Ribbon)** — Teddy's red ribbon; the visual/emotional progress symbol that glows brighter after each completed Act and reveals a memory. Not "progress bar."
- **Огонёк (Ogonyok)** — the golden light-guide character. Keep this name consistently; don't rename to generic "guide" or "helper" in code/content.
- **Комикс-воспоминание (memory comic)** — the 2-4 frame flat-style comic shown after each Act, revealing backstory with Angelina. Distinct from the live comic-overlay effects used during gameplay.
- **Комиксный слой (comic-overlay layer)** — the flat, hand-drawn-style effects (motion lines, emotion icons, sound-effect text, POV freeze-frames) rendered on top of the 3D-styled puppet-theatre scene during play.
- **Мемная пасхалка (meme easter egg)** — one of the four optional, skippable comedic moments (Six-Seven idle animation, POV freeze-frames, two Candy Castle joke characters, dancing kittens). Never blocks progression.

---

## Text Patterns

No traditional forms/buttons/error-messages - this is a game with no accounts, no validation, no failure states. The only recurring UI text elements:

### POV Freeze-Frame Captions
**Style:** Always starts with "POV:", one short absurd/funny clause describing the surprising outcome.

**Examples:** "POV: ты поставил трон на батут", "POV: улитка получила главную роль"

### Sound-Effect Text (comic overlay)
**Style:** Single onomatopoeic word, all caps, with an exclamation mark.

**Examples:** "БАМ!", "ПУФ!", "ДЗЫНЬ!"

### Ogonyok's reaction lines
**Style:** One short exclamation or observation, in character (mischievous, sometimes gives imperfect advice). Never explains mechanics in instructional language.

---

## Copy Reference

**Location:** Not yet created - in-game text will live in a dedicated content/dialogue file, to be established during Act I implementation.

---

## Design System

**Design files:** No Figma/design files. Concept art lives in `/artbook` (reference only, not shipped assets).

**Art direction:** Handmade puppet-theatre look - visible yarn texture, felt, stitching, buttons, cardboard and wood construction (per game-passport.md section 9). Early concept renders (`/artbook`) came out too polished/glossy - like a saccharine, hyper-real CGI product shot - rather than a warm, slightly imperfect handcrafted toy. Direction going forward: keep Teddy's warm caramel-brown knitted look, the red ribbon, and Ogonyok's golden winged-light design, but favor a more tactile, hand-made, less glossy rendering treatment.

**Color palette:**
- Theatre base: burgundy, dark wood, muted blue, gold light
- Teddy's accent: red ribbon
- Act I - Lilac Garden: lilac, violet, green, night blue
- Act II - Candy Castle: pink, caramel, cream, mint
- Act III - Princess's Bedroom: sky blue, cream, powder pink, gold

**Key components:**
- Puppet-theatre 3D-styled scene (base visual layer) with a contrasting flat 2D comic-overlay layer on top (motion lines, emotion icons, sound-effect text, POV freeze-frames) - see game-passport.md section 9.
- Comic-overlay assets are a small reusable set (8-12 emotion icons, 6-8 motion/flash lines, 5-6 sound-effect words, 3 freeze-frame frames, 1 page-transition), not bespoke per event.

---

## Accessibility

**Requirements:**
- No reading required to understand core actions - meaning must come through visual/iconographic cues and Ogonyok's brief reactions, since the audience is 8-10 year olds playing solo.
- All interactive objects must be clearly readable and reachable by touch on both PC and mobile screen sizes (per game-passport.md section 3).
- No time pressure and no fail state - nothing may punish a slow or "wrong" action.
- All important actions/outcomes must be understandable with sound off (visual language must carry meaning on its own, per game-passport.md section 10).
