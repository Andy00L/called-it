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
