// config.js — single source of truth for the pylon → CC mapping.
//
// The web side is parameter-agnostic: it only maps a pylon's Y position to a
// CC value (0–127) and dispatches it. *What* each CC drives on the operator is
// decided entirely in SuperCollider. Each pylon owns its `cc`, so reconciling
// with the SuperCollider handlers is a one-file edit.

// MIDI channel index (0 = MIDI channel 1).
export const MIDI_CHANNEL = 0;

// Vertical band in metres; maps linearly across the full CC range (0..127).
export const BAND = { min: 1, max: 6 };

// One pylon per FM operator. `cc` is the contract with the SuperCollider side.
// Surface colors are drawn from the 3-color green palette (#73EC8B / #54C392 /
// #15B392); with 4 pylons one color repeats — M1 and c2 intentionally share
// #73EC8B per docs/IMPLEMENTATION.md (palette, not an identity signal).
export const PYLONS = [
  { id: "M1", role: "modulator", cc: 1, position: [-1, 0, 3], color: "#73EC8B" },
  { id: "M2", role: "modulator", cc: 2, position: [-3, 0, -1], color: "#54C392" },
  { id: "c1", role: "carrier",   cc: 3, position: [ 1, 0, -2], color: "#15B392" },
  { id: "c2", role: "carrier",   cc: 4, position: [ 3, 0, 2], color: "#73EC8B" },
];

// Fixed FM routing for the connection lines (drawn in bright lime #D2FF72).
// Static depiction of the algorithm only — no value/depth encoding.
export const CONNECTIONS = [["M1", "c2"], ["M1", "M2"], ["M2", "c1"]];

// The pylon `cc`s above are also the contract with the in-page SuperSonic synth
// (supersonic.js): each `cc` selects the FM parameter that pylon drives, via the
// engine's exported PARAM_DEFS table. cc 1..4 → m1Ratio / m2Ratio / c1Ratio /
// c2Ratio. No extra config is needed here.
