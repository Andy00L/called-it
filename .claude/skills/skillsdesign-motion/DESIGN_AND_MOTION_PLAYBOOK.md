# The premium design and motion playbook (general)

A reusable method for building premium interfaces and animation, and for getting good
at it. It is project-agnostic: the principles, tokens, and checklists apply to any
product. Where a concrete example helps, one worked system (a light "glass over warm
paper" look) appears in a boxed EXAMPLE, never as the requirement.

Read part 1 to build the skill, parts 2 and 3 to build the work, part 4 to keep it
coherent, and part 5 to judge it. Then keep the project sheet at the end for each new
product.

---

## 1. How to get good at this (the method, not just the rules)

Premium is not more effects. It is restraint plus coherence plus finish. Three people
with the same component library ship wildly different quality because of taste and
discipline, not tools. Taste is learnable. Here is the method.

### 1.1 Build the eye (study on purpose, do not just scroll)

- Pick a small set of reference products and study them deliberately: Apple product
  pages, Stripe, Linear, Vercel, Family, Wealthsimple, and the craft writing of Rauno
  Freiberg and Emil Kowalski. Watch how little moves, and how precise the little that
  moves is.
- Do teardowns. Screen-record a page, step through it frame by frame, and write down:
  what entered, from where, how long it took, what easing, and what stayed still. You
  will find the same small numbers again and again (200 to 500ms, decelerate on enter,
  one thing moving at a time). That repetition is the craft.
- Steal the system, not the pixels. Do not copy a screen; extract its structure, the
  size of its palette, its type pairing, its spacing rhythm, its motion durations, and
  rebuild your own thing with an equally tight system.

### 1.2 Work system-first

- Define the system before you design a screen: palette, type, spacing and radii scale,
  one material, and motion tokens. Every screen then reads from that one source. A
  design is only as coherent as its token sheet.
- Compose from primitives. Build a small set of reusable surfaces and controls and reuse
  them; do not hand-roll a new card each time. Consistency is mostly reuse.

### 1.3 Restraint-first

- Start by removing. One accent color, one primary action per view, one hero moment, one
  thing moving at a time. If you can name every effect on the screen, remove one until
  you cannot.
- Give it space. Crowding kills the premium feel faster than any wrong color.

### 1.4 Finish, then critique

- Do a deliberate finishing pass last (part 3.6): grade, grain, light, depth. It is what
  separates expensive from clean-but-ordinary.
- Critique against a checklist (part 5), not against your mood. The best designers run
  the same failure-mode list every time. Taste plus a checklist beats taste alone.

### 1.5 The mindset

- The aesthetic is not in the tool's taste; it is in your system and your discipline.
- Ship the calm, coherent version over the busy, clever one. Confidence reads as
  restraint.

---

## 2. The design system (build this first)

A premium look is a small, strict system applied consistently. Nail these and it holds;
break them and it drifts into a generic dashboard.

### 2.1 The rules that hold any system together

1. **One accent.** Choose a single saturated color for everything interactive (links,
   the primary button, active and focus states). Nothing else uses it.
2. **Reserved punctuation.** Keep one or two colors as rare accents (a success stamp, a
   brand object), used once per screen, never as a generic status color.
3. **One field, committed.** Pick a base (a warm paper, a deep ink, a specific neutral)
   and commit. Never a flat accidental white, never an accidental dark. Pure white is
   only an opaque fallback under a material.
4. **A fixed type pairing.** One UI face, one precise face for numbers and code, with a
   weight ceiling (usually 600). No faux-bold, no random weights.
5. **Sentence case.** Titles and buttons are sentence case; uppercase only for tiny
   eyebrow labels and pills.
6. **One material.** Surfaces share one recipe (a glass, a card, a paper), so every panel
   reads as the same substance.
7. **Restraint.** A glance should show mostly neutral field, the material, and ink, with
   the accent as the only saturated color.

### 2.2 Tokenize everything

Lock a single token sheet and read every value from it. The categories:

- **Palette:** field or background, ink (primary text), muted ink, faint ink, one accent
  (plus a soft and a deep variant), one or two reserved accents, a destructive.
- **Type:** the two families, the size steps, the weight ceiling, eyebrow tracking, and
  tabular numbers for anything machine-precise.
- **Space and shape:** a radii scale (for example 8 / 11 / 14 / 18 from a 14 base), a
  spacing rhythm (a 4 or 8 base), consistent card padding, generous gaps.
- **Depth:** one shadow logic (one light direction, layered falloff, tinted rather than
  pure black) and one material recipe.
- **Motion:** the duration and easing tokens (part 3.2).

> **EXAMPLE (one worked material, not a requirement): a light "glass over warm paper"
> look.** The field is a warm cream radial; surfaces are translucent white glass built
> from five ingredients moving together (a white gradient about 0.82 to 0.56 alpha; a
> `backdrop-filter: blur(30px) saturate(1.85)`, where the saturate is what keeps it alive
> rather than dead grey; a 1px near-white top edge; a faint inner ring; a soft
> ink-tinted drop shadow). One blue accent; green reserved for a single verified stamp;
> oxblood reserved for one brand seal; a sans plus a mono face; weight 600 maximum. The
> glass only reads as glass over a busy backdrop (slow drifting blurred orbs plus a
> vignette), and is never stacked on itself. Swap the material and palette and the same
> discipline yields a completely different premium look.

### 2.3 Depth and material

- One light source for the whole product; every shadow agrees in direction, and softness
  tracks elevation (higher is softer and larger). Mixed light directions read unstable.
- One material recipe, reused. If it is translucent, it needs a busy backdrop to refract;
  a material over a flat field looks like plastic.
- Do not nest the same material on itself; it goes muddy.

### 2.4 Layout

- A content max width, generous side padding, a grid, and one primary action per view
  (usually right-aligned or full-width at the bottom).
- Numbers right-aligned and monospaced; status in a consistent corner; a brand ornament
  used once, not sprinkled.

---

## 3. The animation system

Motion is where premium is most often won or lost. It is a system too.

### 3.1 The three laws (every animation obeys these)

1. **Animate transform and opacity only** (add `filter` and `clip-path` sparingly). These
   run on the GPU. Animating width, height, top, left, or margin is the most common
   amateur tell; it janks.
2. **Never ship a default easing.** `ease`, `ease-in-out`, and `linear` as-is read as
   unconsidered. Use custom curves or springs: decelerate on enter, accelerate on exit,
   in-out for on-screen moves, and linear only for continuous spin or a marquee.
3. **Keep motion interruptible.** A premium motion can reverse or redirect mid-flight and
   keep its velocity (springs do this natively). Keyframes that restart from zero feel
   mechanical.

Plus: the UI duration ceiling is about 300ms (400ms only for large travel; 500ms starts
to feel slow); exits run about 20% faster than enters; and reduced-motion is wired on
every animation.

### 3.2 The token sheet (durations and easings)

Pick one duration ladder and one easing family and use them everywhere; never a one-off
number.

Durations (a usable ladder): about 70 for micro states, 110 to 150 for small moves, 200
to 250 for standard transitions, 300 to 400 for large or hero moves, and beyond that only
a deliberate hero or a slow atmospheric layer.

Easings (one family; example curves):

- decelerate / enter: `cubic-bezier(0, 0, 0.2, 1)` or a quart-out
  `cubic-bezier(0.165, 0.84, 0.44, 1)`
- accelerate / exit: `cubic-bezier(0.4, 0, 1, 1)`
- standard / on-screen: `cubic-bezier(0.4, 0, 0.2, 1)`
- expressive reveal: `cubic-bezier(0.16, 1, 0.3, 1)` or emphasized
  `cubic-bezier(0.05, 0.7, 0.1, 1)`
- spring default: about duration 0.5s, bounce 0.1 to 0.3 (bounce 0 for anything that
  moves constantly)

One stagger constant for every sequenced group (about 40 to 80ms). One overshoot budget
(a few percent, one bounce), used only where a signature bounce belongs.

### 3.3 The families (the vocabulary)

Know the full menu, then spend most of the budget on one moment.

1. **Entrance / reveal:** mask or clip reveal, blur-to-sharp, fade-rise (8 to 24px),
   stagger cascade, scale-in from 0.92 to 0.97 (never from 0), draw-on.
2. **Transition:** shared-element or FLIP, container transform, shared-axis, fade-through
   (incoming scale 0.92 to 1), crossfade, morph or matched cut.
3. **Scroll-driven:** scrub (with a small catch-up lag), pin or sticky, parallax (10 to
   30%), reveal-on-scroll, scroll-linked video.
4. **Text / kinetic:** per-line mask rise (the tasteful default), per-word or per-char
   split, variable-font weight, RSVP, scramble, gradient-clip shimmer.
5. **Micro-interaction:** hover lift (2 to 4px), spring press (scale 0.97), magnetic
   button, custom cursor, origin-aware tooltip. Do not animate high-frequency actions
   (the button clicked a hundred times a day should be instant).
6. **3D / depth:** layered parallax, tilt (6 to 12 degrees), WebGL, depth-of-field,
   camera dolly.
7. **Particle / ambient:** mesh or aurora gradient, noise field, dust motes, generative
   fields (near-subliminal, long cycles).
8. **Data / number:** count-up (ease-out, 0.8 to 2s), odometer digit-roll, chart draw-on.
9. **Physics:** spring, inertia, drag, elastic, magnetic.
10. **Finishing / post:** grain, chromatic aberration, bloom, vignette, color grade,
    light sweep.

### 3.4 Choreography (how they combine)

- One primary motion at any instant; everything else is subordinate (slower, dimmer, or
  delayed). Two things fighting for the eye reads cheap.
- Stagger groups by importance with the one stagger constant; nothing simultaneous.
- Build cause and effect, then rest. Deliberate stillness is what makes the next move
  land. Wall-to-wall motion is noise.

### 3.5 Numbers and data (a common tell)

- Tabular figures always, so digits do not jitter; right-align and reserve the width.
- Ease the value, not just the opacity: count up and decelerate into the final number.
- Use an odometer digit-roll (with a touch of motion blur) for a value changing to
  another value; a count-up for approaching a total from zero.
- To make one value beat another (a rival, a record), choreograph it: the incumbent
  flinches and dims, the challenger muscles in on a decelerate curve and briefly
  overlaps it, one accent flashes, and a thin connector or delta chip annotates the gap.

### 3.6 The finishing pass (apply last)

The optical top layer. Dialed low it reads expensive; slightly too much reads cheap. The
rule: if a viewer can name the effect, it is too strong.

- Grade once: one warm or brand tint over everything, about 4 to 8%, `soft-light`.
- Vignette: a barely perceptible edge darken to hold the center.
- Grain: animated noise 3 to 7%, hopped in steps so it reads as film, not a dirty screen.
- Depth of field: blur non-focal layers 4 to 12px; keep the focal layer sharp.
- Chromatic aberration: 0.5 to 2px at the edges only; never 3px or more (that reads
  broken, not filmic).
- Ambient life: the hero breathes (scale 1.02 to 1.04, 3 to 5s); a few dust motes drift.
- One specular sweep and one accent hit per scene, at or under 1s, never two at once.
- Lock 60fps, wire reduced-motion, then remove the busiest effect.

### 3.7 Attention (for any animated or promo piece)

If the motion tells a story (an intro, a promo, an onboarding), steer the eye:

- Introduce a new focal change every 0.7 to 1.0s (faster in the first 3 seconds), but
  only one dominant change at a time; never leave more than about 1.5s of dead air.
- Rank the levers: a motion onset and a scale-up toward the viewer pull hardest, then a
  luminance flash, then a single color or size singleton.
- Meaning-bearing text needs at least about 300ms per word to be read, and belongs on a
  near-empty frame.
- Shape the whole thing by peak and end: a hard hook in the first 3 seconds, a single
  built-to climax at about 75 to 85% through, and a clean, still final beat held about
  1.2s. Memory keeps the peak and the end, not the length.

---

## 4. Coherence (the guardrail)

Premium is consistency. Every placement, direction, timing, and effect must agree. Run
these as MUST rules.

- **Tokens are law:** every duration and curve resolves to the token sheet; no ad-hoc
  value.
- **One spatial model:** one z-order; elements enter from and exit to motivated
  locations; offstage memory holds (what exits an edge returns from that edge); nothing
  teleports.
- **One direction per meaning:** forward and back, add and remove, deeper and shallower
  each map to one axis and never swap; every exit is the inverse of its entrance.
- **Timing asymmetry:** enters run a step longer than exits; duration scales with size
  the same way every time.
- **One physics:** one weight and one overshoot budget across the whole piece; no bouncy
  element next to a stiff one for equivalent actions.
- **One lead:** exactly one primary motion at a time; one stagger constant; deliberate
  rests.
- **One light:** one direction; all shadows agree and track elevation; no flat-versus-3D
  flip-flop.
- **One personality:** one easing feel, one texture, one glow, one grade; effects
  reinforce the motion, never contradict it.
- **On the grid:** everything aligns optically and rests on the grid; sizes and weights
  come from the scale.

---

## 5. The critique checklist (how to judge it)

### 5.1 The amateur tells (if you see one, fix it)

Animating layout properties; a default or linear easing on a move; everything appearing
at once; scale-from-0 or a 60px-plus fly-in; two things competing for the eye;
inconsistent or zero stagger; a second accent color, or a reserved color used
generically; title case or a weight over the ceiling; a flat white or an accidental dark;
a material with no backdrop, or blur without saturate; text on a heavy blur; nested
material; heavy grain, visible aberration, or a vignette you can see; wall-to-wall motion
with no rest; motion with no communicative job.

### 5.2 The pass/fail contract (every line TRUE before you ship)

1. One accent; reserved colors used once per screen only.
2. One material; it has a backdrop to refract; never nested.
3. Type pairing fixed; weight at or under the ceiling; numbers tabular.
4. Every duration and curve is a token; enter decelerates, exit accelerates, one family.
5. Enter and exit are asymmetric and reversible; nothing teleports; offstage memory holds.
6. Exactly one primary motion at a time; one stagger constant; deliberate rests exist.
7. One light direction; shadows agree and track elevation; one personality, texture, and
   grade.
8. Everything aligns to the grid and rests on it; the layout is generous, not crowded.
9. Finishing dialed low (grain 3 to 7%, aberration under 2px, a subtle vignette).
10. Reduced-motion wired; 60fps held; every motion answers "what does this communicate?"

If a line is false, fix it before shipping. Taste plus this list is the whole craft.

---

## 6. Study list (go watch and read these)

- **Products:** Apple product pages, Stripe, Linear, Vercel, Family, Wealthsimple.
- **Writing:** Emil Kowalski (animations.dev, practical animation tips); Rauno Freiberg
  (invisible details of interaction design); Material Design motion (transitions, easing
  and duration tokens); Apple HIG motion; IBM Carbon motion; Disney's twelve principles.
- **Method:** study attention (change blindness, the peak-end rule), and do frame-by-frame
  teardowns of the products above until the numbers become second nature.

---

## 7. The per-project sheet (fill this in for each product)

The playbook is the general method. To apply it, write a short sheet that fills in the
tokens and the one hero moment, then obey parts 4 and 5. The discipline transfers; only
the values change.

- Field and palette: base, ink, muted, faint, one accent (soft and deep), reserved
  accents, destructive.
- Material: the recipe (opaque card, glass, paper) and its backdrop.
- Type: UI face, precise face, size steps, weight ceiling.
- Space and shape: radii scale, spacing base, card padding, content width.
- Motion tokens: the duration ladder, the easing family, the stagger constant, the
  overshoot budget.
- The one hero moment: the single reveal or interaction that gets most of the budget.
- The one-line house style: how it should feel in a sentence.

Keep that sheet next to the code as the single source of truth, exactly as a strong
product design system does.

---

## Appendix A: the glass material recipe (copy-paste, parameterized)

A concrete, reusable glass. It reads as glass only when the five ingredients move
together over a busy backdrop; tune them apart and you get flat grey plastic. Swap the
two variables (the field and the shadow tint) for any brand.

```css
:root {
  /* choose per brand */
  --field: #f3f1ec;          /* the warm or neutral base the glass floats over */
  --ink-shadow: 40, 38, 52;  /* the shadow tint, rgb, never pure black */

  /* the glass recipe (works on any light field) */
  --glass-fill: linear-gradient(158deg, rgba(255,255,255,.82), rgba(255,255,255,.56));
  --glass-edge: rgba(255,255,255,.68);
  --glass-blur: blur(30px) saturate(1.85);
  --glass-shadow:
    inset 0 1px 0 rgba(255,255,255,.95),        /* bright top edge */
    inset 0 0 0 1px rgba(255,255,255,.22),      /* faint inner ring */
    0 1px 2px rgba(var(--ink-shadow), .05),     /* tight contact shadow */
    0 16px 38px rgba(var(--ink-shadow), .12);   /* soft wide drop */
}

.glass {
  background: var(--glass-fill);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-edge);
  box-shadow: var(--glass-shadow);
  border-radius: 14px;
}
```

The five ingredients, in the order of what breaks the illusion first if you drop it:

1. Translucent fill (a 158deg white gradient about 0.82 to 0.56 alpha), not a flat white.
2. Blur AND saturate. The saturate (about 1.85) is what makes it look alive rather than
   dead grey. Never blur without it.
3. One bright top edge (a near-white 1px border plus the inset top highlight).
4. A faint inner ring (the second inset).
5. A soft, layered, ink-tinted drop shadow (a tight contact plus a wide soft one), never
   pure black.

Two non-negotiables around it: a busy backdrop behind the glass (a gradient field plus
slow blurred shapes) so there is something to refract, and never stack glass on glass (it
goes muddy). Keep the fill alpha in the 0.55 to 0.82 band: higher and it turns opaque,
lower and text fails. For a dark theme, invert it (a dark translucent fill, a bright
hairline, the backdrop supplies the glow); the five-ingredient rule is unchanged.

## Appendix B: building a restrained palette (the method)

You need only seven roles. Fill them and stop.

1. **Field:** the base everything sits on (a warm paper, a cool grey, a deep ink). Commit.
2. **Ink:** primary text.
3. **Muted ink:** secondary text.
4. **Faint ink:** eyebrow labels, empty states, disabled.
5. **One accent:** the single interactive color, plus a soft variant (about 9% over
   white) and a deep variant (mixed with black).
6. **One or two reserved accents:** a success or a brand color, each used once per screen.
7. **Destructive:** errors and dangerous actions.

Rules: the accent is the only saturated color at rest; reserved accents are punctuation,
never a generic status color; the field is never a flat accidental white; and if you
reach for an eighth color, stop.

A worked neutral example (swap the accent and field to reskin the whole product): field
`#f5f5f4`, ink `#1c1c1e`, muted `#6b6b70`, faint `#a6a6ab`, accent `#2b5fd9` (soft
`#eef2fd`, deep `#14315f`), reserved `#1f8a5b`, destructive `#b8472f`. Nine values, and
the product is skinned.
