import { useSyncExternalStore } from "react";
import {
  Drawer,
  DrawerDescription,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { Store } from "@/lib/store";

/** Read-only inspection data for one selected pylon (snapshot at open time). */
export interface PylonInfo {
  /** Operator id, e.g. "M1". */
  id: string;
  /** "modulator" | "carrier". */
  role: string;
  /** MIDI CC number this pylon drives. */
  cc: number;
  /** Engine parameter label the cc maps to (e.g. "M1 Ratio"), if any. */
  paramLabel?: string;
  /** Current parameter value (cc mapped into [min, max]), if a param exists. */
  value?: number;
  /** Parameter range, if a param exists. */
  min?: number;
  max?: number;
  /** Current height in metres within the band. */
  height: number;
  /** Ids this pylon links to in the FM routing. */
  connections: string[];
}

export interface SideviewState {
  /** Whether the drawer is open. */
  open: boolean;
  /** The selected pylon's info; kept across close so the exit animation has content. */
  pylon: PylonInfo | null;
}

/** One label/value row, styled like ReadoutPanel. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 leading-relaxed">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Sideview drawer: opens from the right when a pylon is selected (double-click)
 * and lists its read-only parameters. The camera focus/return is driven
 * separately in scene.js; this panel only mirrors the selection state and
 * reports close requests (×, Esc, backdrop) back through onClose.
 */
export function SideviewPanel({
  store,
  onClose,
}: {
  store: Store<SideviewState>;
  onClose: () => void;
}) {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const p = state.pylon;

  return (
    <Drawer
      open={state.open}
      position="right"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerPopup
        showCloseButton
        showBackdrop={false}
        // Width via inline style: it beats the component's base `max-w-md`/`w-[…]`
        // utilities (tailwind-merge doesn't strip them under Tailwind v4).
        style={{ width: "50vw", maxWidth: "none" }}
        className="border-s-2 border-primary"
      >
        {p && (
          <>
            <DrawerHeader>
              <DrawerTitle>{p.id}</DrawerTitle>
              <DrawerDescription className="capitalize">{p.role}</DrawerDescription>
            </DrawerHeader>
            {/* scrollable={false} → no ScrollArea wrapper, so the panel stretches to
                full width and the rows' justify-between right-aligns the values. */}
            <DrawerPanel scrollable={false} className="flex flex-col gap-1.5 text-sm">
              <Row label="CC" value={`#${p.cc}`} />
              <Row label="Parameter" value={p.paramLabel ?? "—"} />
              {p.value != null && (
                <Row label="Value" value={p.value.toFixed(2)} />
              )}
              {p.min != null && p.max != null && (
                <Row label="Range" value={`${p.min} – ${p.max}`} />
              )}
              <Row label="Height" value={`${p.height.toFixed(2)} m`} />
              <Row
                label="Connections"
                value={p.connections.length ? p.connections.join(", ") : "—"}
              />
            </DrawerPanel>
          </>
        )}
      </DrawerPopup>
    </Drawer>
  );
}
