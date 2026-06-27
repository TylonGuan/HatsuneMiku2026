import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Stats } from "@react-three/drei";
import { useControls } from "leva";
import { useRef } from "react";
import type { MutableRefObject } from "react";
import type { Player } from "textalive-app-api";
import { CameraRig } from "./CameraRig";
import { Theater } from "./Theater";
import { Spotlight } from "./Spotlight";
import { BackgroundLight } from "./BackgroundLight";
import { Curtains } from "./Curtains";
import { Chorus } from "./Chorus";
import { Stars } from "./Stars";
import { Miku } from "./Miku";
import { Lyrics } from "./Lyrics";
import { createSignals, SignalsUpdater } from "./Signals";
import type { Signals } from "./Signals";
import type { LyricData } from "../textalive/types";
import type { SongConfig } from "./lyrics/types";
import { Background } from "./Background";

interface Props {
  player: Player | null;
  positionRef: MutableRefObject<number>;
  isPlaying: boolean;
  ended: boolean;
  lyrics: LyricData | null;
  song: SongConfig;
}

export function Scene({ player, positionRef, isPlaying, ended, lyrics, song }: Props) {
  const signalsRef = useRef<Signals>(createSignals());

  // House-light brightness. Raised from the original 0.85 so the stage doesn't
  // read as too dark on dimmer displays; exposed here so it can be tuned live
  // (and re-tuned per monitor) without a rebuild.
  const { ambient, bloom } = useControls("Lighting", {
    ambient: { value: 1.0, min: 0, max: 3, step: 0.05, label: "house lights" },
    // On, but light: its visible benefit is mostly the climax-star sparkle, so it
    // runs at half intensity. Still the heaviest GPU pass — toggle off for FPS.
    bloom: { value: true, label: "bloom" },
  });

  return (
    <>
      {/* Dev-only FPS / frame-time / memory panel (top-left). Stripped from
          production builds, same as the leva panel. */}
      {process.env.NODE_ENV !== "production" && <Stats />}

      <color attach="background" args={["#0b0710"]} />

      <SignalsUpdater
        player={player}
        positionRef={positionRef}
        isPlaying={isPlaying}
        ended={ended}
        signalsRef={signalsRef}
      />

      <CameraRig />
      {/* House lights — flat fill on the whole stage (the spotlight then adds a
          hot spot on top). Tunable via the "Lighting" leva folder; default 1.25
          keeps non-spotlit areas readable on dimmer displays. */}
      <ambientLight intensity={ambient} />
      <Background signalsRef={signalsRef} />
      <Theater />
      <Spotlight signalsRef={signalsRef} />
      <BackgroundLight signalsRef={signalsRef} />
      <Chorus signalsRef={signalsRef} lyrics={lyrics} song={song} />
      <Miku signalsRef={signalsRef} lyrics={lyrics} song={song} />
      <Curtains signalsRef={signalsRef} />
      {lyrics && <Lyrics lyrics={lyrics} signalsRef={signalsRef} song={song} />}
      <Stars signalsRef={signalsRef} />

      {/* multisampling defaults to 8 — heavy on mobile GPUs. 4 keeps edges clean
          on the star/lyric geometry while halving the MSAA resolve cost. Gated on
          the leva toggle so Bloom's cost can be measured / dropped for FPS. */}
      {bloom && (
        <EffectComposer multisampling={4}>
          <Bloom intensity={0.45} luminanceThreshold={0.4} luminanceSmoothing={0.3} mipmapBlur />
        </EffectComposer>
      )}
    </>
  );
}
