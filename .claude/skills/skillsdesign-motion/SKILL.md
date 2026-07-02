---
name: design-motion
description: Use when the user asks to create or change an animation or any motion piece (UI motion, hero reveal, product film, promo, demo insert, loading or ambient piece), or to write a prompt or spec for Claude Design or another generation tool to produce an animation or visual piece. Covers the token-first design system, motion tokens and families, the finishing pass, the coherence guardrail, and the pass/fail critique checklist. Do not load for backend work, plain logic, or UI changes that involve no motion and no new visual system.
---

# Design and motion (loads the full standards on demand)

This skill exists so the design and animation standards stay out of context until an animation task actually shows up. When this skill triggers, do all of the following before producing anything:

1. Read `SKILL_ANIMATION.md` in this folder, in full. It is the workflow: frame the ask, ground in the project's real tokens, run the research sweep, write the spec, prototype reference frames, pass the critique gate.
2. Read `DESIGN_AND_MOTION_PLAYBOOK.md` in this folder, in full. It is the standard: the token sheet method, palette and material recipes, the motion duration and easing tokens, the coherence guardrail, the pass/fail checklist.
3. Where `SKILL_ANIMATION.md` refers to `docs/DESIGN_AND_MOTION_PLAYBOOK.md`, use the copy in this folder. If the current project carries its own copy under `docs/`, the project copy wins.
4. Fill the per-project sheet at the end of the playbook for the product at hand. If the project already has a design system, that system supplies the exact tokens and the playbook supplies the method.
5. Nothing ships before every line of the critique checklist is true.

The general coding standards (SKILL_GENERAL.md) and the security always-on rules keep applying to any code this work produces; the stricter rule wins. After reading this skill, extend the acknowledgement line from CLAUDE.md to: Standards loaded: coding-standards + security-audit + design-motion
