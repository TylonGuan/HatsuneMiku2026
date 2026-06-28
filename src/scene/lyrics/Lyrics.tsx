import { useFrame, useThree } from "@react-three/fiber";
import { folder, useControls } from "leva";
import { useEffect, useMemo } from "react";
import type { RefObject } from "react";
import {
  AdditiveBlending,
  Color,
  Group,
  PerspectiveCamera,
  Sprite,
  SpriteMaterial,
} from "three";
import { charTexture } from "./glyphTexture";
import { lyricsDefaults } from "./lyricStyleDefaults";
import { resolveStyle } from "./styleCascade";
import { REFERENCE_FOV_DEG } from "../stageMetrics";
import { buildWrapLayout, SETTLE_Z, SIDE_MARGIN } from "./wordWrap";
import {
  computeColor,
  computeLifecycle,
  computeOpacityScale,
  computePosition,
} from "./glyphAnimation";
import type { Item } from "./glyphAnimation";
import type { AnimStyle, LyricDefaults, SongConfig } from "./types";
import type { LyricData } from "../../textalive/types";
import type { Signals } from "../Signals";

// The per-glyph maths lives in two sibling modules so this file reads as
// orchestration only: `./lyrics/wrap` decides where glyphs settle (responsive
// word-wrap), and `./lyrics/glyphAnim` owns the per-frame lifecycle / position /
// opacity / colour. This component builds the sprites and drives them each frame.

interface Props {
  /** Immutable song-segment data from TextAlive. */
  lyrics: LyricData;
  /** Real-time playback signals (pos, sat, clim, beat, vocal). */
  signalsRef: RefObject<Signals>;
  /** Song-specific style overrides + (optional) timing corrections. */
  song: SongConfig;
}

/**
 * Renders all of a song's lyrics as glowing 3D sprites and animates them every
 * frame. Song-agnostic: receives a `SongConfig` via prop and consumes the
 * cascade-resolved style per glyph (see `./lyrics/resolve`). The helpers in
 * `./lyrics/glyphAnim` own the per-frame logic (`computeLifecycle` /
 * `computePosition` / `computeOpacityScale` / `computeColor`); this component
 * just builds the sprites and orchestrates them.
 */
export function Lyrics({ lyrics, signalsRef, song }: Props) {
  // ---- Viewport-aware word-wrap layout ----
  // Recompute per-glyph settle (x, y) overrides whenever the window resizes.
  // Wrap target width is the visible width at SETTLE_Z, measured at the
  // REFERENCE FOV — so user zoom doesn't trigger a re-wrap (which would be
  // jarring). Phrases that fit within the line cap aren't overridden and use
  // their baked single-line layout from `buildLyrics`.
  const { size, camera } = useThree();
  const wrapLayout = useMemo(() => {
    if (!(camera instanceof PerspectiveCamera)) {
      return new Map<number, { x: number; y: number }>();
    }
    const distance = camera.position.z - SETTLE_Z;
    const refFovRad = (REFERENCE_FOV_DEG * Math.PI) / 180;
    const visibleH = 2 * distance * Math.tan(refFovRad / 2);
    const visibleW = visibleH * (size.width / size.height);
    return buildWrapLayout(lyrics.chars, visibleW * SIDE_MARGIN);
  }, [lyrics.chars, size.width, size.height, camera]);

  // ---- Build sprites once when lyrics data changes ----
  const { group, items } = useMemo(() => {
    const builtGroup = new Group();
    const builtItems: Item[] = [];
    for (const datum of lyrics.chars) {
      const material = new SpriteMaterial({
        map: charTexture(datum.text),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
        opacity: 0,
      });
      const sprite = new Sprite(material);
      sprite.position.copy(datum.entry);
      sprite.scale.setScalar(0);
      sprite.renderOrder = 10; // draw above the theater backdrop planes
      sprite.visible = false;
      builtGroup.add(sprite);
      builtItems.push({
        sprite,
        material,
        datum,
        color: new Color(0.6, 0.5, 0.55),
        target: new Color(0.6, 0.5, 0.55),
      });
    }
    return { group: builtGroup, items: builtItems };
  }, [lyrics]);

  // Cleanup: dispose GPU textures when the component unmounts.
  useEffect(() => () => items.forEach((it) => it.material.dispose()), [items]);

  // ---- Live tuning (leva) ──────────────────────────────────────────────────
  // Sliders mirror the SONG's effective defaults (`song.defaults` merged with
  // the global `lyricsDefaults`). Dragging during playback updates the
  // song-level cascade layer at runtime, so per-phrase / word / char overrides
  // above it still win. Copy values you like back into the song config.
  const initial: LyricDefaults = {
    settleX: song.defaults?.settleX ?? lyricsDefaults.settleX,
    settleY: song.defaults?.settleY ?? lyricsDefaults.settleY,
    settleZ: song.defaults?.settleZ ?? lyricsDefaults.settleZ,
    scale: song.defaults?.scale ?? lyricsDefaults.scale,
    anim: song.defaults?.anim ?? lyricsDefaults.anim,
    colorFrom: song.defaults?.colorFrom ?? lyricsDefaults.colorFrom,
    colorTo: song.defaults?.colorTo ?? lyricsDefaults.colorTo,
  };
  const live = useControls("Lyrics", {
    sweep: { value: 0.5, min: 0, max: 1, step: 0.01, label: "word sweep" },
    settleY: { value: initial.settleY, min: -10, max: 5, step: 0.01 },
    settleZ: { value: initial.settleZ, min: -10, max: 5, step: 0.01 },
    scale: { value: initial.scale, min: 0.2, max: 3, step: 0.01 },
    anim: { value: initial.anim, options: ["default", "float-up", "swirl-out"] },
    colorFrom: folder(
      {
        fromHue: { value: initial.colorFrom.hue, min: 0, max: 360, step: 1 },
        fromSat: { value: initial.colorFrom.saturation, min: 0, max: 100, step: 1 },
        fromLight: { value: initial.colorFrom.lightness, min: 0, max: 100, step: 1 },
      },
      { collapsed: true },
    ),
    colorTo: folder(
      {
        toHue: { value: initial.colorTo.hue, min: 0, max: 360, step: 1 },
        toSat: { value: initial.colorTo.saturation, min: 0, max: 100, step: 1 },
        toLight: { value: initial.colorTo.lightness, min: 0, max: 100, step: 1 },
      },
      { collapsed: true },
    ),
  });

  // The song-config flavour used for resolution this render — its `defaults`
  // layer is the live leva values (so dragging is reflected immediately). The
  // map-keyed per-phrase / word / char overrides flow through unchanged.
  const liveSong: SongConfig = {
    ...song,
    defaults: {
      ...song.defaults,
      settleY: live.settleY,
      settleZ: live.settleZ,
      scale: live.scale,
      anim: live.anim as AnimStyle,
      colorFrom: { hue: live.fromHue, saturation: live.fromSat, lightness: live.fromLight },
      colorTo: { hue: live.toHue, saturation: live.toSat, lightness: live.toLight },
    },
  };

  // ---- Per-frame animation loop ----
  // Orchestration only — the `./glyphAnimation` helpers own the actual logic.
  useFrame(({ clock }) => {
    const signals = signalsRef.current;
    if (!signals) return;
    const time = clock.elapsedTime;

    for (const item of items) {
      const glyph = item.datum;
      const lifecycle = computeLifecycle(glyph, live.sweep, signals.pos);

      // Visibility gate — fade out and skip work when outside the window.
      if (signals.pos < lifecycle.enter || signals.pos >= lifecycle.gone) {
        if (item.material.opacity > 0.002) {
          item.material.opacity *= 0.85;
        } else {
          item.sprite.visible = false;
          continue;
        }
      }
      item.sprite.visible = true;

      const resolved = resolveStyle(lyricsDefaults, liveSong, glyph);
      const settleOverride = wrapLayout.get(glyph.charIndex);
      const xyz = computePosition(glyph, lifecycle.progress, resolved, time, settleOverride);
      item.sprite.position.set(xyz.x, xyz.y, xyz.z);

      const envelope = computeOpacityScale(lifecycle.progress, signals, resolved, lifecycle.isActive);
      item.material.opacity += (envelope.alpha - item.material.opacity) * 0.12;
      // Lerp scale (same pattern as opacity) so the small discontinuity in
      // envScale at the settle/exit boundary doesn't read as a "pop".
      const currScale = item.sprite.scale.x;
      item.sprite.scale.setScalar(currScale + (envelope.scale - currScale) * 0.15);

      item.target.copy(
        computeColor(lifecycle.progress, lifecycle.isActive, signals, resolved, time, glyph),
      );
      item.color.lerp(item.target, 0.06);
      item.material.color.copy(item.color);
    }
  });

  return <primitive object={group} />;
}
