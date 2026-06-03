// midi.js — Web MIDI access, port picker, and throttled CC dispatch (M4).
//
// The web side is parameter-agnostic: each pylon maps its height to a CC value
// (0..127, full range) and sends it on the configured channel. What that CC
// drives on the operator is decided entirely in SuperCollider. Each pylon's CC
// number and the MIDI channel come from config.js.
//
// Web MIDI is Chromium-only (Chrome/Edge) and needs a secure context
// (https:// or http://localhost). This module degrades gracefully: it reports
// "use Chrome/Edge" when the API is missing, and "no access" when the user
// denies the permission prompt.

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { MIDI_CHANNEL } from "./config.js";
import { clampCC } from "./pylon-synth.js";
import { createStore } from "@/lib/store";
import { MidiPanel } from "@/components/overlays/MidiPanel";

// MIDI Control Change status byte for the configured channel. 0xB0 is "CC on
// channel 1"; OR-ing the channel index (0..15) selects the channel.
const CC_STATUS = 0xb0 | (MIDI_CHANNEL & 0x0f);

// Default port match: prefer a loopMIDI virtual port if one is present.
const DEFAULT_PORT_MATCH = /loopmidi/i;

/**
 * Build the MIDI controller: request access, render a port picker + status
 * overlay, and dispatch throttled CC from pylon heights.
 *
 * @param {object} opts
 * @param {import("./pylon.js").Pylon[]} opts.pylons - pylons in config order.
 * @param {Array<object>} opts.entries - config.PYLONS, in the same order as
 *   `opts.pylons`; each entry carries the pylon's `cc`.
 * @param {HTMLElement} [opts.container] - element to mount the overlay UI into
 *   (defaults to document.body).
 * @returns {{ tick: () => void, dispose: () => void }} `tick()` should be called
 *   each render frame; it sends CC only when a pylon's integer CC value changes.
 */
export function createMidi({ pylons, entries, container = document.body }) {
  // Pair each pylon with its config CC, by shared index (createPylons preserves
  // config order). Track the last integer CC value sent per pylon so we only
  // emit on change (natural throttling — pointer events fire far faster than CC
  // values actually change).
  const channels = pylons.map((pylon, i) => ({
    pylon,
    cc: entries[i].cc,
    lastValue: null,
  }));

  /** @type {MIDIAccess | null} */
  let access = null;
  /** @type {MIDIOutput | null} */
  let output = null;
  // Whether the MIDI sink is active. Starts on, so existing behaviour (auto-send
  // once a port is selected) is unchanged; the user can toggle it off to drive
  // only the in-page SuperCollider sink (supersonic.js).
  let enabled = true;

  const ui = mountUI(
    container,
    enabled,
    (on) => {
      enabled = on;
      ui.setEnabled(on);
      // Force a full refresh on the next tick when re-enabled.
      for (const ch of channels) ch.lastValue = null;
      refreshStatus();
    },
    (id) => selectPort(id),
  );

  /**
   * Select an output port by id and reset throttle state so the new port gets a
   * full refresh on the next tick.
   * @param {string} id
   */
  function selectPort(id) {
    output = (access && access.outputs.get(id)) || null;
    for (const ch of channels) ch.lastValue = null;
    ui.setSelectedPort(output ? output.id : "");
    refreshStatus();
  }

  function refreshStatus() {
    if (!enabled) {
      ui.setStatus("MIDI: disabled", "secondary");
      return;
    }
    if (!access) {
      ui.setStatus("MIDI: no access", "error");
      return;
    }
    if (access.outputs.size === 0) {
      ui.setStatus("MIDI: no ports", "warning");
      return;
    }
    if (!output) {
      ui.setStatus("MIDI: select a port", "warning");
      return;
    }
    ui.setStatus(`MIDI ready (${output.name || output.id})`, "success");
  }

  // Re-enumerate outputs into the picker, preserving the current selection when
  // possible and otherwise defaulting to a loopMIDI port (or the first port).
  function refreshPorts() {
    if (!access) return;
    const outputs = [...access.outputs.values()];
    ui.setPorts(outputs);

    if (output && access.outputs.has(output.id)) {
      // Keep the current valid selection.
      ui.setSelectedPort(output.id);
    } else if (outputs.length > 0) {
      const preferred =
        outputs.find((o) => DEFAULT_PORT_MATCH.test(o.name || "")) ||
        outputs[0];
      selectPort(preferred.id);
      return; // selectPort already refreshed status
    } else {
      output = null;
    }
    refreshStatus();
  }

  /**
   * Read each pylon's normalized height, compute its CC value across the full
   * 0..127 range, and send it only when the integer value changed. Safe to call
   * before access is granted (it is a no-op until an output is selected).
   */
  function tick() {
    if (!enabled || !output) return;
    for (const ch of channels) {
      const value = clampCC(Math.round(ch.pylon.getNormalized() * 127));
      if (value === ch.lastValue) continue;
      ch.lastValue = value;
      output.send([CC_STATUS, ch.cc, value]);
    }
  }

  // --- Access bootstrap ---------------------------------------------------

  if (
    typeof navigator === "undefined" ||
    typeof navigator.requestMIDIAccess !== "function"
  ) {
    ui.setStatus("MIDI unavailable — use Chrome or Edge", "error");
    ui.setUnsupported();
  } else {
    navigator
      .requestMIDIAccess({ sysex: false })
      .then((midiAccess) => {
        access = midiAccess;
        // React to ports appearing/disappearing (e.g. loopMIDI started later).
        access.onstatechange = () => refreshPorts();
        refreshPorts();
      })
      .catch(() => {
        // Permission denied (or otherwise unavailable).
        access = null;
        output = null;
        ui.setStatus("MIDI: no access", "error");
      });
  }

  function dispose() {
    if (access) access.onstatechange = null;
    ui.dispose();
  }

  return { tick, dispose };
}

/**
 * Mount the MIDI overlay (a COSS React panel) and return the imperative
 * controller createMidi drives. The returned surface mirrors the old hand-rolled
 * overlay so the factory body is unchanged, except `setPorts` no longer takes a
 * pick callback (the panel receives `onPick` as a stable prop) and `setEnabled`
 * keeps the controlled Switch in sync.
 *
 * @param {HTMLElement} container
 * @param {boolean} initialEnabled
 * @param {(on: boolean) => void} onToggle - invoked with the toggle state.
 * @param {(id: string) => void} onPick - invoked with the chosen port id.
 */
function mountUI(container, initialEnabled, onToggle, onPick) {
  const store = createStore({
    status: "MIDI: connecting…",
    variant: "secondary",
    enabled: initialEnabled,
    ports: [],
    selectedId: "",
    unsupported: false,
  });

  const host = document.createElement("div");
  container.appendChild(host);
  const root = createRoot(host);
  root.render(createElement(MidiPanel, { store, onToggle, onPick }));

  return {
    setStatus(text, variant) {
      store.set({ status: text, variant });
    },
    setEnabled(on) {
      store.set({ enabled: on });
    },
    /**
     * Replace the port options shown in the picker.
     * @param {MIDIOutput[]} outputs
     */
    setPorts(outputs) {
      store.set({
        ports: outputs.map((out) => ({ id: out.id, name: out.name || out.id })),
      });
    },
    setSelectedPort(id) {
      store.set({ selectedId: id });
    },
    // No outputs are possible at all (unsupported browser): hide the picker.
    setUnsupported() {
      store.set({ unsupported: true });
    },
    dispose() {
      root.unmount();
      host.remove();
    },
  };
}
