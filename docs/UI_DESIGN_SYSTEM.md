# CALLED IT design system: "Matchday programme"

The per-project sheet (design-motion playbook part 7). Single source of truth:
every rendered value in `apps/web` traces to a token defined here and wired in
`apps/web/app/globals.css`. No literal colors, radii, or durations in
components.

This sheet replaced the dark "Stade de nuit" system on 2026-07-09 (user
decision: light system modeled on a printed matchday programme; the thermal
receipt is unchanged and remains the brand object).

House style in one line: a matchday programme printed on warm cream, with calm
bookmaker precision, one pitch-green accent, and every win printed as a
thermal receipt.

## Register and density

- Register: consumer warmth carried by precision-tool discipline on every
  number (the fan reads it like a programme, the numbers behave like a desk).
- Density: consumer mobile-first (design at 390 px first), focused screens,
  one primary action per view. Lobby and leaderboard may breathe wider.
- Theme scope: light only, committed. There is no dark mode; the cream field
  IS the identity.
- Hero moment: locking a call on the live match screen and the receipt
  printing on a hit. Every other screen stays quieter so those two land.

## Palette (appendix B roles)

| Role | Token | Hex | Notes |
| --- | --- | --- | --- |
| Field | `--cream` | `#FAF7EF` | the page; never flat white |
| Inset container | `--soft` | `#F0EBDD` | the "print tray" material (below) |
| Card | `--card` | `#FFFFFF` | white only inside a tray or with a hairline |
| Ink | `--ink` | `#12170F` | primary text, 16.5:1 on cream |
| Muted ink | `--ink-muted` | `#67705F` | secondary text, 5.0:1 on cream |
| Faint ink | `--ink-faint` | `#9AA18F` | disabled and decorative only, never body |
| Accent | `--accent` | `#2C8C3C` | pitch green, the only interactive color |
| Accent deep | `--accent-deep` | `#1F6B2C` | CTA ring, pressed, small accent text |
| Accent soft | `--accent-soft` | `#EAF4EB` | selected fills, my-row highlight |
| Reserved: streak | `--streak` | `#B87514` | once per screen, the streak only |
| Destructive / miss | `--miss` | `#D24141` | misses and errors only |
| Hairline | `--hairline` | `rgba(18,23,15,0.1)` | borders; dashed for internal rules |
| Pulse mid | `--pulse-mid` | `#DED8C6` | non-favored bar segments (pulse, calibration) |
| Pulse low | `--pulse-low` | `#B9B29E` | the quieter bar segment; market bars |
| Skeleton deep | `--skeleton-deep` | `#E4DECD` | skeleton blocks sitting on the soft tray |
| Accent line | `--accent-line` | `rgba(44,140,60,0.4)` | the "you" chip border |
| Streak soft | `--streak-soft` | `rgba(184,117,20,0.12)` | replay ribbon and badge fill |
| Streak line | `--streak-line` | `rgba(184,117,20,0.5)` | replay ribbon and badge dashed border |

Receipt material (reserved, receipts only): paper `#F6F3EA`, ink `#151515`,
JetBrains Mono, dashed rules, perforated edges, 0.6deg rotation, floating
shadow. It is the one object that casts a real shadow on the page.

Rules: pitch green is the only saturated color at rest (CTAs, live indicators,
focus, the winning side of the pulse). Small accent-colored text uses
`--accent-deep` for contrast; `--accent` text is reserved for large mono
numbers (18 px and up). Streak amber appears exactly once per screen. Miss red
is never decoration. White never appears as a naked page background.

## Type

- UI face: Inter (`--font-ui`). Weight ceiling 600; display and titles sit at
  500 with tight tracking (-0.03em), body at 400.
- Precise face: JetBrains Mono (`--font-mono`) for every number, clock, score,
  probability, points, hash, and address, always
  `font-variant-numeric: tabular-nums`.
- Steps: 11/12 (eyebrow, 600, uppercase, tracking 0.14em, muted, flanked by
  small chevron glyphs), 14 (body small), 16 (body), 22 (card title, -0.03em),
  28 (score), 36 (section display), 52 (hero display, desktop only).
- Sentence case everywhere; uppercase only for eyebrows, badges, and receipt
  headings.

## Space and shape

- Spacing base 4; card padding 16 to 20; tray padding 12 to 20; screen gutter
  20 (mobile) / 30 (desktop). Content max width 1060 px; product flows sit in
  a 640 px column.
- Radii scale: 0 (primary and secondary CTAs, deliberately square) / 4 (chips,
  badges, eyebrow plates) / 8 (cards) / 16 (trays). Nested radius = outer
  minus padding.

## Material and depth (one material: the print tray)

The single material: a soft inset tray holding flat white cards.

```css
.tray {
  background: var(--soft);
  border-radius: 16px;
  box-shadow: inset 0 0 6px 0 rgba(18, 23, 15, 0.16);
}
.card {
  background: var(--card);
  border: 1px solid var(--hairline);
  border-radius: 8px;
  /* cards are FLAT inside the tray: no drop shadow */
}
```

Elevation logic: in-flow content is flat (tray + card). Only floating objects
cast shadows, with one high light source and an ink-tinted layered stack:

```css
--shadow-float:
  0 2px 3px rgba(18, 23, 15, 0.05),
  0 14px 20px rgba(18, 23, 15, 0.06);
/* the receipt adds a tighter contact: 0 10px 24px rgba(18,23,15,0.14) */
```

Buttons are physical, square, and ringed (the programme's letterpress feel):

```css
.btn-primary {
  background: var(--accent); color: #fff; border-radius: 0;
  box-shadow: 0 0 0 1px var(--accent-deep),
    inset 0 1.4px 1px rgba(255, 255, 255, 0.15),
    0 1.4px 4px rgba(18, 23, 15, 0.3);
}
.btn-secondary {
  background: var(--ink); color: #fff; border-radius: 0;
  box-shadow: inset 0 1.4px 1px rgba(255, 255, 255, 0.08),
    0 0 0 1.4px #3a4136;
}
.btn-ghost { background: transparent; border: 1px solid var(--hairline); }
```

Internal separators are 1px dashed hairlines (the ticket-rule motif shared
with the receipt). No glass, no grain, no gradients as decoration.

## Motion tokens

- Durations: 70 (micro state) / 150 (small move) / 250 (standard) / 400 (hero)
  ms. Exits run one step faster than enters.
- Easings: enter `cubic-bezier(0.16, 1, 0.3, 1)`, exit
  `cubic-bezier(0.4, 0, 1, 1)`, standard `cubic-bezier(0.44, 0, 0.56, 1)`.
- Stagger constant: 40 ms. Press scale 0.97. Overshoot budget: one small
  bounce, reserved for the receipt print-in; nothing else overshoots.
- Probability bar widths move on standard/250. Changing numbers roll (odometer
  or count-up easing the value), never bare swaps.
- `prefers-reduced-motion`: everything collapses to opacity or none with an
  identical final layout.

## Signature elements (three, with placement rules)

1. **The probability pulse.** The 1X2 market as one horizontal segmented bar
   (accent = the side the market favors, soft-dark and muted for the rest)
   with mono percentages. Placement: exactly once at the top of the match
   screen; a thin 2 px echo on lobby cards of live matches.
2. **The pressure pitch.** A printed top-down pitch (accent-soft field,
   hairline markings) that reacts to the live feed with no video: an accent
   pressure halo and a printed matchday ball (ink panels, seam, rim) that
   rolls, trails, and motion-blurs along one horizontal line as momentum
   shifts, with a pre-event shimmer and a goal detonation. It is an honest
   momentum abstraction, never player tracking, and the caption says "live, no
   video". Placement: once inside the match cockpit card, full by default with
   a reduce toggle to a slim band. Amber stays reserved (corner flags use
   accent-deep).
3. **The receipt.** Thermal-ticket surface (paper, mono, dashed rules,
   perforated edges, slight rotation, floating shadow). Placement: settlement
   moments and the public share page only. Never a generic card.

## Primitives

Tray, Card, Button (primary square green / secondary square ink / ghost),
Badge (live, phase, replay, streak), Eyebrow (chevron-flanked label), Skeleton
(mirrors final layout), EmptyState (one motif + one sentence + one action).
Every primitive ships default, hover, focus-visible, active, disabled, loading
states at birth. Focus treatment: 2 px `--accent` ring offset 2 px, on cream
and on white alike.

## Accessibility floor

Contrast per the palette table (faint ink never for body; small accent text
uses accent-deep); 44 px touch targets; focus visible everywhere; labels on
inputs; aria-live on settlement updates; clocks and dates via `Intl`; numbers
tabular.
