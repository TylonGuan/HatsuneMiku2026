import type { CharDatum } from "../../textalive/types";
import type {
  LyricDefaults,
  LyricStyleOverride,
  ResolvedStyle,
  SongConfig,
} from "./types";

/**
 * Walk the cascade for one glyph and return its final style.
 *
 *   char  →  word  →  phrase  →  song.defaults  →  globalDefaults
 *
 * Each layer is partial. For every field we pick the value from the most
 * specific layer that set it (closest-wins). Missing fields fall through. This
 * is OOP inheritance: a phrase setting `colorTo` "propagates" to its words and
 * chars by default; a per-char `colorTo` overrides just for that one char.
 *
 * Called per glyph per frame. It's just nullish-coalescing lookups — cheap.
 */
export function resolveStyle(
  defaults: LyricDefaults,
  song: SongConfig | undefined,
  glyph: CharDatum,
): ResolvedStyle {
  // Most-specific first; the resolver walks the list and returns the first hit.
  const layers: (LyricStyleOverride | undefined)[] = [
    song?.charOverrides?.[glyph.charIndex],
    song?.wordOverrides?.[glyph.wordIndex],
    song?.phraseOverrides?.[glyph.phraseIndex],
    song?.defaults,
  ];

  function pick<K extends keyof LyricDefaults>(key: K): LyricDefaults[K] {
    for (const layer of layers) {
      const v = layer?.[key];
      if (v !== undefined) return v as LyricDefaults[K];
    }
    return defaults[key];
  }

  return {
    settleX: pick("settleX"),
    settleY: pick("settleY"),
    settleZ: pick("settleZ"),
    scale: pick("scale"),
    anim: pick("anim"),
    colorFrom: pick("colorFrom"),
    colorTo: pick("colorTo"),
  };
}
