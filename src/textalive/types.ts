import { Vector3 } from "three";

/**
 * A single kanji character with its 3D journey through the scene.
 *
 * Each char flies in from `entry`, settles at `settle` while its phrase is sung,
 * then drifts away to `exit`. The progress between these three points is driven
 * by the animation loop in <Lyrics />.
 */
export interface CharDatum {
  /** The character itself (e.g. "教", "し", "ピ"). */
  text: string;
  /** Index of the phrase this character belongs to (0-based, song order). */
  phraseIndex: number;
  /** Global word index this character belongs to (0-based across the whole song). */
  wordIndex: number;
  /** Global character index (0-based across the whole song). */
  charIndex: number;
  /**
   * Milliseconds — when this character's *word* begins. Drives the reveal
   * lifecycle so a word's characters appear and leave together. The `sweep`
   * control in <Lyrics /> blends between this (whole word at once) and the
   * per-character time below (each char on its own sung beat).
   */
  wordStart: number;
  /** Milliseconds — when this character's *word* ends. */
  wordEnd: number;
  /** Milliseconds — when this character begins (its own sung time, finer than wordStart). */
  charStart: number;
  /** Milliseconds — when this character ends (its own sung time, finer than wordEnd). */
  charEnd: number;
  /** 3D position where the char flies in from (e.g. the audience / seats). */
  entry: Vector3;
  /** 3D position where the char sits on screen while active (the "lyric line"). */
  settle: Vector3;
  /** 3D position where the char drifts away to after its phrase ends. */
  exit: Vector3;
  /**
   * Random offset (0–2π) so each char's sine-wave wind wobble is slightly
   * out of sync with its neighbours.
   */
  windPhase: number;
}

/**
 * A single line of the song — a phrase of consecutive kanji.
 *
 * Built from TextAlive's {@link IPhrase} list in {@link buildLyrics}.
 * Each phrase contains one or more {@link CharDatum}.
 */
export interface PhraseDatum {
  /** 0-based index in song order. */
  index: number;
  /** The raw kanji text of this phrase (e.g. "教えてよ"). */
  text: string;
  /** Milliseconds — when this phrase starts in the song. */
  startTime: number;
  /** Milliseconds — when this phrase ends in the song. */
  endTime: number;
}

/**
 * All lyric data for the song, computed once from the TextAlive API.
 *
 * - `chars` — flat list of every individual kanji with 3D positions.
 * - `phrases` — the lines of the song, in order.
 * - `duration` — total song length.
 * - `maxRowWidth` — widest phrase row in world units; used by the renderer to
 *   shrink the whole line on narrow viewports so the side characters don't
 *   fall off-screen.
 */
export interface LyricData {
  /** Every individual kanji character across the whole song. */
  chars: CharDatum[];
  /** Every phrase (line of the song), in playback order. */
  phrases: PhraseDatum[];
  /** Total song duration in milliseconds. */
  duration: number;
  /** World-units width of the widest phrase (for responsive scaling). */
  maxRowWidth: number;
}
