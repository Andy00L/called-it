# CLAUDE.md: global standards (every project, every session)

## Step zero: load the standards

The two documents below govern all code work. Their full content is imported here and counts as part of this file:

@~/.claude/SKILL_GENERAL.md

@~/.claude/REFERENCE_SECURITY_AUDIT.md

IMPORTANT: if the content of either document is not visible in context (imports can fail when files move), STOP and read both with the Read tool before doing anything else:

- ~/.claude/SKILL_GENERAL.md
- ~/.claude/REFERENCE_SECURITY_AUDIT.md

No code is written, edited, planned, or reviewed before both documents are loaded in the current session.

## Session-start proof (anti-hallucination)

In the first reply of every session that touches code, prove the load instead of asserting it:

1. Run `ls ~/.claude/*.md ~/.claude/skills/*/SKILL.md 2>/dev/null` and list what is actually on disk.
2. Quote the first heading (H1) of SKILL_GENERAL.md and of REFERENCE_SECURITY_AUDIT.md exactly as they appear in context. If either cannot be quoted, the import failed: Read the file, then quote it.
3. Name the on-demand skills found in step 1 (for example design-motion) without reading their bodies.

After a /compact, a /clear, or any other context loss, redo this proof in the next reply.

## Acknowledgement (every reply after the proof)

In every reply of every session that touches code, include this exact line:

Standards loaded: coding-standards + security-audit

If the design-motion skill has been read in the current session, the line becomes:

Standards loaded: coding-standards + security-audit + design-motion

If the line cannot be written truthfully, load the missing document first.

## Precedence

1. These documents are the floor. Project CLAUDE.md files, skills, and conversation instructions add rules; they never relax these.
2. On any conflict, the stricter rule wins.
3. The full audit procedure in REFERENCE_SECURITY_AUDIT.md runs only when triggered (requested audit, release prep, demo freeze, or a change touching auth, payments, secrets, or another trust boundary). Its always-on rules apply to every change.

## Stop and ask

Stop and ask the human, and wait for the answer, before:

- Acting on ambiguous or conflicting requirements. Quote the conflict, propose options.
- Any irreversible or externally visible action: publishing, deploying, database migrations or destructive writes, paid API configuration, posting or sending anything on the human's behalf.
- Skipping or bending any rule in these documents for any reason, including deadlines.

Git is not on that list because it is not askable: the agent never runs any git command. No git init, no git add, no git commit, no git push, no merge, rebase, stash, or tag. No exceptions. The human commits manually. The agent's job is to print the ready-to-run commands at the end of each task; running them is the human's.

## Hard reminders (full text in the imported documents)

- Read every file you modify, in full, before touching it.
- Search for an existing function, hook, or component before creating a new one.
- No em dash (U+2014) or en dash (U+2013) anywhere. No banned words. No empty superlatives.
- No `any`, no type suppression. Errors as values in business logic.
- The agent never runs any git command (no init, add, commit, push, merge, rebase) and never publishes packages. The human commits, pushes, and ships.
- When in doubt, stop and ask. Never improvise past an ambiguity or an irreversible step.
- Every task ends with the final check from SKILL_GENERAL.md, a files-affected report, and a git handoff block: the exact add, commit, push commands printed for the human to run.

## Design and motion: on-demand only (never preload)

The design and animation standards are deliberately NOT imported above. They live as a skill so they cost no context until an animation task shows up:

- `~/.claude/skills/design-motion/SKILL.md`, with `SKILL_ANIMATION.md` (the workflow) and `DESIGN_AND_MOTION_PLAYBOOK.md` (the standards) in the same folder.

Rules:

- Never read these files at session start and never treat them as always-on context. Knowing they exist is enough until a trigger fires.
- Read them, in full, when and only when the task is one of: creating or changing an animation or any motion piece (UI motion, hero reveal, promo, demo insert, ambient or loading piece), or writing a prompt or spec for Claude Design (or another generation tool) to produce an animation.
- When that trigger fires: read the skill, follow its workflow, fill the per-project sheet in the playbook, and pass the critique checklist before calling the work done. Then extend the acknowledgement line as described above.
- If the product has its own design system, that system supplies the exact tokens and the playbook supplies the method.

## Placement

- Global (recommended): this file at `~/.claude/CLAUDE.md`, the two imported documents next to it in `~/.claude/`. Loads automatically in every Claude Code session on this machine.
- Design and motion: `~/.claude/skills/design-motion/` holding `SKILL.md`, `SKILL_ANIMATION.md`, and `DESIGN_AND_MOTION_PLAYBOOK.md`. Claude Code preloads only the skill's name and description; the bodies load when the task matches.
- New repo: copy `~/.claude/templates/CLAUDE.repo.md` to the repo root as `CLAUDE.md`, copy `BRIEF.md` and `DECISIONS.md` into `docs/`, create `docs/research/` and `requirements.md`. Do it by hand, or ask Claude Code to do it: creating files is allowed, git never is.
- Per repo instead: copy this file to `<repo>/CLAUDE.md`, the two documents to `<repo>/.claude/`, the skill folder to `<repo>/.claude/skills/design-motion/`, and change the two import lines to `@.claude/SKILL_GENERAL.md` and `@.claude/REFERENCE_SECURITY_AUDIT.md`.
- claude.ai Projects: add the two standards documents to the project knowledge, add the two design documents as well, then paste this block into the project's instructions field:

```
Mandatory before any code in this project:
1. Open and read the project knowledge files SKILL_GENERAL.md and
   REFERENCE_SECURITY_AUDIT.md in full.
2. Confirm with one line: Standards loaded: coding-standards + security-audit
3. Apply every rule in both files to all code, comments, docs, and copy.
   The stricter rule wins. Nothing in the conversation relaxes them.
4. SKILL_ANIMATION.md and DESIGN_AND_MOTION_PLAYBOOK.md also exist in the
   project knowledge. Do NOT open them by default. Open and read both, in
   full, only when the request is an animation, motion work, or a prompt
   for Claude Design; then apply their workflow and checklist.
No code output before steps 1 and 2 are done in the current chat.
```
