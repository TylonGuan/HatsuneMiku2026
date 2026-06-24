import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useRef } from "react";
import type { MutableRefObject } from "react";
import type { Player } from "textalive-app-api";
import { CameraRig } from "./CameraRig";
import { Theater } from "./Theater";
import { Spotlight } from "./Spotlight";
import { BackgroundLight } from "./BackgroundLight";
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
  lyrics: LyricData | null;
  song: SongConfig;
}

export function Scene({ player, positionRef, isPlaying, lyrics, song }: Props) {
  const signalsRef = useRef<Signals>(createSignals());

  return (
    <>
      <color attach="background" args={["#0b0710"]} />

      <SignalsUpdater
        player={player}
        positionRef={positionRef}
        isPlaying={isPlaying}
        signalsRef={signalsRef}
      />

      <CameraRig />
      {/* House lights. 0.85 keeps non-spotlit areas at ~85% of TINT brightness —
          a hair darker than the original unlit look, while still leaving room
          for the spotlight to feel like an added hot spot on top. */}
      <ambientLight intensity={0.85} />
      <Background signalsRef={signalsRef} />
      <Theater />
      <Spotlight signalsRef={signalsRef} />
      <BackgroundLight />
      <Miku signalsRef={signalsRef} lyrics={lyrics} />
      {lyrics && <Lyrics lyrics={lyrics} signalsRef={signalsRef} song={song} />}

      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.4} luminanceSmoothing={0.3} mipmapBlur />
      </EffectComposer>
    </>
  );
}
