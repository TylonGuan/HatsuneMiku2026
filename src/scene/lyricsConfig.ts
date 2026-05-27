// ─── Per-phrase lyric overrides ───────────────────────────────────────────────
// Edit this file to customize individual lines of the song.
// Key = phraseIndex (0-based, in the order the song plays).
// Only specify fields you want to override; everything else uses defaults.
//
// Example:
//   5: { settleY: 1.0, hue: 200, scale: 1.3, anim: "float-up" },

export interface LyricLineConfig {
  // Position offsets (added to the computed settle position).
  settleX?: number;
  settleY?: number;
  settleZ?: number;

  // Color override for the active (sung) state.
  // Leave undefined to use the default magenta progression.
  hue?: number; // 0–360
  saturation?: number; // 0–100
  lightness?: number; // 0–100

  // Size multiplier (1 = normal).
  scale?: number;

  // Motion style while the character is settled.
  anim?: "default" | "float-up" | "swirl-out";
}

export const answerMeLyricOverrides: Record<number, LyricLineConfig> = {
  // ── Intro ──
  0: { anim: "float-up", scale: 0.8 },

  // ── Verse 1 ──
  // 1: { settleY: 0.5 },
  // 2: { settleY: 0.5 },

  // ── Chorus 1 ──
  // 3: { scale: 1.2, saturation: 90, lightness: 80 },
  // 4: { scale: 1.2, hue: 350 },

  // ── Verse 2 ──
  // 5: { settleY: -0.3 },

  // ── Chorus 2 ──
  // 6: { scale: 1.3, saturation: 95 },

  // ── Bridge ──
  // 7: { hue: 200, saturation: 70, anim: "swirl-out" },
  // 8: { hue: 200, anim: "swirl-out" },

  // ── Final Chorus ──
  // 9: { scale: 1.4, saturation: 100, lightness: 85 },
};
