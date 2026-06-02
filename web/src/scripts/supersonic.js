// supersonic.js — in-page SuperCollider synth sink.
//
// A second transport alongside Web MIDI (midi.js). Instead of sending CC out to
// an external SuperCollider, this drives the in-page SuperSonic engine
// (pylon-synth.js) directly: it boots scsynth in the browser, runs the JS note
// sequencer, and maps each pylon's height onto an FM parameter.
//
// The web side stays parameter-agnostic: a pylon still maps its height to a CC
// value (0..127). The engine owns the CC→param contract via PARAM_DEFS — the
// same `[key,label,min,max,default,cc]` table the standalone synth page uses —
// so a pylon's `cc` selects which FM param it drives and over what range. We
// forward the value through PylonSynth.setParam (real, denormalized value),
// which live-updates any sounding voices, exactly like the engine's own MIDI
// handler.
//
// SuperSonic needs a user gesture to start audio, so this sink owns a Play
// button: first press boots the engine and starts the sequence; pressing again
// stops it.

import { PylonSynth, PARAM_DEFS } from "./pylon-synth.js";

/**
 * Clamp a value to the inclusive 0..127 MIDI CC range.
 * @param {number} v
 * @returns {number}
 */
function clampCC(v) {
  return Math.min(127, Math.max(0, v));
}

// CC number → { key, min, max } from the engine's parameter table. This is the
// contract shared with the SuperCollider side (and config.js's pylon `cc`s).
const CC_PARAMS = new Map(
  PARAM_DEFS.map(([key, , min, max, , cc]) => [cc, { key, min, max }]),
);

/**
 * Build the in-page synth sink: a status line + Play/Stop button, plus a frame
 * `tick()` that maps changed pylon CC values onto FM params. Mirrors createMidi's
 * throttle (emit only on integer-CC change) so the two sinks stay in lockstep.
 *
 * @param {object} opts
 * @param {import("./pylon.js").Pylon[]} opts.pylons - pylons in config order.
 * @param {Array<object>} opts.entries - config.PYLONS, same order; each `cc`.
 * @param {HTMLElement} [opts.container] - element to mount the overlay into.
 * @returns {{ tick: () => void, dispose: () => void }}
 */
export function createSupersonic({ pylons, entries, container = document.body }) {
  // Pair each pylon with the param its CC drives. Pylons whose `cc` has no entry
  // in PARAM_DEFS are dropped (they simply don't control the in-page synth).
  const channels = pylons
    .map((pylon, i) => ({ pylon, param: CC_PARAMS.get(entries[i].cc), lastValue: null }))
    .filter((ch) => ch.param);

  const synth = new PylonSynth({
    onStatus: (message) => ui.setStatus(message),
  });

  let booting = false;

  const ui = buildUI(container, () => onPlayToggle());

  function resetThrottle() {
    for (const ch of channels) ch.lastValue = null;
  }

  async function onPlayToggle() {
    if (synth.isRunning) {
      synth.stop();
      ui.setPlaying(false);
      return;
    }
    if (!synth.isReady) {
      if (booting) return;
      booting = true;
      ui.setBusy(true);
      try {
        await synth.boot(); // first user gesture → starts audio + loads synthdefs
      } catch {
        ui.setBusy(false);
        booting = false;
        return; // boot() already reported the error via onStatus
      }
      ui.setBusy(false);
      booting = false;
    }
    resetThrottle(); // push every pylon's current value once the sequence starts
    synth.start();
    ui.setPlaying(true);
  }

  /**
   * Read each pylon's normalized height, compute its CC value across the full
   * 0..127 range, and forward it to the engine only when the integer value
   * changed. No-op until the sequence is running.
   */
  function tick() {
    if (!synth.isRunning) return;
    for (const ch of channels) {
      const value = clampCC(Math.round(ch.pylon.getNormalized() * 127));
      if (value === ch.lastValue) continue;
      ch.lastValue = value;
      const { key, min, max } = ch.param;
      // Same mapping the engine's MIDI handler uses: CC 0..127 → [min, max].
      synth.setParam(key, min + (value / 127) * (max - min));
    }
  }

  function dispose() {
    if (synth.isRunning) synth.stop();
    ui.dispose();
  }

  return { tick, dispose };
}

/**
 * Build the minimal overlay: a status line and a Play/Stop button. Matches the
 * MIDI overlay's palette so the two read as one set of controls.
 *
 * @param {HTMLElement} container
 * @param {() => void} onPlay - invoked when the Play/Stop button is clicked.
 */
function buildUI(container, onPlay) {
  const root = document.createElement("div");
  root.className = "supersonic-overlay";
  Object.assign(root.style, {
    font: "13px system-ui, sans-serif",
    color: "#d2ff72",
    background: "rgba(10, 20, 16, 0.85)",
    border: "1px solid rgba(210, 255, 114, 0.35)",
    borderRadius: "8px",
    padding: "10px 12px",
    maxWidth: "260px",
  });

  const status = document.createElement("div");
  status.className = "supersonic-status";
  status.textContent = "synth: idle";
  status.style.marginBottom = "8px";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "▶ Play synth";
  Object.assign(button.style, {
    width: "100%",
    font: "inherit",
    color: "#0a1410",
    background: "#d2ff72",
    border: "none",
    borderRadius: "4px",
    padding: "6px",
    cursor: "pointer",
    letterSpacing: "0.04em",
  });
  button.addEventListener("click", onPlay);

  root.appendChild(status);
  root.appendChild(button);
  container.appendChild(root);

  return {
    setStatus(t) {
      status.textContent = t;
    },
    setPlaying(on) {
      button.textContent = on ? "■ Stop synth" : "▶ Play synth";
    },
    setBusy(busy) {
      button.disabled = busy;
      button.style.opacity = busy ? "0.6" : "1";
      button.style.cursor = busy ? "default" : "pointer";
    },
    dispose() {
      root.remove();
    },
  };
}
