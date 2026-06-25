import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { useEffect, useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { Scene } from "./scene/Scene";
import { answerMeSong } from "./scene/lyrics/songs/answerMe";
import { Overlay } from "./ui/Overlay";
import { usePlayer } from "./textalive/usePlayer";

/**
 * The active song's config (style overrides + timing corrections). Swap this
 * one import to render a different song; `Lyrics.tsx` is song-agnostic and
 * just consumes whatever SongConfig is handed to it.
 */
const currentSong = answerMeSong;

/**
 * Minimum pointer movement (px) to qualify as a drag instead of a click.
 * Below this threshold the interaction is treated as a tap/click to toggle playback.
 */
const DRAG_THRESHOLD = 6;

/** Step (ms) for ←/→ keyboard seeks. */
const KEY_SEEK_STEP_MS = 5000;

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
    ended,
    lyrics,
    subtitle,
    duration,
    volume,
    muted,
    controls,
  } = usePlayer(mediaRef, currentSong);

  /**
   * Global keyboard shortcuts. Active once the player is ready.
   *   - Space        → play / pause
   *   - ArrowLeft    → seek backward {@link KEY_SEEK_STEP_MS}
   *   - ArrowRight   → seek forward {@link KEY_SEEK_STEP_MS}
   *
   * Space is suppressed while a form field is focused so it can interact with
   * the control. The ←/→ seek is suppressed only for the **volume** slider (so
   * its native value-stepping still works) — the seek bar keeps the ±step seek
   * instead of nudging its own 100 ms step, which is what the user expects.
   */
  useEffect(() => {
    if (status !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const tag = (el?.tagName ?? "").toUpperCase();
      const isFormField = tag === "INPUT" || tag === "TEXTAREA";
      const isVolumeSlider = !!el?.classList.contains("volume");
      if (e.code === "Space" || e.key === " ") {
        if (isFormField) return; // let Space interact with the focused control
        e.preventDefault(); // stop the page from scrolling on Space
        controls.toggle();
      } else if (e.key === "ArrowLeft") {
        if (isVolumeSlider) return; // volume keeps native stepping
        e.preventDefault(); // also overrides the seek bar's native 100 ms step
        controls.seek(Math.max(0, positionRef.current - KEY_SEEK_STEP_MS));
      } else if (e.key === "ArrowRight") {
        if (isVolumeSlider) return;
        e.preventDefault();
        controls.seek(Math.min(duration, positionRef.current + KEY_SEEK_STEP_MS));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, controls, positionRef, duration]);

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
          <Scene
            player={player}
            positionRef={positionRef}
            isPlaying={isPlaying}
            ended={ended}
            lyrics={lyrics}
            song={currentSong}
          />
        </Canvas>
      </div>

      {/* HTML UI overlays on top of the canvas. */}
      <Overlay
        status={status}
        isPlaying={isPlaying}
        ended={ended}
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
