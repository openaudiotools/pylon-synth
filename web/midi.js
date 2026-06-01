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

import { MIDI_CHANNEL } from "./config.js";

// MIDI Control Change status byte for the configured channel. 0xB0 is "CC on
// channel 1"; OR-ing the channel index (0..15) selects the channel.
const CC_STATUS = 0xb0 | (MIDI_CHANNEL & 0x0f);

// Default port match: prefer a loopMIDI virtual port if one is present.
const DEFAULT_PORT_MATCH = /loopmidi/i;

/**
 * Clamp a value to the inclusive 0..127 MIDI CC range.
 * @param {number} v
 * @returns {number}
 */
function clampCC(v) {
  return Math.min(127, Math.max(0, v));
}

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

  const ui = buildUI(container, enabled, (on) => {
    enabled = on;
    // Force a full refresh on the next tick when re-enabled.
    for (const ch of channels) ch.lastValue = null;
    refreshStatus();
  });

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
      ui.setStatus("MIDI: disabled");
      return;
    }
    if (!access) {
      ui.setStatus("MIDI: no access");
      return;
    }
    if (access.outputs.size === 0) {
      ui.setStatus("MIDI: no ports");
      return;
    }
    if (!output) {
      ui.setStatus("MIDI: select a port");
      return;
    }
    ui.setStatus(`MIDI ready (${output.name || output.id})`);
  }

  // Re-enumerate outputs into the picker, preserving the current selection when
  // possible and otherwise defaulting to a loopMIDI port (or the first port).
  function refreshPorts() {
    if (!access) return;
    const outputs = [...access.outputs.values()];
    ui.setPorts(outputs, (id) => selectPort(id));

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
    ui.setStatus("MIDI unavailable — use Chrome or Edge");
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
        ui.setStatus("MIDI: no access");
      });
  }

  function dispose() {
    if (access) access.onstatechange = null;
    ui.dispose();
  }

  return { tick, dispose };
}

/**
 * Build the minimal overlay UI: a status line, an enable checkbox, and a port
 * <select>. Returns a small controller used by createMidi to update it.
 * Positioning is owned by the shared container passed in (see main.js).
 *
 * @param {HTMLElement} container
 * @param {boolean} initialEnabled
 * @param {(on: boolean) => void} onToggle - invoked with the checkbox state.
 */
function buildUI(container, initialEnabled, onToggle) {
  const root = document.createElement("div");
  root.className = "midi-overlay";
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
  status.className = "midi-status";
  status.textContent = "MIDI: connecting…";
  status.style.marginBottom = "8px";

  // Enable toggle: lets the user drive only the in-page SuperCollider sink.
  const enable = document.createElement("label");
  Object.assign(enable.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    marginBottom: "8px",
  });
  const enableBox = document.createElement("input");
  enableBox.type = "checkbox";
  enableBox.checked = initialEnabled;
  enableBox.addEventListener("change", () => onToggle(enableBox.checked));
  const enableText = document.createElement("span");
  enableText.textContent = "MIDI output";
  enable.appendChild(enableBox);
  enable.appendChild(enableText);

  const label = document.createElement("label");
  label.textContent = "Output port";
  label.style.display = "block";
  label.style.marginBottom = "4px";
  label.style.opacity = "0.85";

  const select = document.createElement("select");
  Object.assign(select.style, {
    width: "100%",
    font: "inherit",
    color: "#0a1410",
    background: "#d2ff72",
    border: "none",
    borderRadius: "4px",
    padding: "4px",
  });

  // Track current change-handler so we can swap it when ports re-enumerate.
  let onPick = null;
  select.addEventListener("change", () => {
    if (onPick) onPick(select.value);
  });

  label.appendChild(document.createElement("br"));
  label.appendChild(select);
  root.appendChild(status);
  root.appendChild(enable);
  root.appendChild(label);
  container.appendChild(root);

  return {
    setStatus(text) {
      status.textContent = text;
    },
    /**
     * Replace the port options. `pick` is invoked with the chosen port id.
     * @param {MIDIOutput[]} outputs
     * @param {(id: string) => void} pick
     */
    setPorts(outputs, pick) {
      onPick = pick;
      select.replaceChildren();
      if (outputs.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "(no MIDI outputs)";
        select.appendChild(opt);
        select.disabled = true;
        return;
      }
      select.disabled = false;
      for (const out of outputs) {
        const opt = document.createElement("option");
        opt.value = out.id;
        opt.textContent = out.name || out.id;
        select.appendChild(opt);
      }
    },
    setSelectedPort(id) {
      select.value = id;
    },
    // No outputs are possible at all (unsupported browser): hide the picker.
    setUnsupported() {
      label.style.display = "none";
    },
    dispose() {
      root.remove();
    },
  };
}
