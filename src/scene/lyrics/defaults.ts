import type { LyricDefaults } from "./types";

/**
 * Global lyric styling defaults — applied to every song before any song-specific
 * config layers over them. Tune these to change how *every* song looks; tune the
 * song's own `defaults` (in its `SongConfig`) to override just that song.
 *
 * Initial values reproduce the original "colourless paper → magenta" progression
 * exactly, so existing behaviour is preserved.
 */
export const lyricsDefaults: LyricDefaults = {
  // Position offsets on top of the per-glyph computed path. 0 means "sit where
  // buildLyrics placed me." A song that needs the whole line shifted lowers
  // settleY in its own defaults.
  settleX: 0,
  settleY: 0,
  settleZ: 0,

  // Global size multiplier.
  scale: 1.5,

  // Default motion style while a glyph is settled / exiting.
  anim: "default",

  // Active-state colour gradient. The song's saturation signal (0 at the quiet
  // start, 1 at peak) interpolates between these two ends. Setting them equal
  // at any cascade layer gives a flat colour for that scope.
  colorFrom: { hue: 335, saturation: 12, lightness: 60 }, // colourless paper tint
  colorTo: { hue: 265, saturation: 80, lightness: 82 }, // signature lyric colour
};
