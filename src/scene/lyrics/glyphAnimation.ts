// ─── Per-glyph animation maths ──────────────────────────────────────────────
//
// The pure, React-free heart of the lyric display: given a glyph's static data
// and the current frame's signals, work out *when* it lives (lifecycle), *where*
// it sits (position), *how visible/big* it is (opacity & scale), and *what
// colour* it shows. `Lyrics.tsx` builds the sprites and calls these every frame;
// keeping the maths here lets the component read as orchestration only, and lets
// each rule below be reasoned about (and tested) in isolation.

import { Color } from "three";
import type { Sprite, SpriteMaterial } from "three";
import { hsl } from "../common/color";
import { smoothstep } from "../common/ease";
import type { ResolvedStyle } from "./types";
import type { CharDatum } from "../../textalive/types";
import type { Signals } from "../Signals";

// ─── Constants ────────────────────────────────────────────────────────────────

/** ms before a phrase starts — characters begin flying in. */
const LEAD = 1200;
/** ms after a phrase ends — characters finish flying out. */
const TRAIL = 1500;
/** Multiplier on top of all scale calculations. */
const BASE_SCALE = 0.9;

// ─── Per-frame state for one character sprite ────────────────────────────────

export interface Item {
  sprite: Sprite;
  material: SpriteMaterial;
  datum: CharDatum;
  /** Currently-displayed colour (lerped toward `target` each frame). */
  color: Color;
  /** Target colour we lerp toward each frame. */
  target: Color;
}

export interface Lifecycle {
  /** Wall-clock time (ms) when fade-in starts. = `arrive − LEAD`. */
  enter: number;
  /** Wall-clock time when the char is fully visible AND its sung beat begins. */
  arrive: number;
  /** Wall-clock time when the sung beat ends and fade-out begins. */
  leave: number;
  /** Wall-clock time when fade-out finishes (sprite hides). = `leave + TRAIL`. */
  gone: number;
  /**
   * Normalised progress through `[enter, gone]`, bucketed for the rest of the code:
   *   `[0.00–0.35]` fly-in · `[0.35–0.65]` settled · `[0.65–1.00]` fly-out.
   */
  progress: number;
  /**
   * True while the char's sung beat is happening (pos between `arrive` and `leave`).
   * Gates the vocal-amplitude scale pulse and the active-state colour case.
   */
  isActive: boolean;
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Compute when a character fades in / is sung / fades out, and how far through
 * that window we are.
 *
 * Each char has two valid moments to "arrive" at: its *word's* start (so all
 * chars in the word reveal together) or its *own* sung beat. `sweep` blends
 * between them — and the same blend is applied to `leave`:
 *   - `sweep = 0` → whole word pops in/out together.
 *   - `sweep = 1` → each char on its own karaoke beat.
 */
export function computeLifecycle(glyph: CharDatum, sweep: number, pos: number): Lifecycle {
  const arrive = glyph.wordStart + (glyph.charStart - glyph.wordStart) * sweep;
  const leave = glyph.wordEnd + (glyph.charEnd - glyph.wordEnd) * sweep;
  const enter = arrive - LEAD;
  const gone = leave + TRAIL;

  let progress: number;
  if (pos < arrive) {
    progress = ((pos - enter) / Math.max(1, arrive - enter)) * 0.35;
  } else if (pos < leave) {
    progress = 0.35 + ((pos - arrive) / Math.max(1, leave - arrive)) * 0.3;
  } else {
    progress = 0.65 + ((pos - leave) / Math.max(1, gone - leave)) * 0.35;
  }
  progress = Math.min(1, Math.max(0, progress));

  return { enter, arrive, leave, gone, progress, isActive: pos >= arrive && pos <= leave };
}

// ─── Position / animation ────────────────────────────────────────────────────

/**
 * Where the glyph sits this frame, in world space. Called per sprite per frame
 * by the `useFrame` loop to drive `sprite.position`.
 *
 * The result combines, in order: the per-phrase `entry → settle → exit` path,
 * extra motion from `resolved.anim`, a continuous wind wobble, and the
 * cascade-resolved `settleX/Y/Z` offsets.
 *
 * @param glyph    Char's static lyric data (entry/settle/exit + windPhase).
 * @param progress Lifecycle progress (see {@link Lifecycle.progress}); picks the phase.
 * @param resolved Cascade-resolved style for this glyph — supplies `anim` plus
 *                 `settleX/Y/Z` offsets layered on top of the path. To add a new
 *                 anim style: extend `AnimStyle` in `lyrics/types.ts` and add a
 *                 branch in the settle/exit blocks below.
 * @param time     Shared elapsed clock (seconds) — drives the wind wobble phase.
 * @returns The `(x, y, z)` to assign to `sprite.position` this frame.
 */
export function computePosition(
  glyph: CharDatum,
  progress: number,
  resolved: ResolvedStyle,
  time: number,
  settleOverride?: { x: number; y: number },
): { x: number; y: number; z: number } {
  const { anim } = resolved;
  // Override the baked settle X/Y when multi-line wrap reassigned this glyph
  // to a different line; Z is never wrap-modified.
  const settleX = settleOverride?.x ?? glyph.settle.x;
  const settleY = settleOverride?.y ?? glyph.settle.y;
  let bx: number;
  let by: number;
  let bz: number;

  if (progress < 0.35) {
    // Phase 1 — fly in from entry to the (possibly wrap-overridden) settle.
    const e = smoothstep(progress / 0.35);
    bx = glyph.entry.x + (settleX - glyph.entry.x) * e;
    by = glyph.entry.y + (settleY - glyph.entry.y) * e;
    bz = glyph.entry.z + (glyph.settle.z - glyph.entry.z) * e;
  } else if (progress < 0.65) {
    // Phase 2 — settled. Gentle resting wobble plus optional anim motion.
    const u = (progress - 0.35) / 0.3;
    bx = settleX + Math.sin(u * Math.PI * 2) * 0.1;
    by = settleY + Math.sin(u * Math.PI) * 0.05;
    bz = glyph.settle.z;
    if (anim === "float-up") by += u * 0.8; // slowly rises while on screen
  } else {
    // Phase 3 — fly out, *starting from where settle actually ended*.
    // The settle phase can leave the glyph offset from `settleX/Y` (e.g.
    // "float-up" adds u*0.8 by u=1). Without carrying that offset into the
    // exit's starting point, the position would snap back to the settle
    // base before lerping toward `glyph.exit`. Match the settle code's
    // end-of-u=1 values here so position is continuous across the boundary.
    const e = smoothstep((progress - 0.65) / 0.35);
    const settleEndX = settleX; // matches sin(2π)*0.1 = 0
    const settleEndY = settleY + (anim === "float-up" ? 0.8 : 0); // float-up's u=1 offset
    const settleEndZ = glyph.settle.z;
    bx = settleEndX + (glyph.exit.x - settleEndX) * e;
    by = settleEndY + (glyph.exit.y - settleEndY) * e;
    bz = settleEndZ + (glyph.exit.z - settleEndZ) * e;
    if (anim === "swirl-out") {
      const angle = e * Math.PI * 3;
      bx += Math.sin(angle) * 1.5 * e;
      bz += Math.cos(angle) * 1.5 * e;
    }
  }

  // Wind wobble — continuous sine offset; amplitude grows through the lifecycle.
  const windAmp = 0.3 + progress * 0.7;
  bx += Math.sin(time * 2.5 + glyph.windPhase) * 0.4 * windAmp;
  by += Math.sin(time * 1.8 + glyph.windPhase * 1.3) * 0.25 * windAmp;
  bz += Math.cos(time * 2 + glyph.windPhase * 0.7) * 0.3 * windAmp;

  // Cascade-resolved positional offsets (closest layer's settle* wins).
  bx += resolved.settleX;
  by += resolved.settleY;
  bz += resolved.settleZ;

  return { x: bx, y: by, z: bz };
}

// ─── Opacity & scale ─────────────────────────────────────────────────────────

/**
 * Fade envelope (in/out) and the final scale, including beat / vocal pulses and
 * the cascade-resolved `scale` multiplier.
 *
 * `alpha` is the *target* opacity for this frame; the caller lerps toward it.
 */
export function computeOpacityScale(
  progress: number,
  signals: Signals,
  resolved: ResolvedStyle,
  isActive: boolean,
): { alpha: number; scale: number } {
  const { sat, clim, beat, vocal } = signals;
  let alpha: number;
  let envScale: number;

  if (progress < 0.35) {
    // Fade in + grow during entry.
    const f = smoothstep(progress / 0.35);
    alpha = f * 0.95;
    envScale = f * (0.6 + sat * 0.3 + clim * 0.2);
  } else if (progress < 0.65) {
    // Settled — full opacity, beat-driven pulse.
    alpha = 0.95;
    envScale = 0.6 + sat * 0.3 + clim * 0.2 + beat * 0.08;
  } else {
    // Fade out + shrink during exit.
    const f = 1 - smoothstep((progress - 0.65) / 0.35);
    alpha = f * 0.8;
    envScale = f * (0.5 + sat * 0.2);
  }

  const scale =
    envScale *
    BASE_SCALE *
    resolved.scale *
    (1 + beat * 0.2) *
    (isActive ? 1 + vocal * 0.15 : 1);

  return { alpha, scale };
}

// ─── Colour ──────────────────────────────────────────────────────────────────

/**
 * Target colour for this glyph this frame. Three cases — all derived from the
 * same cascade-blended hue family, so a phrase stays in its colour identity
 * (Miku teal, chorus pink, etc.) across all lifecycle states:
 *
 *   1. **Active** (singer's current beat) → pushed toward neon. Saturation is
 *      floored at 90 so muted base hues (e.g. Miku's 42-saturation teal) still
 *      read as vivid when highlighted; lightness honours the cascade spec with
 *      a small climax bump. Bloom then carries the glow.
 *   2. **Transitioning in/out** → same hue, dim and desaturated, with a tiny
 *      hue wobble so neighbouring glyphs don't all march together.
 *   3. **Settled but inactive** (within a phrase, between sung beats) → most
 *      muted so the active glyph clearly pops out of the line.
 *
 * Returns a fresh `Color`; the caller copies it into the lerp target.
 */
export function computeColor(
  progress: number,
  isActive: boolean,
  signals: Signals,
  resolved: ResolvedStyle,
  time: number,
  glyph: CharDatum,
): Color {
  const { sat, clim } = signals;
  const { colorFrom, colorTo } = resolved;

  // Cascade-blended hue family for this glyph (driven by song saturation).
  // Shared by every lifecycle case so inactive doesn't snap to a different
  // colour family from active.
  const baseHue = colorFrom.hue + sat * (colorTo.hue - colorFrom.hue);
  const baseSat = colorFrom.saturation + sat * (colorTo.saturation - colorFrom.saturation);
  const baseLight = colorFrom.lightness + sat * (colorTo.lightness - colorFrom.lightness);

  if (isActive) {
    return hsl(
      baseHue,
      Math.max(90, baseSat),
      Math.min(90, baseLight + clim * 15),
    );
  }
  if (progress < 0.35 || progress >= 0.65) {
    return hsl(
      baseHue + Math.sin(time + glyph.windPhase) * 6,
      baseSat * 0.4,
      baseLight * 0.5,
    );
  }
  return hsl(baseHue, baseSat * 0.25, baseLight * 0.4);
}
