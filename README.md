# pylon-synth

A three.js web experience of draggable **"pylons"** that control a **SuperCollider
FM synth**. Each pylon is an operator in a fixed FM algorithm; dragging a pylon
up and down sends MIDI CC, which drives the synth's parameters in real time. The
browser is the control surface; SuperCollider is the sound engine.

Built for a hackathon.

## How it works

```
┌─────────────┐    MIDI CC     ┌──────────────┐    audio    ┌─────────┐
│   web/      │ ─────────────▶ │   engine/    │ ──────────▶ │ speakers│
│  three.js   │  (Web MIDI →   │ SuperCollider│             │         │
│  pylons     │   loopMIDI)    │  FM SynthDef │             │         │
└─────────────┘                └──────────────┘             └─────────┘
```

- **`web/`** — the control surface. Renders the pylons in three.js and dispatches
  MIDI CC over the Web MIDI API. Knows nothing about the synth.
- **`engine/`** — the sound engine. A SuperCollider FM SynthDef driven entirely by
  incoming MIDI CC.

The two halves are independent and communicate **only over MIDI**.

## Interaction

- **Click and hold** a pylon, then move it **up/down** to reposition it.
- A pylon is **4 m tall** and travels from **1 m above ground** to **6 m**; that
  **5 m range maps to the full CC range (0–127)**.
- Moving a pylon adjusts the CC for its operator's parameter.

## FM algorithm

A single fixed algorithm over four operators:

```
c2 ← M1 → M2 → c1
```

- **M1** (modulator) → carrier **c2** and modulator **M2**
- **M2** (modulator) → carrier **c1**
- Audio output = **c1 + c2**

## Visual design

- Pylons are **bicone / spinning-top** shapes with a **connector ring** at the waist.
- Palette ([colorhunt](https://colorhunt.co/palette/d2ff7273ec8b54c39215b392)):

  | Hex | Role |
  |---|---|
  | `#D2FF72` | bright lime — **connections & halos** (the only active/glowing element) |
  | `#73EC8B` | static pylon surface |
  | `#54C392` | static pylon surface |
  | `#15B392` | static pylon surface |

## Requirements

- **Chrome / Edge** (Web MIDI API is unsupported in Firefox/Safari).
- **[loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)** (Windows) — a virtual MIDI port between browser and SuperCollider.
- **[SuperCollider](https://supercollider.github.io/)**.

## Layout

| Path | What |
|---|---|
| `web/` | three.js control surface, dispatches MIDI CC |
| `engine/` | SuperCollider FM synth, consumes MIDI CC |
| `docs/` | plan, design notes, sketches |

See [`docs/PLAN.md`](docs/PLAN.md) for the build plan and the project journal for
design-decision history.
