// ─── Shared "paper sprite" look ──────────────────────────────────────────────
// Every visible element in the scene — the theater backdrop layers, the curtains,
// Miku, and the chorus — is a flat plane textured with a transparent hand-drawn
// PNG. They all composite the same way, so that recipe lives here once instead of
// being copy-pasted onto every <meshPhongMaterial>.

/**
 * Compositing props shared by all paper sprites. Spread onto a
 * `<meshPhongMaterial>`; pass `map`, `color` (tint), and optional `side`
 * separately.
 *
 * - `depthTest` / `depthWrite` **off** → the planes don't z-fight; **paint order
 *   is decided purely by each mesh's `renderOrder`** (see the render-order table
 *   in CLAUDE.md). This is what lets deeper-z layers still draw in a chosen order.
 * - `toneMapped` **off** → tints and the Bloom pass act on the raw colour, so
 *   bright glyphs/stars actually bloom instead of being gamma-compressed first.
 * - `shininess: 0` → no specular hot-spot on the matte "paper".
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
