# CALLED IT: Claude Design prompt pack

The generate-and-integrate loop (SKILL_CLAUDE_DESIGN): paste the SYSTEM PROMPT
plus ONE screen prompt per generation, with the attachments. Generate the hero
screen (screen 1) first and lock it; every later screen attaches the accepted
hero export. Return the exported code per accepted screen and note which
variant won; the session re-tokenizes, wires real data, and gates it.

Token source of truth: `docs/UI_DESIGN_SYSTEM.md`. Real wire shapes:
`packages/contracts/src/index.ts`.

---

## SYSTEM PROMPT (paste with every screen prompt)

You are designing screens for CALLED IT, a free live prediction game for the
2026 World Cup: fans lock short-window calls during a live match, every call
is priced by the betting market's de-margined probability at lock time, wins
print as paper receipts provable on Solana. Register: energy and play, with
precision-tool discipline for every number. Mobile-first (design at 390 px,
scale up to 640 px single column). Dark theme only.

TOKENS (the only values allowed):

- Field (page background): #0A0F0B, with a fixed radial "stadium glow" at the
  top: radial-gradient(120% 60% at 50% 0%, rgba(182,255,59,0.05) 0%,
  rgba(182,255,59,0.015) 38%, transparent 70%). Never flat black, never white.
- Surface (cards): #111813. Border/hairlines: #1E2A21.
- Text: ink #F2F7F3, muted #8FA396, faint #5C6B60 (faint is for disabled and
  decorative labels only, never body text).
- Accent #B6FF3B (lime): the ONLY interactive color. CTAs, live indicators,
  focus rings, hit results, rising probability. Pressed variant #7DB428.
- Reserved: streak amber #FFC24B, used at most ONCE per screen (streak badge
  only). Miss/destructive red #FF5D5D, only for misses and errors.
- Receipt material (receipts only): paper #F6F3EA, ink #151515.
- Type: Inter for UI (weight ceiling 600, sentence case everywhere; uppercase
  only for tiny eyebrow labels with letter-spacing 0.08em). JetBrains Mono for
  EVERY number, score, clock, probability, and points value, always with
  tabular figures.
- Type steps: 12 eyebrow, 14 body small, 16 body, 20 title, 28 score,
  40 hero score.
- Radii: 10 (chips, buttons), 14 (cards), 18 (sheets). Spacing base 4; card
  padding 16; screen gutter 16.
- Card material, exactly: background #111813; border 1px solid #1E2A21;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.40),
  0 12px 32px rgba(0,0,0,0.50); border-radius 14px. One light source, above.

SIGNATURE ELEMENTS (placement is a rule, not a suggestion):

1. The probability pulse: the 1X2 market as ONE horizontal stacked bar
   (segments: home share in #B6FF3B, draw share in #1E2A21, away share in
   #8FA396), mono percentage labels underneath. Exactly once, at the top of
   the match screen; a thin 2 px echo without labels on live lobby cards.
2. The receipt: thermal-ticket surface (paper #F6F3EA, mono type, perforated
   top and bottom edges showing the dark field through punched semicircles,
   a slight 0.6 degree tilt). Settlement moments and the receipt page only,
   never as a generic card.

HARD RULES (violating any one fails the screen):

- One accent. Never introduce a second saturated color, gradient sets, or
  blue/purple of any kind.
- Never flat white backgrounds, never pure black, never glassmorphism, never
  neon glows, never rainbow gradients.
- Never a single flat drop shadow; use the exact layered stack above.
- Never title case, never font weights above 600, never proportional digits
  on numbers.
- Never betting language in copy: no "bet", "stake", "odds", "wager",
  "payout". The vocabulary is: call, lock, streak, receipt, points, market.
- Never invent features: no wallet-connect buttons, no sign-in, no settings,
  no notifications bell, no theme toggle, no extra nav items, no decimal or
  American odds formats.
- Every state in the prompt is designed, not defaulted: loading is a skeleton
  mirroring the final layout (no spinners), empty states carry one sentence
  and at most one action, errors are visually distinct from empty and carry a
  retry path.
- Realistic data only, exactly as given in the screen prompt. No lorem ipsum,
  no John Doe, no $ amounts.

ACCESSIBILITY FLOOR: body text contrast 4.5:1 minimum on its background
(the palette above passes; do not lighten the field or darken the ink), focus
visible as a 2 px #B6FF3B outline offset 2 px on every interactive element,
touch targets 44 px minimum, one h1 per screen.

OUTPUT: React function components in TypeScript (TSX), Next.js App Router
conventions, styled with Tailwind CSS v4 utility classes using THESE exact
custom utilities which already exist in the project: bg-field, bg-surface,
border-line, text-ink, text-ink-muted, text-ink-faint, text-accent,
bg-accent, text-miss, border-miss, text-streak, bg-paper, text-paper-ink,
rounded-chip, rounded-card, rounded-sheet, font-mono, and the class
"tabular" for tabular numbers. No other UI libraries: no shadcn, no MUI, no
framer-motion, no icon packages (use inline SVG only if an icon is truly
needed). One component per logical block. Static markup with sample data
inline is fine; the session wires real data afterward.

---

## SCREEN 1 (HERO, generate first): live match

Purpose: the second screen a fan keeps open during a match; the one screen
this product exists for. It must feel like a stadium scoreboard that reacts
before the TV commentator speaks.

Layout, top to bottom, single column, max width 640:
1. Back link "All matches" (left).
2. Score header, centered: live badge with mono clock "61'", then one row:
   "Paraguay" (right-aligned), mono score "1 : 2" at 40 px, "France"
   (left-aligned).
3. The probability pulse (signature 1, full size): segments 12.4 / 23.4 /
   64.2, labels "Paraguay 12.4%", "draw 23.4%", "France 64.2%".
4. Section "Open calls" (eyebrow) with, on the right, a latency chip:
   lime dot + mono "feed to screen 153ms".
   Four call cards (the deck), each a Surface card with: claim (semibold 14),
   "market says 66.7%" line in muted with mono percent, and on the right the
   mono lime "+150" over a lime "Lock it" button. The four cards:
   - "Corner in the next 10 minutes", 66.7%, +150
   - "A card in the next 15 minutes", 48.3%, +207
   - "Goal in the next 15 minutes", 36.2%, +276
   - "Underdog still alive at 80'", 12.4%, +806
   Card states to design (show them as variants):
   a. available (Lock it button),
   b. locking (button in loading state),
   c. locked pending: no button; footer line "locked 61' at 66.7%" plus
      "The Bookie countered: Corner in the next 10 minutes", and a muted
      "settling live" tag,
   d. hit: mono lime "+150" result and the footer line,
   e. miss: mono red "missed",
   f. one card showing an inline error line in red:
      "One live call per category. Wait for your current one to settle."
5. Line "playing as Fan 4832" in faint, linking to the profile.
6. Section "Your results" (eyebrow) with amber "Streak x3" badge on the right
   (the single amber element). Two rows: "Goal in the next 15 minutes" with
   lime "Called it" pill and mono "+276"; "A card in the next 15 minutes"
   with mono red "miss". Row claims link to receipts.
7. Section "Timeline" (eyebrow): rows "61' Corner, away side", "58' Goal,
   home side" (goal rows semibold lime), "44' Yellow card, away side".

Also design these whole-screen states:
- Loading: skeleton mirroring this exact layout.
- Connection lost: thin red-bordered banner at top, "Connection lost.
  Reconnecting; the state below may lag the pitch."
- Full time: calls section replaced by an empty state "Full time. This match
  has settled. Replays land with the Time Machine."

Responsive: single column at 390 px; nothing hides; the score row tightens.
Do not invent: no team crests or flags, no player photos, no possession
percentage widget, no chat.

---

## SCREEN 2: lobby

Purpose: pick the match to play, in one glance, phone in hand.

Layout: header with mono "CALLED IT" (h1, 24), tagline "Call the match
before it happens. The market sets the price." in muted, and two quiet nav
links right: "Leaderboard", "Profile". Then sections by eyebrow: "Live now",
"Upcoming", "Finished". Cards in a 1-column grid at 390 px, 2 columns at
640+.

Fixture card (Surface): eyebrow competition "World Cup" (faint) with a
status badge right: live matches get the lime pulse badge "Live 61'",
upcoming get neutral "Sat 17:00", finished get "Full time". Body: two team
names stacked semibold, truncating ("Canada", "Morocco"), and when the match
is live or finished, the mono score column right-aligned ("1" over "2").
Live cards close with the 2 px probability pulse echo (no labels).

Real data to render:
- Live now: "Paraguay vs France, 1:2, Live 61'" (pulse echo 12.4/23.4/64.2).
- Upcoming: "Canada vs Morocco, Sat 17:00"; "Brazil vs Norway, Sun 20:00";
  "Mexico vs England, Mon 00:00".
- Finished: "USA vs Bosnia and Herzegovina, 2:0, Full time".

States: error state (worker down): "The feed is unreachable. The live worker
did not answer. It usually recovers on its own; try reloading in a few
seconds."; empty state: "No matches in the window."

Do not invent: no search bar, no filters, no date picker, no favorites.

---

## SCREEN 3: public receipt (/r/{id})

Purpose: the shareable proof object. Someone lands here from a group chat
link; the receipt must read as a physical thermal ticket floating on the
dark field, and the proof must feel checkable.

Layout: centered column, generous vertical padding. The receipt ticket
(signature 2): max width 384, paper #F6F3EA, ink #151515, all JetBrains
Mono, perforated top and bottom edges (punched semicircles showing the dark
field), tilted 0.6 degrees, deep soft shadow. Ticket content, separated by
dashed rules:
1. Header row: "CALLED IT" tracked wide, "RECEIPT" small right, 60% opacity.
2. Claim block: "Corner in the next 10 minutes" semibold; "Paraguay vs
   France (World Cup)" 60% opacity; "locked 85' at 66.7% by smoke-e2e".
3. Result row: "RESULT" eyebrow left, "HIT +150 pts" semibold right.
4. Proof block: "PROOF" eyebrow, then mono lines:
   "leaf 25d2ea1c...2cb008b3 (#0 of 2)",
   "root d24e38f9...e6821875",
   "solana memo tx 5PpiUYU6...DpqsQM" (underlined link),
   "proof check: root recomputed, VALID" (semibold).
5. Footer centered, tracked wide, 60% opacity: "ANCHORED ON SOLANA".

Below the ticket, on the dark field: a small faint explainer, max width 448:
"This call was hashed and batched into a Merkle root posted on Solana before
its event resolved. The leaf, the proof path, and the on-chain memo let
anyone verify the call existed, at this exact market price, ahead of time."
Then a quiet link "Play the live matches".

Ticket states to design: result row variants "settling live" (no settlement
yet) and "MISS" (60% opacity); proof block variant "Not yet committed
on-chain. Batches post about every minute; reload shortly."

Do not invent: no social share buttons row, no QR code (later milestone), no
confetti.

---

## SCREEN 4: profile

Purpose: the skill dashboard answering one question: do you beat the market
itself, not just other players?

Layout: back link, then header: handle "Fan 4832" (mono 24), total
"1,250 pts" (mono 40 with "pts" small muted), line "streak 3 (best 5) over
12 settled calls" in muted.

Section "You vs The Bookie" (eyebrow): Surface card with three divided rows:
"Your points / 1,250" with hint "on settled calls, streaks included";
"The Bookie's points / 1,035" with hint "the market favorite of your every
call, played flat"; "Margin / +215" where the margin number is mono 20 in
lime (red variant when negative). Below the card, faint caption: "Positive
margin means you beat the market itself, not just other players."

Section "Skill vs the market": Surface card, two rows: "Edge vs market /
+8.3 pts" hint "your hit rate minus what the market predicted for your
picks"; "Market surprise (Brier) / 0.284" hint "higher means you hunt calls
the market prices poorly".

Section "Calibration": Surface table, columns "Market band / Calls / Market
said / You hit", rows: "0-20% / 3 / 14.2% / 33.3%" (You hit in semibold lime,
beats the market), "20-40% / 4 / 31.0% / 25.0%", "40-60% / 3 / 48.9% /
66.7%" (lime), "60-80% / 2 / 66.9% / 50.0%". Faint caption: "Hitting above
what the market said, in any band, is edge the market missed."

States: loading skeleton; no-identity empty state "No profile yet. Lock your
first call during a live match and your skill profile starts building
here."; error state with ghost "Retry" button.

Do not invent: no avatar upload, no edit form, no charts library (the
calibration is a table).

---

## SCREEN 5: leaderboard

Purpose: the tournament-long race, dense and scannable.

Layout: back link, header "Leaderboard" (mono 24) with tagline "Points only
come from beating the market. Streaks multiply the brave." Surface table:
columns "# / Player / Points / Streak", ranks mono (top 3 semibold lime),
points mono semibold right-aligned, streaks mono muted ("x3" or "0").
Rows (real magnitudes): "1 / Fan 4832 / 1,250 / x3", "2 / smoke-e2e / 150 /
0", then 6 more plausible guest handles between 950 and 40 points, long
handle truncation demonstrated once ("Fan 90210 the Corner Whisperer").

States: empty "Nobody on the board yet. Lock a call during a live match and
your handle shows up here."; unreachable error (same copy as lobby).

Do not invent: no time filters, no pagination controls, no medals or emoji.

---

## ATTACHMENTS (send with every prompt)

1. Palette card screenshot: open `docs/design/palette-card.html` in a browser
   at 1280 px wide, screenshot at 2x. Pins the palette, the card material,
   the receipt material, and the type pairing.
2. `docs/assets/icon.svg`: the mark (lime check in a dark rounded square).
   Pins the brand shape; do not redraw it.
3. After screen 1 is accepted: the exported hero screen (image + code). Pins
   the whole style for screens 2 to 5; ask the tool to match it exactly.

## ITERATION GUIDE (for the human running Claude Design)

1. Run Claude Design on high. Paste SYSTEM PROMPT + SCREEN 1 + attachments.
2. Generate 3 to 5 variants; pick one; iterate with ONE change per
   regeneration ("same screen, tighter density", "same screen, calmer
   timeline"), never three changes at once.
3. Lock screen 1. Export its code AND a full-size image.
4. For screens 2 to 5: paste SYSTEM PROMPT + that screen's prompt, attach the
   palette card AND the accepted screen 1 export, ask to match the
   established style.
5. Return per accepted screen: the exported code (TSX preferred, HTML/CSS
   acceptable) and one line on which variant won and why. The session then
   re-tokenizes, wires real data and states, and runs the gate. Generated
   output is a draft, never merged as-is.
