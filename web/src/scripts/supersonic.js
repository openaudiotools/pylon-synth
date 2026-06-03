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

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { PylonSynth, ccParamMap, clampCC } from "./pylon-synth.js";
import { createStore } from "@/lib/store";
import { SupersonicPanel } from "@/components/overlays/SupersonicPanel";

// CC number → { key, label, min, max } from the engine's parameter table. This
// is the contract shared with the SuperCollider side (and config.js's pylon
// `cc`s); this sink ignores `label`.
const CC_PARAMS = ccParamMap();

// Map the engine's status className onto a COSS Badge variant.
function statusVariant(className) {
  switch (className) {
    case "ready":
      return "success";
    case "loading":
      return "warning";
    case "error":
      return "error";
    default:
      return "secondary";
  }
}

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
    onStatus: (message, className) => ui.setStatus(message, className),
  });

  let booting = false;

  const ui = mountUI(container, () => onPlayToggle());

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
 * Mount the SuperSonic overlay (a COSS React panel) into `container` and return
 * the imperative controller the factory drives. The returned surface matches
 * the old hand-rolled overlay (setStatus/setPlaying/setBusy/dispose) so the
 * factory body is unchanged.
 *
 * @param {HTMLElement} container
 * @param {() => void} onPlay - invoked when the Play/Stop button is clicked.
 */
function mountUI(container, onPlay) {
  const store = createStore({
    status: "synth: idle",
    variant: "secondary",
    playing: false,
    busy: false,
  });

  const host = document.createElement("div");
  container.appendChild(host);
  const root = createRoot(host);
  root.render(createElement(SupersonicPanel, { store, onPlay }));

  return {
    setStatus(text, className) {
      store.set({ status: text, variant: statusVariant(className) });
    },
    setPlaying(on) {
      store.set({ playing: on });
    },
    setBusy(busy) {
      store.set({ busy });
    },
    dispose() {
      root.unmount();
      host.remove();
    },
  };
}
