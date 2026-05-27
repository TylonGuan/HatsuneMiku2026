import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, MutableRefObject, PointerEvent } from "react";
import type { PlayerControls, PlayerStatus } from "../textalive/usePlayer";
import { SONG } from "../config";

/**
 * Props for {@link Overlay} — the live playback state and controls surfaced by
 * {@link usePlayer}. The overlay is a thin HTML layer drawn on top of the WebGL
 * canvas, so everything here is plain DOM driven by these values.
 */
interface Props {
  /** Player load state — drives the loading text vs. the "click to start" panel. */
  status: PlayerStatus;
  /** Whether the song is playing (toggles the Paused overlay + subtitle visibility). */
  isPlaying: boolean;
  /** Translation for the current phrase, or null when no phrase is active. */
  subtitle: string | null;
  /** Live song position (ms), updated every frame *outside* React for the scrub bar. */
  positionRef: MutableRefObject<number>;
  /** Total song length (ms). */
  duration: number;
  /** Current volume, 0–100. */
  volume: number;
  /** Whether audio is muted. */
  muted: boolean;
  /** Playback control callbacks (play / seek / volume / …). */
  controls: PlayerControls;
}

/** Format milliseconds as `m:ss` (e.g. 75200 → "1:15"). Negatives clamp to 0. */
function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Write the "current / total" label straight to the DOM (no React state per frame). */
function setTimeLabel(el: HTMLSpanElement | null, ms: number, duration: number): void {
  if (el) el.textContent = `${formatTime(ms)} / ${formatTime(duration)}`; // ${formatTime(duration)} doesnt change, see if you can just cache the value once
}

/**
 * Scrub bar for seeking through the song.
 *
 * To avoid a React re-render every frame, this is an *uncontrolled* range input:
 * a requestAnimationFrame loop reads the live position from `positionRef` and
 * writes it straight to the DOM. While the user drags (`scrubbing`), the loop
 * stops following so it doesn't fight the thumb, and the actual seek fires on
 * release. `positionRef` tracks the audio element's true clock, so right after a
 * seek the bar already reflects the new time — no snap-back to smooth over.
 */
function SeekBar({
  positionRef,
  duration,
  seek,
  visible,
}: {
  positionRef: MutableRefObject<number>;
  duration: number;
  seek: (ms: number) => void;
  visible: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  /** True while the user is dragging the thumb. */
  const scrubbing = useRef(false);

  // Follow the live position each frame (skipped while the user is dragging).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = inputRef.current;
      if (el && !scrubbing.current) {
        const pos = positionRef.current;
        el.value = String(pos);
        setTimeLabel(timeRef.current, pos, duration);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [positionRef, duration]);

  // Fires as the thumb value changes. For a pointer drag we only seek on release
  // (in end); a keyboard/programmatic change has no pointer gesture, so seek now.
  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const ms = parseFloat(e.target.value);
    setTimeLabel(timeRef.current, ms, duration);
    if (!scrubbing.current) seek(ms);
  };

  const begin = (e: PointerEvent<HTMLInputElement>) => {
    scrubbing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const end = (e: PointerEvent<HTMLInputElement>) => {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    seek(parseFloat(e.currentTarget.value));
  };

  return (
    <div className={`seekbar${visible ? " visible" : ""}`}>
      <input
        ref={inputRef}
        className="seek"
        type="range"
        min={0}
        max={Math.max(1, duration)}
        step={100}
        defaultValue={0}
        onPointerDown={begin}
        onPointerUp={end}
        onPointerCancel={end}
        onChange={onInput}
      />
      <span ref={timeRef} className="seek-time">
        0:00 / {formatTime(duration)}
      </span>
    </div>
  );
}

/**
 * HTML UI layer rendered over the WebGL scene: the title / click-to-start panel,
 * volume + mute, skip-to-first-lyric, the scrub bar, the live subtitle, and a
 * Paused indicator. All playback state arrives via props from {@link usePlayer}.
 */
export function Overlay({
  status,
  isPlaying,
  subtitle,
  positionRef,
  duration,
  volume,
  muted,
  controls,
}: Props) {
  const ready = status === "ready";
  /** Latches true once playback first starts, so the intro panel hides for good. */
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (isPlaying) setStarted(true);
  }, [isPlaying]);

  const muteIcon = muted ? "🔇" : volume > 50 ? "🔊" : "🔉";

  return (
    <>
      {/* Intro panel: song title + start hint, or a loading message. Hidden once started. */}
      <div className={`info${started ? " hidden" : ""}`}>
        {ready ? (
          <>
            <div className="title">{SONG.title}</div>
            <div className="artist">{SONG.artist}</div>
            <div className="hint">Click anywhere to start</div>
          </>
        ) : (
          <div className="loading">Loading song…</div>
        )}
      </div>

      {/* Mute toggle + volume slider. */}
      <div className={`controls${ready ? " visible" : ""}`}>
        <button className="btn" title="Mute / unmute" onClick={controls.toggleMute}>
          {muteIcon}
        </button>
        <input
          className="volume"
          type="range"
          min={0}
          max={100}
          step={1}
          value={muted ? 0 : volume}
          onChange={(e) => controls.setVolume(parseFloat(e.target.value))}
        />
      </div>

      <button
        className={`btn skip${ready ? " visible" : ""}`}
        title="Skip to first lyric"
        onClick={controls.skip}
      >
        ⏭
      </button>

      <SeekBar positionRef={positionRef} duration={duration} seek={controls.seek} visible={ready} />

      {/* Current phrase translation; only shown while actually playing. */}
      <div className={`subtitle${subtitle && isPlaying ? " visible" : ""}`}>{subtitle}</div>

      <div className={`paused${started && !isPlaying ? " visible" : ""}`}>Paused</div>
    </>
  );
}
