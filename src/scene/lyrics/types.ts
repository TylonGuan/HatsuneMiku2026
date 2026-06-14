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
