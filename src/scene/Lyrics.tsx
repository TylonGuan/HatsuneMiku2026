import { useFrame } from "@react-three/fiber";
import { useControls } from "leva";
import { useEffect, useMemo } from "react";
import type { RefObject } from "react";
import { AdditiveBlending, Color, Group, Sprite, SpriteMaterial } from "three";
import { charTexture } from "./textTexture";
import { hsl } from "./color";
import type { CharDatum, LyricData } from "../textalive/types";
import type { Signals } from "./Signals";
import { answerMeLyricOverrides } from "./lyricsConfig";
import type { LyricLineConfig } from "./lyricsConfig";

// Timing offsets for the entry/exit animation lifecycle.
const LEAD = 1200; // ms before a phrase starts — characters begin flying in
const TRAIL = 1500; // ms after a phrase ends — characters finish flying out
const BASE_SCALE = 0.9;

// One sprite + its per-frame animation state.
interface Item {
  sprite: Sprite;
  material: SpriteMaterial;
  datum: CharDatum; // original API data: text, timing, entry/settle/exit positions, windPhase
  color: Color; // current lerped color
  target: Color; // target color we lerp toward each frame
}

// Smooth Hermite interpolation: 0 → 1 with easing at both ends.
const smoothstep = (u: number): number => u * u * (3 - 2 * u);

interface Props {
  lyrics: LyricData; // immutable song-segment data from TextAlive
  signalsRef: RefObject<Signals>; // real-time playback signals (pos, sat, clim, beat, vocal)
}

export function Lyrics({ lyrics, signalsRef }: Props) {
  // ---- Build sprites once when lyrics data changes ----
  // Each character gets its own Sprite with a canvas-generated texture.
  const { group, items } = useMemo(() => {
    const g = new Group();
    const its: Item[] = [];
    for (const datum of lyrics.chars) {
      // Transparent sprite with additive blending for a glowing look.
      const material = new SpriteMaterial({
        map: charTexture(datum.text),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
        opacity: 0, // starts invisible
      });
      const sprite = new Sprite(material);
      sprite.position.copy(datum.entry);
      sprite.scale.setScalar(0);
      sprite.renderOrder = 10; // draw above the theater backdrop planes
      sprite.visible = false;
      g.add(sprite);
      its.push({
        sprite,
        material,
        datum,
        color: new Color(0.6, 0.5, 0.55), // initial warm gray
        target: new Color(0.6, 0.5, 0.55),
      });
    }
    return { group: g, items: its };
  }, [lyrics]);

  // Cleanup: dispose GPU textures when component unmounts.
  useEffect(() => () => items.forEach((it) => it.material.dispose()), [items]);

  // Live tuning: 0 = a word's characters all appear together; 1 = each character
  // appears on its own sung beat (natural karaoke-style rhythm). Drag to taste.
  const { sweep } = useControls("Lyrics", {
    sweep: { value: 0.25, min: 0, max: 1, step: 0.01, label: "word sweep" },
  });

  // ---- Per-frame animation loop ----
  useFrame(({ clock }) => {
    const s = signalsRef.current;
    if (!s) return;
    const { pos, sat, clim, beat, vocal } = s;
    const time = clock.elapsedTime;

    for (const it of items) {
      const d = it.datum;
      const cfg: LyricLineConfig | undefined = answerMeLyricOverrides[d.phraseIndex];

      // Reveal window. `sweep` blends each character from its word's window
      // (0 = the whole word appears together) to its own sung time (1 = each
      // character on its natural beat).
      const arrive = d.wordStart + (d.charStart - d.wordStart) * sweep; // fully visible
      const leave = d.wordEnd + (d.charEnd - d.wordEnd) * sweep; // begin fade-out
      const enter = arrive - LEAD; // begin fade-in
      const gone = leave + TRAIL; // fully gone

      // ---- Visibility & fade-out when outside the window ----
      if (pos < enter || pos >= gone) {
        // Exponential fade-out when outside the active window.
        if (it.material.opacity > 0.002) {
          it.material.opacity *= 0.85;
        } else {
          it.sprite.visible = false;
          continue;
        }
      }
      it.sprite.visible = true;

      // ---- Compute lifecycle progress p ∈ [0, 1] ----
      // p maps to three phases: fly-in (0–0.35), settled (0.35–0.65), fly-out (0.65–1).
      let p: number;
      if (pos < arrive) {
        p = ((pos - enter) / Math.max(1, arrive - enter)) * 0.35;
      } else if (pos < leave) {
        p = 0.35 + ((pos - arrive) / Math.max(1, leave - arrive)) * 0.3;
      } else {
        p = 0.65 + ((pos - leave) / Math.max(1, gone - leave)) * 0.35;
      }
      p = Math.min(1, Math.max(0, p));

      // ---- Position: interpolate along entry → settle → exit path ----
      let bx: number;
      let by: number;
      let bz: number;
      const anim = cfg?.anim ?? "default";
      if (p < 0.35) {
        // Phase 1: fly in from entry to settle position.
        const e = smoothstep(p / 0.35);
        bx = d.entry.x + (d.settle.x - d.entry.x) * e;
        by = d.entry.y + (d.settle.y - d.entry.y) * e;
        bz = d.entry.z + (d.settle.z - d.entry.z) * e;
      } else if (p < 0.65) {
        // Phase 2: settled — gentle wobble, or float upward depending on anim style.
        const u = (p - 0.35) / 0.3;
        bx = d.settle.x + Math.sin(u * Math.PI * 2) * 0.1;
        by = d.settle.y + Math.sin(u * Math.PI) * 0.05;
        bz = d.settle.z;
        if (anim === "float-up") {
          by += u * 0.8; // slowly rises while on screen
        }
      } else {
        // Phase 3: fly out from settle to exit position.
        const e = smoothstep((p - 0.65) / 0.35);
        bx = d.settle.x + (d.exit.x - d.settle.x) * e;
        by = d.settle.y + (d.exit.y - d.settle.y) * e;
        bz = d.settle.z + (d.exit.z - d.settle.z) * e;
        if (anim === "swirl-out") {
          const angle = e * Math.PI * 3;
          bx += Math.sin(angle) * 1.5 * e;
          bz += Math.cos(angle) * 1.5 * e;
        }
      }

      // ---- Wind wobble: continuous sine-wave offset on top of the base path ----
      // Amplitude increases as the character progresses (more drift at exit).
      const windAmp = 0.3 + p * 0.7;
      bx += Math.sin(time * 2.5 + d.windPhase) * 0.4 * windAmp;
      by += Math.sin(time * 1.8 + d.windPhase * 1.3) * 0.25 * windAmp;
      bz += Math.cos(time * 2 + d.windPhase * 0.7) * 0.3 * windAmp;

      // Per-phrase config: position offsets applied to the settle position.
      if (cfg) {
        bx += cfg.settleX ?? 0;
        by += cfg.settleY ?? 0;
        bz += cfg.settleZ ?? 0;
      }
      it.sprite.position.set(bx, by, bz);

      // Whether this character is in the "actively sung" portion of its phrase.
      const isActive = pos >= arrive && pos <= leave;

      // ---- Opacity & scale ----
      let alpha: number;
      let scale: number;
      if (p < 0.35) {
        // Fade in + grow during entry.
        const f = smoothstep(p / 0.35);
        alpha = f * 0.95;
        scale = f * (0.6 + sat * 0.3 + clim * 0.2);
      } else if (p < 0.65) {
        // Full opacity while settled; scale pulses with beat.
        alpha = 0.95;
        scale = 0.6 + sat * 0.3 + clim * 0.2 + beat * 0.08;
      } else {
        // Fade out + shrink during exit.
        const f = 1 - smoothstep((p - 0.65) / 0.35);
        alpha = f * 0.8;
        scale = f * (0.5 + sat * 0.2);
      }
      // Smooth opacity transition (lerp, not instant).
      it.material.opacity += (alpha - it.material.opacity) * 0.12;
      // Final scale = base × cfg.scale × saturation/climax × beat pulse × vocal pulse (active only).
      const cfgScale = cfg?.scale ?? 1;
      const finalScale =
        scale * BASE_SCALE * cfgScale * (1 + beat * 0.2) * (isActive ? 1 + vocal * 0.15 : 1);
      it.sprite.scale.setScalar(finalScale);

      // ---- Color: shifts from near-white to warm magenta as saturation builds ----
      if (isActive && cfg?.hue !== undefined) {
        // Per-phrase override: use the configured color.
        it.target.copy(hsl(cfg.hue, cfg.saturation ?? 80, cfg.lightness ?? 70));
      } else if (isActive) {
        // Default: warmer, more vibrant during the sung portion.
        it.target.copy(hsl(335 - sat * 70 + clim * 25, 12 + sat * 68, 60 + sat * 22 + clim * 15));
      } else if (p < 0.35 || p >= 0.65) {
        // Transitioning in/out: dimmer with a subtle hue wobble from windPhase.
        it.target.copy(hsl(320 + Math.sin(time + d.windPhase) * 15, 8 + sat * 22, 38 + sat * 18));
      } else {
        // Settled but inactive (between phrases): most muted.
        it.target.copy(hsl(320, 6 + sat * 16, 30 + sat * 12));
      }
      it.color.lerp(it.target, 0.06);
      it.material.color.copy(it.color);
    }
  });

  return <primitive object={group} />;
}
