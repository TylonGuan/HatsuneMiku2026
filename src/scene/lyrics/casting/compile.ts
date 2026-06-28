// ─── Casting cue → on-stage interval compiler ───────────────────────────────
//
// Pure timeline logic extracted from `Chorus.tsx`: turn the song's authored
// casting *cues* (who's on stage, anchored to absolute ms or to phrase
// start/end, with optional staggered one-by-one spin-outs) into concrete
// `[from, to]` millisecond intervals per member. No React, no three.js — given
// the cues and the resolved phrase times, it returns the merged presence
// windows the component reads each frame. Isolated here so the choreography
// maths can be reasoned about (and tested) without a render.

import type { CastAnchor, CastCue } from "../types";
import type { PhraseDatum } from "../../../textalive/types";

/** Bridge sub-second gaps between a member's cues so they don't flicker out/in. */
const JOIN_MS = 900;

/**
 * Compile the cue timeline into per-member on-stage intervals (ms).
 *
 * For each cue: resolve its `from`/`to` anchors against the phrase times, then
 * emit one interval per listed member. When the cue staggers its exit, each
 * member's `to` is pushed out by group so the team spins off one-by-one. Finally
 * each member's intervals are sorted and adjacent ones within {@link JOIN_MS}
 * are merged, so a member who's cued back almost immediately doesn't flicker.
 *
 * @param cues      the song's casting cues (`SongConfig.castingCues`).
 * @param phrases   resolved phrase windows, for anchor resolution.
 * @param teamNames the member roster; output has one (possibly empty) entry each.
 * @returns member name → sorted, merged `[from, to]` intervals (ms).
 */
export function compileCastingIntervals(
  cues: CastCue[],
  phrases: PhraseDatum[],
  teamNames: readonly string[],
): Record<string, [number, number][]> {
  const byName: Record<string, [number, number][]> = {};
  for (const name of teamNames) byName[name] = [];

  const phraseByIndex = new Map(phrases.map((p) => [p.index, p]));
  const resolve = (a: CastAnchor): number | null => {
    if (typeof a === "number") return a;
    const p = phraseByIndex.get(a.phrase);
    if (!p) return null;
    return (a.at === "end" ? p.endTime : p.startTime) + (a.offset ?? 0);
  };

  for (const cue of cues) {
    const from = resolve(cue.from);
    const to = resolve(cue.to);
    if (from == null || to == null) continue;
    const memberCount = cue.who.length;
    // Staggered exit: hold together for `staggerHoldMs`, then spin out group by
    // group (groups of `staggerGroup`) evenly across the rest of the window.
    const hold = cue.staggerHoldMs ?? 0;
    const groupSize = Math.max(1, cue.staggerGroup ?? 1);
    const numGroups = Math.ceil(memberCount / groupSize);
    const spread = Math.max(0, (cue.staggerOutMs ?? 0) - hold);
    cue.who.forEach((name, memberIndex) => {
      if (!byName[name]) return;
      let end = to;
      if (cue.staggerOutMs) {
        const groupIndex = Math.floor(memberIndex / groupSize);
        const frac = numGroups > 1 ? groupIndex / (numGroups - 1) : 0;
        end = to + hold + spread * frac;
      }
      byName[name].push([from, end]);
    });
  }

  for (const name of Object.keys(byName)) {
    const sorted = byName[name].sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const interval of sorted) {
      const last = merged[merged.length - 1];
      if (last && interval[0] - last[1] <= JOIN_MS) last[1] = Math.max(last[1], interval[1]);
      else merged.push([interval[0], interval[1]]);
    }
    byName[name] = merged;
  }

  return byName;
}
