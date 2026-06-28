import { useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { folder, useControls } from "leva";
import { DoubleSide, SRGBColorSpace } from "three";
import type { Mesh, Texture } from "three";

import kaitoUrl from "../../../art/KaitoCutout/Kaito.png";
import lenUrl from "../../../art/LenCutout/Len.png";
import lukaUrl from "../../../art/LukaCutout/Luka.png";
import meikoUrl from "../../../art/MeikoCutout/Meiko.png";
import rinUrl from "../../../art/RinCutout/Rin.png";
import { easeOutBack, smoothstep } from "../common/ease";
import {
  BEATS_PER_SWAY,
  heightFactor,
  pulseShape,
  SWAY_FREQ_HZ,
  SWAY_PHASE,
  swayCycles,
} from "./performerMotion";
import { PAPER_MATERIAL, SPRITE_ASPECT } from "../common/sketch";
import { compileCastingIntervals } from "../lyrics/casting/compile";
import type { Signals } from "../Signals";
import type { CharDatum, LyricData } from "../../textalive/types";
import type { SongConfig } from "../lyrics/types";
import type { TeamName } from "../lyrics/songs/answerMe/casting";

// Paint order: behind Miku (1.8) but in front of the stage floor / background.
const CHORUS_RENDER_ORDER = 1.5;

// Default theater tint, matching Miku — slightly lighter than the backdrop.
const DEFAULT_TINT = "#524d5e";

// ── Bob / sway tuning (same feel as Miku) ────────────────────────────────────
const CHORUS_BOB_AMPLITUDE = 0.2;
/** Bob height during the lyric-free "la la la" ad-libs (vocal-amplitude driven).
 *  Bigger than the per-syllable bob so each ad-lib note clearly registers. */
const CHORUS_AMP_BOB_AMPLITUDE = 0.7;
/** Mirrors the lyric display's word-blend so the bob tracks the lit word. */
const LYRIC_SWEEP = 0.5;
/** How fast each member's singing gain eases in once they're on stage. */
const CHORUS_GAIN_RATE = 2.5;
const CHORUS_SWAY_AMPLITUDE = 0.1;
/** Sway floor so they keep a gentle idle lean between sung syllables. */
const CHORUS_SWAY_IDLE = 0.25;
// Tempo lock, beatless fallback, and phase are shared with Miku via `./motion`
// (BEATS_PER_SWAY / SWAY_FREQ_HZ / SWAY_PHASE) so the team sways in sync with her.

// ── Twirl tuning ─────────────────────────────────────────────────────────────
const ENTER_DURATION = 0.8; // grow + spin in
const EXIT_DURATION = 0.6; // shrink + spin out

/** A chorus member's fixed home placement on stage. `name` is typed against the
 *  casting roster ({@link TeamName}), so a typo here — or a name that doesn't
 *  match the casting cues / singer map — is a compile error, not a silent no-show. */
interface TeamMember {
  name: TeamName;
  url: string;
  x: number;
  y: number;
  z: number;
  scale: number;
}

// One entry per team member, with a FIXED home position (so e.g. Rin is always in
// the same spot whenever she's cast). Defaults are the original tuned placements;
// arrange each live via its leva folder, then copy values back here.
const TEAM: readonly TeamMember[] = [
  { name: "Rin", url: rinUrl, x: -4.65, y: -0.05, z: -17, scale: 7.5 },
  { name: "Len", url: lenUrl, x: 6.1, y: 0, z: -17, scale: 7.5 },
  { name: "Luka", url: lukaUrl, x: 4.6, y: 1.85, z: -19, scale: 7.5 },
  { name: "Meiko", url: meikoUrl, x: -3.3, y: 2, z: -18.5, scale: 7.5 },
  { name: "Kaito", url: kaitoUrl, x: 0.45, y: 2.5, z: -19, scale: 7.5 },
];

// One collapsed leva folder per member (x / y / z / scale).
const memberControls = Object.fromEntries(
  TEAM.map((member) => [
    member.name,
    folder(
      {
        [`${member.name}-x`]: { value: member.x, min: -20, max: 20, step: 0.05 },
        [`${member.name}-y`]: { value: member.y, min: -8, max: 8, step: 0.05 },
        [`${member.name}-z`]: { value: member.z, min: -35, max: -2, step: 0.1 },
        [`${member.name}-scale`]: { value: member.scale, min: 0.5, max: 12, step: 0.05 },
      },
      { collapsed: true },
    ),
  ]),
);

/** One member's lifecycle phase. */
type Phase = "hidden" | "in" | "active" | "out";

/**
 * One unison bob value for the syllable sounding at `pos`, over a given phrase's
 * chars. Same word-blended window + pulse shape as Miku's bob.
 */
function bobForSyllable(chars: CharDatum[], pos: number): number {
  const arriveOf = (char: CharDatum) => char.wordStart + (char.charStart - char.wordStart) * LYRIC_SWEEP;
  for (const char of chars) {
    const arrive = arriveOf(char);
    const leave = char.wordEnd + (char.charEnd - char.wordEnd) * LYRIC_SWEEP;
    if (pos >= arrive && pos < leave) {
      const durationMs = leave - arrive;
      const phase = (pos - arrive) / Math.max(1, durationMs);
      return pulseShape(phase, durationMs) * heightFactor(durationMs) * CHORUS_BOB_AMPLITUDE;
    }
  }
  return 0;
}

interface Props {
  signalsRef: RefObject<Signals>;
  /** Lyric data — phrase windows (to resolve cue anchors) + chars (for the bob). */
  lyrics: LyricData | null;
  /** Song config — supplies `castingCues` (when each member is on stage) and
   *  `singByPhrase` (who sings each phrase, for bobbing). */
  song: SongConfig;
}

/**
 * The chorus ensemble — the five Cryptons behind Miku.
 *
 * ### Choreography (cue timeline)
 *
 * Each member appears only when the song's {@link SongConfig.castingCues} put them
 * on stage — in a **fixed home position**. The cues compile (per member) into
 * on-stage intervals; cue times are absolute ms or phrase-anchored, so entrances
 * land on exact moments (the "woah oh" ad-libs) rather than phrase boundaries. A
 * member **twirls in** at an interval's start and **out** at its end; a cue's
 * `staggerOutMs` spreads the exits so the group spins out one-by-one (the
 * sustained-note finishes that leave only Miku). Default: Miku alone.
 *
 * ### Bob vs sway
 *
 * While on stage everyone sways in time with the song (in sync with Miku). Only
 * members who actually **sing** the current phrase ({@link SongConfig.singByPhrase})
 * also **bob** to its syllables — so the woah-oh appearances sway without bobbing,
 * and during the [6]/[7]+[8]/[9] overlap the team bobs to *their* line ([8]/[9]).
 *
 * NOT yet encoded: the la-la-la POSITION SWAPS (need dynamic home slots).
 */
export function Chorus({ signalsRef, lyrics, song }: Props) {
  const textures = useTexture(TEAM.map((member) => member.url)) as Texture[];
  const ctrl = useControls("Chorus", {
    tint: { value: DEFAULT_TINT },
    ...memberControls,
  }) as Record<string, number | string>;
  const tint = ctrl.tint as string;

  // Compile the cue timeline into per-member on-stage intervals (ms). Recomputed
  // only when the lyrics (phrase times) or cues change. See `./lyrics/casting/compile`.
  const presence = useMemo(
    () =>
      compileCastingIntervals(
        song.castingCues ?? [],
        lyrics?.phrases ?? [],
        TEAM.map((member) => member.name),
      ),
    [lyrics, song.castingCues],
  );

  // Per-phrase chars for the sung phrases, so the bob can target the line the team
  // is actually singing (not whatever else overlaps).
  const charsBySungPhrase = useMemo(() => {
    const map = new Map<number, CharDatum[]>();
    const chars = lyrics?.chars ?? [];
    for (const idxStr of Object.keys(song.singByPhrase ?? {})) {
      const idx = Number(idxStr);
      map.set(
        idx,
        chars.filter((char) => char.phraseIndex === idx),
      );
    }
    return map;
  }, [lyrics, song.singByPhrase]);

  /** One mesh handle per member. */
  const meshRefs = useRef<(Mesh | null)[]>([]);
  /** Per-member lifecycle phase. */
  const phaseRef = useRef<Phase[]>(TEAM.map(() => "hidden"));
  /** Per-member 0..1 twirl progress. */
  const twirlRef = useRef<number[]>(TEAM.map(() => 0));
  /** Per-member eased gain (drives bob/sway amplitude). */
  const gainRef = useRef<number[]>(TEAM.map(() => 0));

  useFrame((_, dt) => {
    const signals = signalsRef.current;
    if (!signals) return;
    const delta = Math.min(dt, 0.05);
    const pos = signals.pos;
    // Inside a lyric-free "la la la" window, the team bobs to the vocal amplitude
    // instead of to lyric syllables (there are none).
    const inAmp = (song.ampBobWindows ?? []).some(([start, end]) => pos >= start && pos < end);

    // Tempo-locked sway base — shared `swayCycles` keeps the team in sync with Miku.
    const tSec = pos * 0.001;
    const cycles = swayCycles(signals.beats, signals.beatPhase, tSec, BEATS_PER_SWAY, SWAY_FREQ_HZ);
    const swayBase = Math.sin(cycles * Math.PI * 2 + SWAY_PHASE);

    // Which sung phrase is active, who sings it, and its current-syllable bob.
    // Only these members bob; everyone else on stage just sways.
    let singers: Set<string> | null = null;
    let singBob = 0;
    const singByPhrase = song.singByPhrase;
    if (singByPhrase) {
      for (const phrase of lyrics?.phrases ?? []) {
        const phraseSingers = singByPhrase[phrase.index];
        if (phraseSingers && pos >= phrase.startTime && pos < phrase.endTime) {
          singers = new Set(phraseSingers);
          singBob = bobForSyllable(charsBySungPhrase.get(phrase.index) ?? [], pos);
          break;
        }
      }
    }

    for (let i = 0; i < TEAM.length; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      const name = TEAM[i].name;
      const homeY = ctrl[`${name}-y`] as number;

      // Cast right now?
      let present = false;
      for (const interval of presence[name]) {
        if (pos >= interval[0] && pos < interval[1]) {
          present = true;
          break;
        }
      }

      // Lifecycle edges.
      const phase = phaseRef.current[i];
      if (present && (phase === "hidden" || phase === "out")) {
        phaseRef.current[i] = "in";
        twirlRef.current[i] = 0;
        gainRef.current[i] = 0;
      } else if (!present && (phase === "active" || phase === "in")) {
        phaseRef.current[i] = "out";
        twirlRef.current[i] = 0;
      }

      const ph = phaseRef.current[i];
      if (ph === "hidden") {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;

      // ── Entrance / exit twirl: owns scale + Y-rotation, suppresses bob/sway ──
      if (ph === "in" || ph === "out") {
        const dur = ph === "in" ? ENTER_DURATION : EXIT_DURATION;
        twirlRef.current[i] += delta / dur;
        const t = Math.min(1, twirlRef.current[i]);
        const spin = smoothstep(t) * Math.PI * 2;
        if (ph === "in") {
          mesh.scale.setScalar(Math.max(0, easeOutBack(t))); // grow with a pop
          mesh.rotation.y = spin;
        } else {
          mesh.scale.setScalar(1 - smoothstep(t)); // shrink to nothing
          mesh.rotation.y = -spin;
        }
        mesh.rotation.z = 0;
        mesh.position.y = homeY;
        if (t >= 1) {
          if (ph === "in") {
            phaseRef.current[i] = "active";
            mesh.scale.setScalar(1);
            mesh.rotation.y = 0;
          } else {
            phaseRef.current[i] = "hidden";
            mesh.visible = false;
          }
        }
        continue;
      }

      // ── Active: sway always; bob only if this member sings the current line ──
      gainRef.current[i] += (1 - gainRef.current[i]) * Math.min(1, delta * CHORUS_GAIN_RATE);
      const gain = gainRef.current[i];
      const swayGain = CHORUS_SWAY_IDLE + (1 - CHORUS_SWAY_IDLE) * gain;
      // A sung LINE takes priority over the la-la ad-lib: while a line is active
      // (`singers != null`) only its singers bob (to syllables) and everyone else
      // sways; only when no line is active does the amp-bob window kick in.
      const bob = singers
        ? singers.has(name)
          ? singBob * gain
          : 0
        : inAmp
          ? signals.vocalBob * CHORUS_AMP_BOB_AMPLITUDE * gain
          : 0;
      mesh.scale.setScalar(1);
      mesh.rotation.y = 0;
      mesh.position.y = homeY + bob;
      mesh.rotation.z = swayBase * swayGain * CHORUS_SWAY_AMPLITUDE;
    }
  });

  return (
    <group>
      {TEAM.map((member, i) => {
        const tex = textures[i];
        tex.colorSpace = SRGBColorSpace;
        const x = ctrl[`${member.name}-x`] as number;
        const y = ctrl[`${member.name}-y`] as number;
        const z = ctrl[`${member.name}-z`] as number;
        const scale = ctrl[`${member.name}-scale`] as number;
        const h = scale;
        const w = h * SPRITE_ASPECT;
        return (
          <mesh
            key={member.name}
            ref={(mesh) => {
              meshRefs.current[i] = mesh;
            }}
            position={[x, y, z]}
            renderOrder={CHORUS_RENDER_ORDER}
            visible={false}
          >
            <planeGeometry args={[w, h]} />
            <meshPhongMaterial
              map={tex}
              color={tint}
              side={DoubleSide}
              {...PAPER_MATERIAL}
            />
          </mesh>
        );
      })}
    </group>
  );
}
