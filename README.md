# こたえて — A Magical Mirai 2026 lyric visualizer

For the [Hatsune Miku 「Magical Mirai」 2026 Programming Contest][procon].
Deadline 6/29/2026.

By **Tylon Guan**

### (◕‿◕) Hello from USA 🇺🇸 !! (◕‿◕)

A web-based lyric performance for the contest's Grand Prize song
**imie feat. 初音ミク — 「こたえて」 (Answer Me)**. The lyrics rise out of the
audience as glowing characters onto a sketched theatre stage, where
a hand-drawn Hatsune Miku sways, bobs, and spins with the music under a
live spotlight.

[procon]: https://magicalmirai.com/2026/procon/index_en.html

---

## About the project

This is a single-page React + WebGL application built on the
[TextAlive App API][textalive], which provides per-character lyric timing and
audio analysis (beats, vocal amplitude, chorus detection) for the song. The app
renders a 2.5D sketchbook-style theatre with parallaxed layers, animates each
kanji glyph along a flight path synced to the singer, and stages Miku as a
hand-drawn cutout illuminated by a real three.js spotlight whose intensity
fades in when playback first begins.

**Visual concept.** The artwork is original graphite-pencil work — Miku, the
theatre stage, the curtains, the seats, all sketched on paper and digitised.
The intent is to read as a small live performance witnessed from inside a
sketchbook: dim, intimate, with the spotlight and lyric colour as the only
sources of brightness.

[textalive]: https://developer.textalive.jp/

---

## Features

- **Per-character lyric animation** — every kanji has an entry, settle, and
  exit phase, with timing taken from TextAlive (and per-phrase corrections
  supplied for the parallel-voice chorus where the API timing is broken).
  Phrases word-wrap responsively so side glyphs never fall off narrow screens.
- **Sketchbook theatre stage** — original graphite art rendered as five
  parallaxed layers (back wall, background painting, stage floor, proscenium /
  curtains, audience seats), depth-tinted to a moody palette.
- **Curtains** — hand-drawn drapes that part when the song starts and draw
  closed again when it ends, returning the stage to its opening look.
- **Spotlight with fade-in** — a real `THREE.SpotLight` positioned behind and
  above the audience, aimed at the stage; intensity eases up from black the
  first time playback starts. A separate pair of stage-wash lights illuminates
  only the background painting (via a dedicated render layer).
- **Miku character animation** — bob locked to per-character timing
  (long held notes show a visible hold at the peak; quick syllables register
  as brief blips), continuous sway, and a vertical spin on chorus entry.
- **Rotating chorus ensemble** — the other Cryptons (Rin, Len, Luka, Meiko,
  Kaito) take the stage during choruses and their own harmony lines. A random
  cast is drawn into fixed slots each chorus, **twirling into existence** on
  entry and out on exit, with an in-place dance spin at the end of each pink line.
- **Climax confetti** — an instanced field of star sprites rains down through the
  foreground during the final chorus, gated on a smoothed climax signal so it
  only renders when on screen.
- **Phrase-cascading style overrides** — global defaults → per-song → per-phrase
  → per-word → per-character, CSS-style cascade for tuning specific moments
  without writing custom code per song.
- **English subtitles** — per-phrase translation gloss displayed in sync with
  the original Japanese lyrics, including the parallel-voice chorus shown as
  two simultaneous lines.
- **Camera rig** — orbit-on-drag with bounded swing and idle drift, pinch /
  scroll zoom, and **gyroscope tilt control** on supported phones/tablets (with
  a one-time on-screen gesture hint after start). Preserves the front-row
  audience perspective at every angle.
- **Tunable house lights** — ambient brightness is exposed as a live control so
  the stage stays readable across displays.
- **Playback controls** — scrub bar, volume, mute, skip-to-first-lyric.

---

## Tech stack

| | |
|---|---|
| Framework | React 18, TypeScript (strict) |
| 3D | three.js, @react-three/fiber, @react-three/drei |
| Post-processing | @react-three/postprocessing (Bloom) |
| Music / lyric API | [TextAlive App API][textalive] |
| Dev tuning | leva (hidden in production builds) |
| Build | Webpack 5 + Babel |

---

## Development

### Prerequisites

- Node.js ≥ 18
- A [TextAlive App API][textalive] developer token. The current token is in
  `src/config.ts` (`TEXTALIVE_TOKEN`); replace it with your own for any
  redistribution.

### Install & run

```bash
npm install
npm run dev          # starts webpack-dev-server (http://localhost:1234)
```

### Testing on a phone/tablet (gyroscope)

iOS only exposes the gyroscope over **HTTPS**, so plain `npm run dev` over the
LAN won't trigger it. Use:

```bash
npm run dev:mobile   # serves HTTPS on 0.0.0.0 (same port, 1234)
```

Open `https://<your-LAN-IP>:1234` on the device (same Wi-Fi), accept the
self-signed-certificate warning, tap to start, and allow "Motion & Orientation
Access." For a trusted URL with no cert warning, tunnel instead (e.g.
`npx cloudflared tunnel --url http://localhost:1234` alongside `npm run dev`).
To exercise the tilt logic on desktop, use Chrome DevTools → **Sensors** →
*Orientation*.

### Production build

```bash
npm run build        # emits to dist/
```

### Type check

```bash
npm run typecheck    # tsc --noEmit
```

---

## Project layout

> A deeper, element-by-element guide for contributors (and AI assistants) lives
> in [`CLAUDE.md`](./CLAUDE.md), including the render-order table and conventions.

```
src/
  App.tsx                  — root component; orchestrates player + canvas + UI
  config.ts                — song + TextAlive token + English translation
  index.tsx                — React mount
  styles.css               — DOM-layer styling (overlay, controls, subtitle, hint)
  scene/
    Scene.tsx              — three.js scene composition + Bloom + ambient control
    Theater.tsx            — five parallaxed sketch backdrop layers
    Curtains.tsx           — drapes that part on play / close on song end
    Miku.tsx               — hand-drawn Miku sprite + bob/sway/spin animation
    Chorus.tsx             — rotating Crypton ensemble + twirl in/out + dance spin
    Lyrics.tsx             — per-character glyph sprites, lifecycle, responsive wrap
    Stars.tsx              — instanced falling-star confetti for the climax
    Spotlight.tsx          — real spotLight with fade-in on first play
    BackgroundLight.tsx    — stage-wash lights for the background painting (layer-gated)
    Background.tsx         — atmospheric particles + clear-colour wash
    CameraRig.tsx          — orbit-on-drag + zoom + gyroscope tilt
    gyro.ts                — device-orientation input singleton (mobile)
    Signals.tsx            — per-frame timing signals shared scene-wide
    color.ts / ease.ts / sketch.ts — shared HSL / easing / paper-sprite helpers
    textTexture.ts         — cached canvas glyph textures (system fonts)
    lyrics/
      defaults.ts          — global default lyric style
      resolve.ts           — cascade resolver (defaults → song → phrase → word → char)
      types.ts             — style override types + SongConfig
      songs/answerMe/      — this song's config + chorus timing corrections
  textalive/
    usePlayer.ts           — TextAlive Player React hook
    buildLyrics.ts         — flattens phrases/words/chars into renderable data
    analysis.ts            — beat / vocal / chorus signal helpers
    types.ts               — lyric data types
  ui/
    Overlay.tsx            — HTML transport controls + subtitle + gesture hint
art/
  Scene1/                  — graphite-pencil theatre backdrop layers (PNG)
  MikuCutout/              — hand-drawn Miku poses with transparent BG
  RinCutout/ LenCutout/ LukaCutout/ MeikoCutout/ KaitoCutout/ — chorus cutouts
```

---

## Credits & Attribution

### Song

**「こたえて」 (Answer Me)** — composed and produced by **imie** featuring
vocals by **初音ミク (Hatsune Miku)**.
Published on piapro: <https://piapro.jp/t/6W2N/20251215164617>

### Character

**初音ミク (Hatsune Miku)** — character design by **KEI**, voice synth
developed and licensed by **Crypton Future Media, INC.**

> © Crypton Future Media, INC. [www.piapro.net](https://piapro.net)

Used under the [Piapro Character License (PCL)][pcl]. This project is a
non-commercial entry in the Magical Mirai 2026 Programming Contest.

[pcl]: https://piapro.net/intl/en_for_creators.html

### Lyric & audio analysis

**TextAlive App API** — developed by the National Institute of Advanced
Industrial Science and Technology (AIST) and contributors. Beat, chord,
vocal-amplitude, and chorus-segment data is supplied by the TextAlive
analytical pipeline (Songle).
<https://developer.textalive.jp/>

The contest song's analysis IDs (`beatId`, `chordId`, `repetitiveSegmentId`,
`lyricId`, `lyricDiffId`) are the official values published at the
[contest event page][procon].

### Artwork

All theatre backdrop layers (back wall, stage floor, curtains/proscenium,
audience seats) and the Miku character cutouts are **original graphite
illustrations** drawn for this entry by Tylon Guan and digitised. They are
not reused from existing piapro / fan art.

---

## License

Source code in this repository is released under the **MIT License** (see
`LICENSE` if present, otherwise treat as MIT) **with the following
exceptions**:

- The **original graphite artwork** in `art/` is the author's own work,
  © 2026 Tylon Guan, all rights reserved. It is provided for the contest
  entry and may not be redistributed separately.
- All uses of the **Hatsune Miku** likeness are governed by the
  [Piapro Character License][pcl] and the surrounding Crypton terms — those
  terms supersede this repository's licence wherever they apply.
- The **TextAlive App API** is subject to its own terms of service.

If you fork or build on this project, please replace `TEXTALIVE_TOKEN` in
`src/config.ts` with your own developer token and make sure your use is
PCL-compliant.
