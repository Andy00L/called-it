# CALLED IT design system: "Stade de nuit + Receipt"

The per-project sheet (design-motion playbook part 7). Single source of truth:
every rendered value in `apps/web` traces to a token defined here and wired as
a CSS variable in `apps/web/app/globals.css`. No literal colors, radii, or
durations in components.

House style in one line: a stadium at night seen from the stands, where the
scoreboard shows what the market believes; wins print as paper receipts.

## Register and density

- Register: energy and play, with precision-tool discipline for every number.
- Density: consumer mobile-first (design at 390 px first), focused screens,
  one primary action per view.
- Theme scope: dark only. The receipt is the deliberate light-mode object.
- Hero moment: the live match screen; the probability pulse reacting to the
  pitch within a second. Every other screen stays quieter.

## Palette (7 roles, appendix B method)

| Role | Token | Hex | Contrast on field |
| --- | --- | --- | --- |
| Field | `--field` | `#0A0F0B` | base |
| Surface | `--surface` | `#111813` | elevated card fill |
| Line (borders) | `--line` | `#1E2A21` | hairlines only |
| Ink | `--ink` | `#F2F7F3` | 17.4:1 |
| Muted ink | `--ink-muted` | `#8FA396` | 6.7:1 |
| Faint ink | `--ink-faint` | `#5C6B60` | 3.3:1, disabled and decorative only, never body text |
| Accent (the only interactive color) | `--accent` | `#B6FF3B` | 12.6:1 |
| Accent deep (pressed, on-accent text) | `--accent-deep` | `#7DB428` | pressed states |
| Reserved: streak amber | `--streak` | `#FFC24B` | streak flame only, once per screen |
| Destructive / miss | `--miss` | `#FF5D5D` | misses and errors only |

Receipt material (reserved, receipts only): paper `#F6F3EA`, ink `#151515`,
mono type, perforated edge. It is the single light object in a dark product;
that inversion is the brand.

Rules: lime is the only saturated color at rest (CTAs, live indicators, focus,
rising probabilities). Amber appears exactly once per screen (the streak).
Miss red is never decoration. The field is never flat black: it carries the
stadium glow (below).

## Type

- UI face: Inter (next/font, `--font-ui`). Weight ceiling 600.
- Precise face: JetBrains Mono (`--font-mono`) for every number, clock, score,
  probability, and points value, always `font-variant-numeric: tabular-nums`.
- Steps: 12 (eyebrow, uppercase, tracking 0.08em), 14 (body small), 16 (body),
  20 (title), 28 (score), 40 (hero score). Sentence case everywhere; uppercase
  only for eyebrows and pills.

## Space and shape

- Spacing base 4; card padding 16; screen gutter 16 (mobile) / 24 (desktop).
- Radii scale: 10 (chips, buttons) / 14 (cards, base) / 18 (sheets, hero).
  Nested radius = outer minus padding.
- Content max width: 640 px single column (mobile-first product); lobby grid
  may extend to 960 px.

## Material and depth (dark logic: edges carry elevation)

One material: the opaque elevated card. Recipe, exactly:

```css
background: var(--surface);
border: 1px solid var(--line);
box-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.04),   /* top edge catch-light */
  0 2px 8px rgba(0, 0, 0, 0.40),             /* contact */
  0 12px 32px rgba(0, 0, 0, 0.50);           /* soft drop */
border-radius: 14px;
```

One light source: above. The field carries a fixed radial stadium glow at the
top (`--field-glow`), the only background life on work screens. No glass, no
grain in v1 (dense live screens; playbook 9 allows omitting).

## Motion tokens

- Durations: 70 (micro state) / 150 (small move) / 220 (standard) / 320 (hero)
  ms. Exits run one step faster than enters.
- Easings: enter `cubic-bezier(0, 0, 0.2, 1)`, exit `cubic-bezier(0.4, 0, 1, 1)`,
  standard `cubic-bezier(0.4, 0, 0.2, 1)`.
- Stagger constant: 50 ms. Press scale 0.97. Overshoot budget: none in v1.
- Probability bar width moves on standard/220. Numbers change via rolling
  digits (later milestone), never bare swaps.
- `prefers-reduced-motion`: all transitions collapse to opacity or none.

## Signature elements (two, with placement rules)

1. **The probability pulse.** The 1X2 market rendered as one horizontal
   stacked bar (lime = market moving up for the side it favors), with mono
   percentages. Placement: exactly once, at the top of the match screen; a
   thin echo (2 px) on lobby cards for live matches. It is the product's
   heartbeat and the only animated background element on the match screen.
2. **The receipt.** Thermal-ticket surface (paper, mono, perforated edge,
   slight rotation) for settled wins. Placement: settlement moments and the
   public share page only. Never used as a generic card.

## Primitives

Surface, Button (primary lime / ghost / destructive), Badge (live, phase,
streak), Skeleton (mirrors final layout), EmptyState (one sentence + one
action). Every primitive ships default, hover, focus-visible, active,
disabled, loading states at birth. Focus treatment: 2 px lime ring offset 2 px
on every interactive element.

## Accessibility floor

Contrast per the table above (faint ink never for body text); 44 px touch
targets; focus visible; labels on inputs; aria-live on settlement updates;
clocks and dates via `Intl` (locale-aware), numbers tabular.
