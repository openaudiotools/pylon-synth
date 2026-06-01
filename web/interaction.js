// interaction.js — click-hold vertical drag + right-drag camera orbit (M3).
//
// PRIMARY button (left): grab a pylon on pointerdown (raycaster pick), then on
// pointermove drag it vertically within the band; release on
// pointerup/pointercancel. SECONDARY button (right): drag to orbit the camera
// around the band centre via the scene's orbit() callback. The two are
// arbitrated by event.button so they never fight over the same drag.
//
// Height mapping: while grabbed, the pointer ray is intersected with a vertical
// plane through the grabbed pylon that faces the camera. The intersection's Y is
// the target height (clamped by Pylon.setHeight to the band). This makes the
// pylon track the cursor's world height directly under the current camera.

import * as THREE from "three";

// Orbit sensitivity in radians per pixel of drag (~0.46°/px).
const ORBIT_SPEED = 0.008;

/**
 * Wire pointer interaction onto a canvas/camera/pylons triple.
 *
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas - the render canvas (event source).
 * @param {THREE.Camera} opts.camera - the scene camera.
 * @param {import("./pylon.js").Pylon[]} opts.pylons - grabbable pylons.
 * @param {(dTheta: number, dPhi: number) => void} [opts.orbit] - rotates the
 *   camera around the pivot; called on right-drag. Omit to disable orbit.
 * @returns {{ dispose: () => void, getGrabbed: () => import("./pylon.js").Pylon | null }}
 */
export function createInteraction({ canvas, camera, pylons, orbit }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  // The vertical drag plane through the grabbed pylon, and a scratch vector for
  // ray/plane intersections. Reused across moves to avoid per-event allocation.
  const dragPlane = new THREE.Plane();
  const planeNormal = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();

  // Flattened pick list across all pylons; each mesh back-references its Pylon
  // via userData.pylon (set in Pylon's constructor).
  const pickTargets = pylons.flatMap((p) => p.pickTargets);

  /** @type {import("./pylon.js").Pylon | null} */
  let grabbed = null;
  let activePointerId = null;

  // Right-drag orbit state: the dragging pointer and its last screen position.
  let orbiting = false;
  let orbitPointerId = null;
  let lastX = 0;
  let lastY = 0;

  // Best-effort pointer capture so drags keep updating when the cursor leaves
  // the canvas; ignore unsupported/invalid pointer ids.
  function capture(pointerId) {
    if (!canvas.setPointerCapture) return;
    try {
      canvas.setPointerCapture(pointerId);
    } catch {
      /* capture is best-effort */
    }
  }
  function releaseCapture(pointerId) {
    if (!canvas.releasePointerCapture) return;
    try {
      canvas.releasePointerCapture(pointerId);
    } catch {
      /* may already be released */
    }
  }

  // Set the normalized device coords (NDC, [-1, 1]) for the raycaster from a
  // pointer event, relative to the canvas's on-screen rect.
  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  // Build a vertical plane through `point` whose normal faces the camera but is
  // kept horizontal (no Y component), so the plane is truly vertical and the
  // ray always meets it for a stable height read.
  function setDragPlane(point) {
    planeNormal.subVectors(camera.position, point);
    planeNormal.y = 0;
    if (planeNormal.lengthSq() === 0) planeNormal.set(0, 0, 1);
    planeNormal.normalize();
    dragPlane.setFromNormalAndCoplanarPoint(planeNormal, point);
  }

  function onPointerDown(event) {
    // Secondary button → orbit the camera (if enabled). Takes priority and
    // never grabs a pylon, so right-clicking a pylon orbits rather than drags.
    if (event.button === 2) {
      if (!orbit || orbiting || grabbed) return;
      orbiting = true;
      orbitPointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      capture(event.pointerId);
      event.preventDefault();
      return;
    }

    // Primary button only → grab a pylon.
    if (event.button !== 0 || grabbed || orbiting) return;
    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickTargets, false);
    if (hits.length === 0) return;

    grabbed = hits[0].object.userData.pylon;
    activePointerId = event.pointerId;
    grabbed.setGrabbed(true);
    setDragPlane(grabbed.object3d.position);
    capture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (orbiting && event.pointerId === orbitPointerId) {
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      // Drag-to-rotate-the-scene feel (matches OrbitControls): drag right →
      // azimuth decreases; drag down → elevation decreases (camera rises).
      orbit(-dx * ORBIT_SPEED, -dy * ORBIT_SPEED);
      event.preventDefault();
      return;
    }

    if (!grabbed || event.pointerId !== activePointerId) return;
    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
      grabbed.setHeight(hitPoint.y); // setHeight clamps to the band
    }
    event.preventDefault();
  }

  function release(event) {
    if (orbiting && event.pointerId === orbitPointerId) {
      orbiting = false;
      orbitPointerId = null;
      releaseCapture(event.pointerId);
      return;
    }

    if (!grabbed || event.pointerId !== activePointerId) return;
    grabbed.setGrabbed(false);
    grabbed = null;
    activePointerId = null;
    releaseCapture(event.pointerId);
  }

  // Suppress the browser context menu so right-drag can orbit without a popup.
  function onContextMenu(event) {
    event.preventDefault();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("contextmenu", onContextMenu);

  function dispose() {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", release);
    canvas.removeEventListener("pointercancel", release);
    canvas.removeEventListener("contextmenu", onContextMenu);
  }

  return { dispose, getGrabbed: () => grabbed };
}
