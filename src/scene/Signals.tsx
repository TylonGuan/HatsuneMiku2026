import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { MutableRefObject, RefObject } from "react";
import type { Player } from "textalive-app-api";
import {
  getBeatAmp,
  getBeatPhase,
  getPhrasePhase,
  getProgress,
  getVocalAmp,
  getWordPhase,
  isChorus,
} from "../textalive/analysis";
import { clamp01 } from "./color";

// Climax intensity — a smoothed 0..1 that ramps up over the late, final-chorus
// stretch of the song. Drives the background warm-up (see Background.tsx).
// NOTE: the star confetti is NOT gated on this — it fires at a fixed song cue
// (STAR_START_MS in Stars.tsx). CLIMAX_PROGRESS sets when the warm-up kicks in
// (0.8 = only the last fifth of the song); the out-fade is quicker so it doesn't
// linger.
const CLIMAX_PROGRESS = 0.8;
const CLIMAX_FADE_IN = 0.02;
const CLIMAX_FADE_OUT = 0.05;

// Vocal-amplitude shaping for amplitude-driven motion (the la-la bob). A low-pass
// follower: the attack is deliberately gentle so within-note amplitude noise
// (a "la" isn't one clean ramp) smooths into a SINGLE rise per note rather than a
// jittery cluster of little bobs; the decay is a touch quicker so it still dips
// between notes (up-la-down, up-la-down). `vocalBob` then gates out the low-level
// floor (instrument bleed / noise) and expands the rest, so the motion follows
// the vocal rather than drifting with the backing.
//   Jittery within a note?  → lower VOCAL_ATTACK (smoother rise).
//   Notes blur together?    → raise VOCAL_ATTACK / VOCAL_DECAY (more responsive).
const VOCAL_ATTACK = 0.1;
const VOCAL_DECAY = 0.5;
/** Amplitude below this reads as silence/bleed → no bob; above it is expanded to
 *  fill 0..1. Raise if instruments still drive the bob; lower if quiet ad-libs
 *  don't register. */
const VOCAL_FLOOR = 0.10;

// Per-frame signals shared by the whole scene.
export interface Signals {
  pos: number; // song position (ms)
  sat: number; // 0 (colorless) -> 1 (full color), follows song progress
  clim: number; // smoothed climax intensity (final chorus)
  beat: number; // 0..1 sharp pulse — peaks on each beat, decays fast
  beatPhase: number; // 0..1 position within current beat; -1 if no beat data
  beats: number; // continuous beats elapsed (beat index + intra-beat phase); lets motion lock to tempo. Holds its last value when no beat data.
  wordPhase: number; // 0..1 position within current sung word; -1 if no word active
  phrasePhase: number; // 0..1 position within current lyric phrase; -1 if no phrase active
  vocal: number; // 0..1 vocal amplitude (raw, can be jittery)
  vocalSmooth: number; // 0..1 attack/decay-smoothed vocal amplitude (peak follower)
  vocalBob: number; // 0..1 floor-gated + expanded vocalSmooth — drives the la-la bob
  chorus: boolean;
  playing: boolean;
  ended: boolean; // true the moment the song naturally finished; cleared on next play
}

export function createSignals(): Signals {
  return {
    pos: 0,
    sat: 0,
    clim: 0,
    beat: 0,
    beatPhase: -1,
    beats: 0,
    wordPhase: -1,
    phrasePhase: -1,
    vocal: 0,
    vocalSmooth: 0,
    vocalBob: 0,
    chorus: false,
    playing: false,
    ended: false,
  };
}

interface Props {
  player: Player | null;
  positionRef: MutableRefObject<number>;
  isPlaying: boolean;
  ended: boolean;
  signalsRef: RefObject<Signals>;
}

// Runs first in the frame loop so children read fresh values.
export function SignalsUpdater({ player, positionRef, isPlaying, ended, signalsRef }: Props) {
  // Cached <audio>/<video> element (found once the song loads, re-found if replaced).
  const audioRef = useRef<HTMLMediaElement | null>(null);
  // Running beat count + the start time of the beat we last saw, so `s.beats`
  // can advance continuously across beat boundaries (for tempo-locked motion).
  const beatIndexRef = useRef(0);
  const prevBeatStartRef = useRef(-1);

  useFrame(() => {
    const s = signalsRef.current;
    if (!s) return;
    s.playing = isPlaying;
    s.ended = ended;

    if (!player || !player.video) {
      s.beat = Math.max(0, s.beat - 0.05);
      s.beatPhase = -1;
      s.wordPhase = -1;
      s.phrasePhase = -1;
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
    s.beatPhase = getBeatPhase(player, pos);

    // Continuous beat position (index + intra-beat phase), so motion can lock to
    // the song's tempo instead of wall-clock time. Bump the index whenever a new
    // beat starts; hold the last value when there's no beat data (so tempo-locked
    // motion doesn't snap during beatless gaps).
    const beat = player.findBeat?.(pos);
    if (beat && beat.duration > 0) {
      if (beat.startTime !== prevBeatStartRef.current) {
        if (prevBeatStartRef.current >= 0) beatIndexRef.current += 1;
        prevBeatStartRef.current = beat.startTime;
      }
      s.beats = beatIndexRef.current + clamp01((pos - beat.startTime) / beat.duration);
    }

    s.wordPhase = getWordPhase(player, pos);
    s.phrasePhase = getPhrasePhase(player, pos);
    s.vocal = getVocalAmp(player, pos);
    // Peak-follow the raw amplitude: rise fast to a new peak, fall moderately.
    s.vocalSmooth +=
      (s.vocal - s.vocalSmooth) * (s.vocal > s.vocalSmooth ? VOCAL_ATTACK : VOCAL_DECAY);
    // Gate out the low-level floor and expand the rest, so the bob tracks the
    // voice (each ad-lib note) and not the constant backing.
    s.vocalBob = clamp01((s.vocalSmooth - VOCAL_FLOOR) / (1 - VOCAL_FLOOR));
    s.chorus = isChorus(player, pos);

    // Climax = late-song chorus; ease in/out so transitions feel intentional.
    const climaxTarget = s.chorus && progress > CLIMAX_PROGRESS ? 1 : 0;
    s.clim += (climaxTarget - s.clim) * (climaxTarget > s.clim ? CLIMAX_FADE_IN : CLIMAX_FADE_OUT);
  });

  return null;
}
