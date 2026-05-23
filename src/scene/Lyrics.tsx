import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import type { RefObject } from "react";
import { AdditiveBlending, Color, Group, Sprite, SpriteMaterial } from "three";
import { charTexture } from "./textTexture";
import { hsl } from "./color";
import type { CharDatum, LyricData } from "../textalive/types";
import type { Signals } from "./Signals";

const LEAD = 1200; // ms before a phrase that its glyphs fly in
const TRAIL = 1500; // ms after a phrase that its glyphs fly out
const BASE_SCALE = 0.9;

interface Item {
  sprite: Sprite;
  material: SpriteMaterial;
  datum: CharDatum;
  color: Color;
  target: Color;
}

const smoothstep = (u: number): number => u * u * (3 - 2 * u);

interface Props {
  lyrics: LyricData;
  signalsRef: RefObject<Signals>;
}

export function Lyrics({ lyrics, signalsRef }: Props) {
  const { group, items } = useMemo(() => {
    const g = new Group();
    const its: Item[] = [];
    for (const datum of lyrics.chars) {
      const material = new SpriteMaterial({
        map: charTexture(datum.text),
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        opacity: 0,
      });
      const sprite = new Sprite(material);
      sprite.position.copy(datum.entry);
      sprite.scale.setScalar(0);
      sprite.visible = false;
      g.add(sprite);
      its.push({
        sprite,
        material,
        datum,
        color: new Color(0.6, 0.5, 0.55),
        target: new Color(0.6, 0.5, 0.55),
      });
    }
    return { group: g, items: its };
  }, [lyrics]);

  useEffect(() => () => items.forEach((it) => it.material.dispose()), [items]);

  useFrame(({ clock }) => {
    const s = signalsRef.current;
    if (!s) return;
    const { pos, sat, clim, beat, vocal } = s;
    const time = clock.elapsedTime;

    for (const it of items) {
      const d = it.datum;
      const enter = d.phraseStart - LEAD;
      const arrive = d.phraseStart;
      const leave = d.phraseEnd;
      const gone = d.phraseEnd + TRAIL;

      if (pos < enter || pos >= gone) {
        if (it.material.opacity > 0.002) {
          it.material.opacity *= 0.85;
        } else {
          it.sprite.visible = false;
          continue;
        }
      }
      it.sprite.visible = true;

      let p: number;
      if (pos < arrive) p = ((pos - enter) / Math.max(1, arrive - enter)) * 0.35;
      else if (pos < leave) p = 0.35 + ((pos - arrive) / Math.max(1, leave - arrive)) * 0.3;
      else p = 0.65 + ((pos - leave) / Math.max(1, gone - leave)) * 0.35;
      p = Math.min(1, Math.max(0, p));

      let bx: number;
      let by: number;
      let bz: number;
      if (p < 0.35) {
        const e = smoothstep(p / 0.35);
        bx = d.entry.x + (d.settle.x - d.entry.x) * e;
        by = d.entry.y + (d.settle.y - d.entry.y) * e;
        bz = d.entry.z + (d.settle.z - d.entry.z) * e;
      } else if (p < 0.65) {
        const u = (p - 0.35) / 0.3;
        bx = d.settle.x + Math.sin(u * Math.PI * 2) * 0.1;
        by = d.settle.y + Math.sin(u * Math.PI) * 0.05;
        bz = d.settle.z;
      } else {
        const e = smoothstep((p - 0.65) / 0.35);
        bx = d.settle.x + (d.exit.x - d.settle.x) * e;
        by = d.settle.y + (d.exit.y - d.settle.y) * e;
        bz = d.settle.z + (d.exit.z - d.settle.z) * e;
      }

      const windAmp = 0.3 + p * 0.7;
      bx += Math.sin(time * 2.5 + d.windPhase) * 0.4 * windAmp;
      by += Math.sin(time * 1.8 + d.windPhase * 1.3) * 0.25 * windAmp;
      bz += Math.cos(time * 2 + d.windPhase * 0.7) * 0.3 * windAmp;
      it.sprite.position.set(bx, by, bz);

      const isActive = pos >= arrive && pos <= leave;

      let alpha: number;
      let scale: number;
      if (p < 0.35) {
        const f = smoothstep(p / 0.35);
        alpha = f * 0.95;
        scale = f * (0.6 + sat * 0.3 + clim * 0.2);
      } else if (p < 0.65) {
        alpha = 0.95;
        scale = 0.6 + sat * 0.3 + clim * 0.2 + beat * 0.08;
      } else {
        const f = 1 - smoothstep((p - 0.65) / 0.35);
        alpha = f * 0.8;
        scale = f * (0.5 + sat * 0.2);
      }
      it.material.opacity += (alpha - it.material.opacity) * 0.12;
      const finalScale = scale * BASE_SCALE * (1 + beat * 0.2) * (isActive ? 1 + vocal * 0.15 : 1);
      it.sprite.scale.setScalar(finalScale);

      // Color: near-white at the start of the song, blooming into magenta.
      if (isActive) {
        it.target.copy(hsl(335 - sat * 70 + clim * 25, 12 + sat * 68, 60 + sat * 22 + clim * 15));
      } else if (p < 0.35 || p >= 0.65) {
        it.target.copy(hsl(320 + Math.sin(time + d.windPhase) * 15, 8 + sat * 22, 38 + sat * 18));
      } else {
        it.target.copy(hsl(320, 6 + sat * 16, 30 + sat * 12));
      }
      it.color.lerp(it.target, 0.06);
      it.material.color.copy(it.color);
    }
  });

  return <primitive object={group} />;
}
