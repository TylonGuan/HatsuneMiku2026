import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import { Player } from "textalive-app-api";
import type { IPlayerApp, IVideo } from "textalive-app-api";
import { ENGLISH, SONG, TEXTALIVE_TOKEN } from "../config";
import { buildLyrics } from "./buildLyrics";
import type { LyricData } from "./types";

/** Whether the TextAlive player has finished loading the song data. */
export type PlayerStatus = "loading" | "ready";

/** Actions the UI can call to control playback. */
export interface PlayerControls {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  skip: () => void;
  /** Seek playback to a position [ms]. */
  seek: (ms: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
}

/**
 * Return value of {@link usePlayer}.
 *
 * `player` / `lyrics` / `duration` / `status` — loaded once when the song initialises.
 * `isPlaying` / `positionRef` / `subtitle` — updated live during playback.
 * `volume` / `muted` — current audio state.
 * `controls` — functions the UI calls to play, pause, skip, seek, or adjust volume.
 */
export interface UsePlayerResult {
  /** The raw TextAlive Player instance (null before onAppReady). */
  player: Player | null;
  /** Mutable ref updated every frame with the current song position (ms). */
  positionRef: MutableRefObject<number>;
  /** Whether lyrics/phrases have been loaded from the API. */
  status: PlayerStatus;
  /** True while the song is actively playing. */
  isPlaying: boolean;
  /** The computed lyric data (char positions, phrases, timing), or null before ready. */
  lyrics: LyricData | null;
  /** English subtitle for the current phrase, or null outside any phrase. */
  subtitle: string | null;
  /** Total song duration in ms. */
  duration: number;
  /** Current volume level (0–100). */
  volume: number;
  /** Whether audio is muted. */
  muted: boolean;
  /** Stable set of playback control functions. */
  controls: PlayerControls;
}

/** Default volume level between 0–100. */
const DEFAULT_VOLUME = 20;

/**
 * React hook that initialises the TextAlive Player, loads song data,
 * tracks playback state, and exposes controls to the rest of the app.
 */
export function usePlayer(mediaRef: RefObject<HTMLElement>): UsePlayerResult {
  const [player, setPlayer] = useState<Player | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("loading");
  const [isPlaying, setIsPlaying] = useState(false);
  const [lyrics, setLyrics] = useState<LyricData | null>(null);
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [muted, setMuted] = useState(false);

  /** Ref kept in sync with position so the animation loop can read it without re-renders. */
  const positionRef = useRef(0);
  /** Stable reference to the TextAlive Player for use in callbacks. */
  const playerRef = useRef<Player | null>(null);
  /** Stable reference to LyricData for `onTimeUpdate` callbacks. */
  const lyricsRef = useRef<LyricData | null>(null);
  /** Key of the phrase indices currently shown, so we only setSubtitle on changes. */
  const lastSubtitleKeyRef = useRef("");
  /**
   * The TextAlive API auto-plays when the video loads.
   * We suppress that until the user explicitly clicks.
   */
  const userInitiatedRef = useRef(false);

  // ---- Initialise TextAlive Player on mount ----
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    // The song is only truly playable once BOTH the lyric data (onVideoReady) and
    // the audio timer (onTimerReady, which waits on Songle's song.json) have
    // loaded. We flip to "ready" only when both are done — otherwise a click in
    // the gap starts a not-yet-loaded player, which then gets clobbered (paused)
    // when loading finalizes.
    let videoLoaded = false;
    let timerLoaded = false;
    const markReadyWhenLoaded = () => {
      if (videoLoaded && timerLoaded) setStatus("ready");
    };

    const musicPlayer = new Player({
      app: { token: TEXTALIVE_TOKEN },
      mediaElement: media,
      vocalAmplitudeEnabled: true,
    });
    playerRef.current = musicPlayer;

    musicPlayer.addListener({
      /** App is ready — load the song URL if one wasn't provided via managed mode. */
      onAppReady: (app: IPlayerApp) => {
        if (!app.managed && !app.songUrl) {
          musicPlayer.createFromSongUrl(SONG.url, { video: SONG.video });
        }
      },
      /** Lyric data loaded — build geometry. (Audio timer may still be loading.) */
      onVideoReady: (video: IVideo) => {
        if (!video.firstChar) return;
        const data = buildLyrics(video);
        lyricsRef.current = data;
        setLyrics(data);
        setDuration(video.duration);
        videoLoaded = true;
        markReadyWhenLoaded();
      },
      /** Audio timer is live (Songle song.json returned) — playback can be honored. */
      onTimerReady: () => {
        timerLoaded = true;
        markReadyWhenLoaded();
      },
      /**
       * Update the subtitle from the phrase(s) sounding now. We read the true
       * position from positionRef (the <audio> element's clock, see SignalsUpdater)
       * rather than this event's argument, which comes from the Songle timer and can
       * be stale after a seek. Shows *every* active phrase, so the two parallel
       * chorus voices both appear instead of just one.
       */
      onTimeUpdate: () => {
        const data = lyricsRef.current;
        if (!data) return;
        const position = positionRef.current;
        const active = data.phrases.filter((p) => position >= p.startTime && position < p.endTime);
        const key = active.map((p) => p.index).join(",");
        if (key !== lastSubtitleKeyRef.current) {
          lastSubtitleKeyRef.current = key;
          const lines = active.map((p) => ENGLISH[p.index]).filter(Boolean);
          setSubtitle(lines.length ? lines.join("\n") : null);
        }
      },
      onPlay: () => {
        // Suppress the API's initial auto-play until the user clicks.
        if (!userInitiatedRef.current) {
          musicPlayer.requestPause();
          return;
        }
        setIsPlaying(true);
      },
      // User/explicit pause — playhead stays put.
      onPause: () => setIsPlaying(false),
      // Song reached the end — API auto-stops and rewinds.
      onStop: () => setIsPlaying(false),
    });

    setPlayer(musicPlayer);

    return () => {
      playerRef.current = null;
      musicPlayer.dispose();
    };
  }, [mediaRef]);

  /**
   * Apply a volume level to the TextAlive Player.
   * Silently no-ops if the player isn't ready yet.
   */
  const applyVolume = useCallback((vol: number, isMuted: boolean) => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.volume = isMuted ? 0 : vol;
    } catch {
      /* volume not settable before media is ready */
    }
  }, []);

  /** Stable set of control functions, memoised so they don't cause re-renders. */
  const controls = useMemo<PlayerControls>(
    () => ({
      play: () => {
        userInitiatedRef.current = true;
        playerRef.current?.requestPlay();
      },
      pause: () => playerRef.current?.requestPause(),
      toggle: () => {
        const p = playerRef.current;
        if (!p) return;
        userInitiatedRef.current = true;
        if (p.isPlaying) p.requestPause();
        else p.requestPlay();
      },
      skip: () => {
        const p = playerRef.current;
        const first = p?.video?.firstChar;
        if (!p || !first) return;
        userInitiatedRef.current = true;
        p.requestMediaSeek(first.startTime);
        if (!p.isPlaying) p.requestPlay();
      },
      // Seek the audio element. The scene reads the element's true position each
      // frame (see SignalsUpdater), so this stays correct whether playing or paused.
      seek: (ms: number) => playerRef.current?.requestMediaSeek(ms),
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

  // Push the initial volume once the player can accept it (status === "ready").
  useEffect(() => {
    if (status === "ready") applyVolume(volume, muted);
  }, [status, volume, muted, applyVolume]);

  return {
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
  };
}
