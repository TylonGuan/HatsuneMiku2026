import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useControls } from "leva";
import { Color, Matrix4, MeshBasicMaterial, Quaternion, Shape, ShapeGeometry, Vector3 } from "three";
import type { InstancedMesh } from "three";
import type { Signals } from "./Signals";

// How many stars in the field. Fixed (an InstancedMesh is allocated for this
// count); it only updates while the climax is on screen, so it's cheap.
const COUNT = 160;

const CAM_Z = 8; // camera z (matches App's camera) — used to size the spawn width per depth
// Foreground slab the stars fall through. All in FRONT of the seats (z=-2), so
// they rain down past the audience toward the viewer. The depth spread gives a
// little parallax (nearer stars look bigger / sweep wider).
const Z_NEAR = 5;
const Z_FAR = 1;
const SPAWN_TOP = 5; // y a star (re)appears at, above the top of the frame
const SPAWN_BOTTOM = -6; // y a star recycles back to the top, below the frame (past the seats)
const Z_AXIS = new Vector3(0, 0, 1); // stars are camera-facing; they spin about it

// Warm gold + white confetti, with a couple of Miku-palette accents. Bright +
// `toneMapped: false` so the Bloom pass makes them sparkle.
const STAR_COLORS = ["#ffd966", "#fff3c4", "#ffffff", "#86cecb", "#ffb7c5"];

/** A flat five-point star centred on the origin, ~1 unit across at scale 1. */
function makeStarGeometry(outer = 0.5, inner = 0.22, spikes = 5): ShapeGeometry {
  const shape = new Shape();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  shape.closePath();
  return new ShapeGeometry(shape);
}

interface StarState {
  /** -0.5..0.5; multiplied by the per-depth spawn width to get x. */
  baseX: number;
  y: number;
  z: number;
  /** Per-star fall-speed multiplier. */
  fall: number;
  swayAmp: number;
  swayFreq: number;
  swayPhase: number;
  spin: number;
  spinSpeed: number;
  scale: number;
  color: string;
}

interface Props {
  signalsRef: RefObject<Signals>;
}

/**
 * Falling-star confetti for the song's climax.
 *
 * A field of {@link COUNT} star sprites rains down through the foreground (in
 * front of the seats), gated on {@link Signals.clim} — the smoothed "final
 * chorus" intensity — so it fades in at the climax and out again afterward. The
 * whole field only animates while it's actually visible, so it costs nothing the
 * rest of the song. Tune via the "Stars (climax)" leva folder; the `test` toggle
 * forces it on so you can preview without waiting for the climax.
 */
export function Stars({ signalsRef }: Props) {
  const meshRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => makeStarGeometry(), []);
  const material = useMemo(
    () => new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }),
    [],
  );

  const { test, fallSpeed, size, spawnWidth } = useControls("Stars (climax)", {
    test: { value: false, label: "test (ignore climax)" },
    fallSpeed: { value: 3.5, min: 0.5, max: 12, step: 0.1 },
    size: { value: 0.45, min: 0.1, max: 3, step: 0.05 },
    spawnWidth: { value: 18, min: 4, max: 36, step: 0.5, label: "spread" },
  });

  // Per-instance state, generated once. Initial y is staggered across the whole
  // fall range so the field looks mid-shower the instant it fades in.
  const stars = useMemo<StarState[]>(() => {
    const arr: StarState[] = [];
    for (let i = 0; i < COUNT; i++) {
      arr.push({
        baseX: Math.random() - 0.5,
        y: SPAWN_BOTTOM + Math.random() * (SPAWN_TOP - SPAWN_BOTTOM),
        z: Z_FAR + Math.random() * (Z_NEAR - Z_FAR),
        fall: 0.6 + Math.random() * 0.8,
        swayAmp: 0.2 + Math.random() * 0.6,
        swayFreq: 0.5 + Math.random() * 1.2,
        swayPhase: Math.random() * Math.PI * 2,
        spin: Math.random() * Math.PI * 2,
        spinSpeed: (Math.random() - 0.5) * 4,
        scale: 0.5 + Math.random() * 0.8,
        color: STAR_COLORS[(Math.random() * STAR_COLORS.length) | 0],
      });
    }
    return arr;
  }, []);

  // Per-instance colours, set once after mount.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const c = new Color();
    for (let i = 0; i < COUNT; i++) mesh.setColorAt(i, c.set(stars[i].color));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [stars]);

  // Scratch objects reused each frame (no per-frame allocation).
  const m4 = useMemo(() => new Matrix4(), []);
  const q = useMemo(() => new Quaternion(), []);
  const pos = useMemo(() => new Vector3(), []);
  const scl = useMemo(() => new Vector3(), []);

  useFrame((state, dt) => {
    const mesh = meshRef.current;
    const s = signalsRef.current;
    if (!mesh || !s) return;

    const clim = test ? 1 : s.clim;
    material.opacity = clim;
    mesh.visible = clim > 0.01;
    if (!mesh.visible) return; // dormant outside the climax — no matrix work

    const t = state.clock.elapsedTime;
    const d = Math.min(dt, 0.05); // clamp so a tab-switch stall doesn't teleport them
    for (let i = 0; i < COUNT; i++) {
      const st = stars[i];
      st.y -= fallSpeed * st.fall * d;
      if (st.y < SPAWN_BOTTOM) st.y += SPAWN_TOP - SPAWN_BOTTOM; // recycle to the top
      st.spin += st.spinSpeed * d;
      // Wider sweep for nearer stars so they stay within the frame at every depth.
      const xRange = spawnWidth * ((CAM_Z - st.z) / (CAM_Z - Z_FAR));
      const x = st.baseX * xRange + Math.sin(t * st.swayFreq + st.swayPhase) * st.swayAmp;
      pos.set(x, st.y, st.z);
      q.setFromAxisAngle(Z_AXIS, st.spin);
      scl.setScalar(st.scale * size);
      m4.compose(pos, q, scl);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  // renderOrder 12 + depthTest off → drawn on top of the whole stage (the seats
  // are 3), so the confetti rains over everything.
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, COUNT]}
      renderOrder={12}
      frustumCulled={false}
    />
  );
}
