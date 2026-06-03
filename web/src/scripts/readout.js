// readout.js — a small labels-and-values panel for the pylon-driven FM ratios.
//
// Shows the live value of each parameter a pylon controls (e.g. "M1 Ratio"),
// derived purely from the pylon's height + the engine's PARAM_DEFS table — so
// it reflects the controls whether or not the in-page synth is playing. The
// displayed value matches what the synth/MIDI sinks send: the same
// CC 0..127 → [min, max] mapping, updated only when the integer CC changes.

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { ccParamMap, clampCC } from "./pylon-synth.js";
import { createStore } from "@/lib/store";
import { ReadoutPanel } from "@/components/overlays/ReadoutPanel";

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

  const ui = mountUI(container, rows.map((r) => r.param.label));
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
 * Mount the readout (a COSS React Card) and return a setValue(i, text)/dispose
 * controller. Values update only when a pylon's integer CC changes (see tick),
 * so the React panel re-renders infrequently despite the per-frame tick.
 *
 * @param {HTMLElement} container
 * @param {string[]} labels
 */
function mountUI(container, labels) {
  const store = createStore({ values: labels.map(() => "—") });

  const host = document.createElement("div");
  container.appendChild(host);
  const root = createRoot(host);
  root.render(createElement(ReadoutPanel, { labels, store }));

  return {
    setValue(i, text) {
      const values = store.get().values.slice();
      values[i] = text;
      store.set({ values });
    },
    dispose() {
      root.unmount();
      host.remove();
    },
  };
}
