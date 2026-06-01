// scene.js — the three.js stage the pylons sit on.
//
// This module owns the scene: a WebGLRenderer, a camera (default framing set
// here; right-drag orbit is driven via the exposed orbit() callback), the
// pylon guide rails, a ground plane, and lighting.

import * as THREE from "three";

import { BAND, PYLONS } from "./config.js";
import { createPylons } from "./pylon.js";

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
 * @returns {{ start: () => void, dispose: () => void, onFrame: (cb: () => void) => void, scene: THREE.Scene, pylons: import("./pylon.js").Pylon[], camera: THREE.Camera, canvas: HTMLCanvasElement }}
 */
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND_COLOR);

  // Fixed camera: a single static framing showing all 4 pylon slots and the
  // full vertical band. It looks at the band centre and never moves (no orbit)
  // so vertical-drag interaction stays unambiguous.
  //
  // Base framing is straight-on from +Z, slightly above the band centre. We
  // then pivot the camera around the centre: 30° left (azimuth) and 20° up
  // (elevation), keeping the same distance and look-at target.
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const pivotCenter = new THREE.Vector3(0, BAND_CENTER_Y, 0);
  const camOffset = new THREE.Vector3(0, 1.5, 12); // base position relative to centre
  const camSpherical = new THREE.Spherical().setFromVector3(camOffset);
  camSpherical.theta -= THREE.MathUtils.degToRad(30); // 30° left
  camSpherical.phi -= THREE.MathUtils.degToRad(20); // 20° up (smaller polar angle = higher)
  camSpherical.makeSafe();
  camera.position.copy(pivotCenter).add(new THREE.Vector3().setFromSpherical(camSpherical));
  camera.position.y *= 0.85; // lower the camera 15%, still looking at the band centre
  camera.lookAt(pivotCenter);

  // Orbit state: the camera's spherical coords relative to the pivot. Seeded
  // from the current (lowered) position so the default framing is preserved
  // exactly, and updated by orbit() on right-drag (see interaction.js).
  const orbitSpherical = new THREE.Spherical().setFromVector3(
    new THREE.Vector3().subVectors(camera.position, pivotCenter),
  );

  /**
   * Rotate the camera around the band centre by the given spherical deltas
   * (radians), keeping its distance and look-at target. Elevation is clamped so
   * the view can't flip over the top or dip below the band.
   * @param {number} dTheta - azimuth delta.
   * @param {number} dPhi - elevation (polar) delta.
   */
  function orbit(dTheta, dPhi) {
    orbitSpherical.theta += dTheta;
    orbitSpherical.phi = THREE.MathUtils.clamp(orbitSpherical.phi + dPhi, 0.2, 1.5);
    orbitSpherical.makeSafe();
    camera.position
      .copy(pivotCenter)
      .add(new THREE.Vector3().setFromSpherical(orbitSpherical));
    camera.lookAt(pivotCenter);
  }

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

  // Vertical guide rails: a faint line at each pylon's centre axis, from the
  // ground (y = 0) up to the top of the band (BAND.max), depicting each pylon's
  // full travel range. Static furniture — drawn independently of the pylon
  // groups (which translate vertically as they're dragged). One LineSegments
  // holds all rails (two vertices each) for a single draw call.
  const railPositions = new Float32Array(PYLONS.length * 2 * 3);
  PYLONS.forEach((entry, i) => {
    const [x, , z] = entry.position;
    const base = i * 6;
    railPositions[base + 0] = x;
    railPositions[base + 1] = 0;
    railPositions[base + 2] = z;
    railPositions[base + 3] = x;
    railPositions[base + 4] = BAND.max;
    railPositions[base + 5] = z;
  });
  const railGeometry = new THREE.BufferGeometry();
  railGeometry.setAttribute("position", new THREE.BufferAttribute(railPositions, 3));
  const railMaterial = new THREE.LineBasicMaterial({
    color: 0xd2ff72,
    transparent: true,
    opacity: 0.18,
  });
  const rails = new THREE.LineSegments(railGeometry, railMaterial);
  scene.add(rails);

  // One pylon per config entry, placed at its [x, z] slot and resting at
  // mid-band. Interaction + MIDI (later milestones) drive their heights via the
  // Pylon get/set API.
  const pylons = createPylons(scene, PYLONS);

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  // Per-frame callbacks (e.g. MIDI dispatch) run before each render. Kept here
  // so the render loop owns a single requestAnimationFrame for the whole app.
  const frameCallbacks = [];
  function onFrame(cb) {
    frameCallbacks.push(cb);
  }

  let frameId = 0;
  function renderLoop() {
    frameId = requestAnimationFrame(renderLoop);
    for (const cb of frameCallbacks) cb();
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
    for (const pylon of pylons) pylon.dispose();
    railGeometry.dispose();
    railMaterial.dispose();
    ground.geometry.dispose();
    ground.material.dispose();
    renderer.dispose();
  }

  // Expose the camera and canvas so interaction (M3) can raycast against the
  // pylons; expose the pylons themselves for grab targets + their value getter;
  // expose the scene so connection lines (M5) can be added to it.
  return { start, dispose, onFrame, orbit, scene, pylons, camera, canvas };
}
