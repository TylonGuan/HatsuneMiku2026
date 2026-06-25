import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { folder, useControls } from "leva";
import { Object3D } from "three";
import type { SpotLight as ThreeSpotLight } from "three";
import type { Signals } from "./Signals";

/**
 * Three.js render-layer index that the background lights illuminate.
 *
 * `Theater.tsx` enables this layer on the meshes that should receive background
 * lighting (the `backgroundMedieval` painting). Every other mesh stays on layer
 * 0 only, so these spotlights cannot touch the theater frame, seats, Miku, or
 * the lyrics — even though they sit in the same scene.
 *
 * Lights work the same way: setting a light's `.layers.set(1)` means it
 * illuminates ONLY meshes that have layer 1 enabled. Meshes still need layer 0
 * enabled for the main camera to render them — `layers.enable(1)` is additive,
 * it doesn't replace the default.
 */
export const BACKGROUND_LIGHT_LAYER = 1;

/** Seconds for the background lights to fade out when the song finishes. */
const FADE_OUT_SECONDS = 2.0;

/**
 * A pair of stage-wash spotlights aimed at the background painting from
 * **behind the theater proscenium** but **in front of the back-wall plane**.
 *
 * Default placement:
 * - Sources at `(±xOffset, sourceY, sourceZ)` — above and slightly inset of
 *   the theater frame's depth (`frame` is at z=-8, stage floor at z=-15;
 *   default source z=-17 sits just behind both).
 * - Targets at `(±targetXOffset, targetY, targetZ)` — landing on the left
 *   and right halves of the background painting at z=-20.
 *
 * Both lights are constrained to {@link BACKGROUND_LIGHT_LAYER} so they only
 * touch opted-in meshes. Everything else in the scene is rendered through
 * the main camera (layer 0) and is unaffected.
 *
 * Tune via the "Background lights" leva folder.
 */
interface Props {
  signalsRef: RefObject<Signals>;
}

export function BackgroundLight({ signalsRef }: Props) {
  /** Aim points — three.js SpotLight semantics require a separate Object3D. */
  const targetLeft = useMemo(() => new Object3D(), []);
  const targetRight = useMemo(() => new Object3D(), []);
  /** Light refs so we can pin their render layer once on mount. */
  const lightLeftRef = useRef<ThreeSpotLight>(null);
  const lightRightRef = useRef<ThreeSpotLight>(null);
  /** 0..1 brightness multiplier; drops to 0 when the song ends (blackout). */
  const fadeRef = useRef(1);
  /** Camera — its layer mask must intersect the lights' layer mask, otherwise
   *  three.js's `WebGLRenderer.projectObject` skips the lights entirely (they
   *  never get added to the renderer's per-mesh light list). Default camera
   *  is on layer 0; we enable layer 1 below so the bg lights participate. */
  const { camera } = useThree();

  const {
    xOffset,
    sourceY,
    sourceZ,
    targetXOffset,
    targetY,
    targetZ,
    angleDeg,
    penumbra,
    distance,
    decay,
    intensity,
    color,
  } = useControls("Background lights", {
    // Mirrored placement: both lights share Y/Z; X is ±xOffset.
    source: folder(
      { 
        xOffset: { value: 14, min: 0, max: 25, step: 0.1, label: "±x offset" },
        sourceY: { value: 17, min: -5, max: 25, step: 0.1, label: "y" },
        sourceZ: { value: -9, min: -25, max: -2, step: 0.1, label: "z" },
      },
      { collapsed: false },
    ),
    target: folder(
      {
        targetXOffset: { value: 8, min: -10, max: 25, step: 0.1, label: "±x offset" },
        targetY: { value: 3, min: -10, max: 25, step: 0.1, label: "y" },
        targetZ: { value: -20, min: -40, max: -5, step: 0.1, label: "z" },
      },
      { collapsed: false },
    ),
    cone: folder(
      {
        angleDeg: { value: 30, min: 1, max: 70, step: 1 },
        penumbra: { value: 0.6, min: 0, max: 1, step: 0.01 },
        distance: { value: 35, min: 1, max: 100, step: 1 },
        decay: { value: 0.5, min: 0, max: 2, step: 0.05 },
      },
      { collapsed: true },
    ),
    // Shared by both lights so symmetry is preserved.
    intensity: { value: 30, min: 0, max: 30, step: 0.1 },
    // Warm-white default ≈ tungsten. Cool/cyan reads as moonlight.
    color: { value: "#ffe4c4" },
  });

  // Re-aim the targets whenever the leva sliders change. The Object3Ds are
  // mounted via `<primitive>` below so their world matrices update each frame.
  useEffect(() => {
    targetLeft.position.set(-targetXOffset, targetY, targetZ);
    targetLeft.updateMatrixWorld();
    targetRight.position.set(+targetXOffset, targetY, targetZ);
    targetRight.updateMatrixWorld();
  }, [targetLeft, targetRight, targetXOffset, targetY, targetZ]);

  // Pin each light to the background-only render layer, AND enable that same
  // layer on the camera. The camera step is non-obvious but critical: three.js's
  // `WebGLRenderer.projectObject` filters lights by camera layers — a light on
  // a channel the camera doesn't share is dropped before reaching the renderer's
  // per-mesh lighting setup, so it never illuminates anything (even meshes that
  // also have that layer enabled). Enabling the layer on the camera doesn't
  // change which meshes get rendered, since meshes still need to share at least
  // one channel with the camera and they all retain layer 0.
  useEffect(() => {
    camera.layers.enable(BACKGROUND_LIGHT_LAYER);
    lightLeftRef.current?.layers.set(BACKGROUND_LIGHT_LAYER);
    lightRightRef.current?.layers.set(BACKGROUND_LIGHT_LAYER);
  }, [camera]);

  // Fade the lights to black when the song ends, back up on a fresh play. The
  // intensity prop below seeds the initial value; this drives it each frame.
  useFrame((_, dt) => {
    const target = signalsRef.current?.ended ? 0 : 1;
    const dir = Math.sign(target - fadeRef.current);
    fadeRef.current = Math.min(1, Math.max(0, fadeRef.current + (dir * dt) / FADE_OUT_SECONDS));
    const lit = intensity * fadeRef.current;
    if (lightLeftRef.current) lightLeftRef.current.intensity = lit;
    if (lightRightRef.current) lightRightRef.current.intensity = lit;
  });

  return (
    <>
      <primitive object={targetLeft} />
      <primitive object={targetRight} />
      <spotLight
        ref={lightLeftRef}
        position={[-xOffset, sourceY, sourceZ]}
        target={targetLeft}
        angle={(angleDeg * Math.PI) / 180}
        penumbra={penumbra}
        distance={distance}
        decay={decay}
        intensity={intensity}
        color={color}
      />
      <spotLight
        ref={lightRightRef}
        position={[+xOffset, sourceY, sourceZ]}
        target={targetRight}
        angle={(angleDeg * Math.PI) / 180}
        penumbra={penumbra}
        distance={distance}
        decay={decay}
        intensity={intensity}
        color={color}
      />
    </>
  );
}
