import { Card } from "@/components/ui/card";

/** Top-left title + one-line help text. Purely decorative (no pointer events). */
export function TitleOverlay() {
  return (
    <Card className="pointer-events-none fixed top-3 left-3 z-10 max-w-65 select-none gap-1 rounded-lg p-3">
      <h1 className="font-semibold text-sm uppercase tracking-wider">
        pylon-synth
      </h1>
      <p className="text-muted-foreground text-xs">
        Drag a pylon up/down · right-drag to orbit · double-click for details.
      </p>
    </Card>
  );
}
