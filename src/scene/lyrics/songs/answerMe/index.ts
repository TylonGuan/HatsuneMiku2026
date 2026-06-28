// ─── "Answer Me" song bundle ──────────────────────────────────────────────────
// Everything specific to this song lives here:
//   - song-wide style tweaks (the lyrics need to sit lower in our theater scene)
//   - per-phrase / word / char style overrides (start empty; fill in by ear)
//   - hand-corrected pre-chorus timings (TextAlive's data is broken there)
//
// Adding another song = copy this folder, swap the imports in `App.tsx` (and
// `usePlayer`). `Lyrics.tsx` is song-agnostic — it just consumes the SongConfig.

import type { ColorPoint, SongConfig } from "../../types";
import { ANSWER_ME_AMP_WINDOWS, ANSWER_ME_CUES, ANSWER_ME_SINGERS } from "./casting";
import { chorusTimingOverrides } from "./chorusTimings";

// ── Voice colours ────────────────────────────────────────────────────────────
// Vocaloid casting: Miku sings the main vocal line, the rest of the Cryptons
// (Rin, Len, Meiko, Kaito, Luka) take the chorus harmony. Two flat HSL points
// per voice so the cascade can apply them uniformly.

/** #86cecb — Miku's signature teal. Used for every line by default. */
const MIKU_TEAL: ColorPoint = { hue: 182, saturation: 74, lightness: 50 };

/** #ffb7c5 — soft pink for the chorus voices (the other Cryptons). Applied
 *  per-phrase to the lines they actually sing. */
const CHORUS_PINK: ColorPoint = { hue: 348, saturation: 100, lightness: 86 };

// ── Chorus-voice phrases ─────────────────────────────────────────────────────
// The phrases the other Cryptons sing (Miku takes everything else). This single
// list is the source of truth: each phrase here is coloured pink in the lyrics
// AND makes the on-stage chorus characters bob/sway while it plays. To add the
// back-and-forth call-and-response (or any team line), just add its phrase index.
//   8: どれほどの苦しみも悲しみの向こうに
//   9: きっと私の目指す私がいると信じ続けていた
const CHORUS_VOICE_PHRASES = [8, 9];

/** Pink colour overrides generated from {@link CHORUS_VOICE_PHRASES}. */
const chorusPinkOverrides = Object.fromEntries(
  CHORUS_VOICE_PHRASES.map((i) => [i, { colorFrom: CHORUS_PINK, colorTo: CHORUS_PINK }]),
);

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
  // the index of any line you want to tune. The chorus-voice pink lines are
  // merged in from CHORUS_VOICE_PHRASES above; add any other manual tweaks here.
  phraseOverrides: {
    ...chorusPinkOverrides,
  },

  // Phrases the chorus voices sing — pink lyrics. (Casting below decides who's
  // actually on stage; this is just the lyric colour for the team's own lines.)
  chorusVoicePhrases: CHORUS_VOICE_PHRASES,

  // On-stage choreography (entrance/exit timeline) + who sings each phrase (for
  // bobbing). Drives the <Chorus> cast — authored in ./casting.ts.
  castingCues: ANSWER_ME_CUES,
  singByPhrase: ANSWER_ME_SINGERS,
  ampBobWindows: ANSWER_ME_AMP_WINDOWS,

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
