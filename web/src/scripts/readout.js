// readout.js — a small labels-and-values panel for the pylon-driven FM ratios.
//
// Shows the live value of each parameter a pylon controls (e.g. "M1 Ratio"),
// derived purely from the pylon's height + the engine's PARAM_DEFS table — so
// it reflects the controls whether or not the in-page synth is playing. The
// displayed value matches what the synth/MIDI sinks send: the same
// CC 0..127 → [min, max] mapping, updated only when the integer CC changes.

import { ccParamMap, clampCC } from "./pylon-synth.js";

// CC number → { key, label, min, max } from the engine's parameter table.
const CC_PARAMS = ccParamMap();

/**
 * Build the readout panel and a per-frame `tick()` that keeps it current.
 *
 * @param {object} opts
 * @param {import("./pylon.js").Pylon[]} opts.pylons - pylons in config order.
 * @param {Array<object>} opts.entries - config.PYLONS, same order; each `cc`.
 * @param {HTMLElement} [opts.container]
 * @returns {{ tick: () => void, dispose: () => void }}
 */
export function createReadout({ pylons, entries, container = document.body }) {
  // Only pylons whose cc maps to a parameter get a row (cc 1..4 → ratios).
  const rows = pylons
    .map((pylon, i) => ({ pylon, param: CC_PARAMS.get(entries[i].cc) }))
    .filter((r) => r.param);

  const ui = buildUI(container, rows.map((r) => r.param.label));
  const last = new Array(rows.length).fill(null);

  function tick() {
    for (let i = 0; i < rows.length; i++) {
      const { pylon, param } = rows[i];
      const cc = clampCC(Math.round(pylon.getNormalized() * 127));
      if (cc === last[i]) continue;
      last[i] = cc;
      const value = param.min + (cc / 127) * (param.max - param.min);
      ui.setValue(i, value.toFixed(2));
    }
  }

  return { tick, dispose: ui.dispose };
}

/**
 * Build the panel: one row per label, each with a value cell. Matches the other
 * overlays' palette. Returns setValue(rowIndex, text) + dispose.
 *
 * @param {HTMLElement} container
 * @param {string[]} labels
 */
function buildUI(container, labels) {
  const root = document.createElement("div");
  root.className = "readout-overlay";
  Object.assign(root.style, {
    position: "fixed",
    bottom: "12px",
    left: "12px",
    zIndex: "10",
    font: "13px system-ui, sans-serif",
    color: "#d2ff72",
    background: "rgba(10, 20, 16, 0.85)",
    border: "1px solid rgba(210, 255, 114, 0.35)",
    borderRadius: "8px",
    padding: "10px 12px",
    minWidth: "150px",
    userSelect: "none",
  });

  const valueEls = labels.map((label) => {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      justifyContent: "space-between",
      gap: "16px",
      lineHeight: "1.6",
    });

    const name = document.createElement("span");
    name.textContent = label;
    name.style.opacity = "0.8";

    const value = document.createElement("span");
    value.textContent = "—";
    value.style.fontVariantNumeric = "tabular-nums";

    row.appendChild(name);
    row.appendChild(value);
    root.appendChild(row);
    return value;
  });

  container.appendChild(root);

  return {
    setValue(i, text) {
      if (valueEls[i]) valueEls[i].textContent = text;
    },
    dispose() {
      root.remove();
    },
  };
}
