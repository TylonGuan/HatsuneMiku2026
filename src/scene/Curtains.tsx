import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useControls } from "leva";
import { useRef } from "react";
import type { RefObject } from "react";
import { SRGBColorSpace } from "three";
import type { Mesh, Texture } from "three";

import curtainLeftUrl from "../../art/Scene1/Curtains L.png";
import curtainRightUrl from "../../art/Scene1/Curtains R.png";
import { easeInOutCubic } from "./ease";
import { PAPER_MATERIAL, SPRITE_ASPECT, STAGE_TINT } from "./sketch";
import type { Signals } from "./Signals";

// Both curtains are the same transparent cutout PNG size (4:3, see SPRITE_ASPECT),
// each drawn to fit the stage opening of the theater cutout (the left drape on one
// canvas, the right on the other). Sized at their native aspect — NOT stretched to
// cover the whole camera frame — so they match the opening rather than the theater.

const CAMERA_BASE_Z = 7; // keep in sync with CameraRig / Theater

// Plane-sizing reference — fixed FOV so the curtains don't shrink with the
// viewport (mirrors Theater.tsx). `scale` below is expressed as a fraction of
// this reference frame's height at the curtain's depth.
const REFERENCE_FOV_DEG = 55;

// ── Open / close motion ──────────────────────────────────────────────────────
// Seconds for a full part or close. A linear timeline advances at this rate and
// is eased through `easeInOutCubic` so the curtains accelerate off the centre and
// settle gently at the sides — and reverse cleanly if the state flips mid-slide.
const SLIDE_SECONDS = 1.8;

// Size a curtain plane at its native aspect: `scale` is the plane height as a
// fraction of the camera frame height at `distance`. Width follows SPRITE_ASPECT.
// Both curtains share this (identical PNGs), so symmetry is automatic.
function curtainSize(distance: number, scale: number, vFovRad: number): [number, number] {
  const frameH = 2 * distance * Math.tan(vFovRad / 2);
  const h = frameH * scale;
  return [h * SPRITE_ASPECT, h];
}

interface Props {
  signalsRef: RefObject<Signals>;
}

/**
 * Stage curtains — a left and right hand-drawn drape that part when the song
 * starts and draw closed again when it ends.
 *
 * ### Depth & paint order
 *
 * The curtains sit at `z` (default −10), between the stage floor (z=−15) and the
 * proscenium frame (z=−8), with `renderOrder` 1.9 — above Miku (1.8) so a closed
 * curtain hides her, but below the proscenium frame (2) so a parted curtain
 * tucks behind the frame's side pillars and "hides behind the theater." (Like
 * the other theater planes they use `depthTest=false` and rely purely on
 * `renderOrder`.)
 *
 * ### Lifecycle (driven by {@link Signals})
 *
 * - Before the first play, and after the song ends → **closed** (open = 0).
 * - Once playback has *ever* started → slide **open** (open = 1).
 * - When `signals.ended` flips true → slide **closed** again, returning the
 *   stage to exactly its opening look. A fresh play clears `ended` and reopens.
 *
 * Arrange the art with the "Curtains" leva folder: shared `scale` (both PNGs are
 * the same size) and `y`, per-side `x` to set the closed seam, plus `z` and
 * `open distance`.
 */
export function Curtains({ signalsRef }: Props) {
  const [texLeft, texRight] = useTexture([curtainLeftUrl, curtainRightUrl]) as Texture[];
  texLeft.colorSpace = SRGBColorSpace;
  texRight.colorSpace = SRGBColorSpace;

  const { z, scale, y, xL, xR, openDistance } = useControls("Curtains", {
    // Shared size: both drapes are the same PNG, so one scale keeps them equal.
    // Fraction of the camera frame height at the curtain depth (dial to match
    // the stage opening).
    scale: { value: 0.9, min: 0.1, max: 1.5, step: 0.01, label: "size" },
    // Shared vertical position and depth.
    y: { value: 1.2, min: -15, max: 15, step: 0.1 },
    z: { value: -9, min: -15, max: -2, step: 0.1 },
    // Per-side closed x — nudge so the two drapes meet cleanly at the centre.
    xL: { value: 0, min: -20, max: 20, step: 0.1, label: "left x" },
    xR: { value: 0, min: -20, max: 20, step: 0.1, label: "right x" },
    // How far each drape travels when fully parted.
    openDistance: { value: 12, min: 0, max: 45, step: 0.1, label: "open distance" },
  });

  const vFov = REFERENCE_FOV_DEG * (Math.PI / 180);
  const distance = CAMERA_BASE_Z - z;
  const [w, h] = curtainSize(distance, scale, vFov);

  const leftRef = useRef<Mesh>(null);
  const rightRef = useRef<Mesh>(null);
  /** Sticky "playback has ever started" — like Spotlight's. Set once, kept. */
  const startedRef = useRef(false);
  /** Linear 0..1 slide timeline (0 = closed, 1 = open); eased into position. */
  const slideRef = useRef(0);

  useFrame((_, dt) => {
    const s = signalsRef.current;
    if (s?.playing) startedRef.current = true;
    // Closed unless we've started and haven't yet hit the end of the song.
    const target = startedRef.current && !s?.ended ? 1 : 0;

    // Advance the linear timeline toward the target at a constant rate, then
    // ease it for the actual displacement (smooth start + settle, reversible).
    const dir = Math.sign(target - slideRef.current);
    slideRef.current = Math.min(1, Math.max(0, slideRef.current + (dir * dt) / SLIDE_SECONDS));
    const open = easeInOutCubic(slideRef.current);

    if (leftRef.current) leftRef.current.position.x = xL - openDistance * open;
    if (rightRef.current) rightRef.current.position.x = xR + openDistance * open;
  });

  return (
    <group>
      <mesh ref={leftRef} position={[xL, y, z]} renderOrder={1.9}>
        <planeGeometry args={[w, h]} />
        <meshPhongMaterial map={texLeft} color={STAGE_TINT} {...PAPER_MATERIAL} />
      </mesh>
      <mesh ref={rightRef} position={[xR, y, z]} renderOrder={1.9}>
        <planeGeometry args={[w, h]} />
        <meshPhongMaterial map={texRight} color={STAGE_TINT} {...PAPER_MATERIAL} />
      </mesh>
    </group>
  );
}
