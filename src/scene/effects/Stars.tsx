import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useControls } from "leva";
import { Color, Matrix4, MeshBasicMaterial, Quaternion, Shape, ShapeGeometry, Vector3 } from "three";
import type { InstancedMesh } from "three";
import { CAMERA_DISTANCE_Z } from "../stageMetrics";
import type { Signals } from "../Signals";

// How many stars in the shower. Fixed (an InstancedMesh is allocated for this
// count); it only updates while the shower is running, so it's free otherwise.
const COUNT = 40;

// ── When the shower happens ──────────────────────────────────────────────────
// Fired at a fixed song position rather than the fuzzy climax signal, so it lands
// exactly on the intended line.
//   3:02 — "この世界を果てまで探そうとも"
const STAR_START_MS = 182_000;
/** Seconds that new stars keep entering from the top. The shower stays on screen
 *  for roughly this plus a short tail while the last stars fall out — ~10 s at
 *  the default fall speed. This is the "how long does it last" knob. */
const STAR_EMIT_SECONDS = 8;

const CAM_Z = CAMERA_DISTANCE_Z; // sizes the spawn width per depth (shared camera z)
// Depth slab the stars fall through — a WIDE z spread (from behind the seats out
// to close to the camera) so perspective makes near stars clearly bigger and
// faster than far ones. That parallax is what stops the field reading as a flat
// 2D sheet pasted over the screen.
const Z_NEAR = 5; // nearest stars (closest to the camera)
const Z_FAR = -3; // farthest stars (back around the seats / stage)
// World-Y where a star enters (above the visible frame at every depth) and where
// it has fully exited (below the frame). Stars APPEAR by sliding in from the top
// and DISAPPEAR by falling past the bottom — no fading.
const SPAWN_TOP = 6;
const SPAWN_BOTTOM = -7;
const Z_AXIS = new Vector3(0, 0, 1); // stars are camera-facing; they spin about it
/** Opacity while the shower runs — kept under 1 so the confetti stays airy and
 *  doesn't compete with the lyrics. Constant (no fade); appearance/disappearance
 *  is positional (enter top / exit bottom). */
const MAX_OPACITY = 0.9;

// Warm gold + white confetti, with a couple of Miku-palette accents. Bright +
// `toneMapped: false` so the Bloom pass makes them sparkle.
const STAR_COLORS = ["#ffd966", "#fff3c4", "#ffffff", "#86cecb", "#ffb7c5"];

/** A flat five-point star centred on the origin, ~1 unit across at scale 1. */
function makeStarGeometry(outer = 0.5, inner = 0.22, spikes = 5): ShapeGeometry {
  const shape = new Shape();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  shape.closePath();
  return new ShapeGeometry(shape);
}

interface StarState {
  /** -0.5..0.5; remapped away from the centre, then scaled by per-depth width. */
  baseX: number;
  z: number;
  /** Per-star fall-speed multiplier. */
  fall: number;
  swayAmp: number;
  swayFreq: number;
  swayPhase: number;
  spinSpeed: number;
  scale: number;
  color: string;
  /** Mutable current state (reset each time the shower starts). */
  y: number;
  spin: number;
}

interface Props {
  signalsRef: RefObject<Signals>;
}

/**
 * Falling-star confetti for the song's climax line.
 *
 * Fires once when playback reaches {@link STAR_START_MS} (3:02 — "この世界を果てま
 * で探そうとも"): for {@link STAR_EMIT_SECONDS} the field rains confetti that
 * cascades in from above the top of the frame, falls down across a wide depth
 * slab — near stars bigger + faster than far ones, for real parallax — and exits
 * past the bottom (recycling to the top while the shower is on). After the window
 * the stars stop being replenished and fall out, so the whole thing lasts ~10 s
 * and ends cleanly without a fade.
 *
 * Stars are biased away from the centre column (the `center gap` control) so they
 * don't sit over the lyrics, drawn *behind* the lyric glyphs, and **frozen while
 * playback is paused**. Tune via the "Stars (climax)" leva folder; `test` loops
 * the shower so you can preview it without seeking to the cue.
 */
export function Stars({ signalsRef }: Props) {
  const meshRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => makeStarGeometry(), []);
  const material = useMemo(
    () => new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }),
    [],
  );

  const { test, fallSpeed, size, spawnWidth, middleGap } = useControls("Stars (climax)", {
    test: { value: false, label: "test (loop preview)" },
    fallSpeed: { value: 3.5, min: 0.5, max: 12, step: 0.1, label: "fall speed" },
    size: { value: 0.45, min: 0.1, max: 3, step: 0.05 },
    spawnWidth: { value: 18, min: 4, max: 36, step: 0.5, label: "spread" },
    middleGap: { value: 0.4, min: 0, max: 0.8, step: 0.05, label: "center gap" },
  });

  // Per-instance state, generated once.
  const stars = useMemo<StarState[]>(() => {
    const arr: StarState[] = [];
    for (let i = 0; i < COUNT; i++) {
      const z = Z_FAR + Math.random() * (Z_NEAR - Z_FAR);
      // 0 (farthest) → 1 (nearest). Bias world size toward the near stars so size
      // *correlates with depth* instead of being random noise that flattens the
      // perspective cue — this is the main thing that makes the field read 3D.
      const depthT = (z - Z_FAR) / (Z_NEAR - Z_FAR);
      arr.push({
        baseX: Math.random() - 0.5,
        z,
        fall: 0.8 + Math.random() * 0.7,
        swayAmp: 0.2 + Math.random() * 0.6,
        swayFreq: 0.5 + Math.random() * 1.2,
        swayPhase: Math.random() * Math.PI * 2,
        spinSpeed: (Math.random() - 0.5) * 4,
        scale: (0.55 + depthT * 0.85) * (0.85 + Math.random() * 0.3),
        color: STAR_COLORS[(Math.random() * STAR_COLORS.length) | 0],
        y: SPAWN_TOP,
        spin: 0,
      });
    }
    return arr;
  }, []);

  // Per-instance colours, set once after mount.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const c = new Color();
    for (let i = 0; i < COUNT; i++) mesh.setColorAt(i, c.set(stars[i].color));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [stars]);

  // Scratch objects reused each frame (no per-frame allocation).
  const m4 = useMemo(() => new Matrix4(), []);
  const q = useMemo(() => new Quaternion(), []);
  const pos = useMemo(() => new Vector3(), []);
  const scl = useMemo(() => new Vector3(), []);
  /** Seconds into the current shower, or < 0 when none is running. */
  const burstRef = useRef(-1);
  /** Last frame's song position, to detect the forward crossing of the cue. */
  const prevPosRef = useRef(0);

  useFrame((_, dt) => {
    const mesh = meshRef.current;
    const signals = signalsRef.current;
    if (!mesh || !signals) return;

    // Start the shower when playback crosses the cue (and not via a big seek that
    // lands well past it). `test` loops it so the leva preview keeps replaying.
    const crossedCue =
      prevPosRef.current < STAR_START_MS &&
      signals.pos >= STAR_START_MS &&
      signals.pos < STAR_START_MS + 1500;
    prevPosRef.current = signals.pos;
    if (crossedCue || (test && burstRef.current < 0)) {
      burstRef.current = 0;
      for (const star of stars) {
        // Stagger initial Y ABOVE the top so the field cascades IN over the first
        // fall, rather than appearing mid-screen.
        star.y = SPAWN_TOP + Math.random() * (SPAWN_TOP - SPAWN_BOTTOM);
        star.spin = Math.random() * Math.PI * 2;
      }
    }

    if (burstRef.current < 0) {
      mesh.visible = false; // no shower running — dormant, no matrix work
      return;
    }
    mesh.visible = true;
    material.opacity = MAX_OPACITY;

    // Advance the shower clock — frozen while paused (test forces motion so the
    // preview still plays). All motion derives from `d`, so a pause holds the
    // whole shower still (fall, spin, and sway alike).
    const moving = test || signals.playing;
    const delta = moving ? Math.min(dt, 0.05) : 0;
    const elapsed = (burstRef.current += delta);
    const emitting = elapsed < STAR_EMIT_SECONDS;

    const half = middleGap * 0.5; // central baseX band to keep clear of stars
    const fallSpan = SPAWN_TOP - SPAWN_BOTTOM;
    let active = emitting; // still emitting ⇒ definitely active
    for (let i = 0; i < COUNT; i++) {
      const star = stars[i];
      star.y -= fallSpeed * star.fall * delta;
      // Recycle to the top while the shower is on; once emission stops, let the
      // straggler fall out and stay gone so the field thins to nothing.
      if (star.y < SPAWN_BOTTOM && emitting) star.y += fallSpan;
      if (star.y > SPAWN_BOTTOM) active = true;
      star.spin += star.spinSpeed * delta;

      // Remap baseX away from the centre so stars straddle the lyric column.
      // Because per-depth width and screen size both scale with distance, this
      // leaves a consistent central screen gap at every depth.
      const sign = star.baseX >= 0 ? 1 : -1;
      const mag = half + (Math.abs(star.baseX) / 0.5) * (0.5 - half);
      const xRange = spawnWidth * ((CAM_Z - star.z) / (CAM_Z - Z_FAR));
      const x = sign * mag * xRange + Math.sin(elapsed * star.swayFreq + star.swayPhase) * star.swayAmp;

      pos.set(x, star.y, star.z);
      q.setFromAxisAngle(Z_AXIS, star.spin);
      scl.setScalar(star.scale * size);
      m4.compose(pos, q, scl);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;

    if (!active) burstRef.current = -1; // emission ended and all stars cleared
  });

  // renderOrder 9 + depthTest off → drawn on top of the whole theater (seats are
  // 3) but BEHIND the lyric glyphs (renderOrder 10), so the confetti never sits
  // over the text the viewer is reading.
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, COUNT]}
      renderOrder={9}
      frustumCulled={false}
    />
  );
}
