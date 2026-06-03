// sideview.js — the per-pylon inspection drawer.
//
// Double-clicking a pylon (see interaction.js) selects it: scene.js eases the
// camera in to frame the pylon in the left ~25% of the viewport, and this
// factory slides a read-only info drawer in from the right. Built on the same
// store → React-overlay bridge as readout.js/midi.js (createStore + createRoot),
// so the imperative control loop and the panel share one state object.
//
// The drawer is controlled: any close request from the panel (×, Esc, backdrop)
// flows through handleClose, which both closes the drawer and runs the caller's
// onClose (which returns the camera via scene.clearFocus).

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { ccParamMap, clampCC } from "./pylon-synth.js";
import { CONNECTIONS } from "./config.js";
import { createStore } from "@/lib/store";
import { SideviewPanel } from "@/components/overlays/SideviewPanel";

// CC number → { key, label, min, max } from the engine's parameter table.
const CC_PARAMS = ccParamMap();

/**
 * Snapshot a pylon's read-only inspection data for the drawer. Mirrors the
 * readout's cc → value mapping (readout.js) so the displayed value matches what
 * the synth/MIDI sinks send. Captured at open time; height can't change while
 * the sideview is open (drag is blocked, MIDI is output-only).
 *
 * @param {import("./pylon.js").Pylon} pylon
 * @param {object} entry - the matching config.PYLONS entry (id, role, cc).
 * @returns {import("@/components/overlays/SideviewPanel").PylonInfo}
 */
export function buildPylonInfo(pylon, entry) {
  const param = CC_PARAMS.get(entry.cc);
  const info = {
    id: entry.id,
    role: entry.role,
    cc: entry.cc,
    height: pylon.getHeight(),
    // Operators this pylon links to in the fixed FM routing.
    connections: CONNECTIONS.flatMap((pair) =>
      pair.includes(entry.id) ? [pair.find((id) => id !== entry.id)] : [],
    ),
  };

  if (param) {
    const cc = clampCC(Math.round(pylon.getNormalized() * 127));
    info.paramLabel = param.label;
    info.value = param.min + (cc / 127) * (param.max - param.min);
    info.min = param.min;
    info.max = param.max;
  }

  return info;
}

/**
 * Mount the sideview drawer and return an open/close controller.
 *
 * @param {object} opts
 * @param {HTMLElement} [opts.container]
 * @param {() => void} [opts.onClose] - run when the drawer is dismissed (e.g.
 *   to ease the camera back via scene.clearFocus).
 * @returns {{ open: (info: object) => void, close: () => void, dispose: () => void }}
 */
export function createSideview({ container = document.body, onClose } = {}) {
  const store = createStore({ open: false, pylon: null });

  // Close the drawer (controlled, so we must flip the store) then notify caller.
  function handleClose() {
    store.set({ open: false });
    onClose?.();
  }

  const host = document.createElement("div");
  container.appendChild(host);
  const root = createRoot(host);
  root.render(createElement(SideviewPanel, { store, onClose: handleClose }));

  return {
    /** Open the drawer for a pylon. `info` comes from buildPylonInfo. */
    open(info) {
      store.set({ open: true, pylon: info });
    },
    close: handleClose,
    dispose() {
      root.unmount();
      host.remove();
    },
  };
}
