// scene.js — the static three.js stage the pylons will later sit on.
//
// This module owns only the empty scene: a WebGLRenderer, a FIXED camera
// (no orbit controls) framing the play area, a ground plane, and lighting.
// Pylon meshes, interaction, and MIDI are added in later milestones.

import * as THREE from "three";

import { BAND } from "./config.js";

// Background: dark, calm green-tinted near-black. Bright lime (#D2FF72) is
// reserved for later accents (connections / halos) and is NOT used here.
const BACKGROUND_COLOR = 0x0a1410;
const GROUND_COLOR = 0x14241c;

// Play area: 4 pylons sit in a row across x ∈ [-3, 3]; the draggable band is
// y ∈ [BAND.min, BAND.max]. The fixed camera is placed to frame both, with a
// little headroom above the band and width to spare around the row.
const BAND_CENTER_Y = (BAND.min + BAND.max) / 2;

/**
 * Build the static scene and bind it to a canvas.
 *
 * @param {HTMLCanvasElement} canvas - the full-window canvas to render into.
 * @returns {{ start: () => void, dispose: () => void }}
 */
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND_COLOR);

  // Fixed camera: a single static framing showing all 4 pylon slots and the
  // full vertical band. It looks slightly down at the band centre and never
  // moves (no orbit) so vertical-drag interaction stays unambiguous.
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, BAND_CENTER_Y + 1.5, 12);
  camera.lookAt(0, BAND_CENTER_Y, 0);

  // Ground plane the pylons stand on (y = 0). Rotated flat (XZ plane).
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({
      color: GROUND_COLOR,
      roughness: 0.95,
      metalness: 0.0,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Lighting: soft ambient fill + a key light from the front-upper-left so the
  // ground (and later the pylons) reads with some shading.
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  keyLight.position.set(-5, 10, 7);
  scene.add(keyLight);

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  let frameId = 0;
  function renderLoop() {
    frameId = requestAnimationFrame(renderLoop);
    renderer.render(scene, camera);
  }

  function start() {
    if (frameId === 0) renderLoop();
  }

  function dispose() {
    if (frameId !== 0) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
    window.removeEventListener("resize", resize);
    ground.geometry.dispose();
    ground.material.dispose();
    renderer.dispose();
  }

  return { start, dispose };
}
