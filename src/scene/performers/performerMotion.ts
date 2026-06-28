// ─── Shared performer motion primitives ─────────────────────────────────────
//
// Miku and the Chorus ensemble move with the same vocabulary: a per-syllable
// **bob** (one self-contained pulse per character) and a tempo-locked **sway**.
// The maths for both lives here so the two components stay in lock-step by
// construction — previously Chorus imported the bob helpers from Miku and
// re-declared the sway formula with a "same feel as Miku" comment, which is
// exactly the kind of hand-synced duplication that drifts. Per-performer
// *amplitudes* stay in each component (they legitimately differ); the *shapes*
// and the tempo lock are shared.

import { smoothstep } from "../common/ease";

// --- Bob pulse shape ---------------------------------------------------------
/** Fixed rise/fall portion of every char's bob, in ms. Hold fills the rest.
 *  For chars shorter than 2× this, rise+fall consume the whole duration and
 *  there's no flat hold (pure triangular blip). */
const BOB_RISE_FALL_MS = 80;
/** Char duration (ms) that maps to a height factor of 1.0. Shorter chars get
 *  proportionally smaller bobs, longer chars get proportionally taller ones. */
const BOB_HEIGHT_NORMAL_MS = 500;
/** Min/max clamp on heightFactor. Floor keeps very short chars visible at all;
 *  ceiling keeps very long held notes from launching the performer off-screen. */
const BOB_MIN_HEIGHT_FACTOR = 0.5;
const BOB_MAX_HEIGHT_FACTOR = 1.5;

/**
 * Pulse shape across one character's [0, 1] phase:
 * smoothly rises to 1 in {@link BOB_RISE_FALL_MS}, holds at 1, falls back to 0
 * in another {@link BOB_RISE_FALL_MS}. Returns 0 at both endpoints, guaranteeing
 * smooth continuity into and out of any neighbouring char or gap.
 */
export function pulseShape(phase: number, durationMs: number): number {
  const rfFrac = Math.min(0.4, BOB_RISE_FALL_MS / Math.max(1, durationMs));
  if (phase < rfFrac) return smoothstep(phase / rfFrac);
  if (phase > 1 - rfFrac) return smoothstep((1 - phase) / rfFrac);
  return 1.0;
}

/** Linearly map char duration to a height multiplier, clamped. */
export function heightFactor(durationMs: number): number {
  const f = durationMs / BOB_HEIGHT_NORMAL_MS;
  return Math.max(BOB_MIN_HEIGHT_FACTOR, Math.min(BOB_MAX_HEIGHT_FACTOR, f));
}

// --- Sway --------------------------------------------------------------------
/**
 * Continuous sway position in *cycles* — locked to the song's tempo when beat
 * data is available (one full left→right→back lean every `beatsPerSway` beats,
 * so the performer sways in time with the music), and falling back to a
 * free-running rate (`freqHz`) during beatless gaps so nothing freezes mid-lean.
 *
 * Returns a raw cycle count; callers turn it into an angle with
 * `Math.sin(cycles * 2π + phase) * amplitude`. Shared so Miku and the chorus
 * advance through the lean in unison.
 *
 * @param beats     continuous beats elapsed (`Signals.beats`).
 * @param beatPhase 0..1 within the current beat, or -1 when there's no beat data.
 * @param posSec    song position in seconds — drives the beatless fallback.
 */
export function swayCycles(
  beats: number,
  beatPhase: number,
  posSec: number,
  beatsPerSway: number,
  freqHz: number,
): number {
  return beatPhase >= 0 ? beats / beatsPerSway : posSec * freqHz;
}

/** Sway phase offset (radians) shared by every performer so they lean together. */
export const SWAY_PHASE = 1.0;
/** Beats per full sway cycle — the tempo lock. Higher = slower/lazier lean.
 *  2.67 is a quarter slower than a 2-beat cycle. */
export const BEATS_PER_SWAY = 2.67;
/** Fallback sway frequency (Hz) for beatless gaps (intro / silence). */
export const SWAY_FREQ_HZ = 0.5;
