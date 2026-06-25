import { useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { folder, useControls } from "leva";
import { DoubleSide, SRGBColorSpace } from "three";
import type { Mesh, Texture } from "three";

import mikuHoldUrl from "../../art/MikuCutout/Miku Hold.png";
import mikuWaveUrl from "../../art/MikuCutout/Miku Wave.png";
import type { LyricData } from "../textalive/types";
import type { Signals } from "./Signals";
import type { SongConfig } from "./lyrics/types";

// Sprites are 4032 × 3024 (4:3) — Miku is cutout-centered with transparent
// surroundings, so the plane stays 4:3 and the alpha channel does the framing.
const SPRITE_ASPECT = 4032 / 3024;

// One entry per pose. To add a new pose: import the PNG, append it here,
// extend the `Pose` union and the leva dropdown options.
const POSES = {
  hold: mikuHoldUrl,
  wave: mikuWaveUrl,
} as const;

type Pose = keyof typeof POSES;

// ── Animation tuning ─────────────────────────────────────────────────────────
/** Base bob (world units, Y). Each char's actual height = this × heightFactor(dur). */
const BOB_AMPLITUDE = 0.2;
/** Max sway angle (radians) when she's singing fully. */
const SWAY_AMPLITUDE = 0.1;
/** Sway frequency (Hz). Sway is a slow continuous sine — locking it to a
 *  segment caused snaps at boundaries, this never does. */
const SWAY_FREQ_HZ = 0.2;
/** Idle motion amplitude during instrumentals (0..1). Keeps her gently alive
 *  rather than freezing between phrases. */
const IDLE_GAIN = 0.25;
/** How fast the singing/idle gain envelope ramps. Symmetric — same speed in
 *  and out — because the transitions are slow anyway (gated by phrase activity). */
const GAIN_RATE = 2.5;
/** How long the chorus-entry spin takes, in seconds. */
const SPIN_DURATION = 0.8;

// --- Bob pulse shape ---------------------------------------------------------
/** Fixed rise/fall portion of every char's bob, in ms. Hold fills the rest.
 *  For chars shorter than 2× this, rise+fall consume the whole duration and
 *  there's no flat hold (pure triangular blip). */
const BOB_RISE_FALL_MS = 80;
/** Char duration (ms) that maps to a height factor of 1.0. Shorter chars get
 *  proportionally smaller bobs, longer chars get proportionally taller ones. */
const BOB_HEIGHT_NORMAL_MS = 500;
/** Min/max clamp on heightFactor. Floor keeps very short chars visible at all;
 *  ceiling keeps very long held notes from launching her off-screen. */
const BOB_MIN_HEIGHT_FACTOR = 0.5;
const BOB_MAX_HEIGHT_FACTOR = 1.5;

/** Smoothstep ease (Hermite). */
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/**
 * Pulse shape across one character's [0, 1] phase:
 * smoothly rises to 1 in {@link BOB_RISE_FALL_MS}, holds at 1, falls back to 0
 * in another {@link BOB_RISE_FALL_MS}. Returns 0 at both endpoints, guaranteeing
 * smooth continuity into and out of any neighbouring char or gap.
 */
export function pulseShape(phase: number, durationMs: number): number {
  const rfFrac = Math.min(0.4, BOB_RISE_FALL_MS / Math.max(1, durationMs));
  if (phase < rfFrac) return smoothstep(phase / rfFrac);
  if (phase > 1 - rfFrac) return smoothstep((1 - phase) / rfFrac);
  return 1.0;
}

/** Linearly map char duration to a height multiplier, clamped. */
export function heightFactor(durationMs: number): number {
  const f = durationMs / BOB_HEIGHT_NORMAL_MS;
  return Math.max(BOB_MIN_HEIGHT_FACTOR, Math.min(BOB_MAX_HEIGHT_FACTOR, f));
}

interface Props {
  signalsRef: RefObject<Signals>;
  /** Computed lyric data — Miku reads `lyrics.chars` for per-character bob timing.
   *  These timings reflect any per-song corrections (chorus overrides etc.) that
   *  the lyric display also uses, so her bob stays in sync with the visible text. */
  lyrics: LyricData | null;
  /** Song config — supplies `chorusVoicePhrases` (the pink lines). Miku sings the
   *  main vocal, so she skips her bob on those; the on-stage chorus characters
   *  take them instead. */
  song: SongConfig;
}

/**
 * Miku sprite on stage.
 *
 * Renders a single billboard plane textured with one of the pose PNGs. Pose
 * selection + base transform are exposed via a leva folder so the artist can
 * place her live, then copy the chosen defaults back into this file.
 *
 * ### Animation
 *
 * Two per-frame motions sit on top of the leva-tuned base pose:
 *
 * - **Bob** (Y position): one **pulse per character**. Each pulse rises in
 *   {@link BOB_RISE_FALL_MS}, holds at peak for whatever time is left, then
 *   falls in another {@link BOB_RISE_FALL_MS} — so a long held note shows a
 *   visible *hold* at the top, while a quick syllable is just a brief blip.
 *   The pulse's height also scales linearly with char duration (longer note =
 *   taller bob, clamped to [{@link BOB_MIN_HEIGHT_FACTOR},
 *   {@link BOB_MAX_HEIGHT_FACTOR}]). Pulses naturally start and end at 0, so
 *   neighbouring chars and inter-word gaps both transition with no snap.
 *   Reads timings from the *corrected* {@link LyricData.chars} so it stays in
 *   sync with the visible lyric text even during chorus-override sections.
 * - **Sway** (Z tilt): slow continuous sine, deliberately not segment-locked
 *   so it never snaps and gives a second voice of motion outside the bob's
 *   per-character pulses.
 * - **Gain envelope** ramps amplitude up when a phrase is active and down
 *   toward {@link IDLE_GAIN} during instrumental gaps. The sway uses this so
 *   she still gently moves between lyrics; the bob is naturally quiet outside
 *   chars (pulse returns 0 with no active char) so the envelope is mostly for
 *   the sway.
 * - **Spin**: A full 360° **Y-axis** twirl (ballerina-style, around her
 *   vertical body axis) triggered the moment {@link Signals.chorus} flips from
 *   `false → true`. Reads as "end of the verse, here comes the chorus." The
 *   material is rendered {@link DoubleSide} so the back-half of the rotation
 *   isn't invisible — Miku appears mirrored from behind, which works because
 *   her pose is roughly symmetric. While the spin is in progress the wiggle's
 *   rotation/position are clamped to base so the two animations don't fight.
 *
 * Sits in scene-Z between the stage floor (z=-15) and the proscenium frame
 * (z=-8) by default. Render order 1.8 — behind the curtains (1.9) and the
 * proscenium frame (2), but in front of the background / stage floor (1). So a
 * closed curtain fully hides her, and when it parts she's revealed framed by
 * the proscenium opening.
 */
export function Miku({ signalsRef, lyrics, song }: Props) {
  const textures = useTexture(Object.values(POSES)) as Texture[];
  const poseUrls = Object.values(POSES);

  // Phrases the chorus voices sing (the pink lines). Miku skips her bob on these
  // so the on-stage chorus characters are clearly the ones singing them.
  const chorusVoiceSet = useMemo(
    () => new Set(song.chorusVoicePhrases ?? []),
    [song.chorusVoicePhrases],
  );

  const { pose, x, y, z, scale, tint } = useControls("Miku", {
    pose: { value: "hold" as Pose, options: Object.keys(POSES) as Pose[] },
    transform: folder(
      {
        x: { value: 0.5, min: -10, max: 10, step: 0.05 },
        y: { value: -0.25, min: -8, max: 8, step: 0.05 },
        z: { value: -15, min: -15, max: -2, step: 0.1 },
        scale: { value: 9, min: 0.5, max: 12, step: 0.05 },
      },
      { collapsed: false },
    ),
    // Defaults to the theater tint so she blends into the same moody palette;
    // the spotlight then brightens her on stage. Pick a lighter colour here if
    // you want her to stand out even outside the spotlight.
    tint: { value: "#3d3947" },
  });

  const tex = textures[poseUrls.indexOf(POSES[pose])];
  tex.colorSpace = SRGBColorSpace;

  const h = scale;
  const w = h * SPRITE_ASPECT;

  // --- Animation state (refs survive renders without re-triggering useFrame) ---
  const meshRef = useRef<Mesh>(null);
  /** Latched chorus state from last frame, for false→true transition detection. */
  const prevChorusRef = useRef(false);
  /** Spin progress in [0, 1]; -1 means "not currently spinning." */
  const spinProgressRef = useRef(-1);
  /** Eased "singing vs idle" gain. Targets 1.0 when a phrase is active,
   *  {@link IDLE_GAIN} otherwise. Smoothed so transitions glide. */
  const gainRef = useRef(IDLE_GAIN);
  /** Hint for the current-char search. The search walks forward from here each
   *  frame, so during normal playback it's O(1). Resets to 0 on backward seek. */
  const charIdxRef = useRef(0);

  useFrame((_, dt) => {
    const mesh = meshRef.current;
    const s = signalsRef.current;
    if (!mesh || !s) return;

    // Verse → chorus transition arms a fresh spin (unless one is already running).
    if (s.chorus && !prevChorusRef.current && spinProgressRef.current < 0) {
      spinProgressRef.current = 0;
    }
    prevChorusRef.current = s.chorus;

    if (spinProgressRef.current >= 0) {
      // Spin owns the pose entirely: drive rotation.y 0 → 2π and clamp the
      // wiggle channels (rotation.z, position.y) so the two don't blend.
      spinProgressRef.current += dt / SPIN_DURATION;
      const t = Math.min(1, spinProgressRef.current);
      const eased = t * t * (3 - 2 * t); // smoothstep
      mesh.rotation.y = eased * Math.PI * 2;
      mesh.rotation.z = 0;
      mesh.position.y = y;
      if (spinProgressRef.current >= 1) {
        spinProgressRef.current = -1;
        mesh.rotation.y = 0;
      }
    } else {
      // Ease the singing-vs-idle gain. Full when a phrase is active, falls
      // toward IDLE_GAIN during instrumental gaps so she doesn't freeze.
      const gainTarget = s.phrasePhase >= 0 ? 1 : IDLE_GAIN;
      gainRef.current += (gainTarget - gainRef.current) * Math.min(1, dt * GAIN_RATE);
      const gain = gainRef.current;

      const tSec = s.pos * 0.001;

      // BOB — find the current character and emit a self-contained pulse for
      // its duration. The pulse rises in BOB_RISE_FALL_MS, holds at peak for
      // the middle, falls in another BOB_RISE_FALL_MS — so long held notes
      // visibly *hold* at the top while quick syllables read as brief blips.
      // Pulse value is 0 at both endpoints, so there's no snap into or out of
      // gaps between chars / words. Outside any char she sits at bob = 0
      // (gentle sway alone keeps her alive — see below).
      let bob = 0;
      const chars = lyrics?.chars;
      if (chars && chars.length > 0) {
        // Walk the index hint forward to the char whose window contains s.pos
        // (or the latest one that starts at or before it). Reset to 0 if we
        // detect a backward seek past the hint.
        let idx = charIdxRef.current;
        if (idx >= chars.length || chars[idx].charStart > s.pos) idx = 0;
        while (idx + 1 < chars.length && chars[idx + 1].charStart <= s.pos) idx++;
        charIdxRef.current = idx;
        const c = chars[idx];
        // Skip the chorus voices' lines (pink) — those are the team's to sing.
        if (s.pos >= c.charStart && s.pos < c.charEnd && !chorusVoiceSet.has(c.phraseIndex)) {
          const durationMs = c.charEnd - c.charStart;
          const phase = (s.pos - c.charStart) / Math.max(1, durationMs);
          bob = pulseShape(phase, durationMs) * heightFactor(durationMs) * gain * BOB_AMPLITUDE;
        }
      }

      // SWAY — slow free-running sine on the song clock. Deliberately not
      // locked to any lyric segment so it stays continuous; gives a second
      // voice of motion outside the bob's per-character pulses and keeps her
      // visibly alive during instrumentals (where bob is naturally 0).
      const sway = Math.sin(tSec * Math.PI * 2 * SWAY_FREQ_HZ + 1.0) * gain * SWAY_AMPLITUDE;

      mesh.position.y = y + bob;
      mesh.rotation.z = sway;
    }
  });

  return (
    <mesh ref={meshRef} position={[x, y, z]} renderOrder={1.8}>
      <planeGeometry args={[w, h]} />
      <meshPhongMaterial
        map={tex}
        transparent
        depthTest={false}
        depthWrite={false}
        color={tint}
        toneMapped={false}
        shininess={0}
        // Both sides rendered so the spin (rotation.y) doesn't go invisible
        // for half its travel. Miku appears mirrored from behind, which is
        // fine — her pose is roughly symmetric.
        side={DoubleSide}
      />
    </mesh>
  );
}
