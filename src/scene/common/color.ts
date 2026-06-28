import { Color } from "three";

// HSL helper with hue wrapping. h in degrees, s/l in percent.
export function hsl(h: number, s: number, l: number): Color {
  const hue = (((h % 360) + 360) % 360) / 360;
  return new Color().setHSL(hue, s / 100, l / 100);
}

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
