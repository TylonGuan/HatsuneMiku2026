import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { Scene } from "./scene/Scene";
import { Overlay } from "./ui/Overlay";
import { usePlayer } from "./textalive/usePlayer";

/**
 * Minimum pointer movement (px) to qualify as a drag instead of a click.
 * Below this threshold the interaction is treated as a tap/click to toggle playback.
 */
const DRAG_THRESHOLD = 6;

/**
 * Root application component.
 *
 * Orchestrates the entire app:
 * 1. Initializes the TextAlive player via {@link usePlayer}.
 * 2. Renders the Three.js canvas with the 3D lyric scene.
 * 3. Renders the HTML overlay for status, subtitles, and volume controls.
 * 4. Distinguishes taps (toggle play/pause) from drags (orbit camera).
 */
export function App() {
  /** Hidden container TextAlive uses to create its <audio> element. */
  const mediaRef = useRef<HTMLDivElement>(null);

  const {
    player,
    positionRef,
    status,
    isPlaying,
    lyrics,
    subtitle,
    duration,
    volume,
    muted,
    controls,
  } = usePlayer(mediaRef);

  /** Pointer position on pointerdown, used to detect drag distance on click. */
  const downPos = useRef<{ x: number; y: number } | null>(null);

  /** Records pointer position when the user first presses down. */
  const onPointerDown = (e: PointerEvent) => {
    downPos.current = { x: e.clientX, y: e.clientY };
  };

  /**
   * Handles click/tap on the stage.
   * If the pointer moved more than DRAG_THRESHOLD it's treated as an orbit drag
   * and ignored. Otherwise it toggles playback via the player controls.
   */
  const onClick = (e: MouseEvent) => {
    const down = downPos.current;
    downPos.current = null;
    if (down) {
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved > DRAG_THRESHOLD) return;
    }
    if (status === "ready") controls.toggle();
  };

  /**
   * Initial camera configuration used by the Three.js Canvas.
   * - position: [x, y, z] in world units (matches the theater rig's seated base)
   * - fov: vertical field of view in degrees (also used by Theater to size layers)
   * - near/far: render depth bounds
   */
  const camera = { position: [0, 1, 8] as [number, number, number], fov: 55, near: 0.1, far: 200 };

  return (
    <>
      {/* Dev-only layer-tuning panel; hidden in production builds. */}
      <Leva collapsed hidden={process.env.NODE_ENV === "production"} />

      {/* TextAlive injects its <audio> element into this div. */}
      <div id="media" ref={mediaRef} />

      {/* Click/tap target that covers the entire 3D viewport. */}
      <div className="stage" onPointerDown={onPointerDown} onClick={onClick}>
        <Canvas camera={camera} dpr={[1, 2]} gl={{ antialias: true }}>
          <Scene player={player} positionRef={positionRef} isPlaying={isPlaying} lyrics={lyrics} />
        </Canvas>
      </div>

      {/* HTML UI overlays on top of the canvas. */}
      <Overlay
        status={status}
        isPlaying={isPlaying}
        subtitle={subtitle}
        positionRef={positionRef}
        duration={duration}
        volume={volume}
        muted={muted}
        controls={controls}
      />
    </>
  );
}
