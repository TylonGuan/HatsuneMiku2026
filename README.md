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
- **Sketchbook theatre stage** — original graphite art rendered as four
  parallaxed layers (back wall, stage floor, proscenium / curtains, audience
  seats), depth-tinted to a moody palette.
- **Spotlight with fade-in** — a real `THREE.SpotLight` positioned behind and
  above the audience, aimed at the stage; intensity eases up from black the
  first time playback starts.
- **Miku character animation** — bob locked to per-character timing
  (long held notes show a visible hold at the peak; quick syllables register
  as brief blips), continuous sway, and a vertical spin on chorus entry.
- **Phrase-cascading style overrides** — global defaults → per-song → per-phrase
  → per-word → per-character, CSS-style cascade for tuning specific moments
  without writing custom code per song.
- **English subtitles** — per-phrase translation gloss displayed in sync with
  the original Japanese lyrics, including the parallel-voice chorus shown as
  two simultaneous lines.
- **Camera rig** — orbit-on-drag with bounded swing and idle drift; preserves
  the front-row audience perspective.
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
npm run dev          # starts webpack-dev-server (http://localhost:8080)
```

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

```
src/
  App.tsx                  — root component; orchestrates player + canvas + UI
  config.ts                — song + TextAlive token + English translation
  index.tsx                — React mount
  styles.css               — DOM-layer styling (overlay, controls, subtitle)
  scene/
    Scene.tsx              — three.js scene composition
    Theater.tsx            — four parallaxed sketch backdrop layers
    Miku.tsx               — hand-drawn Miku sprite + bob/sway/spin animation
    Spotlight.tsx          — real spotLight with fade-in on first play
    Lyrics.tsx             — per-character glyph sprites and lifecycle
    CameraRig.tsx          — orbit-on-drag camera with idle drift
    Signals.tsx            — per-frame timing signals shared scene-wide
    Background.tsx         — atmospheric particles + fog (currently dormant)
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
    Overlay.tsx            — HTML transport controls + subtitle layer
art/
  Scene1/                  — graphite-pencil theatre backdrop layers (PNG)
  MikuCutout/              — hand-drawn Miku poses with transparent BG
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
