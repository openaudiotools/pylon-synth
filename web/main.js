// main.js — bootstrap entry loaded by index.html.
//
// Keep this minimal: it just wires the canvas to the scene and starts it.
// MIDI and interaction are introduced in later milestones.

import { createScene } from "./scene.js";

const canvas = document.getElementById("scene");
if (!canvas) {
  throw new Error("Canvas element with id='scene' not found");
}

const scene = createScene(canvas);
scene.start();
