// ─── Viewport-aware multi-line wrap ─────────────────────────────────────────
//
// Pure layout maths extracted from `Lyrics.tsx`: given a phrase's chars and a
// target line width, decide where each glyph settles so long phrases break onto
// multiple lines instead of running off narrow screens. No React, no three.js —
// just data in, `{x, y}` overrides out — so the component file stays focused on
// orchestration and this stays independently testable.

import { LYRIC_Z, SPACING } from "../../textalive/buildLyrics";
import type { CharDatum } from "../../textalive/types";

// `SPACING` (char gap) and `SETTLE_Z` (settle depth) are imported from
// `buildLyrics.ts` — its baked settle positions are the single source of truth,
// and this wrap layout measures against the exact same geometry so line breaks
// land where the glyphs actually sit.

/** World Z where characters settle (= `LYRIC_Z` in `buildLyrics.ts`). */
export const SETTLE_Z = LYRIC_Z;
/** Vertical gap between wrapped lines within one phrase. Smaller than the
 *  parallel-voice `LANE_GAP` (2.4 in buildLyrics) so wrapped lines stay
 *  visually grouped as one phrase. */
export const LINE_HEIGHT = 1.2;
/** Fraction of visible width used for the lyric block — the rest is side
 *  margin so glyphs don't kiss the screen edges. */
export const SIDE_MARGIN = 0.9;

/**
 * For each phrase, greedy-wrap its words onto multiple lines so no line
 * exceeds `maxLineWidth`. Returns a per-charIndex override of `{x, y}` for the
 * settled position. Phrases whose original row already fits within
 * `maxLineWidth` are skipped entirely (`computePosition` falls back to each
 * glyph's baked `settle` in that case).
 *
 * Word-aware: line breaks only fall at word boundaries (`wordIndex` change),
 * never mid-word — important for Japanese where words have no spaces.
 *
 * If a single word is itself wider than `maxLineWidth`, it still occupies its
 * own line as a unit and overflows; readability beats wrapping mid-word.
 */
export function buildWrapLayout(
  chars: CharDatum[],
  maxLineWidth: number,
): Map<number, { x: number; y: number }> {
  const out = new Map<number, { x: number; y: number }>();
  if (maxLineWidth <= 0 || chars.length === 0) return out;

  // Bucket chars by phrase.
  const byPhrase = new Map<number, CharDatum[]>();
  for (const char of chars) {
    const bucket = byPhrase.get(char.phraseIndex);
    if (bucket) bucket.push(char);
    else byPhrase.set(char.phraseIndex, [char]);
  }

  for (const phraseChars of byPhrase.values()) {
    // Skip if the whole phrase already fits — keep the baked layout.
    if (phraseChars.length * SPACING <= maxLineWidth) continue;

    // Group consecutive chars into words (chars share a wordIndex within a word).
    const words: CharDatum[][] = [];
    let currentWord: CharDatum[] = [];
    let currentWordIndex = -1;
    for (const char of phraseChars) {
      if (char.wordIndex !== currentWordIndex) {
        if (currentWord.length) words.push(currentWord);
        currentWord = [];
        currentWordIndex = char.wordIndex;
      }
      currentWord.push(char);
    }
    if (currentWord.length) words.push(currentWord);

    // Greedy wrap: pack words into lines.
    const lines: CharDatum[][] = [];
    let line: CharDatum[] = [];
    let lineWidth = 0;
    for (const word of words) {
      const wordWidth = word.length * SPACING;
      if (line.length > 0 && lineWidth + wordWidth > maxLineWidth) {
        lines.push(line);
        line = [];
        lineWidth = 0;
      }
      line.push(...word);
      lineWidth += wordWidth;
    }
    if (line.length) lines.push(line);

    // Center the multi-line block on the phrase's original settle Y so lane
    // assignment (parallel-voice phrases at different LANE_GAPs) still applies.
    const baseY = phraseChars[0].settle.y;
    const numLines = lines.length;

    lines.forEach((lineChars, lineIndex) => {
      const lineWidth = lineChars.length * SPACING;
      const startX = -lineWidth / 2;
      // Line 0 sits highest; bottom line lowest. Block is centered on baseY.
      const yOffset = ((numLines - 1) / 2 - lineIndex) * LINE_HEIGHT;
      const y = baseY + yOffset;
      lineChars.forEach((char, charIndex) => {
        out.set(char.charIndex, { x: startX + (charIndex + 0.5) * SPACING, y });
      });
    });
  }

  return out;
}
