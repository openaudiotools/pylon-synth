# engine

The SuperCollider sound engine for pylon-synth.

A fixed-algorithm FM synth (`c2 <- M1 -> M2 -> c1`) driven entirely by incoming
MIDI CC. It listens on a virtual MIDI port and maps each CC to an operator
parameter.

- `MIDIClient.init; MIDIIn.connectAll;` then one `MIDIdef.cc` per pylon/param.
- Receives CC from the `web` module; the two halves communicate only over MIDI.

See the project journal for the FM algorithm and CC-mapping decisions.
