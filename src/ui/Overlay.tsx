import { useEffect, useState } from "react";
import type { PlayerControls, PlayerStatus } from "../textalive/usePlayer";
import { SONG } from "../config";

interface Props {
  status: PlayerStatus;
  isPlaying: boolean;
  subtitle: string | null;
  volume: number;
  muted: boolean;
  controls: PlayerControls;
}

export function Overlay({ status, isPlaying, subtitle, volume, muted, controls }: Props) {
  const ready = status === "ready";
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (isPlaying) setStarted(true);
  }, [isPlaying]);

  const muteIcon = muted ? "🔇" : volume > 50 ? "🔊" : "🔉";

  return (
    <>
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

      <div className={`subtitle${subtitle && isPlaying ? " visible" : ""}`}>{subtitle}</div>

      <div className={`paused${started && !isPlaying ? " visible" : ""}`}>Paused</div>
    </>
  );
}
