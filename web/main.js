// main.js — bootstrap entry loaded by index.html.
//
// Wires the canvas to the scene, enables click-hold vertical drag (M3), starts
// MIDI dispatch (M4), and starts the render loop. MIDI reads each pylon's
// normalized value via `Pylon.getNormalized()` and emits CC on integer change.

import { createScene } from "./scene.js";
import { createInteraction } from "./interaction.js";
import { createConnections } from "./connections.js";
import { createMidi } from "./midi.js";
import { PYLONS } from "./config.js";

const canvas = document.getElementById("scene");
if (!canvas) {
  throw new Error("Canvas element with id='scene' not found");
}

const scene = createScene(canvas);

// Click-hold a pylon and drag up/down to set its height within the band.
createInteraction({
  canvas: scene.canvas,
  camera: scene.camera,
  pylons: scene.pylons,
});

// FM-algorithm depiction: bright-lime lines linking the connected pylons.
// Static (no value/depth encoding); `update()` runs each frame so the lines
// follow the pylons' waist positions as they are dragged vertically.
const connections = createConnections(scene.scene, scene.pylons);
scene.onFrame(connections.update);

// Web MIDI: port picker + status overlay + throttled CC dispatch. `tick()` runs
// each frame and only sends a pylon's CC when its integer value changes.
const midi = createMidi({ pylons: scene.pylons, entries: PYLONS });
scene.onFrame(midi.tick);

scene.start();
