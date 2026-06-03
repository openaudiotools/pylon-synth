import { useSyncExternalStore } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Store } from "@/lib/store";

export interface SupersonicState {
  status: string;
  variant: BadgeProps["variant"];
  playing: boolean;
  busy: boolean;
}

/**
 * In-page SuperCollider sink overlay: a status badge + a Play/Stop button.
 * Driven entirely by the store the supersonic.js factory owns; clicking the
 * button calls back into the factory's play/stop toggle.
 */
export function SupersonicPanel({
  store,
  onPlay,
}: {
  store: Store<SupersonicState>;
  onPlay: () => void;
}) {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  return (
    <Card className="w-60 gap-2 rounded-lg p-3">
      <Badge variant={state.variant} size="sm" className="self-start">
        {state.status}
      </Badge>
      <Button className="w-full" loading={state.busy} onClick={onPlay}>
        {state.playing ? "■ Stop synth" : "▶ Play synth"}
      </Button>
    </Card>
  );
}
