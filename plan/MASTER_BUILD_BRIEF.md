
# MASTER_BUILD_BRIEF.md

# Space Carball (PSX Rocket League) — Master Implementation Brief

## Purpose

This document is the **entry point** for any Sonnet-level coding LLM working on the project.

Do **not** begin coding by scanning the repository randomly.

Read this document first, then follow the required reading order.

This document coordinates all module specifications, establishes authority, prevents scope creep, and defines the exact implementation workflow.

---

# Project Goal

Build a browser-based game inspired by:

- Rocket League gameplay
- Wipeout PS1 visual style
- Original PlayStation rendering aesthetics

Technology:

- TypeScript
- Vite
- Vue 3
- Three.js 0.160.0
- Rapier
- Web Audio API
- Playwright
- Vitest

No multiplayer.

Single player only:

Player

vs

Predictive AI.

---

# Golden Rules

Never sacrifice gameplay for visuals.

Gameplay hierarchy:

1. Physics correctness
2. Determinism
3. Input responsiveness
4. Match rules
5. AI
6. Camera
7. Visuals
8. Effects
9. Polish

Do not implement later phases before earlier exit criteria pass.

---

# Required Reading Order

Read these specifications in order:

1. Core Application Architecture
2. Physics
3. Input & Controls
4. Asset Production Pipeline
5. Visual / Stadium / Match Flow
6. Opponent AI
7. Audio

**CRITICAL CONTEXT LIMITATION:** Do not read all 8 specifications into context for every small iterative file change. To maintain coding quality and prevent hallucination, read ONLY this Master Brief, the Progress document, and the *single* module specification required for the current phase.

After reading:

Read:

docs/implementation-progress.md

before changing code.

---

# Specification Authority

If documents disagree:

1. Core Architecture
2. Physics
3. Asset Pipeline
4. Visual/Game Flow
5. Input
6. AI
7. Audio

Never invent conflicting behaviour.

---

# Build Workflow

Every implementation cycle:

1.
Read implementation-progress.md

2.
Read only the module(s) required for this phase.

3.
Read relevant Three.js skills.

4.
Implement only this phase.

5.
Run:

npm run validate

6.
Run:

npm run type-check

7.
Run only focused tests.

8.
Update:

docs/implementation-progress.md

9.
Stop.

Never continue into the next phase automatically.

---

# Phase Order

Phase 0
Repository scaffold

↓

Phase 1
Runtime

↓

Phase 2
Procedural assets

↓

Phase 3
Physics foundation

↓

Phase 4
Input

↓

Phase 5
Car mechanics

↓

Phase 6
Boost pads

↓

Phase 7
Match flow

↓

Phase 8
Camera + HUD

↓

Phase 9
Basic AI

↓

Phase 10
Advanced AI

↓

Phase 11
User GLBs

↓

Phase 12
Textures

↓

Phase 13
PSX renderer

↓

Phase 14
Stadium art + VFX

↓

Phase 15
UI polish

↓

Phase 16
Audio

↓

Phase 17
Integration hardening

↓

Phase 18
Release gate

---

# Before Writing Code

Confirm internally:

Current phase

Required exit criteria

Files expected to change

Tests that must pass

Modules that must NOT change

If uncertain:

Do not guess.

Read the specification again.

---

# Required Architecture

One:

GameRuntime

One:

requestAnimationFrame loop

One:

Rapier world

One:

AudioContext

Vue owns UI only.

Three.js owns rendering.

Rapier owns gameplay.

---

# Never Do These

Never make Three.js objects reactive.

Never put Rapier state in Pinia.

Never mutate physics from rendering.

Never mutate gameplay from UI.

Never duplicate constants.

Never use Math.random() for gameplay.

Never fetch runtime assets remotely.

Never upgrade Three.js independently.

Never bypass module APIs.

Never skip validation.

---

# Required Build Commands

Development:

npm run dev

Validation:

npm run validate

Types:

npm run type-check

Unit tests:

npm run test:unit

Focused Playwright:

npm run test:<module>

Release:

npm run test:release

---

# Definition of "Finished"

A phase is finished only when:

✓ TypeScript passes

✓ Validation passes

✓ Focused tests pass

✓ Progress document updated

✓ Exit criteria satisfied

Not when "it looks good".

---

# If You Become Stuck

Do not redesign the architecture.

Instead:

Identify the failing specification.

Implement the smallest compliant solution.

Record deviations.

Continue only after tests pass.

---

# Final Goal

A clean repository checkout should allow:

npm ci

↓

npm run validate

↓

npm run build

↓

npm run test:release

without manual fixes.

That is the definition of project completion.
