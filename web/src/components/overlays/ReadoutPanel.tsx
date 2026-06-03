import { useSyncExternalStore } from "react";
import { Card } from "@/components/ui/card";
import type { Store } from "@/lib/store";

export interface ReadoutState {
  /** One formatted value per label, in the same order. */
  values: string[];
}

/**
 * Live FM-ratio readout: one label/value row per pylon-driven parameter, fixed
 * bottom-left. The readout.js factory updates values only when a pylon's
 * integer CC changes, so re-renders are infrequent despite the per-frame tick.
 */
export function ReadoutPanel({
  labels,
  store,
}: {
  labels: string[];
  store: Store<ReadoutState>;
}) {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  return (
    <Card className="fixed bottom-3 left-3 z-10 min-w-[150px] select-none gap-1.5 rounded-lg p-3">
      {labels.map((label, i) => (
        <div key={label} className="flex justify-between gap-4 leading-relaxed">
          <span className="text-muted-foreground">{label}</span>
          <span className="tabular-nums">{state.values[i] ?? "—"}</span>
        </div>
      ))}
    </Card>
  );
}
