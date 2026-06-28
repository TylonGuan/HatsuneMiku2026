import { useTexture } from "@react-three/drei";
import { folder, useControls } from "leva";
import { SRGBColorSpace } from "three";
import type { Texture } from "three";

import backgroundMedieval from "../../../art/Theater/BackgroundMedieval.png";
import stageSpace from "../../../art/Theater/TheaterStageSpace.png";
import stageFloorUrl from "../../../art/Theater/TheaterStageFloor.png";
import frameUrl from "../../../art/Theater/TheaterCurtainsprosceniumWindows.png";
import seatsUrl from "../../../art/Theater/TheaterSeats.png";
import { BACKGROUND_LIGHT_LAYER } from "../lighting/BackgroundLight";
import { PAPER_MATERIAL, STAGE_TINT } from "../common/sketch";
import {
  CAMERA_BASE_Z,
  PLANE_IMG_ASPECT as IMG_ASPECT,
  PLANE_MARGIN as MARGIN,
  REFERENCE_FOV_DEG,
} from "../stageMetrics";

// All layers share one 3432x2429 canvas, so by default they overlay pixel-perfect
// (IMG_ASPECT). The shared sizing reference (CAMERA_BASE_Z, MARGIN, REFERENCE_FOV_DEG)
// lives in stageMetrics.ts so Curtains/Lyrics/CameraRig size against the same numbers.

// ── Starting placement for each layer ────────────────────────────────────────
// These are the defaults; drag the leva sliders (top-right panel) to tune live,
// then copy the values you like back into here.
//   x      left (−)  /  right (+)
//   y      down (−)  /  up (+)
//   z      depth: more negative = farther away (spread them out for more parallax)
//   scale  size multiplier on top of the auto frame-fit (1 = fills the frame)
//   order  paint order, must increase far → near (0,1,2,3)
// `bgLit: true` opts a layer into the `BackgroundLight` render layer so the
// two dedicated background spotlights illuminate it. Default `false` keeps a
// layer on the main camera channel only.
const LAYERS = [
  { name: "stageSpace", url: stageSpace, x: 0, y: -5, z: -32, scale: 0, order: -1, bgLit: false }, // back wall (deepest)
  { name: "backgroundMedieval", url: backgroundMedieval, x: 0, y: 6, z: -20 , scale: 0.5, order: 1, bgLit: true }, // background painting — receives the dedicated stage-wash lights
  { name: "stageFloor", url: stageFloorUrl, x: 0, y: -1, z: -15, scale: 1.2, order: 1, bgLit: false }, // raised stage / riser
  { name: "frame", url: frameUrl, x: 0, y: 0, z: -8, scale: 1, order: 2, bgLit: false }, // proscenium + curtains + windows
  { name: "seats", url: seatsUrl, x: 0, y: 1, z: -2, scale: 1, order: 3, bgLit: false }, // audience seats (nearest)
];

// ── Plane-sizing reference ───────────────────────────────────────────────────
// Planes are sized at a FIXED reference FOV + aspect rather than the live ones,
// so they don't shrink with the viewport. That gives the user "headroom" to
// pinch/scroll zoom out (which widens the camera frustum) and reveal more of
// each painting — without the planes shrinking to follow. The companion
// {@link CameraRig} clamps the zoom-out FOV at the point where the frustum
// would exceed plane size (i.e. the painting edges would become visible).
// REFERENCE_FOV_DEG lives in stageMetrics.ts (shared); the aspect is local.
const REFERENCE_ASPECT = 16 / 9;

// One leva folder per layer, each with x / y / z / scale sliders.
const layerControls = Object.fromEntries(
  LAYERS.map((layer) => [
    layer.name,
    folder(
      {
        [`${layer.name}-x`]: { value: layer.x, min: -25, max: 25, step: 0.1 },
        [`${layer.name}-y`]: { value: layer.y, min: -25, max: 25, step: 0.1 },
        [`${layer.name}-z`]: { value: layer.z, min: -45, max: 2, step: 0.1 },
        [`${layer.name}-scale`]: { value: layer.scale, min: 0.2, max: 3, step: 0.01 },
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
    return {
      tex,
      w,
      h,
      x,
      y,
      z,
      order: layer.order,
      name: layer.name,
      bgLit: layer.bgLit,
    };
  });

  return (
    <group>
      {planes.map((plane) => (
        <mesh
          key={plane.name}
          position={[plane.x, plane.y, plane.z]}
          renderOrder={plane.order}
          // Opt the background-painting mesh into the dedicated background
          // render layer so the two `BackgroundLight` spotlights illuminate it.
          // `enable` is additive — layer 0 stays on so the main camera still
          // renders the mesh.
          ref={(mesh) => {
            if (mesh && plane.bgLit) mesh.layers.enable(BACKGROUND_LIGHT_LAYER);
          }}
        >
          <planeGeometry args={[plane.w, plane.h]} />
          <meshPhongMaterial map={plane.tex} color={STAGE_TINT} {...PAPER_MATERIAL} />
        </mesh>
      ))}
    </group>
  );
}
