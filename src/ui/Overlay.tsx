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
  /** True the moment the song finished naturally — brings the title card back
   *  instead of the "Paused" overlay so end-of-song feels like a clean reset. */
  ended: boolean;
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
  ended,
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
  /** Brief "how to move the camera" hint, shown once right after the first start
   *  and then faded away. */
  const [showHint, setShowHint] = useState(false);
  const hintShownRef = useRef(false);
  /** Coarse pointer ⇒ touch device ⇒ mention tilt; otherwise mention drag/scroll. */
  const [isTouch] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches,
  );
  /** iOS (incl. iPadOS, which masquerades as "MacIntel" + touch). iOS Safari
   *  makes media-element volume/mute read-only — the OS reserves it for the
   *  hardware buttons — so the in-app volume controls do nothing there and are
   *  replaced with a hint. */
  const [isIOS] = useState(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    return (
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  });
  const hintText = isTouch
    ? "Tilt your device or drag to look around · pinch to zoom"
    : "Drag to look around · scroll to zoom";
  /** User toggle to hide the transport chrome (speaker / seek / skip) for a
   *  clean, uncluttered view. Starts hidden so the stage is uncluttered by
   *  default — the bottom-center triangle handle reveals the controls on
   *  demand. The handle itself always stays visible. */
  const [uiHidden, setUiHidden] = useState(true);

  useEffect(() => {
    if (isPlaying) setStarted(true);
  }, [isPlaying]);

  // First time playback starts, flash the camera-gesture hint for a few seconds.
  useEffect(() => {
    if (!started || hintShownRef.current) return;
    hintShownRef.current = true;
    setShowHint(true);
    const t = setTimeout(() => setShowHint(false), 6000);
    return () => clearTimeout(t);
  }, [started]);

  /**
   * The title card shows in two cases: (1) before the first play, (2) after the
   * song finished. The "Paused" overlay shows only for an explicit mid-song
   * pause — never at end-of-song, because the title card supersedes it.
   */
  const showTitle = !started || ended;
  const showPaused = started && !isPlaying && !ended;

  const muteIcon = muted ? "🔇" : volume > 50 ? "🔊" : "🔉";

  // Chrome visibility. The speaker is available as soon as the song loads; the
  // seek bar and skip-to-lyric button only appear once playback has started
  // (the skip button rides along with the seek bar). The hide toggle suppresses
  // all three for a clean view.
  const showControls = ready && !uiHidden;
  const showTransport = started && !uiHidden;

  return (
    <>
      {/* Intro panel: song title + start hint, or a loading message. */}
      <div className={`info${showTitle ? "" : " hidden"}`}>
        {ready ? (
          <>
            <div className="title">{SONG.title}</div>
            <div className="artist">{SONG.artist}</div>
            <div className="hint">{ended ? "Click to play again" : "Click anywhere to start"}</div>
          </>
        ) : (
          <div className="loading">Loading song…</div>
        )}
      </div>

      {/* Bottom-center triangle handle to collapse / expand the transport
          chrome. Points up when hidden ("raise the UI"), down when shown
          ("lower it"). Stays visible itself so it can always toggle back. */}
      <button
        className={`ui-toggle${ready ? " visible" : ""}${uiHidden ? "" : " open"}`}
        title={uiHidden ? "Show controls" : "Hide controls"}
        aria-label={uiHidden ? "Show controls" : "Hide controls"}
        onClick={() => setUiHidden((v) => !v)}
      >
        <span className="ui-toggle-tri" />
      </button>

      {/* Mute toggle + volume slider. Omitted entirely on iOS, where media volume
          is read-only (the OS reserves it for the hardware buttons). */}
      {!isIOS && (
        <div className={`controls${showControls ? " visible" : ""}`}>
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
      )}

      <button
        className={`btn skip${showTransport ? " visible" : ""}`}
        title="Skip to first lyric"
        onClick={controls.skip}
      >
        ⏭
      </button>

      <SeekBar
        positionRef={positionRef}
        duration={duration}
        seek={controls.seek}
        visible={showTransport}
      />

      {/* Transient camera-gesture hint, shown once right after the first start. */}
      <div className={`gesture-hint${showHint ? " visible" : ""}`}>{hintText}</div>

      {/* Current phrase translation; only shown while actually playing. */}
      <div className={`subtitle${subtitle && isPlaying ? " visible" : ""}`}>{subtitle}</div>

      <div className={`paused${showPaused ? " visible" : ""}`}>Paused</div>
    </>
  );
}
