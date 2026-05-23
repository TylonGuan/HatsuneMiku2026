import { OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useRef } from "react";
import type { MutableRefObject } from "react";
import type { Player } from "textalive-app-api";
import { Background } from "./Background";
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
      <SignalsUpdater
        player={player}
        positionRef={positionRef}
        isPlaying={isPlaying}
        signalsRef={signalsRef}
      />

      <Background signalsRef={signalsRef} />
      {lyrics && <Lyrics lyrics={lyrics} signalsRef={signalsRef} />}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.06}
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.3}
        minDistance={5}
        maxDistance={30}
        target={[0, 0, 0]}
      />

      <EffectComposer>
        <Bloom
          intensity={0.9}
          luminanceThreshold={0.2}
          luminanceSmoothing={0.3}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}
