import type { Player } from "textalive-app-api";

// Live, per-frame signals derived from the TextAlive player at a given position (ms).
// All guarded so they are safe to call before the video/beat data is available.

export function getBeatAmp(player: Player, pos: number): number {
  const beat = player.findBeat?.(pos);
  if (beat && beat.duration > 0) {
    return Math.max(0, 1 - ((pos - beat.startTime) / beat.duration) * 3);
  }
  return 0;
}

/**
 * Where we are *within* the current beat, as a fraction in [0, 1].
 *   - 0   = the beat just started (on the downbeat)
 *   - 0.5 = halfway through the beat
 *   - 1   = beat is about to end / next beat about to start
 *
 * Returns -1 when no beat data is available (intro silence, very start of song,
 * or songs without beat analysis) — callers use this as a "skip beat-synced
 * animation" sentinel.
 *
 * Phase-locked animations (bob/bounce) read this instead of {@link getBeatAmp}
 * so their motion stays continuous across beat boundaries regardless of BPM.
 */
export function getBeatPhase(player: Player, pos: number): number {
  const beat = player.findBeat?.(pos);
  if (!beat || beat.duration <= 0) return -1;
  return Math.min(1, Math.max(0, (pos - beat.startTime) / beat.duration));
}

/**
 * Where we are *within* the current spoken word, as a fraction in [0, 1].
 * Returns -1 when there is no active word (between words, instrumental gaps).
 *
 * Used to drive animations that should pulse *with the singing* rather than
 * with the metronome — one bob per word reads as "she's singing each syllable."
 */
export function getWordPhase(player: Player, pos: number): number {
  const word = player.video?.findWord?.(pos);
  if (!word || word.duration <= 0) return -1;
  return Math.min(1, Math.max(0, (pos - word.startTime) / word.duration));
}

/**
 * Where we are *within* the current lyric phrase, as a fraction in [0, 1].
 * Returns -1 when no phrase is active.
 *
 * Used for slower lyric-paced motion (one sway per phrase) and for gating
 * motion off entirely during instrumental sections.
 */
export function getPhrasePhase(player: Player, pos: number): number {
  const phrase = player.video?.findPhrase?.(pos);
  if (!phrase || phrase.duration <= 0) return -1;
  return Math.min(1, Math.max(0, (pos - phrase.startTime) / phrase.duration));
}

export function getVocalAmp(player: Player, pos: number): number {
  if (!player.getVocalAmplitude || !player.getMaxVocalAmplitude) return 0;
  const max = player.getMaxVocalAmplitude();
  if (!max) return 0;
  return Math.min(1, player.getVocalAmplitude(pos) / max);
}

export function getProgress(player: Player, pos: number): number {
  const duration = player.video?.duration ?? 0;
  return duration > 0 ? Math.min(1, pos / duration) : 0;
}

export function isChorus(player: Player, pos: number): boolean {
  return !!player.findChorus?.(pos);
}
