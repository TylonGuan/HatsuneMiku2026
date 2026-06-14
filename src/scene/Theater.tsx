import { useTexture } from "@react-three/drei";
import { folder, useControls } from "leva";
import { SRGBColorSpace } from "three";
import type { Texture } from "three";

import stageSpaceUrl from "../../art/Scene1/TheaterStageSpace.png";
import stageFloorUrl from "../../art/Scene1/TheaterStageFloor.png";
import frameUrl from "../../art/Scene1/TheaterCurtainsprosceniumWindows.png";
import seatsUrl from "../../art/Scene1/TheaterSeats.png";

// All layers share one 3432x2429 canvas, so by default they overlay pixel-perfect.
const IMG_ASPECT = 3432 / 2429; // ≈ 1.413

// ── Starting placement for each layer ────────────────────────────────────────
// These are the defaults; drag the leva sliders (top-right panel) to tune live,
// then copy the values you like back into here.
//   x      left (−)  /  right (+)
//   y      down (−)  /  up (+)
//   z      depth: more negative = farther away (spread them out for more parallax)
//   scale  size multiplier on top of the auto frame-fit (1 = fills the frame)
//   order  paint order, must increase far → near (0,1,2,3)
const LAYERS = [
  { name: "stageSpace", url: stageSpaceUrl, x: 0, y: 0, z: -20, scale: 1, order: 0 }, // back wall (deepest)
  { name: "stageFloor", url: stageFloorUrl, x: 0, y: 0, z: -15, scale: 1, order: 1 }, // raised stage / riser
  { name: "frame", url: frameUrl, x: 0, y: 0, z: -8, scale: 1, order: 2 }, // proscenium + curtains + windows
  { name: "seats", url: seatsUrl, x: 0, y: 1, z: -2, scale: 1, order: 3 }, // audience seats (nearest)
];

const CAMERA_BASE_Z = 7; // keep in sync with CameraRig RADIUS/TARGET
const MARGIN = 1.4; // oversize each plane so camera moves / zoom-out never reveal edges
const TINT = "#3d3947"; // dim the white paper to a moody, "colorless" theatre tone

// ── Plane-sizing reference ───────────────────────────────────────────────────
// Planes are sized at a FIXED reference FOV + aspect rather than the live ones,
// so they don't shrink with the viewport. That gives the user "headroom" to
// pinch/scroll zoom out (which widens the camera frustum) and reveal more of
// each painting — without the planes shrinking to follow. The companion
// {@link CameraRig} clamps the zoom-out FOV at the point where the frustum
// would exceed plane size (i.e. the painting edges would become visible).
const REFERENCE_FOV_DEG = 55;
const REFERENCE_ASPECT = 16 / 9;

// One leva folder per layer, each with x / y / z / scale sliders.
const layerControls = Object.fromEntries(
  LAYERS.map((l) => [
    l.name,
    folder(
      {
        [`${l.name}-x`]: { value: l.x, min: -25, max: 25, step: 0.1 },
        [`${l.name}-y`]: { value: l.y, min: -25, max: 25, step: 0.1 },
        [`${l.name}-z`]: { value: l.z, min: -45, max: 2, step: 0.1 },
        [`${l.name}-scale`]: { value: l.scale, min: 0.2, max: 3, step: 0.01 },
      },
      { collapsed: true },
    ),
  ]),
);

// Size a plane so its image covers the camera frame at the given distance, also
// growing to cover any x/y offset (so shifting a layer never reveals an edge) and
// applying the per-layer scale. Same formula for every layer keeps them aligned.
function coverSize(
  distance: number,
  offsetX: number,
  offsetY: number,
  scale: number,
  vFovRad: number,
  viewAspect: number,
): [number, number] {
  const frameH = 2 * distance * Math.tan(vFovRad / 2);
  const frameW = frameH * viewAspect;
  const neededW = frameW + 2 * Math.abs(offsetX);
  const neededH = frameH + 2 * Math.abs(offsetY);
  const h = Math.max(neededH, neededW / IMG_ASPECT) * MARGIN * scale;
  return [h * IMG_ASPECT, h];
}

export function Theater() {
  const textures = useTexture(LAYERS.map((l) => l.url)) as Texture[];
  const ctrl = useControls("Theater layers", layerControls) as Record<string, number>;

  // Fixed reference values — plane sizes are stable regardless of the actual
  // camera FOV or window aspect. See REFERENCE_* constants above.
  const vFov = REFERENCE_FOV_DEG * (Math.PI / 180);
  const viewAspect = REFERENCE_ASPECT;

  const planes = LAYERS.map((layer, i) => {
    const tex = textures[i];
    tex.colorSpace = SRGBColorSpace;
    const x = ctrl[`${layer.name}-x`];
    const y = ctrl[`${layer.name}-y`];
    const z = ctrl[`${layer.name}-z`];
    const scale = ctrl[`${layer.name}-scale`];
    const [w, h] = coverSize(CAMERA_BASE_Z - z, x, y, scale, vFov, viewAspect);
    return { tex, w, h, x, y, z, order: layer.order, name: layer.name };
  });

  return (
    <group>
      {planes.map((p) => (
        <mesh key={p.name} position={[p.x, p.y, p.z]} renderOrder={p.order}>
          <planeGeometry args={[p.w, p.h]} />
          <meshPhongMaterial
            map={p.tex}
            transparent
            depthTest={false}
            depthWrite={false}
            color={TINT}
            toneMapped={false}
            shininess={0}
          />
        </mesh>
      ))}
    </group>
  );
}
