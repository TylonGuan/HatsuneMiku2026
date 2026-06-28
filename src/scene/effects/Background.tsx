import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { RefObject } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  PointsMaterial,
} from "three";
import { hsl } from "../common/color";
import type { Signals } from "../Signals";

const PETAL_COUNT = 600;

interface Props {
  signalsRef: RefObject<Signals>;
}

// Drifting "petal" particles + atmosphere. Colorless and dim early in the song,
// blooming into warm color toward the climax.
export function Background({ signalsRef }: Props) {
  const pointsRef = useRef<Points>(null);
  const matRef = useRef<PointsMaterial>(null);
  const { gl } = useThree();

  const { geometry, phases } = useMemo(() => {
    const positions = new Float32Array(PETAL_COUNT * 3);
    const ph = new Float32Array(PETAL_COUNT);
    for (let i = 0; i < PETAL_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 50 + 5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      ph[i] = Math.random() * Math.PI * 2;
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(positions, 3));
    return { geometry: geo, phases: ph };
  }, []);

  useFrame(({ clock }) => {
    const signals = signalsRef.current;
    if (!signals) return;
    const { sat, clim } = signals;
    const time = clock.elapsedTime;

    // Background fill: deep plum -> warmer, more saturated.
    gl.setClearColor(hsl(300 + clim * 30, 8 + sat * 22, 4 + sat * 4 + clim * 4), 1);

    const points = pointsRef.current;
    if (points) {
      points.rotation.y += 0.00015;
      points.rotation.x += 0.00005;
      const attr = points.geometry.attributes.position as BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < PETAL_COUNT; i++) {
        arr[i * 3 + 1] += Math.sin(time * 0.25 + phases[i]) * 0.003;
        arr[i * 3] += Math.cos(time * 0.2 + phases[i] * 0.7) * 0.002;
      }
      attr.needsUpdate = true;
    }

    const mat = matRef.current;
    if (mat) {
      mat.color.copy(hsl(330 + sat * 20 + clim * 10, 20 + sat * 25, 45 + sat * 25));
      mat.opacity = 0.18 + sat * 0.12 + clim * 0.1;
    }
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        ref={matRef}
        size={0.09}
        transparent
        opacity={0.18}
        depthWrite={false}
        blending={AdditiveBlending}
        sizeAttenuation
        color={0xd4a0b0}
      />
    </points>
  );
}
