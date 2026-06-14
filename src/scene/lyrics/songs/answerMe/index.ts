// ─── "Answer Me" song bundle ──────────────────────────────────────────────────
// Everything specific to this song lives here:
//   - song-wide style tweaks (the lyrics need to sit lower in our theater scene)
//   - per-phrase / word / char style overrides (start empty; fill in by ear)
//   - hand-corrected pre-chorus timings (TextAlive's data is broken there)
//
// Adding another song = copy this folder, swap the imports in `App.tsx` (and
// `usePlayer`). `Lyrics.tsx` is song-agnostic — it just consumes the SongConfig.

import type { ColorPoint, SongConfig } from "../../types";
import { chorusTimingOverrides } from "./chorusTimings";

// ── Voice colours ────────────────────────────────────────────────────────────
// Vocaloid casting: Miku sings the main vocal line, the rest of the Cryptons
// (Rin, Len, Meiko, Kaito, Luka) take the chorus harmony. Two flat HSL points
// per voice so the cascade can apply them uniformly.

/** #86cecb — Miku's signature teal. Used for every line by default. */
const MIKU_TEAL: ColorPoint = { hue: 178, saturation: 42, lightness: 67 };

/** #ffb7c5 — soft pink for the chorus voices (the other Cryptons). Applied
 *  per-phrase to the lines they actually sing. */
const CHORUS_PINK: ColorPoint = { hue: 348, saturation: 100, lightness: 86 };

export const answerMeSong: SongConfig = {
  // ── Song-wide style ────────────────────────────────────────────────────────
  // Override only the fields that differ from the global defaults; the rest
  // (scale, anim) fall through.
  defaults: {
    // The theater seating sits high enough that the default lyric line lands in
    // the proscenium arch. Drop the whole line so it floats above the audience.
    settleY: -4.0,
    // Main vocal colour. Flat (from = to) so there's no song-saturation
    // gradient; the climax bump in computeColor still adds a small hue/lightness
    // lift toward the end of the song.
    colorFrom: MIKU_TEAL,
    colorTo: MIKU_TEAL,
  },

  // ── Per-phrase overrides (key = 0-based phraseIndex in song order) ─────────
  // Use a temp console.log in Lyrics.tsx to print `phraseIndex: text` and find
  // the index of any line you want to tune.
  phraseOverrides: {
    // ── Intro ──
    0: { anim: "float-up", scale: 0.8 },

    // ── Chorus (the two phrases in `chorusTimings.ts` / `timings.jsonc`) ──
    // These are sung by the harmony voices (Rin/Len/Meiko/Kaito/Luka), so they
    // get the pink chorus colour instead of Miku's teal.
    //   8: どれほどの苦しみも悲しみの向こうに
    //   9: きっと私の目指す私がいると信じ続けていた
    8: { colorFrom: CHORUS_PINK, colorTo: CHORUS_PINK },
    9: { colorFrom: CHORUS_PINK, colorTo: CHORUS_PINK },
  },

  // ── Per-word overrides (key = 0-based global wordIndex) ────────────────────
  // Reserved for fine-grained emphasis like a single word flashing a colour.
  wordOverrides: {},

  // ── Per-character overrides (key = 0-based global charIndex) ───────────────
  // Reserved for the most granular control (one kanji spelled out differently).
  charOverrides: {},

  // ── Raw-data corrections ───────────────────────────────────────────────────
  // Consumed by `buildLyrics` when constructing the lyric data. Without this,
  // the pre-chorus pair around 52–66s collapses to a single instant.
  chorusTimings: chorusTimingOverrides,
};
