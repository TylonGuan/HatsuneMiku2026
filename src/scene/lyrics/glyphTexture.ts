import { CanvasTexture, SRGBColorSpace } from "three";

// Render each glyph to a 2D canvas using the browser's system fonts. This gives
// full Japanese coverage with zero font downloads. Textures are white so they can
// be tinted per-character via the sprite material color (additive blending = glow).
const cache = new Map<string, CanvasTexture>();

export function charTexture(char: string): CanvasTexture {
  const cached = cache.get(char);
  if (cached) return cached;

  const size = 128;
  const pad = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size + pad * 2;
  canvas.height = size + pad * 2;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255, 240, 220, 0.35)";
  ctx.shadowBlur = size * 0.2;
  ctx.fillStyle = "#fff7ec";
  ctx.font = `700 ${size}px "Hiragino Kaku Gothic ProN", "Noto Sans JP", Meiryo, sans-serif`;
  ctx.fillText(char, cx, cy);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(char, tex);
  return tex;
}
