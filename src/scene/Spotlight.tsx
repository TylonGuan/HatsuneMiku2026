import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { folder, useControls } from "leva";
import { Object3D } from "three";
import type { SpotLight as ThreeSpotLight } from "three";
import { easeOutCubic } from "./ease";
import type { Signals } from "./Signals";

/** Seconds for the spotlight to fade from black to full intensity on first play. */
const FADE_IN_SECONDS = 2.5;
/** Seconds for the spotlight to fade back out when the song finishes. */
const FADE_OUT_SECONDS = 2.0;

/**
 * Stage spotlight — a real three.js {@link SpotLight} positioned **behind and
 * above the camera**, aimed at the stage.
 *
 * ### Why behind + above
 *
 * Our theater is built from camera-facing planes; their surface normals point
 * +Z (toward the viewer). A spotlight directed straight down would hit those
 * normals at ~90° and produce zero diffuse illumination. By placing the lamp
 * behind/above the audience and aiming it at the stage, the light direction is
 * roughly co-axial with the plane normals (dot ≈ 0.9), so the painted layers
 * actually receive the light. The spotlight's **cone** still does the spatial
 * selection — only the centre of the stage falls inside the beam.
 *
 * ### Target plumbing
 *
 * SpotLight aims at a separate {@link Object3D} (`light.target`). We create
 * one via {@link useMemo}, mount it with `<primitive>` so it's in the scene
 * graph (matrices update each frame), and re-position it from the leva sliders.
 *
 * ### Fade-in
 *
 * The lamp starts at intensity 0 (dark theater). The first time playback ever
 * begins ({@link Signals.playing} flips true), we ease from 0 → user's
 * intensity slider value over {@link FADE_IN_SECONDS} with an `easeOutCubic`.
 * It stays up through mid-song pauses — pause does *not* fade it back out,
 * because blinking the spotlight every time the user pauses would be jarring.
 * When the song *finishes* ({@link Signals.ended}) it fades back down to black
 * over {@link FADE_OUT_SECONDS} for a "show's over" blackout; a fresh play
 * (which clears `ended`) fades it up again.
 */
interface Props {
  signalsRef: RefObject<Signals>;
}

export function Spotlight({ signalsRef }: Props) {
  /** Aim point — separate Object3D required by three.js SpotLight semantics. */
  const target = useMemo(() => new Object3D(), []);
  /** Imperative handle to the three.js light so we can mutate intensity per-frame. */
  const lightRef = useRef<ThreeSpotLight>(null);
  /** Sticky "playback has ever started" flag — set once, never cleared. */
  const hasStartedRef = useRef(false);
  /** Linear fade progress 0..1; the eased curve is derived from this each frame. */
  const fadeRef = useRef(0);

  const {
    lightX,
    lightY,
    lightZ,
    targetX,
    targetY,
    targetZ,
    angleDeg,
    penumbra,
    distance,
    decay,
    intensity,
    color,
  } = useControls("Spotlight", {
    // Lamp position. Default: above and behind the camera (camera is at z=8),
    // angled forward-and-down toward the stage.
    source: folder(
      {
        lightX: { value: -2.6, min: -20, max: 20, step: 0.1 },
        lightY: { value: 11.1, min: 0, max: 30, step: 0.1 },
        lightZ: { value: 25.4, min: -10, max: 30, step: 0.1 },
      },
      { collapsed: false },
    ),
    // What the beam aims at. Default: stage centre, slightly above the floor.
    target: folder(
      {
        targetX: { value: 0.6, min: -15, max: 15, step: 0.1 },
        targetY: { value: 1, min: -10, max: 10, step: 0.1 },
        targetZ: { value: -20, min: -20, max: 0, step: 0.1 },
      },
      { collapsed: false },
    ),
    // Cone shape. `angle` is the cone *half*-angle (degrees here, converted to
    // radians on the way into three.js). `penumbra` softens the edge (0 = hard).
    // `decay` controls falloff with distance: 0 = none, 1 = linear, 2 = inverse-square.
    cone: folder(
      {
        angleDeg: { value: 11, min: 1, max: 70, step: 1 },
        penumbra: { value: 0.66, min: 0, max: 1, step: 0.01 },
        distance: { value: 82, min: 1, max: 100, step: 1 },
        decay: { value: 0.3, min: 0, max: 2, step: 0.05 },
      },
      { collapsed: true },
    ),
    // Master brightness. Non-physical units (we don't enable physicallyCorrectLights);
    // 1 is subtle, 5 is a clear hot-spot, 10+ is dramatic.
    intensity: { value: 30, min: 0, max: 30, step: 0.1 },
    // Slight warmth = tungsten lamp; push toward cyan to match Miku's palette.
    color: { value: "#fff1d6" },
  });

  // Re-position the aim point whenever the leva slider changes.
  useEffect(() => {
    target.position.set(targetX, targetY, targetZ);
    target.updateMatrixWorld();
  }, [target, targetX, targetY, targetZ]);

  // Per-frame: advance the fade and drive the live intensity. We mutate the
  // light directly (vs. a re-render per frame) so this stays cheap.
  useFrame((_, dt) => {
    const s = signalsRef.current;
    if (s?.playing) hasStartedRef.current = true;
    // Lit while the show is running; dark before first play and after the song
    // ends. Fade in/out use different durations, so pick the rate by direction.
    const target = hasStartedRef.current && !s?.ended ? 1 : 0;
    const rate = target > fadeRef.current ? FADE_IN_SECONDS : FADE_OUT_SECONDS;
    const dir = Math.sign(target - fadeRef.current);
    fadeRef.current = Math.min(1, Math.max(0, fadeRef.current + (dir * dt) / rate));
    const eased = easeOutCubic(fadeRef.current);
    if (lightRef.current) lightRef.current.intensity = intensity * eased;
  });

  return (
    <>
      <primitive object={target} />
      <spotLight
        ref={lightRef}
        position={[lightX, lightY, lightZ]}
        target={target}
        angle={(angleDeg * Math.PI) / 180}
        penumbra={penumbra}
        distance={distance}
        decay={decay}
        // Initial = 0 so the dark theater isn't lit before first play; the
        // useFrame above drives the actual value once playback begins.
        intensity={0}
        color={color}
      />
    </>
  );
}
