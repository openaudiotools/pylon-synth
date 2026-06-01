// main.js — bootstrap entry loaded by index.html.
//
// Wires the canvas to the scene, enables click-hold vertical drag (M3), and
// starts the render loop. MIDI dispatch (M4) is introduced in a later milestone
// and will read each pylon's normalized value via `Pylon.getNormalized()`.

import { createScene } from "./scene.js";
import { createInteraction } from "./interaction.js";

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

scene.start();
