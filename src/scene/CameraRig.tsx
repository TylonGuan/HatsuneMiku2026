import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";

// The camera orbits a fixed point in front of the stage on a short leash, so the
// audience-eye framing is preserved: drag to look around a little, with a gentle
// idle drift when you let go. Limits + the plane oversize keep edges off-screen.
const TARGET = new Vector3(0, 0, -10);
const RADIUS = 18; // distance from TARGET to the camera (=> base z ≈ 8)
const BASE_Y = 1.0; // seated eye height above the look-at point
const AZ_LIMIT = 0.22; // max horizontal swing (radians, ~12.5°)
const EL_LIMIT = 0.12; // max vertical swing (radians, ~7°)
const DRAG_SPEED = 0.0009; // radians per pixel dragged

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function CameraRig() {
  const { camera, gl } = useThree();
  const drag = useRef({ active: false, x: 0, y: 0 });
  const goal = useRef({ az: 0, el: 0 }); // user-driven offset
  const cur = useRef({ az: 0, el: 0 }); // smoothed actual offset
  const clock = useRef(0);

  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: PointerEvent) => {
      drag.current = { active: true, x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag.current.active) return;
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;
      goal.current.az = clamp(goal.current.az - dx * DRAG_SPEED, -AZ_LIMIT, AZ_LIMIT);
      goal.current.el = clamp(goal.current.el + dy * DRAG_SPEED, -EL_LIMIT, EL_LIMIT);
    };
    const onUp = () => {
      drag.current.active = false;
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [gl]);

  useFrame((_, dt) => {
    clock.current += dt;
    const idle = !drag.current.active;
    const driftAz = idle ? Math.sin(clock.current * 0.23) * 0.05 : 0;
    const driftEl = idle ? Math.sin(clock.current * 0.17 + 1.3) * 0.025 : 0;
    const k = Math.min(1, dt * 2.5);
    cur.current.az += (goal.current.az + driftAz - cur.current.az) * k;
    cur.current.el += (goal.current.el + driftEl - cur.current.el) * k;

    const { az, el } = cur.current;
    camera.position.set(
      TARGET.x + Math.sin(az) * RADIUS,
      TARGET.y + BASE_Y + Math.sin(el) * RADIUS * 0.5,
      TARGET.z + Math.cos(az) * RADIUS,
    );
    camera.lookAt(TARGET);
  });

  return null;
}
