// ─── Stage casting for "Answer Me" ───────────────────────────────────────────
// The choreography for this song, authored by hand from its structure.
//
// Two pieces:
//   1. ANSWER_ME_CUES   — WHEN each member is on stage (entrance/exit timeline).
//   2. ANSWER_ME_SINGERS — WHO sings each phrase (drives the bob; non-singers
//                          on stage just sway).
//
// Times are absolute ms or phrase-anchored ({ phrase, at:"start"|"end", offset }).
// `staggerOutMs` makes a group exit ONE BY ONE, spread evenly across
// [to, to + staggerOutMs] — the sustained-note spin-outs that leave only Miku.

import type { CastCue } from "../../types";

/** The five Crypton team members (everyone except Miku). */
export type TeamName = "Rin" | "Len" | "Luka" | "Meiko" | "Kaito";

/** Whole team. */
export const ALL_TEAM: TeamName[] = ["Rin", "Len", "Luka", "Meiko", "Kaito"];

export const ANSWER_ME_CUES: CastCue[] = [
  // ── Scene 1 — team joins one-by-one on the "woah oh" ad-libs; all clear after [9].
  { who: ["Meiko"], from: 36_000, to: { phrase: 9, at: "end" } },
  { who: ["Luka"], from: 40_000, to: { phrase: 9, at: "end" } },
  { who: ["Rin", "Len"], from: 44_000, to: { phrase: 9, at: "end" } },
  { who: ["Kaito"], from: 48_000, to: { phrase: 9, at: "end" } },

  // ── Transition — enter on the ad-libs and PERSIST across [10]/[11] (one cue =
  // no spin-out between the two lines), then out after [11].
  { who: ["Meiko", "Luka"], from: 70_000, to: { phrase: 11, at: "end" } },
  { who: ["Rin"], from: 73_000, to: { phrase: 11, at: "end" } },

  // ── Scene 2 climax — in just after Miku's first word ("この…"); hold the long
  // "laaa" together for ~1.5s, then spin out in pairs through 2:03.
  {
    who: ALL_TEAM,
    from: { phrase: 12, at: "start", offset: 600 },
    to: 119_000,
    staggerOutMs: 4_000,
    staggerHoldMs: 1_500,
    staggerGroup: 2,
  },

  // ── Scene 3 call-and-response — hold the sustained "いる", then spin out
  // one-by-one through 2:30.
  {
    who: ALL_TEAM,
    from: { phrase: 22, at: "start" },
    to: 145_000,
    staggerOutMs: 5_000,
    staggerHoldMs: 1_500,
  },

  // ── Scene 5 climax + outro — in at the reprise ("この…", ~3:02); stay through
  // the la-la-laaa (3:30–3:42), hold the final sustained "いる" ~1.5s, then spin
  // out in pairs through 4:00.
  {
    who: ALL_TEAM,
    from: { phrase: 29, at: "start", offset: 600 },
    to: 236_000,
    staggerOutMs: 4_000,
    staggerHoldMs: 1_500,
    staggerGroup: 2,
  },
];

/**
 * Time windows (ms) with no lyrics — the "la la la" ad-lib sections. During these
 * the on-stage characters (and Miku) bob to the VOCAL AMPLITUDE instead of to
 * lyric syllables, so they still move with the voice. (See {@link SongConfig
 * .ampBobWindows}.)
 */
export const ANSWER_ME_AMP_WINDOWS: [number, number][] = [
  [107_000, 123_000], // 1:47–2:03 — "la la la" + long "laaa" after [18]
  [210_000, 222_000], // 3:30–3:42 — "la la la laaa" after [34]
];

/**
 * Team members who SING each phrase (Miku is implicit/separate). A member only
 * bobs while a phrase they sing is active; otherwise they just sway. So the
 * Scene 1 / transition appearances — where the team ad-libs "woah oh" rather than
 * a lyric phrase — sway without bobbing.
 */
export const ANSWER_ME_SINGERS: Record<number, TeamName[]> = {
  8: ALL_TEAM,
  9: ALL_TEAM,
  12: ALL_TEAM,
  13: ALL_TEAM,
  14: ALL_TEAM,
  15: ALL_TEAM,
  16: ALL_TEAM,
  17: ALL_TEAM,
  18: ALL_TEAM,
  22: ALL_TEAM,
  23: ALL_TEAM,
  24: ALL_TEAM,
  29: ALL_TEAM,
  30: ALL_TEAM,
  31: ALL_TEAM,
  32: ALL_TEAM,
  33: ALL_TEAM,
  34: ALL_TEAM,
  35: ALL_TEAM,
  36: ALL_TEAM,
  37: ALL_TEAM,
};
