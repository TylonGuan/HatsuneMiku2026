import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useRef } from "react";
import type { MutableRefObject } from "react";
import type { Player } from "textalive-app-api";
import { CameraRig } from "./CameraRig";
import { Theater } from "./Theater";
import { Lyrics } from "./Lyrics";
import { createSignals, SignalsUpdater } from "./Signals";
import type { Signals } from "./Signals";
import type { LyricData } from "../textalive/types";

interface Props {
  player: Player | null;
  positionRef: MutableRefObject<number>;
  isPlaying: boolean;
  lyrics: LyricData | null;
}

export function Scene({ player, positionRef, isPlaying, lyrics }: Props) {
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
      <Theater />
      {lyrics && <Lyrics lyrics={lyrics} signalsRef={signalsRef} />}

      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.4} luminanceSmoothing={0.3} mipmapBlur />
      </EffectComposer>
    </>
  );
}
