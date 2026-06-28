// ─── Device-orientation (gyroscope) camera input ─────────────────────────────
//
// A tiny shared singleton: the device's tilt is converted into the same az / el
// camera offsets the drag gesture produces, and {@link CameraRig} reads `gyro`
// each frame to add that offset. Kept out of React state on purpose — it updates
// every device-orientation event (fast) and only the render loop consumes it.
//
// Permission: iOS 13+ hides orientation behind `DeviceOrientationEvent
// .requestPermission()`, which MUST be called from a user gesture. We trigger
// {@link requestGyro} from the "tap to start" handler in App.tsx. On Android /
// desktop Chrome there's no permission gate, so we just attach the listener
// (desktop has no real sensor, but Chrome DevTools' Sensors panel can emulate
// one — see the README / testing notes).
//
// Orientation: the raw event reports tilt in the device's NATURAL (portrait)
// frame — `gamma` is left-right, `beta` is front-back. In landscape those axes
// are physically swapped, so we remap into SCREEN space via the current screen
// rotation, and re-center on rotation. That keeps "lean left" = look left no
// matter how the phone is held.

import { CAMERA_AZ_LIMIT as AZ_LIMIT, CAMERA_EL_LIMIT as EL_LIMIT } from "../stageMetrics";

/** Degrees of physical tilt mapped to the full swing. Larger = less sensitive. */
const RANGE_X = 35; // screen left-right tilt → azimuth
const RANGE_Y = 28; // screen up-down tilt → elevation

/** Live gyro offset the camera rig reads. `enabled` stays false until the first
 *  real reading arrives, so drag-only devices are unaffected. */
export const gyro = {
  /** Whether the orientation API even exists in this browser. */
  supported: typeof window !== "undefined" && typeof window.DeviceOrientationEvent !== "undefined",
  /** True once we've received at least one orientation reading. */
  enabled: false,
  az: 0,
  el: 0,
};

/** Neutral pose in SCREEN space, captured from the first reading (and re-captured
 *  after a rotation) so "level" = however the user is holding the device now. */
let baseX: number | null = null;
let baseY: number | null = null;
let listening = false;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Current screen rotation in degrees (0 / 90 / 180 / 270), normalising the
 *  modern `screen.orientation` and the legacy iOS `window.orientation` APIs. */
function screenAngle(): number {
  const modern = window.screen?.orientation?.angle;
  if (typeof modern === "number") return modern;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === "number" ? (((legacy % 360) + 360) % 360) : 0;
}

function onOrientation(e: DeviceOrientationEvent) {
  const { beta, gamma } = e; // beta: front-back (-180..180), gamma: left-right (-90..90)
  if (beta === null || gamma === null) return;

  // Remap device-natural tilt into screen space (x = left-right as seen, y =
  // top-bottom as seen) for the current rotation.
  let x: number;
  let y: number;
  switch (screenAngle()) {
    case 90: // rotated counter-clockwise to landscape
      x = beta;
      y = -gamma;
      break;
    case 180: // upside-down portrait
      x = -gamma;
      y = -beta;
      break;
    case 270: // rotated clockwise to landscape
      x = -beta;
      y = gamma;
      break;
    default: // 0 — portrait
      x = gamma;
      y = beta;
      break;
  }

  // First reading (or first after a rotation) defines the neutral pose.
  if (baseX === null || baseY === null) {
    baseX = x;
    baseY = y;
  }
  // Signs: lean right → look right; tilt the top toward you → look up. If a given
  // landscape feels inverted, flip the sign of that screenAngle case above.
  gyro.az = clamp(((x - baseX) / RANGE_X) * AZ_LIMIT, -AZ_LIMIT, AZ_LIMIT);
  gyro.el = clamp((-(y - baseY) / RANGE_Y) * EL_LIMIT, -EL_LIMIT, EL_LIMIT);
  gyro.enabled = true;
}

/**
 * Ask for orientation access and start listening. Safe to call repeatedly — it
 * no-ops after the first successful attach. Must be invoked from a user gesture
 * on iOS. Resolves once listening (or silently returns if unsupported/denied).
 */
export async function requestGyro(): Promise<void> {
  if (!gyro.supported || listening) return;
  const DOE = window.DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  if (typeof DOE.requestPermission === "function") {
    try {
      if ((await DOE.requestPermission()) !== "granted") return;
    } catch {
      return; // not triggered by a gesture, or the user declined — stay drag-only
    }
  }
  window.addEventListener("deviceorientation", onOrientation, true);
  // Re-capture the neutral pose when the screen rotates, so the remapped axes
  // start centered in the new orientation instead of jumping.
  window.addEventListener("orientationchange", recenterGyro);
  listening = true;
}

/** Re-capture the neutral pose on the next reading (e.g. after a rotation). */
export function recenterGyro(): void {
  baseX = null;
  baseY = null;
}
