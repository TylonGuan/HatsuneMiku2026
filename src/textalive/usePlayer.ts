import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import { Player } from "textalive-app-api";
import type { IPlayerApp, IVideo } from "textalive-app-api";
import { ENGLISH, SONG, TEXTALIVE_TOKEN } from "../config";
import type { SongConfig } from "../scene/lyrics/types";
import { buildLyrics } from "./buildLyrics";
import type { LyricData } from "./types";

/** Whether the TextAlive player has finished loading the song data. */
export type PlayerStatus = "loading" | "ready";

/** Actions the UI can call to control playback. */
export interface PlayerControls {
  play: () => void;
  pause: () => void;
  toggle: () => void;
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
 * `controls` — functions the UI calls to play, pause, seek, or adjust volume.
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
  /** True the moment the song naturally finished (onStop). Cleared on the next
   *  user-initiated play. The UI uses this to bring the title card back instead
   *  of the "Paused" overlay, so end-of-song feels like a clean reset. */
  ended: boolean;
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

/** Default volume level between 0–100. Mobile/touch builds omit the in-app
 *  volume slider (users adjust with the hardware buttons), so this is the level
 *  they start at. */
const DEFAULT_VOLUME = 70;

/**
 * React hook that initialises the TextAlive Player, loads song data,
 * tracks playback state, and exposes controls to the rest of the app.
 */
export function usePlayer(
  mediaRef: RefObject<HTMLElement>,
  song?: SongConfig,
): UsePlayerResult {
  const [player, setPlayer] = useState<Player | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("loading");
  const [isPlaying, setIsPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
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
  /** Song duration cached for use inside event-listener closures (`duration`
   *  state is captured stale by the listeners registered in the mount effect). */
  const durationRef = useRef(0);
  /** Highest playback position observed during the current play-through. When
   *  the song reaches its natural end TextAlive's `onPause` fires (NOT
   *  `onStop` — that one is unreliable for audio-runout). Comparing this peak
   *  against {@link durationRef} on pause lets us distinguish "song ended" from
   *  "user paused mid-song." Reset on every fresh play (via `onPlay`). */
  const peakPosRef = useRef(0);
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
        const data = buildLyrics(video, song?.chorusTimings);
        lyricsRef.current = data;
        setLyrics(data);
        setDuration(video.duration);
        durationRef.current = video.duration;
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
        // Track peak — used by `onPause` to distinguish song-end from user-pause.
        if (position > peakPosRef.current) peakPosRef.current = position;
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
        // Fresh play — clear end-of-song flag and reset the peak so a future
        // `onPause` only counts as "ended" if we actually got back to the end.
        setEnded(false);
        peakPosRef.current = 0;
      },
      // Pause event: covers BOTH user-initiated pause and natural song-end.
      // We distinguish them by checking whether the peak position we observed
      // during this play-through is essentially at the song's duration. The
      // 500 ms slack absorbs audio-buffer rounding (the element usually stops
      // a few ms short of `duration`).
      onPause: () => {
        setIsPlaying(false);
        if (durationRef.current > 0 && peakPosRef.current >= durationRef.current - 500) {
          setEnded(true);
        }
      },
      // Some TextAlive releases also fire `onStop` on natural end. Belt and
      // suspenders — handle it the same way as a song-end pause.
      onStop: () => {
        setIsPlaying(false);
        setEnded(true);
      },
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
    const activePlayer = playerRef.current;
    if (!activePlayer) return;
    try {
      activePlayer.volume = isMuted ? 0 : vol;
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
        const activePlayer = playerRef.current;
        if (!activePlayer) return;
        userInitiatedRef.current = true;
        if (activePlayer.isPlaying) activePlayer.requestPause();
        else activePlayer.requestPlay();
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
    ended,
    lyrics,
    subtitle,
    duration,
    volume,
    muted,
    controls,
  };
}
