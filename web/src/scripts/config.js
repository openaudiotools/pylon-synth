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

// Half-extent of the draggable ground area in metres. Pylons start within
// x,z ∈ [-3, 3] and the ground plane is 40×40; this clamp keeps a dragged pylon
// on visible ground and inside the camera framing.
export const PLAY_HALF = 8;

// One pylon per FM operator. `cc` is the contract with the SuperCollider side.
// Surface color now encodes role: modulators are green, carriers are blue, so
// the two operator kinds read apart at a glance (the bright-lime accent on the
// ring/halo/connections is unchanged).
export const PYLONS = [
  { id: "M1", role: "modulator", cc: 1, position: [-1, 0, 3], color: "#6EEB83" },
  { id: "M2", role: "modulator", cc: 2, position: [-3, 0, -1], color: "#3CCB6E" },
  { id: "c1", role: "carrier",   cc: 3, position: [ 1, 0, -2], color: "#2E86D6" },
  { id: "c2", role: "carrier",   cc: 4, position: [ 3, 0, 2], color: "#4FB6E8" },
];

// Fixed FM routing for the connection lines (drawn in bright lime #D2FF72).
// Static depiction of the algorithm only — no value/depth encoding.
export const CONNECTIONS = [["M1", "c2"], ["M1", "M2"], ["M2", "c1"]];

// The pylon `cc`s above are also the contract with the in-page SuperSonic synth
// (supersonic.js): each `cc` selects the FM parameter that pylon drives, via the
// engine's exported PARAM_DEFS table. cc 1..4 → m1Ratio / m2Ratio / c1Ratio /
// c2Ratio. No extra config is needed here.
