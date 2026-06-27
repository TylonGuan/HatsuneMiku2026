// ─── Easing functions ────────────────────────────────────────────────────────
// Shared so the scene's many hand-rolled animations (sprite bobs, spins, fades,
// curtain slides) all reach for the same curves instead of re-deriving them.
// All take and return a normalised 0..1 progress.

/** Hermite smoothstep — eases in and out, 0 at t=0 and 1 at t=1. The scene's
 *  default "make this lerp feel natural" curve. */
export const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** Decelerating ease — fast start, gentle settle. Good for fade-ins. */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/** Symmetric cubic ease — accelerate off the start, decelerate into the end.
 *  Used for the curtain slide so it leaves/settles smoothly and reverses cleanly. */
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Overshooting ease — passes ~1.1 near the end before settling at 1, so a 0→1
 *  scale "pops" into existence rather than easing in flatly. 0 at t=0, 1 at t=1. */
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
