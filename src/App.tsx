import { Canvas } from "@react-three/fiber";
import { useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { Scene } from "./scene/Scene";
import { Overlay } from "./ui/Overlay";
import { usePlayer } from "./textalive/usePlayer";

const DRAG_THRESHOLD = 6; // px — distinguish a click (toggle) from an orbit drag

export function App() {
  const mediaRef = useRef<HTMLDivElement>(null);
  const { player, positionRef, status, isPlaying, lyrics, subtitle, volume, muted, controls } =
    usePlayer(mediaRef);

  const downPos = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: PointerEvent) => {
    downPos.current = { x: e.clientX, y: e.clientY };
  };

  const onClick = (e: MouseEvent) => {
    const down = downPos.current;
    downPos.current = null;
    if (down) {
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved > DRAG_THRESHOLD) return; // it was a drag, not a click
    }
    if (status === "ready") controls.toggle();
  };

  // Initial camera (OrbitControls takes over after this): position is [x, y, z] in
  // world units — lyrics sit at the origin, so this is centered, raised 5, pulled
  // back 18. fov = vertical view angle in degrees; near/far bound the render depth.
  const camera = { position: [0, 5, 18] as [number, number, number], fov: 55, near: 0.1, far: 200 };

  return (
    <>
      <div id="media" ref={mediaRef} />

      <div className="stage" onPointerDown={onPointerDown} onClick={onClick}>
        <Canvas camera={camera} dpr={[1, 2]} gl={{ antialias: true }}>
          <Scene player={player} positionRef={positionRef} isPlaying={isPlaying} lyrics={lyrics} />
        </Canvas>
      </div>

      <Overlay
        status={status}
        isPlaying={isPlaying}
        subtitle={subtitle}
        volume={volume}
        muted={muted}
        controls={controls}
      />
    </>
  );
}
