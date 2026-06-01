# pylon-synth — build plan

A general plan for the hackathon build. Detailed design rationale lives in the
project journal (`venturesquad/pylon-synth`); this file is the working roadmap.

## Goal

A three.js web UI of draggable pylons that drive a SuperCollider FM synth over
MIDI CC, demoed end-to-end in a browser on Windows.

## Architecture

```
web/ (three.js)                          engine/ (SuperCollider)
┌────────────────────┐                   ┌────────────────────────┐
│ render pylons       │   MIDI CC         │ MIDIIn.connectAll       │
│ drag → value (0-127)│ ───────────────▶  │ MIDIdef.cc per param    │
│ Web MIDI API send   │  via loopMIDI     │ FM SynthDef (c2←M1→M2→c1)│
└────────────────────┘   virtual port    └────────────────────────┘
```

The boundary is the MIDI CC stream. Either side can be built and tested in
isolation against a dummy MIDI sink/source.

## Locked decisions

| Decision | Choice |
|---|---|
| Transport | Web MIDI API → loopMIDI → SuperCollider (no WebSocket/OSC bridge) |
| Browser | Chrome / Edge only (Web MIDI unsupported elsewhere) |
| Algorithm | One fixed algorithm: `c2 ← M1 → M2 → c1` |
| Control | Pylon vertical position (1 m–6 m) → CC (0–127) |
| Interaction | Click-and-hold a pylon, drag up/down |
| Palette | 3 static greens + bright lime (`#D2FF72`) for connections/halos |

## Work breakdown

### engine/ (SuperCollider)

1. **FM SynthDef** — four operators wired as `c2 ← M1 → M2 → c1`. Expose per-operator
   params (freq ratio, mod index, level) as SynthDef args.
2. **MIDI input** — `MIDIClient.init; MIDIIn.connectAll;` then one `MIDIdef.cc` per
   controlled param, mapping CC 0–127 to each param's range via `.linlin`.
3. **Voice management** — decide fixed drone vs note-triggered; for the demo a single
   always-on voice whose timbre is shaped live by the pylons is simplest.

### web/ (three.js)

1. **Scene** — three.js scene with the ground plane and N pylons (one per operator
   param exposed by the SynthDef).
2. **Pylon** — bicone / spinning-top mesh with a connector ring at the waist.
   Static green surface; bright-lime connector lines + halo.
3. **Interaction** — click-and-hold to grab a pylon; pointer drag moves it
   vertically within the 1 m–6 m band.
4. **MIDI out** — `requestMIDIAccess()`, pick the loopMIDI port, map pylon height
   (1–6 m) to CC (0–127), send CC on change.

### Integration

1. Run loopMIDI, start SuperCollider, open the web page in Chrome.
2. Confirm each pylon moves its target param audibly.
3. Tune CC→param ranges so the full drag travel sounds musical.

## Open questions

- Which operator params get their own pylon (and thus CC number)? Map one CC per
  controlled param.
- Mod-index range / scaling at full pylon extension (sketch hinted a large value;
  exact range TBD).
- Whether the 3D layout (operators arranged in 3D space) is in scope for the demo
  or a stretch goal.

## Stretch goals

- 3D arrangement / navigation of pylons rather than a flat row.
- Multiple algorithms (rejected for the core build — fixed algorithm only).
- Visual feedback on the connector lines reacting to modulation depth.
