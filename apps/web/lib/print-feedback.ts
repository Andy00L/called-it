/**
 * Physical feedback for the receipt print-in (the hero moment): a short
 * thermal-printer tick burst plus a small vibration. Browsers only allow
 * audio started from a user gesture, so the lock press ARMS the context and
 * the settlement (which arrives over SSE, not a gesture) can then play.
 * Multichannel feedback per the Apple HIG Feedback guidance; kept tiny and
 * quiet so it reads as the object printing, not a jingle.
 */

// Burst shape: a dozen ticks over ~350 ms reads as a thermal head stepping.
const TICK_COUNT = 12;
const TICK_SPACING_SECONDS = 0.03;
const TICK_DURATION_SECONDS = 0.018;
// Peak gain per tick; deliberately quiet (the sound is texture, not alert).
const TICK_PEAK_GAIN = 0.055;
// Vibration pattern in ms: two short pulses, like paper feeding.
const VIBRATION_PATTERN_MS = [14, 70, 14];

let audioContext: AudioContext | null = null;

/** Call inside a user gesture (the lock press); no-op when audio is blocked. */
export function armPrintFeedback(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') {
      void audioContext.resume();
    }
  } catch {
    audioContext = null;
  }
}

function playTickBurst(context: AudioContext): void {
  const startAt = context.currentTime + 0.01;
  for (let tickIndex = 0; tickIndex < TICK_COUNT; tickIndex += 1) {
    const tickAt = startAt + tickIndex * TICK_SPACING_SECONDS;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    // Three alternating pitches so the burst reads mechanical, not tonal.
    oscillator.frequency.value = 1250 + (tickIndex % 3) * 170;
    gain.gain.setValueAtTime(TICK_PEAK_GAIN, tickAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, tickAt + TICK_DURATION_SECONDS);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(tickAt);
    oscillator.stop(tickAt + TICK_DURATION_SECONDS);
  }
}

/** Fire the print feedback; silent unless a lock press armed the audio. */
export function playReceiptPrintFeedback(prefersReducedMotion: boolean): void {
  if (typeof window === 'undefined' || prefersReducedMotion) {
    return;
  }
  if ('vibrate' in navigator) {
    navigator.vibrate(VIBRATION_PATTERN_MS);
  }
  if (audioContext !== null && audioContext.state === 'running') {
    playTickBurst(audioContext);
  }
}
