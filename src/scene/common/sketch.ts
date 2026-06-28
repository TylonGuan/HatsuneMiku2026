// ─── Shared "paper sprite" look ──────────────────────────────────────────────
// Every visible element in the scene — the theater backdrop layers, the curtains,
// Miku, and the chorus — is a flat plane textured with a transparent hand-drawn
// PNG. They all composite the same way, so that recipe lives here once instead of
// being copy-pasted onto every <meshPhongMaterial>.

/**
 * Shared material settings for every flat "paper" plane. Spread onto a
 * `<meshPhongMaterial>`; pass `map`, `color` (tint), and optional `side` separately.
 *
 * - `depthTest` / `depthWrite` **off** → don't auto-hide planes by distance; we
 *   pick what's in front by hand via each mesh's `renderOrder`,
 *   so a farther plane can still draw on top.
 * - `toneMapped` **off** → keep colours raw (not auto-dimmed) so bright glyphs and
 *   stars are bright enough for the Bloom pass to make them glow.
 * - `shininess: 0` → matte paper, no glossy highlight.
 */
export const PAPER_MATERIAL = {
  transparent: true,
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
  shininess: 0,
} as const;

/**
 * Aspect ratio of the character / curtain cutout canvas (4032×3024, 4:3). The
 * subject is centred with a transparent surround, so the plane stays 4:3 and the
 * alpha channel does the framing.
 */
export const SPRITE_ASPECT = 4032 / 3024;

/** Moody "dim paper" tone for the static theater backdrop and curtains — dims
 *  the white paper to the colourless theatre look. (Miku and the chorus carry
 *  their own, slightly lighter, leva-tunable tints so they read off-spotlight.) */
export const STAGE_TINT = "#3d3947";
