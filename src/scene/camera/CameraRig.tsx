import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, Vector3 } from "three";
import { gyro } from "./gyro";
import {
  CAMERA_AZ_LIMIT as AZ_LIMIT,
  CAMERA_EL_LIMIT as EL_LIMIT,
  PLANE_IMG_ASPECT,
  PLANE_MARGIN,
  REFERENCE_FOV_DEG as BASE_FOV_DEG,
} from "../stageMetrics";

// The camera orbits a fixed point in front of the stage on a short leash, so the
// audience-eye framing is preserved: drag to look around a little, with a gentle
// idle drift when you let go. Limits + the plane oversize keep edges off-screen.
const TARGET = new Vector3(0, 0, -10);
const RADIUS = 18; // distance from TARGET to the camera (=> base z = CAMERA_DISTANCE_Z = 8)
const BASE_Y = 1.0; // seated eye height above the look-at point
// AZ_LIMIT / EL_LIMIT (max orbit swing) are shared with `gyro` via stageMetrics.
const DRAG_SPEED = 0.0009; // radians per pixel dragged

// ── Zoom (pinch / scroll wheel) ──────────────────────────────────────────────
// The user can widen or narrow the camera frustum to see more or less of the
// painted theatre layers, but only within a bound where the frustum still fits
// inside the planes (so they don't reveal a black background past the edges).
// BASE_FOV_DEG is the shared REFERENCE_FOV_DEG (stageMetrics.ts) — the plane-
// sizing reference, matching the Canvas's initial fov in App.tsx.
// ── Starting zoom ────────────────────────────────────────────────────────────
// FOV (degrees) the camera opens at. LOWER = more zoomed IN, HIGHER = zoomed OUT.
// This is the "starting zoom" knob — change just this number. It's clamped into
// the allowed range on mount, so a too-small/large value is pulled into
// [MIN_FOV_DEG, max-zoom-out]. (BASE_FOV_DEG stays the plane-sizing reference.)
const START_FOV_DEG = 60;
const MIN_FOV_DEG = 35; // most zoomed in
// The zoom-out bound is derived from the plane oversize (PLANE_MARGIN) and image
// aspect (PLANE_IMG_ASPECT) so the camera frustum can never exceed the plane it's
// looking at. Both are shared with Theater via stageMetrics.ts.
const WHEEL_SENSITIVITY = 0.05; // degrees of FOV per unit of wheel delta

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Largest FOV that still keeps the camera frustum fully inside the painted
 * planes at the given viewport aspect. Derived from the plane MARGIN baked
 * into Theater.tsx — see comment block above.
 */
function maxZoomOutFov(viewAspect: number): number {
  const baseTan = Math.tan((BASE_FOV_DEG * Math.PI) / 360);
  // Vertical bound: frustum height ≤ plane height (= MARGIN × frame height @ base FOV).
  const vMaxTan = PLANE_MARGIN * baseTan;
  // Horizontal bound: frustum width ≤ plane width (= MARGIN × frame height @ base × IMG_ASPECT).
  const hMaxTan = (PLANE_MARGIN * baseTan * PLANE_IMG_ASPECT) / viewAspect;
  const maxTan = Math.min(vMaxTan, hMaxTan);
  return (2 * Math.atan(maxTan) * 180) / Math.PI;
}

export function CameraRig() {
  const { camera, gl, size } = useThree();
  const drag = useRef({ active: false, x: 0, y: 0 });
  const goal = useRef({ az: 0, el: 0 }); // user-driven offset
  const cur = useRef({ az: 0, el: 0 }); // smoothed actual offset
  const clock = useRef(0);
  /** Current target FOV in degrees (applied to the camera each frame). Opens at
   *  START_FOV_DEG (the starting-zoom knob), then follows wheel/pinch zoom. */
  const fovRef = useRef(START_FOV_DEG);
  /** True while two fingers are down — orbit is suspended in this state. */
  const pinching = useRef(false);
  /** Captured at touchstart for delta-based pinch zoom. */
  const pinchStart = useRef({ dist: 0, fov: BASE_FOV_DEG });

  useEffect(() => {
    const el = gl.domElement;
    const viewAspect = () => size.width / size.height;
    const clampFov = (fov: number) =>
      clamp(fov, MIN_FOV_DEG, maxZoomOutFov(viewAspect()));

    // Existing one-finger / mouse orbit (suspended during pinch).
    const onDown = (e: PointerEvent) => {
      if (pinching.current) return;
      drag.current = { active: true, x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag.current.active || pinching.current) return;
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;
      goal.current.az = clamp(goal.current.az - dx * DRAG_SPEED, -AZ_LIMIT, AZ_LIMIT);
      goal.current.el = clamp(goal.current.el + dy * DRAG_SPEED, -EL_LIMIT, EL_LIMIT);
    };
    const onUp = () => {
      drag.current.active = false;
    };

    // Scroll-wheel zoom. deltaY > 0 (wheel-down) → widen FOV (zoom out).
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      fovRef.current = clampFov(fovRef.current + e.deltaY * WHEEL_SENSITIVITY);
    };

    // Two-finger pinch zoom. Track raw distance between the first two touches;
    // shrinking distance → pinch in → widen FOV (zoom out) — matching how
    // photo/maps apps behave.
    const fingerDist = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        pinching.current = true;
        drag.current.active = false;
        pinchStart.current = {
          dist: fingerDist(e.touches[0], e.touches[1]),
          fov: fovRef.current,
        };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinching.current || e.touches.length < 2) return;
      e.preventDefault();
      const dist = fingerDist(e.touches[0], e.touches[1]);
      // ratio < 1 → fingers spread → zoom in (smaller FOV).
      // ratio > 1 → fingers close → zoom out (larger FOV).
      const ratio = pinchStart.current.dist / Math.max(1, dist);
      fovRef.current = clampFov(pinchStart.current.fov * ratio);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinching.current = false;
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);

    // Re-clamp on viewport-aspect change so a previously-OK FOV doesn't suddenly
    // expose plane edges after a rotation / window resize.
    fovRef.current = clampFov(fovRef.current);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [gl, size.width, size.height]);

  useFrame((_, dt) => {
    clock.current += dt;
    // Gyro tilt (mobile) adds onto the drag offset; clamp the sum to the rig's
    // swing so tilt + drag together still can't expose the painted-plane edges.
    const gAz = gyro.enabled ? gyro.az : 0;
    const gEl = gyro.enabled ? gyro.el : 0;
    const targetAz = clamp(goal.current.az + gAz, -AZ_LIMIT, AZ_LIMIT);
    const targetEl = clamp(goal.current.el + gEl, -EL_LIMIT, EL_LIMIT);
    // Idle drift only when neither dragging nor tilting — the tilt is its own
    // motion, so the gentle auto-sway would just fight it.
    const idle = !drag.current.active && !gyro.enabled;
    const driftAz = idle ? Math.sin(clock.current * 0.23) * 0.05 : 0;
    const driftEl = idle ? Math.sin(clock.current * 0.17 + 1.3) * 0.025 : 0;
    const k = Math.min(1, dt * 2.5);
    cur.current.az += (targetAz + driftAz - cur.current.az) * k;
    cur.current.el += (targetEl + driftEl - cur.current.el) * k;

    const { az, el } = cur.current;
    camera.position.set(
      TARGET.x + Math.sin(az) * RADIUS,
      TARGET.y + BASE_Y + Math.sin(el) * RADIUS * 0.5,
      TARGET.z + Math.cos(az) * RADIUS,
    );
    camera.lookAt(TARGET);

    // Push the zoom-target FOV onto the live camera. Mutating without a
    // re-render is fine; the projection matrix update propagates immediately.
    if (camera instanceof PerspectiveCamera && Math.abs(camera.fov - fovRef.current) > 0.01) {
      camera.fov = fovRef.current;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
