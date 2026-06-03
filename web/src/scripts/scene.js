// scene.js — the three.js stage the pylons sit on.
//
// This module owns the scene: a WebGLRenderer, a camera (default framing set
// here; right-drag orbit is driven via the exposed orbit() callback), the
// pylon guide rails, a ground plane, and lighting.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

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
 * @returns {{ start: () => void, dispose: () => void, onFrame: (cb: () => void) => void, orbit: (dTheta: number, dPhi: number) => void, focusOnPylon: (pylon: import("./pylon.js").Pylon) => void, clearFocus: () => void, isFocused: () => boolean, scene: THREE.Scene, pylons: import("./pylon.js").Pylon[], camera: THREE.Camera, canvas: HTMLCanvasElement }}
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

  // ── Sideview camera focus ────────────────────────────────────────────────
  // Selecting a pylon (double-click; see interaction.js) eases the camera in to
  // look straight at that pylon, while an info drawer opens over the right.
  // Closing eases the camera back to where it was. There's no tween library, so
  // this is a hand-rolled tween advanced by the render loop (see
  // updateFocusTween, registered on frame below). orbitSpherical is left
  // untouched throughout so right-drag orbit resumes exactly on return.
  //
  // The camera always *looks* dead-centre at the pylon; to sit the pylon in the
  // centre of the LEFT HALF of the screen (the drawer covers the right half) we
  // shift the projection frustum horizontally via camera.setViewOffset — a crop,
  // not a camera move, so there's no distortion. Shifting the frustum by a
  // quarter of the width puts the optical axis at 25% from the left.
  //
  // A depth-of-field (bokeh) post-pass keeps the selected pylon sharp while the
  // rest of the scene blurs: `focus` (a world distance) tracks the camera→pylon
  // distance, and `maxblur` is ramped 0→FOCUS_MAXBLUR by the same tween, so the
  // scene is fully sharp when idle and blurs in as the camera flies to a pylon.

  // Framing constants. Tuned against the design sketch.
  const FOCUS_DISTANCE = 4.5; // camera distance from the focused pylon's waist (metres)
  const FOCUS_LIFT = 0.6; // raise the eye a touch above the waist for a slight top-down
  const FOCUS_DURATION_MS = 700; // ease-in-out transition length
  const FOCUS_OFFSET_FRACTION = 0.25; // frustum shift: pylon at 25% from left = centre of left half
  // Bokeh DoF tuning. `aperture` is blur-per-metre-of-defocus: it must be small
  // enough that the pylon's own ~0.9 m front-to-back depth stays inside the sharp
  // zone (≈0.002·0.9 ≈ negligible), while the background — several metres away in
  // depth — still reaches `maxblur`. Too large an aperture blurs the subject itself.
  const FOCUS_APERTURE = 0.002; // ~1.8px blur per metre of defocus (keeps the deep pylon crisp)
  const FOCUS_MAXBLUR = 0.018; // peak blur radius (fraction of screen) for the far scene

  // The live look-at point the render loop aims the camera at. Seeded to the
  // band centre (the orbit target); the focus tween animates it to a pylon and
  // back. Kept in sync so right-drag orbit (which targets pivotCenter) is
  // consistent after a return.
  const currentTarget = pivotCenter.clone();

  let focused = false;
  /** @type {null | { pos: THREE.Vector3, target: THREE.Vector3 }} */
  let homePose = null;
  /** @type {null | { fromPos: THREE.Vector3, toPos: THREE.Vector3, fromTarget: THREE.Vector3, toTarget: THREE.Vector3, fromFrac: number, toFrac: number, fromBlur: number, toBlur: number, start: number, closing: boolean }} */
  let focusTween = null;

  // Current horizontal frustum crop (fraction of width): 0 = none (full frame),
  // FOCUS_OFFSET_FRACTION = pylon centred in the left half. Animated by the tween;
  // sticky on the projection matrix once set, so it persists between frames.
  let viewOffsetFrac = 0;

  // Current depth-of-field amount in [0, 1]: 0 = sharp, 1 = full bokeh. Drives
  // the bokeh pass's maxblur; animated by the tween and held between frames.
  let blurAmount = 0;

  // Apply (or clear) the horizontal frustum crop at the current window size.
  // Re-derived from window dimensions so a resize re-applies it correctly.
  function applyViewOffset(frac) {
    viewOffsetFrac = frac;
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (frac > 0) {
      camera.setViewOffset(width, height, frac * width, 0, width, height);
    } else {
      camera.clearViewOffset();
    }
  }

  // Smoothstep ease-in-out on t ∈ [0, 1].
  const easeInOut = (t) => t * t * (3 - 2 * t);

  // Compute the framed end pose for focusing on `pylon`: aim straight at the
  // pylon's middle (the waist = group origin), with the eye placed FOCUS_DISTANCE
  // back along the current view direction and lifted a little for a slight
  // top-down. No horizontal pan for now — the camera looks dead-centre.
  function framePose(pylon) {
    const target = pylon.object3d.position.clone(); // waist = the pylon's middle

    // Approach from the current viewing direction (pylon → camera) for continuity.
    const dir = new THREE.Vector3().subVectors(camera.position, target);
    dir.y = 0;
    if (dir.lengthSq() === 0) dir.set(0, 0, 1);
    dir.normalize();

    const pos = target
      .clone()
      .addScaledVector(dir, FOCUS_DISTANCE)
      .add(new THREE.Vector3(0, FOCUS_LIFT, 0));

    return { pos, target };
  }

  /**
   * Ease the camera in to look at `pylon`, cropping the frustum so it sits in the
   * centre of the left half. Saves the current pose so clearFocus() can return to
   * it. No-op if already focused.
   * @param {import("./pylon.js").Pylon} pylon
   */
  function focusOnPylon(pylon) {
    if (focused) return;
    focused = true;
    homePose = { pos: camera.position.clone(), target: currentTarget.clone() };
    const { pos, target } = framePose(pylon);
    focusTween = {
      fromPos: camera.position.clone(),
      toPos: pos,
      fromTarget: currentTarget.clone(),
      toTarget: target,
      fromFrac: viewOffsetFrac,
      toFrac: FOCUS_OFFSET_FRACTION,
      fromBlur: blurAmount,
      toBlur: 1,
      start: performance.now(),
      closing: false,
    };
  }

  /** Ease the camera back to the pre-focus pose and uncrop. No-op if not focused. */
  function clearFocus() {
    if (!focused || !homePose) return;
    focusTween = {
      fromPos: camera.position.clone(),
      toPos: homePose.pos.clone(),
      fromTarget: currentTarget.clone(),
      toTarget: homePose.target.clone(),
      fromFrac: viewOffsetFrac,
      toFrac: 0,
      fromBlur: blurAmount,
      toBlur: 0,
      start: performance.now(),
      closing: true,
    };
  }

  /** @returns {boolean} true while focused or mid-transition either way. */
  function isFocused() {
    return focused;
  }

  // Advance the active focus tween, if any; runs once per frame before render.
  function updateFocusTween() {
    if (!focusTween) return;
    const t = THREE.MathUtils.clamp(
      (performance.now() - focusTween.start) / FOCUS_DURATION_MS,
      0,
      1,
    );
    const e = easeInOut(t);
    camera.position.lerpVectors(focusTween.fromPos, focusTween.toPos, e);
    currentTarget.lerpVectors(focusTween.fromTarget, focusTween.toTarget, e);
    camera.lookAt(currentTarget);
    applyViewOffset(THREE.MathUtils.lerp(focusTween.fromFrac, focusTween.toFrac, e));

    // Depth of field: keep `focus` on the live look-at point (the pylon while
    // focused) and ramp the blur with the same eased progress.
    blurAmount = THREE.MathUtils.lerp(focusTween.fromBlur, focusTween.toBlur, e);
    bokehPass.uniforms["focus"].value = camera.position.distanceTo(currentTarget);
    bokehPass.uniforms["maxblur"].value = FOCUS_MAXBLUR * blurAmount;

    if (t >= 1) {
      // A closing tween lands back at the band centre: drop focus so orbit
      // (which targets pivotCenter) takes over cleanly on the next right-drag.
      if (focusTween.closing) {
        focused = false;
        homePose = null;
      }
      focusTween = null;
    }
  }

  // Post-processing composer used for the whole scene (one consistent colour
  // pipeline). The bokeh pass sits between the scene render and output; its
  // maxblur is 0 when idle, so the image is fully sharp until a pylon is focused.
  // Created here (before resize() runs) so resize can size it. RenderPass/Bokeh
  // hold references to scene+camera and render them lazily, so scene contents
  // added after this point are still drawn.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bokehPass = new BokehPass(scene, camera, {
    focus: FOCUS_DISTANCE,
    aperture: FOCUS_APERTURE,
    maxblur: 0,
  });
  composer.addPass(bokehPass);
  composer.addPass(new OutputPass());

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
  // full travel range. One LineSegments holds all rails (two vertices each) for
  // a single draw call. The X/Z of each rail follows its pylon as it's dragged
  // on the ground plane (see updateRails, registered on frame below).
  const railPositions = new Float32Array(PYLONS.length * 2 * 3);
  const railGeometry = new THREE.BufferGeometry();
  const railPositionAttr = new THREE.BufferAttribute(railPositions, 3);
  railGeometry.setAttribute("position", railPositionAttr);
  const railMaterial = new THREE.LineBasicMaterial({
    color: 0xd2ff72,
    transparent: true,
    opacity: 0.18,
  });
  const rails = new THREE.LineSegments(railGeometry, railMaterial);
  scene.add(rails);

  // One pylon per config entry, placed at its [x, z] slot and resting at
  // mid-band. Interaction + MIDI (later milestones) drive their heights via the
  // Pylon get/set API. `pylons[i]` corresponds 1:1 to `PYLONS[i]`.
  const pylons = createPylons(scene, PYLONS);

  // Refresh each rail's X/Z from its pylon's live ground position (base at the
  // ground, top at BAND.max), so rails track pylons dragged on the XZ plane.
  function updateRails() {
    for (let i = 0; i < pylons.length; i++) {
      const { x, z } = pylons[i].getGroundPosition();
      const base = i * 6;
      railPositions[base + 0] = x;
      railPositions[base + 1] = 0;
      railPositions[base + 2] = z;
      railPositions[base + 3] = x;
      railPositions[base + 4] = BAND.max;
      railPositions[base + 5] = z;
    }
    railPositionAttr.needsUpdate = true;
  }
  updateRails(); // seed before the first render

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    composer.setSize(width, height);
    bokehPass.uniforms["aspect"].value = camera.aspect;
    // Re-apply any active sideview crop so it tracks the new window size.
    if (viewOffsetFrac > 0) applyViewOffset(viewOffsetFrac);
  }
  resize();
  window.addEventListener("resize", resize);

  // Per-frame callbacks (e.g. MIDI dispatch) run before each render. Kept here
  // so the render loop owns a single requestAnimationFrame for the whole app.
  const frameCallbacks = [];
  function onFrame(cb) {
    frameCallbacks.push(cb);
  }

  // Keep the guide rails under their pylons as they're dragged on the ground.
  onFrame(updateRails);

  // Advance the sideview focus/return camera tween each frame (no-op when idle).
  onFrame(updateFocusTween);

  let frameId = 0;
  function renderLoop() {
    frameId = requestAnimationFrame(renderLoop);
    for (const cb of frameCallbacks) cb();
    composer.render();
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
    composer.dispose();
    renderer.dispose();
  }

  // Expose the camera and canvas so interaction (M3) can raycast against the
  // pylons; expose the pylons themselves for grab targets + their value getter;
  // expose the scene so connection lines (M5) can be added to it.
  return {
    start,
    dispose,
    onFrame,
    orbit,
    focusOnPylon,
    clearFocus,
    isFocused,
    scene,
    pylons,
    camera,
    canvas,
  };
}
