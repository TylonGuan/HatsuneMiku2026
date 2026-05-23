import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import { Player } from "textalive-app-api";
import type { IPlayerApp, IVideo } from "textalive-app-api";
import { ENGLISH, SONG, TEXTALIVE_TOKEN } from "../config";
import { buildLyrics } from "./buildLyrics";
import type { LyricData } from "./types";

export type PlayerStatus = "loading" | "ready";

export interface PlayerControls {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  skip: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
}

export interface UsePlayerResult {
  player: Player | null;
  positionRef: MutableRefObject<number>;
  status: PlayerStatus;
  isPlaying: boolean;
  lyrics: LyricData | null;
  subtitle: string | null;
  volume: number;
  muted: boolean;
  controls: PlayerControls;
}

const DEFAULT_VOLUME = 70;

export function usePlayer(mediaRef: RefObject<HTMLElement>): UsePlayerResult {
  const [player, setPlayer] = useState<Player | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("loading");
  const [isPlaying, setIsPlaying] = useState(false);
  const [lyrics, setLyrics] = useState<LyricData | null>(null);
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [muted, setMuted] = useState(false);

  const positionRef = useRef(0);
  const playerRef = useRef<Player | null>(null);
  const lyricsRef = useRef<LyricData | null>(null);
  const lastPhraseRef = useRef(-1);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const p = new Player({
      app: { token: TEXTALIVE_TOKEN },
      mediaElement: media,
      vocalAmplitudeEnabled: true,
    });
    playerRef.current = p;

    p.addListener({
      onAppReady: (app: IPlayerApp) => {
        if (!app.managed && !app.songUrl) {
          p.createFromSongUrl(SONG.url, { video: SONG.video });
        }
      },
      onVideoReady: (video: IVideo) => {
        if (!video.firstChar) return;
        const data = buildLyrics(video);
        lyricsRef.current = data;
        setLyrics(data);
        setStatus("ready");
      },
      onTimeUpdate: (position: number) => {
        positionRef.current = position;
        const data = lyricsRef.current;
        if (!data) return;
        let idx = -1;
        for (const ph of data.phrases) {
          if (position >= ph.startTime && position <= ph.endTime + 300) {
            idx = ph.index;
            break;
          }
        }
        if (idx !== lastPhraseRef.current) {
          lastPhraseRef.current = idx;
          setSubtitle(idx >= 0 ? ENGLISH[Math.min(idx, ENGLISH.length - 1)] ?? null : null);
        }
      },
      onPlay: () => setIsPlaying(true),
      onPause: () => setIsPlaying(false),
      onStop: () => setIsPlaying(false),
    });

    setPlayer(p);

    return () => {
      playerRef.current = null;
      p.dispose();
    };
  }, [mediaRef]);

  const applyVolume = useCallback((vol: number, isMuted: boolean) => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.volume = isMuted ? 0 : vol;
    } catch {
      /* volume not settable before media is ready */
    }
  }, []);

  const controls = useMemo<PlayerControls>(
    () => ({
      play: () => playerRef.current?.requestPlay(),
      pause: () => playerRef.current?.requestPause(),
      toggle: () => {
        const p = playerRef.current;
        if (!p) return;
        if (p.isPlaying) p.requestPause();
        else p.requestPlay();
      },
      skip: () => {
        const p = playerRef.current;
        const first = p?.video?.firstChar;
        if (!p || !first) return;
        p.requestMediaSeek(first.startTime);
        if (!p.isPlaying) p.requestPlay();
      },
      setVolume: (v: number) => {
        setVolumeState(v);
        setMuted(false);
        applyVolume(v, false);
      },
      toggleMute: () => {
        setMuted((prev) => {
          const next = !prev;
          applyVolume(volume, next);
          return next;
        });
      },
    }),
    [applyVolume, volume],
  );

  // Push the initial volume once the player can accept it.
  useEffect(() => {
    if (status === "ready") applyVolume(volume, muted);
  }, [status, volume, muted, applyVolume]);

  return { player, positionRef, status, isPlaying, lyrics, subtitle, volume, muted, controls };
}
