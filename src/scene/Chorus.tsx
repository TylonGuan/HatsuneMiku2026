import { useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { folder, useControls } from "leva";
import { SRGBColorSpace } from "three";
import type { Mesh, Texture } from "three";

import kaitoUrl from "../../art/KaitoCutout/Original Kaito.png";
import lenUrl from "../../art/LenCutout/Len.png";
import lukaUrl from "../../art/LukaCutout/Original Luka.png";
import meikoUrl from "../../art/MeikoCutout/Meiko.png";
import rinUrl from "../../art/RinCutout/Rin.png";
import { heightFactor, pulseShape } from "./Miku";
import type { Signals } from "./Signals";
import type { CharDatum, LyricData } from "../textalive/types";
import type { SongConfig } from "./lyrics/types";

// Same cutout canvas as Miku — 4032×3024 (4:3), character centred with a
// transparent surround, so the plane stays 4:3 and the alpha does the framing.
const SPRITE_ASPECT = 4032 / 3024;

// Paint order: behind Miku (1.8) but in front of the stage floor / background
// (both 1). The curtains (1.9) and proscenium frame (2) still sit on top, so a
// closed curtain hides the chorus exactly like it hides Miku.
const CHORUS_RENDER_ORDER = 1.5;

// Default theater tint, matching Miku — keeps everyone in the same moody
// palette; the spotlight then picks out whoever stands centre stage.
const DEFAULT_TINT = "#3d3947";

// ── Bob / sway tuning ────────────────────────────────────────────────────────
/** Base bob (world units, Y) per sung character — same feel as Miku's. */
const CHORUS_BOB_AMPLITUDE = 0.2;
/**
 * Mirrors the lyric display's `sweep` (Lyrics.tsx default 0.5): each bob blends
 * its window between the character's *word* timing and its *own*, so the team
 * bobs in lockstep with the words lighting up — and holds as long as the word
 * stays lit — rather than on the stricter raw char window (which ticked late and
 * released early). Leva's live `sweep` is a dev-only tweak; production uses this.
 */
const LYRIC_SWEEP = 0.5;
/** How fast the "chorus is sounding" gain eases in/out, so the bobs fade up at
 *  the start of a chorus and settle at the end instead of snapping. */
const CHORUS_GAIN_RATE = 2.5;
/** Max sway angle (radians), matching Miku's gentle lean. */
const CHORUS_SWAY_AMPLITUDE = 0.1;
/** Sway frequency (Hz) — a slow continuous sine, same as Miku's. */
const CHORUS_SWAY_FREQ_HZ = 0.2;
/** Sway floor: they keep a gentle idle sway even off-chorus (so they're alive,
 *  not frozen, like Miku's idle), rising to full while the chorus sounds. */
const CHORUS_SWAY_IDLE = 0.25;
/** Per-member phase offset so the line sways loosely, not in robotic lockstep. */
const CHORUS_SWAY_PHASE_STEP = 1.25;

// One entry per chorus character (the other Cryptons who sing the harmony).
// Defaults just spread them in a row across the stage behind Miku so they're
// all visible to start; arrange each live via its leva folder, then copy the
// values you like back here.
const MEMBERS = [
  { name: "Rin", url: rinUrl, x: -4.65, y: -0.05, z: -17, scale: 7.5 },
  { name: "Len", url: lenUrl, x: 6.1, y: 0, z: -17, scale: 7.5 },
  { name: "Luka", url: lukaUrl, x: 4.6, y: 1.85, z: -19, scale: 7.5 },
  { name: "Meiko", url: meikoUrl, x: -3.3, y: 2, z: -18.5, scale: 7.5 },
  { name: "Kaito", url: kaitoUrl, x: 0.45, y: 2.5, z: -19, scale: 7.5 },
] as const;

// One collapsed leva folder per member, each with x / y / z / scale sliders.
const memberControls = Object.fromEntries(
  MEMBERS.map((m) => [
    m.name,
    folder(
      {
        [`${m.name}-x`]: { value: m.x, min: -20, max: 20, step: 0.05 },
        [`${m.name}-y`]: { value: m.y, min: -8, max: 8, step: 0.05 },
        // Floor goes well past the background plane (z=-20): these are
        // render-order-composited (depthTest off), so a deeper z only shrinks
        // them by perspective — handy for fitting the whole line — while they
        // still draw in front of the background and behind Miku.
        [`${m.name}-z`]: { value: m.z, min: -35, max: -2, step: 0.1 },
        [`${m.name}-scale`]: { value: m.scale, min: 0.5, max: 12, step: 0.05 },
      },
      { collapsed: true },
    ),
  ]),
);

/**
 * One unison bob value for the syllable sounding at `pos`, walked over `chars`
 * (kept in time order). Uses the same word-blended window as the lyric display
 * (see {@link LYRIC_SWEEP}) and Miku's pulse shape, so it fires when the word
 * lights up and holds while it stays lit; returns 0 between syllables. `idxRef`
 * is a forward-walking hint, so the search stays O(1) during normal playback.
 */
function bobForSyllable(chars: CharDatum[], idxRef: { current: number }, pos: number): number {
  if (chars.length === 0) return 0;
  const arriveOf = (c: CharDatum) => c.wordStart + (c.charStart - c.wordStart) * LYRIC_SWEEP;
  let idx = idxRef.current;
  if (idx >= chars.length || arriveOf(chars[idx]) > pos) idx = 0;
  while (idx + 1 < chars.length && arriveOf(chars[idx + 1]) <= pos) idx++;
  idxRef.current = idx;
  const c = chars[idx];
  const arrive = arriveOf(c);
  const leave = c.wordEnd + (c.charEnd - c.wordEnd) * LYRIC_SWEEP;
  if (pos >= arrive && pos < leave) {
    const durationMs = leave - arrive;
    const phase = (pos - arrive) / Math.max(1, durationMs);
    return pulseShape(phase, durationMs) * heightFactor(durationMs) * CHORUS_BOB_AMPLITUDE;
  }
  return 0;
}

interface Props {
  signalsRef: RefObject<Signals>;
  /** Lyric data — read for per-character bob timing (same source Miku uses) and
   *  to find which phrase is sounding now, so the chorus bobs in sync with the
   *  syllables being sung. */
  lyrics: LyricData | null;
  /** Song config — supplies `chorusVoicePhrases`, the phrases these characters
   *  actually sing (the pink lines). They only animate during those. */
  song: SongConfig;
}

/**
 * The chorus line — Rin, Len, Luka, Meiko, and Kaito standing behind Miku.
 *
 * Each is a billboard plane textured with its cutout PNG, placed and sized from
 * a per-character leva folder ("Chorus" panel). They share Miku's tint and
 * lighting, so the stage spotlight catches whoever the artist moves to centre.
 *
 * ### Bob
 *
 * They bob with the same per-character pulse as Miku, in two cases:
 *   1. one of their own `chorusVoicePhrases` (the pink lines) is sounding — they
 *      bob to that line's own syllables; or
 *   2. the musical chorus is sounding ({@link Signals.chorus}) — they sing
 *      *along* to whatever syllable is current (Miku's chorus melody).
 * Case 1 takes priority, so an overlapping teal line can't hijack their own
 * line. A smoothed gain fades the motion in/out at the boundaries, and all five
 * bob in unison.
 */
export function Chorus({ signalsRef, lyrics, song }: Props) {
  const textures = useTexture(MEMBERS.map((m) => m.url)) as Texture[];
  const ctrl = useControls("Chorus", {
    // Shared shading tint for the whole line.
    tint: { value: DEFAULT_TINT },
    ...memberControls,
  }) as Record<string, number | string>;

  const tint = ctrl.tint as string;
  // Base Y per member (the leva position the bob offsets from).
  const baseYs = MEMBERS.map((m) => ctrl[`${m.name}-y`] as number);

  // The phrase indices these characters sing (the pink lines). They bob/sway
  // only while one of these is the active phrase.
  const chorusPhraseSet = useMemo(
    () => new Set(song.chorusVoicePhrases ?? []),
    [song.chorusVoicePhrases],
  );

  // Just the team's own characters (the pink lines), in song order. The bob
  // walks THIS list, not the whole song, so an overlapping teal line can never
  // become the "current syllable" and rob them of their cue.
  const chorusChars = useMemo(
    () => (lyrics?.chars ?? []).filter((c) => chorusPhraseSet.has(c.phraseIndex)),
    [lyrics, chorusPhraseSet],
  );

  /** One mesh handle per member, so the bob can mutate Y without re-rendering. */
  const meshRefs = useRef<(Mesh | null)[]>([]);
  /** Eased 0..1 "team is singing" gain. */
  const chorusGainRef = useRef(0);
  /** Forward-walking hints for the two bob sources: the team's own pink chars,
   *  and (when singing along to the musical chorus) the full lyric char list. */
  const pinkIdxRef = useRef(0);
  const singAlongIdxRef = useRef(0);

  useFrame((_, dt) => {
    const s = signalsRef.current;
    if (!s) return;

    // Is one of the team's phrases (the pink lines) sounding now? Use `.some`,
    // NOT `.find` — phrases overlap in this song, and `.find` returns the first
    // match in song order, which is often a concurrent teal line. That made the
    // team read "teal" and miss their cue until the overlap cleared.
    let inChorusSection = false;
    const phrases = lyrics?.phrases;
    if (phrases) {
      for (const p of phrases) {
        if (chorusPhraseSet.has(p.index) && s.pos >= p.startTime && s.pos < p.endTime) {
          inChorusSection = true;
          break;
        }
      }
    }

    // Two ways the team comes alive, both per-syllable like Miku:
    //   1) one of their OWN pink phrases is sounding -> bob to that pink syllable
    //      (walk the pink chars only, so an overlapping teal line can't hijack it)
    //   2) otherwise, if the musical chorus is sounding (Songle's s.chorus) ->
    //      sing ALONG to whatever syllable is current (Miku's chorus melody).
    // (1) wins so their own line always takes priority over a general sing-along.
    let bob = 0;
    if (inChorusSection) {
      bob = bobForSyllable(chorusChars, pinkIdxRef, s.pos);
    } else if (s.chorus) {
      bob = bobForSyllable(lyrics?.chars ?? [], singAlongIdxRef, s.pos);
    }

    // Active (and swaying at full) whenever either trigger holds; ease so the
    // bob/sway fade in/out at the boundaries instead of snapping.
    const gainTarget = inChorusSection || s.chorus ? 1 : 0;
    chorusGainRef.current += (gainTarget - chorusGainRef.current) * Math.min(1, dt * CHORUS_GAIN_RATE);
    const gain = chorusGainRef.current;
    bob *= gain;

    // Sway — a slow continuous lean like Miku's. Keeps a gentle idle amplitude
    // off-chorus so they're never frozen, rising to full while the chorus
    // sounds. Each member is phase-offset so the line doesn't move in lockstep.
    const swayGain = CHORUS_SWAY_IDLE + (1 - CHORUS_SWAY_IDLE) * gain;
    const tSec = s.pos * 0.001;

    for (let i = 0; i < meshRefs.current.length; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      mesh.position.y = baseYs[i] + bob;
      mesh.rotation.z =
        Math.sin(tSec * Math.PI * 2 * CHORUS_SWAY_FREQ_HZ + i * CHORUS_SWAY_PHASE_STEP) *
        swayGain *
        CHORUS_SWAY_AMPLITUDE;
    }
  });

  return (
    <group>
      {MEMBERS.map((m, i) => {
        const tex = textures[i];
        tex.colorSpace = SRGBColorSpace;
        const x = ctrl[`${m.name}-x`] as number;
        const y = ctrl[`${m.name}-y`] as number;
        const z = ctrl[`${m.name}-z`] as number;
        const scale = ctrl[`${m.name}-scale`] as number;
        const h = scale;
        const w = h * SPRITE_ASPECT;
        return (
          <mesh
            key={m.name}
            ref={(mesh) => {
              meshRefs.current[i] = mesh;
            }}
            position={[x, y, z]}
            renderOrder={CHORUS_RENDER_ORDER}
          >
            <planeGeometry args={[w, h]} />
            <meshPhongMaterial
              map={tex}
              transparent
              depthTest={false}
              depthWrite={false}
              color={tint}
              toneMapped={false}
              shininess={0}
            />
          </mesh>
        );
      })}
    </group>
  );
}
