import { useSyncExternalStore } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Store } from "@/lib/store";

export interface MidiPort {
  id: string;
  name: string;
}

export interface MidiState {
  status: string;
  variant: BadgeProps["variant"];
  enabled: boolean;
  ports: MidiPort[];
  selectedId: string;
  /** True when Web MIDI is unavailable (non-Chromium): the picker is hidden. */
  unsupported: boolean;
}

/**
 * Web MIDI overlay: a status badge, an enable toggle, and an output-port
 * picker. State lives in the store the midi.js factory owns; toggling/selecting
 * calls back into the factory, which re-pushes the resulting state.
 */
export function MidiPanel({
  store,
  onToggle,
  onPick,
}: {
  store: Store<MidiState>;
  onToggle: (on: boolean) => void;
  onPick: (id: string) => void;
}) {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const items = Object.fromEntries(state.ports.map((p) => [p.id, p.name]));

  return (
    <Card className="w-60 gap-3 rounded-lg p-3">
      <Badge variant={state.variant} size="sm" className="self-start">
        {state.status}
      </Badge>

      <Label className="justify-between">
        MIDI output
        <Switch
          checked={state.enabled}
          onCheckedChange={(checked) => onToggle(checked)}
        />
      </Label>

      {!state.unsupported && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-muted-foreground text-xs">Output port</Label>
          <Select
            items={items}
            value={state.selectedId || null}
            onValueChange={(value) => {
              if (value) onPick(String(value));
            }}
          >
            <SelectTrigger size="sm" disabled={state.ports.length === 0}>
              <SelectValue placeholder="No MIDI outputs" />
            </SelectTrigger>
            <SelectPopup>
              {state.ports.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
      )}
    </Card>
  );
}
