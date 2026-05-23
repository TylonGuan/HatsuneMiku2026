import { Vector3 } from "three";
import type { IVideo, IPhrase, IChar } from "textalive-app-api";
import type { CharDatum, LyricData, PhraseDatum } from "./types";

const RADIUS = 26;
const SPACING = 0.7; // horizontal gap between settled characters

// Convert TextAlive's loaded video into flat lyric data plus the per-character
// "journey" (where each glyph flies in from, settles, and flies out to).
// Each phrase is assigned an angle around a ring so phrases enter from different
// directions; characters of a phrase settle into a centered horizontal row.
export function buildLyrics(video: IVideo): LyricData {
  const rawPhrases: IPhrase[] = [];
  for (let p = video.firstPhrase; p; p = p.next) rawPhrases.push(p);

  const chars: CharDatum[] = [];
  const phrases: PhraseDatum[] = [];
  const nPhrases = Math.max(1, rawPhrases.length);

  rawPhrases.forEach((p, pi) => {
    const phraseChars: IChar[] = [];
    for (let c = p.firstChar; c; c = c.next) {
      phraseChars.push(c);
      if (c === p.lastChar) break;
    }

    const angle = (pi / nPhrases) * Math.PI * 2;
    const count = Math.max(1, phraseChars.length);
    const rowLen = count * SPACING;

    phraseChars.forEach((c, ci) => {
      const t = ci / Math.max(1, count - 1); // 0..1 across the phrase
      const entryAngle = angle + (Math.random() - 0.5) * 0.4;
      const exitAngle = angle + Math.PI + (Math.random() - 0.5) * 0.4;
      const yBase = (t - 0.5) * 1.5 + (Math.random() - 0.5) * 0.5;

      const entry = new Vector3(
        Math.cos(entryAngle) * RADIUS,
        yBase + (Math.random() - 0.5) * 3,
        Math.sin(entryAngle) * RADIUS,
      );
      const exit = new Vector3(
        Math.cos(exitAngle) * RADIUS,
        yBase + (Math.random() - 0.5) * 3,
        Math.sin(exitAngle) * RADIUS,
      );
      const settle = new Vector3((t - 0.5) * rowLen, 0, 0);

      chars.push({
        text: c.text,
        phraseIndex: pi,
        phraseStart: p.startTime,
        phraseEnd: p.endTime,
        entry,
        settle,
        exit,
        windPhase: Math.random() * Math.PI * 2,
      });
    });

    phrases.push({
      index: pi,
      text: p.text,
      startTime: p.startTime,
      endTime: p.endTime,
    });
  });

  return { chars, phrases, duration: video.duration };
}
