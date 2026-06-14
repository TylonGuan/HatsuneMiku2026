import { Vector3 } from "three";
import type { IVideo, IPhrase, IWord, IChar } from "textalive-app-api";
import type { PhraseTimings } from "../scene/lyrics/songs/answerMe/chorusTimings";
import type { CharDatum, LyricData, PhraseDatum } from "./types";

const SPACING = 0.7; // horizontal gap between settled characters
const LANE_GAP = 2.4; // vertical spacing between lanes of concurrent phrases
// ms padding (~LEAD/TRAIL in Lyrics.tsx) used to decide if two phrases share the screen
const OVERLAP_PAD = 1500;

// --- Theater layout: glyphs rise out of the audience and settle into a readable,
// glowing line above the crowd, like raised glow sticks, then drift up and away. ---
const SEAT_Z = -1.5; // depth of the audience (where glyphs are born)
const LYRIC_Z = -3; // depth where the readable line settles
const LINE_Y = 1.4; // height of the settled line, above the seat backs
const RISE_FROM_Y = -3.4; // glyphs start down in the seats
const RISE_TO_Y = 5.2; // and exit upward, toward the stage lights
const ARC = 0.9; // gentle upward curve toward the ends of the line

interface Journey {
  entry: Vector3;
  settle: Vector3;
  exit: Vector3;
}

const rand = () => Math.random() - 0.5;

function theaterJourney(t: number, rowLen: number, lane: number): Journey {
  const laneY = lane * LANE_GAP; // concurrent lines stack upward above the crowd
  const x = (t - 0.5) * rowLen;
  const arcY = Math.abs(t - 0.5) * ARC; // ends of the line lift a little (crowd curve)
  const jitterX = rand() * 0.6;
  return {
    entry: new Vector3(x + jitterX, RISE_FROM_Y + laneY * 0.3 + rand() * 1.2, SEAT_Z + rand() * 1.5),
    settle: new Vector3(x, LINE_Y + laneY + arcY, LYRIC_Z),
    exit: new Vector3(x + jitterX * 1.5, RISE_TO_Y + laneY + rand() * 1.5, LYRIC_Z - 1.5),
  };
}

// Collect a linked-list run (firstChar..lastChar / firstWord..lastWord) into an array.
function collect<T extends { next: T; }>(first: T | null, last: T): T[] {
  const out: T[] = [];
  for (let n = first; n; n = n.next) {
    out.push(n);
    if (n === last) break;
  }
  return out;
}

// Corrected phrase window = first char of first word .. last char of last word.
const overrideStart = (ph: PhraseTimings) => ph[0][0].startTime;
const overrideEnd = (ph: PhraseTimings) => {
  const lastWord = ph[ph.length - 1];
  return lastWord[lastWord.length - 1].endTime;
};

/**
 * Convert TextAlive's loaded video into flat lyric data plus a per-character
 * "journey" (where each glyph flies in from, settles, and flies out to).
 *
 * Each character carries its *word* window so <Lyrics /> can reveal words as a
 * unit (Japanese has no spaces, so words are the natural grouping), and global
 * `wordIndex`/`charIndex` so the SongConfig's per-word/per-char override maps
 * can address it.
 *
 * @param video           TextAlive's loaded video object (phrases/words/chars).
 * @param chorusTimings   Optional hand-corrected timings (phrase text → word×char times)
 *                        for songs whose raw API timing is broken. Falls back to the
 *                        API's reported times when absent.
 */
export function buildLyrics(
  video: IVideo,
  chorusTimings?: Map<string, PhraseTimings>,
): LyricData {
  const rawPhrases = collect<IPhrase>(video.firstPhrase, video.lastPhrase);

  const chars: CharDatum[] = [];
  const phrases: PhraseDatum[] = [];
  const matchedOverrides = new Set<string>();
  const laneFreeAt: number[] = []; // per lane: the time it becomes free for reuse

  // Running global indices across the song (for SongConfig's word/char override maps).
  let wordCounter = 0;
  let charCounter = 0;
  // Widest phrase row in world units — the renderer uses this to scale the
  // whole line down on narrow viewports so side characters don't fall off.
  let maxRowWidth = 0;

  rawPhrases.forEach((p, pi) => {
    // TextAlive groups Phrase → Word → Char; we walk words so timing can be
    // grouped per word, but lay characters out continuously (no word spacing).
    const words = collect<IWord>(p.firstWord, p.lastWord);

    const override = chorusTimings?.get(p.text);
    if (override) matchedOverrides.add(p.text);

    // Phrase-level window (corrected when available) — used for lane packing and
    // the subtitle phrase list.
    const startTime = override ? overrideStart(override) : p.startTime;
    const endTime = override ? overrideEnd(override) : p.endTime;

    // Lane assignment: greedily put each phrase on the lowest lane no currently-
    // visible phrase occupies, so concurrent phrases don't overlap.
    const enter = startTime - OVERLAP_PAD;
    const gone = endTime + OVERLAP_PAD;
    let lane = laneFreeAt.findIndex((free) => enter >= free);
    if (lane === -1) {
      lane = laneFreeAt.length;
      laneFreeAt.push(gone);
    } else {
      laneFreeAt[lane] = gone;
    }

    // Characters sit evenly across the whole phrase, so a phrase-local char index
    // (ci) drives the horizontal position; the word only governs timing/grouping.
    const totalChars = words.reduce((n, w) => n + w.charCount, 0);
    const count = Math.max(1, totalChars);
    const rowLen = count * SPACING;
    if (rowLen > maxRowWidth) maxRowWidth = rowLen;

    let ci = 0;
    words.forEach((w, wi) => {
      const wordOverride = override?.[wi];
      const wordStart = wordOverride ? wordOverride[0].startTime : w.startTime;
      const wordEnd = wordOverride ? wordOverride[wordOverride.length - 1].endTime : w.endTime;
      const wordIndex = wordCounter++;

      collect<IChar>(w.firstChar, w.lastChar).forEach((c, k) => {
        const t = ci / Math.max(1, count - 1); // 0..1 across the phrase
        const { entry, settle, exit } = theaterJourney(t, rowLen, lane);
        const charOverride = wordOverride?.[k];
        chars.push({
          text: c.text,
          phraseIndex: pi,
          wordIndex,
          charIndex: charCounter++,
          wordStart,
          wordEnd,
          charStart: charOverride?.startTime ?? c.startTime,
          charEnd: charOverride?.endTime ?? c.endTime,
          entry,
          settle,
          exit,
          windPhase: Math.random() * Math.PI * 2,
        });
        ci++;
      });
    });

    phrases.push({ index: pi, text: p.text, startTime, endTime });
  });

  if (process.env.NODE_ENV !== "production" && chorusTimings) {
    for (const key of chorusTimings.keys()) {
      if (!matchedOverrides.has(key)) {
        console.warn(`[chorusTimings] no phrase matched override text: "${key}"`);
      }
    }
  }

  return { chars, phrases, duration: video.duration, maxRowWidth };
}
