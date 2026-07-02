# SKILL_ANIMATION.md: creating premium animation (any project)

This is the general for animation creation. It is the process a session follows every
time the task is to create an animation: a product film, a promo, a hero reveal, UI
motion, a demo piece, an ambient background. It is project-agnostic on purpose. The
look always comes from the current project's design system and from fresh research,
never from the last project's effects and never from the model's default taste.

Companion document: `docs/DESIGN_AND_MOTION_PLAYBOOK.md` holds the standards (the
token-first design system, the ten motion families with parameters, the finishing
pass, the coherence guardrail, the critique checklist). This file holds the workflow:
how to frame the ask, how to research the craft, how to write the spec, how to
prototype, and how to judge the result. When both are present, read both. When the
playbook is missing from a project, copy it in before starting.

The quality bar, in one line: a piece that could sit next to Wealthsimple, Apple,
Stripe, or Linear work without embarrassment. Calm confidence, one held moment,
several visual-effect layers composed with restraint, every value a token, nothing
arbitrary.

---

## 1. The workflow at a glance

1. **Frame** the ask: what kind of piece, how long, where it plays, its one emotional job.
2. **Ground** in the project's truth: its real tokens, screenshots, and hero moment.
3. **Research** the craft for this specific piece: parallel deep-research runs that
   return terms, numbers, and named references. Never skipped.
4. **Spec**: write one long, complete specification (no length limit) with beats,
   tokens, choreography, finishing, and a binding coherence guardrail.
5. **Prototype**: render real reference frames with the real tokens; look at them.
6. **Gate**: run the pass/fail contract; fix and re-render until every line is true.

The failure mode this workflow prevents: a first-idea animation, assembled from memory,
with default easings, one fade for everything, and a look borrowed from whatever the
model built last. Premium is a process output, not a first draft.

---

## 2. Frame the ask

Answer these before anything else. One line each.

- **Type:** product film, launch promo, hero reveal, UI motion set, onboarding, demo
  video insert, loading or ambient piece.
- **Length and medium:** seconds, aspect, where it renders (a generation tool such as
  Claude Design, hand-written CSS or JS, a video editor), autoplay or scroll-driven,
  with or without sound and voice-over.
- **The one emotional job:** the single sentence the viewer should feel. Every premium
  piece is designed around one arc and one climax, not a list of features.
- **The one held moment:** which single reveal or interaction gets most of the motion
  budget. Everything else is quieter so this lands.
- **The register:** the emotional category the piece lives in (section 8), which picks
  the two or three reference brands to study. Do not default to the previous project's
  register.

If the human's ask is ambiguous on type, length, or the one moment, ask before
building. Everything else in this file can proceed without another question.

## 3. Ground in the project's truth

The look is not invented; it is extracted.

- Read the project's design system and token source in full: the design doc, the CSS
  or theme file where tokens live, the component primitives, and the real screenshots.
- Extract the exact token sheet: palette (field, ink scale, the one accent, reserved
  accents), type pairing and weight ceiling, radii and spacing, the material recipe,
  and any existing motion tokens (durations, easings) already validated in the product.
- Identify the product's own arc and motifs: what the interface already celebrates
  (a reveal, a confirmation, a stamp, a chart) becomes the film's climax. The best
  promo motion is the product's own hero moment, enlarged.
- If the project has no design system yet, stop and fill the per-project sheet at the
  end of `docs/DESIGN_AND_MOTION_PLAYBOOK.md` first: field, palette, material, type,
  space, motion tokens, the hero moment, the one-line house style. Then continue.
- Collect the attachable assets now: two or three real screenshots, fonts, logo and
  glyphs, any brand doc. A generation tool matches attachments far better than prose.

Hard rule: never approximate brand values from memory and never reuse another
project's palette, material, or signature moves because they are at hand. Extract or
define, then build.

## 4. The research sweep (mandatory)

Vocabulary ages and the premium bar moves. Every animation project runs its own
research sweep before the spec is written. The goal is to learn the current terms,
techniques, and numbers for this specific piece, and to study the chosen reference
brands until their sensibility is concrete enough to execute.

Run three to six deep-research tasks in parallel, chosen from this menu:

- **A. Attention science:** how often a focal change must land, which levers pull the
  eye (motion onset, looming scale, luminance, a singleton), reading-time budgets for
  on-screen text, and peak-end shaping for the arc. Expect numbers: a new focal onset
  about every 0.7 to 1.0 second, one dominant change at a time, about 300ms per word
  of meaning text, a climax at about 60 to 85 percent of runtime, a still end held
  about 1.2 seconds.
- **B. Premium motion craft:** current easing practice (named cubic-bezier curves and
  spring parameters), duration bands, choreography (stagger values, overlapping
  action, follow-through), and the current list of amateur tells.
- **C. Brand sensibility studies:** for each of the two or three reference brands
  chosen in section 2, study their signature moves, pacing, kinetic type, color and
  light, how they show product UI in motion, and their emotional arc. Return a
  distilled "emulate this" list of concrete moves, not adjectives.
- **D. Narrative structure for the target length:** beat counts, seconds per beat,
  accelerando into a held reveal, text budgets per card, the outro hold. Expect a
  timestamped beat-sheet template.
- **E. The specialty of this piece:** whatever the piece is actually about. Numbers
  and counters for fintech, device and 3D motion for hardware, kinetic type for
  editorial, charts for data products, particles and fields for ambient work. Get
  exact recipes with durations and curves.
- **F. The finishing layer:** current parameter ranges for grain, glow and bloom,
  depth of field, chromatic aberration, light sweeps, vignettes, color grading, and
  the discipline that keeps them below conscious notice.
- **G. Motion-system coherence:** when building a new motion language from scratch,
  study the published systems (Material, Carbon, Apple HIG, Fluent, Disney's
  principles) for the rules that keep a piece consistent.

What each research task must return: named terms, exact parameters (milliseconds,
cubic-bezier values, pixel and percent ranges), named real examples to go watch, and
explicit anti-patterns. Numbers, not vibes. If a result comes back as adjectives,
rerun it with a demand for parameters.

A reusable prompt skeleton for the brand study (adapt per brand and register):

> Research the promotional animation and design language of BRAND so I can emulate its
> sensibility for a LENGTH PIECE-TYPE in REGISTER. Report concretely: signature motion
> moves and scene transitions; pacing and rhythm (how often the focal element changes);
> typography in motion; color and light; how real product UI is shown moving; the
> emotional arc. Then return a distilled emulate-this list of 8 to 12 concrete moves
> that transfer, and named campaigns or pages to go watch. Concrete and specific.

And for the specialty study:

> Research how the best PRODUCT-CATEGORY work animates SPECIALTY so the figures or
> objects feel premium and intentional. For each technique give the exact duration,
> easing as cubic-bezier, amplitudes, and why it reads premium. Ground in real, named
> examples. End with two or three ready-to-implement recipes.

## 5. Write the spec

One document, as long as it needs to be. Generation tools and future sessions execute
long specs better than short ones; there is no length limit. The spec contains, in
order:

1. **Purpose and emotional job**, in two sentences, plus the one held moment.
2. **The visual system**, extracted from the project: palette with hex values, type,
   material recipe, backdrop, and the color usage map with its reserved-accent rules.
3. **Attention rules:** the cadence (a new focal onset every 0.7 to 1.0 second, one
   dominant change at a time), text dwell times, dead-air ceiling, and the peak-end
   shape of the whole piece.
4. **Motion tokens:** the duration ladder and named easing curves for this piece, one
   stagger constant, one overshoot budget, and which single move is allowed to exceed
   the standard ceiling as the documented hero.
5. **The vocabulary shortlist:** from the ten families in the playbook, the USE list
   tuned to this register and an explicit AVOID list of off-brand effects. A premium
   piece composes several families (entrances, one transition grammar, a type
   treatment, an ambient layer, the specialty, the finishing pass), never one trick.
6. **Story structure:** the beats with timestamps, an intensity curve, the accelerando,
   and where the held reveal sits.
7. **A shot-by-shot storyboard:** for every beat, its purpose, exact on-screen text
   with its reading hold, the motion with lever, easing, and duration, and one named
   premium detail so the finish is spread across the whole piece.
8. **Specialty choreography** in full detail (for example, number choreography:
   tabular figures, count-ups that ease the value, odometer rolls, undercut and reveal
   recipes).
9. **The finishing pass**, as an ordered list applied last, dialed low.
10. **The coherence guardrail and a pass/fail consistency contract**, stated as
    binding: one spatial model, one direction per meaning, timing asymmetry, one
    physics, one lead at a time, one light source, one personality, everything on the
    token sheet. The renderer is told to verify the contract before output.
11. **Assets to attach:** the screenshots, fonts, glyphs, and any rendered reference
    frames, each with one line on what it proves.

## 6. Prototype and verify

Never hand off a spec sight unseen when a frame can be rendered.

- Build one to three reference frames of the most important beats in plain HTML using
  the project's exact tokens (the real field, material, type, and accent), including
  the finishing layers (grade, grain, vignette, depth of field).
- Screenshot them at 2x with a headless browser and look at the images. Check them
  against the design system and the contract, not against memory. Fix what reads
  wrong (an over-blurred focal element, a competing accent, a dead corner) and
  re-shoot until the frame is right.
- Show the human the frames, not descriptions of frames.
- Attach the validated frames to the spec as ground truth for the renderer.
- When the piece is implemented in code rather than generated: transform and opacity
  only, one will-change per animated layer, 60fps verified, and the reduced-motion
  fallback wired.

## 7. The critique gate

Before calling any animation done, every line must be true:

1. Every duration and curve resolves to the spec's token sheet; nothing ad-hoc.
2. Enters decelerate, exits accelerate and run shorter; on-screen moves use the
   standard curve; linear appears only on continuous spin or a marquee.
3. Exactly one primary motion at any instant, one stagger constant, and deliberate
   rests; the piece is not wall-to-wall motion.
4. One physics: one weight, one overshoot budget, spent only where the spec says.
5. One light source; shadows agree and track elevation; one texture, one grade, one
   personality across the whole piece.
6. Direction is semantic and reversible; nothing teleports; offstage memory holds.
7. The palette holds: one accent, reserved colors used only in their reserved places.
8. Type holds: the pairing, the weight ceiling, tabular figures on every number.
9. Meaning text gets its reading time on a near-empty frame.
10. The finishing layer sits below conscious notice (grain single-digit opacity,
    aberration under about 2px at edges, a vignette you cannot point to).
11. There is one climax, built to, held, and resolved; the end frame is the cleanest
    frame and holds about 1.2 seconds.
12. Reduced motion degrades to clean crossfades with an identical final composition.

Then the last rule: name every effect on screen; if you can list them all without
pausing, remove the busiest one and look again.

## 8. Reference brands by register

Pick the register first, then study two or three of its brands in the research sweep.
Steal systems and discipline, never pixels.

- **Calm trust (fintech, savings, insurance, health):** Wealthsimple (one hero object
  travels the whole piece; warm materials; editorial type; calm pacing), Apple (one
  reverent held reveal; restraint; light as the hero), Stripe (precision; gradient
  fields; numbers treated beautifully).
- **Precision tools (developer, pro, infra):** Linear (crisp micro-motion; dark
  precision; nothing decorative), Vercel (typographic confidence; grid discipline),
  Stripe again for data.
- **Consumer warmth (social, family, lifestyle):** Family (fluid, interruptible,
  spring-driven), Airbnb (soft, photographic, human), high-end mobile apps with
  physical gesture feel.
- **Luxury and editorial (fashion, print-like, cultural):** Apple brand films, Aesop
  (stillness, typography, almost no motion), premium fashion houses (large serif
  type, slow dissolves, film grain).
- **Energy and play (gaming, sports, youth):** kinetic type-heavy work, faster
  cadence, harder cuts; the same coherence rules apply, only the tokens change.

The register decides pacing, palette temperature, type personality, and how much
motion is appropriate. The workflow and the gate never change.

## 9. Working glossary

The language of the craft, so asks and specs are precise. One line each.

- **Beat:** one story unit of a piece, a few seconds carrying one idea.
- **Accelerando:** beats getting shorter and cuts more frequent to build tension.
- **Held reveal:** the climax where motion stops and one element resolves; the payoff.
- **Motion onset:** the start of movement or appearance; the strongest attention pull.
- **Looming:** scaling up toward the viewer; the second-strongest pull.
- **Singleton:** the one element that differs on one dimension (color, size, motion);
  the eye locks to it.
- **Peak-end:** memory keeps the most intense moment and the final moment, not length.
- **Dwell time:** how long text or a figure must hold to be read (about 300ms a word).
- **Fade-rise:** opacity plus a small upward translate; the workhorse entrance.
- **Blur-to-sharp:** entering from a blur to focus; reads as coming into focus.
- **Mask (clip) reveal:** content unveiled behind a moving mask instead of fading.
- **Draw-on:** a stroke or underline drawing itself in.
- **Stagger:** a fixed small delay between siblings so a group reads as choreography.
- **Shared element (FLIP):** one element morphs continuously into its counterpart
  across a state change.
- **Container transform:** a card expands into the surface it opens.
- **Shared axis:** paired slide-plus-fade along one axis for related states.
- **Fade-through:** outgoing fades, incoming fades in while scaling from about 0.92.
- **Matched cut:** composing two shots so a shape or position carries across the cut.
- **Scrub:** an animation timeline driven by scroll position.
- **Pin (sticky):** an element holds in place while its internal timeline plays.
- **Parallax:** layers moving at different rates to imply depth.
- **Kinetic type:** typography that itself performs (line, word, or character level).
- **RSVP:** words shown one at a time in the same position.
- **Scramble (decode):** glyphs resolve from randomness to the real string.
- **Count-up:** a number easing through values to its target.
- **Odometer roll:** digits rolling on vertical strips to a new value.
- **Tabular figures:** equal-width digits so numbers never jitter.
- **Easing:** the acceleration profile of a move (decelerate in, accelerate out).
- **Spring:** motion from stiffness, damping, and mass instead of a fixed duration.
- **Bounce (overshoot):** passing the target and settling back; a budgeted accent.
- **Interruptible:** a motion that can reverse mid-flight keeping its velocity.
- **Anticipation:** a small counter-move before the main move.
- **Follow-through:** parts trailing the parent and settling late.
- **Secondary action:** a subordinate motion supporting the primary one.
- **Specular sweep:** a light band crossing a surface once.
- **Bloom (glow):** soft light bleed from a bright element.
- **Vignette:** darkened edges holding the eye at center.
- **Grain:** animated noise unifying layers; premium at single-digit opacity.
- **Chromatic aberration:** slight RGB edge split; filmic under 2px, broken above.
- **Depth of field:** blur on non-focal planes to force focus.
- **Mesh gradient:** slow multi-stop gradient blobs drifting as a field.
- **Dust motes:** sparse drifting particles adding ambient life.
- **Color grade:** one tint unifying the whole frame.
- **Reduced motion:** the accessibility fallback where animation collapses to fades.

## 10. The floor (never changes, any register)

- Transform and opacity only; no layout-property animation; 60fps.
- No default or linear easing on spatial moves; decelerate in, accelerate out.
- One accent; reserved colors stay reserved; the field is committed, never accidental.
- One material, one light, one personality, one physics, one lead at a time.
- Restraint: if every effect can be named at a glance, remove one.
- Reduced-motion always wired; the final composition identical.
- The full standards, families, parameters, and recipes live in
  `docs/DESIGN_AND_MOTION_PLAYBOOK.md`; this file is the process that applies them.
