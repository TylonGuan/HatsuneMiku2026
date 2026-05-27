import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { MutableRefObject, RefObject } from "react";
import type { Player } from "textalive-app-api";
import { getBeatAmp, getProgress, getVocalAmp, isChorus } from "../textalive/analysis";
import { clamp01 } from "./color";

// Per-frame signals shared by the whole scene.
export interface Signals {
  pos: number; // song position (ms)
  sat: number; // 0 (colorless) -> 1 (full color), follows song progress
  clim: number; // smoothed climax intensity (final chorus)
  beat: number; // 0..1 beat pulse
  vocal: number; // 0..1 vocal amplitude
  chorus: boolean;
  playing: boolean;
}

export function createSignals(): Signals {
  return { pos: 0, sat: 0, clim: 0, beat: 0, vocal: 0, chorus: false, playing: false };
}

interface Props {
  player: Player | null;
  positionRef: MutableRefObject<number>;
  isPlaying: boolean;
  signalsRef: RefObject<Signals>;
}

// Runs first in the frame loop so children read fresh values.
export function SignalsUpdater({ player, positionRef, isPlaying, signalsRef }: Props) {
  // Cached <audio>/<video> element (found once the song loads, re-found if replaced).
  const audioRef = useRef<HTMLMediaElement | null>(null);

  useFrame(() => {
    const s = signalsRef.current;
    if (!s) return;
    s.playing = isPlaying;

    if (!player || !player.video) {
      s.beat = Math.max(0, s.beat - 0.05);
      return;
    }

    // Read the true playback position straight from the audio element TextAlive
    // injects inside mediaElement. Its clock is always correct — even when the
    // Songle timer is stale after a seek — and reading currentTime is free. Fall
    // back to the timer-derived mediaPosition until the element exists (or if it's
    // an iframe embed we can't read).
    let audio = audioRef.current;
    if (!audio?.isConnected) {
      const found = player.mediaElement?.querySelector?.("audio, video");
      audio = found instanceof HTMLMediaElement ? found : null;
      audioRef.current = audio;
    }
    const pos =
      audio && Number.isFinite(audio.currentTime) ? audio.currentTime * 1000 : player.mediaPosition;
    positionRef.current = pos;

    const progress = getProgress(player, pos);
    s.pos = pos;
    s.sat = clamp01(progress * 1.2);
    s.beat = getBeatAmp(player, pos);
    s.vocal = getVocalAmp(player, pos);
    s.chorus = isChorus(player, pos);

    // Climax = late-song chorus; ease in/out so transitions feel intentional.
    const climaxTarget = s.chorus && progress > 0.6 ? 1 : 0;
    s.clim += (climaxTarget - s.clim) * (climaxTarget > s.clim ? 0.01 : 0.02);
  });

  return null;
}
