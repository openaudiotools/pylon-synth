# web

The web experience for pylon-synth: a three.js scene of draggable "pylons".

This module is **independent** — its only job is to render the control surface
and **dispatch MIDI CC**. It has no knowledge of the synth engine; it just sends
CC to a virtual MIDI port (via the Web MIDI API), which the `engine` picks up.

- Click and hold a pylon, move it up/down to reposition it (1 m–6 m above ground).
- Vertical position maps to a CC value (0–127) and is dispatched as MIDI CC.

See `docs/devjournal` / the project journal for design decisions.
