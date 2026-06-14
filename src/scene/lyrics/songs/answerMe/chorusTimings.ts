import raw from "./timings.jsonc";

// Hand-corrected timings for phrases whose TextAlive data is broken — the
// pre-chorus lines around 52–66s otherwise collapse to ~1ms and overlap, so the
// lyrics flash all at once. The .jsonc file mirrors TextAlive's own hierarchy:
//   phrase -> word -> char -> { startTime, endTime }   (all in ms)
//
// Blocks are matched to phrases by text (robust to phrase-index shifts), so the
// order of ANCHOR_TEXTS below must match the order of blocks in the file.
const ANCHOR_TEXTS = [
  "どれほどの苦しみも悲しみの向こうに",
  "きっと私の目指す私がいると信じ続けていた",
];

export interface CharTime {
  startTime: number;
  endTime: number;
}

/**
 * Corrected timings for one phrase, grouped exactly the way TextAlive groups
 * them: an array of words, each an array of its characters. `buildLyrics` reads
 * these by word/char index, falling back to the raw API timing when absent.
 */
export type PhraseTimings = CharTime[][];

// Strip // line- and /* */ block-comments, then JSON.parse. Safe here because
// the file contains only numbers (no string values that could hold "//").
function parseJsonc(src: string): PhraseTimings[] {
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return JSON.parse(stripped);
}

/** phrase text → corrected word×char timings for this song. */
export const chorusTimingOverrides: Map<string, PhraseTimings> = (() => {
  const map = new Map<string, PhraseTimings>();
  let blocks: PhraseTimings[];
  try {
    blocks = parseJsonc(raw);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[chorusTimings] could not parse timing file:", err);
    }
    return map;
  }

  blocks.forEach((words, i) => {
    const text = ANCHOR_TEXTS[i];
    if (text) map.set(text, words);
  });

  return map;
})();
