// ─── Lyric styling types ──────────────────────────────────────────────────────
// The lyric system is **song-agnostic**. Styling cascades through layers:
//
//   globalDefaults  →  songConfig.defaults  →  phraseOverrides  →  wordOverrides  →  charOverrides
//
// Each layer is a Partial<>; only the fields it sets actually override. Missing
// fields fall through to the layer above (OOP-style inheritance per-field).
// Closest-wins for every field — no additive sums. `Lyrics.tsx` never imports
// anything song-specific; it receives the resolved style per glyph.

import type { PhraseTimings } from "./songs/answerMe/chorusTimings";

/** Motion style available for the settle/exit phase of a glyph. */
export type AnimStyle = "default" | "float-up" | "swirl-out";

/** A single HSL colour point used at either end of the active-state gradient. */
export interface ColorPoint {
  /** 0–360. */
  hue: number;
  /** 0–100. */
  saturation: number;
  /** 0–100. */
  lightness: number;
}

/**
 * One layer's worth of style overrides. Used identically at every cascade level
 * (song-level defaults, per-phrase, per-word, per-char). Every field is optional;
 * unset fields fall through to the layer above.
 */
export interface LyricStyleOverride {
  /** Horizontal offset added to the computed path (world units). */
  settleX?: number;
  /** Vertical offset added to the computed path (world units, negative = lower). */
  settleY?: number;
  /** Depth offset added to the computed path (world units, negative = farther back). */
  settleZ?: number;
  /** Size multiplier (1 = normal). */
  scale?: number;
  /** Motion style while a glyph is settled / exiting. */
  anim?: AnimStyle;
  /** Active-state colour at song-saturation = 0 (the gradient's "from"). */
  colorFrom?: ColorPoint;
  /** Active-state colour at song-saturation = 1 (the gradient's "to"). */
  colorTo?: ColorPoint;
}

/**
 * Fully-specified global defaults. Same shape as {@link LyricStyleOverride}
 * but every field is required — this is the cascade's bottom layer, no
 * fallback exists below it.
 */
export interface LyricDefaults extends Required<LyricStyleOverride> {}

/**
 * A point in the song for a casting cue: either an absolute time in ms, or
 * anchored to a phrase's start/end (with an optional ms offset). Phrase anchors
 * let cues track the lyric data instead of hard-coding times we don't know.
 */
export type CastAnchor = number | { phrase: number; at?: "start" | "end"; offset?: number };

/**
 * One on-stage spell for a set of team members: they twirl in at {@link from} and
 * out at {@link to}. If {@link staggerOutMs} is set, they exit ONE BY ONE, spread
 * evenly across `[to, to + staggerOutMs]` (the sustained-note spin-outs).
 */
export interface CastCue {
  /** Team member names this cue covers (e.g. ["Rin", "Len"]). */
  who: string[];
  from: CastAnchor;
  to: CastAnchor;
  /** Total window (ms) from {@link to} over which the group spins out, leaving
   *  Miku. Omit for a clean simultaneous exit at `to`. */
  staggerOutMs?: number;
  /** Hold (ms) after `to` before the first exit — they sustain together first,
   *  then spin out. The spread happens over the remaining window. */
  staggerHoldMs?: number;
  /** How many exit at a time (1 = one-by-one, 2 = pairs). Bigger groups give each
   *  step more time when the window is short. Defaults to 1. */
  staggerGroup?: number;
}

/**
 * Everything one song knows about itself: per-layer style overrides and raw
 * lyric-timing corrections. All fields optional — a brand-new song with no
 * tweaks just renders on the global defaults.
 */
export interface SongConfig {
  /** Song-wide overrides applied on top of the global {@link LyricDefaults}. */
  defaults?: Partial<LyricDefaults>;
  /** Per-phrase overrides, keyed by `phraseIndex` (0-based, song order). */
  phraseOverrides?: Record<number, LyricStyleOverride>;
  /** Per-word overrides, keyed by global `wordIndex` (0-based across whole song). */
  wordOverrides?: Record<number, LyricStyleOverride>;
  /** Per-character overrides, keyed by global `charIndex` (0-based across whole song). */
  charOverrides?: Record<number, LyricStyleOverride>;
  /**
   * Phrase indices (0-based, song order) sung by the chorus voices — the other
   * Cryptons, not Miku. Single source of truth for "the team is singing here":
   * these phrases get the pink lyric colour AND drive the on-stage chorus
   * characters' bob/sway (they only sing during these phrases). See
   * {@link Chorus}.
   */
  chorusVoicePhrases?: number[];
  /**
   * Stage entrance/exit timeline for the on-stage team — WHEN each member is
   * present. Translated from the song's casting sheet. See {@link CastCue}.
   * Consumed by {@link Chorus}; absent → no team ever (Miku alone).
   */
  castingCues?: CastCue[];
  /**
   * WHO sings each phrase (team member names per phrase index). A member only
   * bobs while a phrase they sing is active; otherwise they sway. Miku is
   * implicit (her own component). Consumed by {@link Chorus}.
   */
  singByPhrase?: Record<number, string[]>;
  /**
   * Lyric-free time windows `[startMs, endMs]` (the "la la la" ad-libs). Inside
   * one, the characters (and Miku) bob to the vocal amplitude instead of to lyric
   * syllables. Consumed by {@link Chorus} and {@link Miku}.
   */
  ampBobWindows?: [number, number][];
  /**
   * Corrections for raw TextAlive char/word timing (phrase-text → corrected
   * word×char times). Only needed if the API's reported timing for a song is
   * broken. Consumed by `buildLyrics` when constructing the lyric data.
   */
  chorusTimings?: Map<string, PhraseTimings>;
}

/**
 * The cascade result for a single glyph, ready for the render helpers to
 * consume. Built by `resolveStyle(defaults, song, glyph)` each frame.
 */
export interface ResolvedStyle {
  settleX: number;
  settleY: number;
  settleZ: number;
  scale: number;
  anim: AnimStyle;
  colorFrom: ColorPoint;
  colorTo: ColorPoint;
}
