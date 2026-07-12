import type { CallCategory } from '@calledit/contracts';

/**
 * The demo sponsorship (monetization surfaces, docs/TECH_DOC.md): one sample
 * brand rides the three ad surfaces (the cockpit pitchside board, one
 * sponsored call category, the public receipt page). These constants lived
 * inline in match-screen.tsx; the receipt page (a server component) needs
 * them too, so they moved to this shared module. Sample brand only, not a
 * real sponsorship; the point is that the slots exist and travel.
 */
export const SAMPLE_SPONSOR = 'Volt';

/** The one call category carrying the "presented by" label. */
export const SPONSORED_CATEGORY: CallCategory = 'corner';

// Display-name shape: letters, numbers, space, . & -, 2 to 16 chars. Rendered
// as text only, but the gate keeps junk and injection noise off the board.
const SPONSOR_NAME_PATTERN = /^[\p{L}\p{N} .&-]{2,16}$/u;

/**
 * The demo of "the slot is the product": every page can be reskinned with
 * ?sponsor=<brand>. Anything that fails the shape check falls back to the
 * sample brand.
 */
export function resolveSponsorName(raw: string | string[] | undefined): string {
  const candidate = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
  return SPONSOR_NAME_PATTERN.test(candidate) ? candidate : SAMPLE_SPONSOR;
}
