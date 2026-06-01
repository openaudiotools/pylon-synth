// interaction.js — click-hold vertical drag (M3).
//
// Grab a pylon on pointerdown (raycaster pick), then on pointermove drag it
// vertically within the band; release on pointerup/pointercancel. The camera is
// FIXED (no orbit), so there is no orbit/drag conflict to arbitrate.
//
// Height mapping: while grabbed, the pointer ray is intersected with a vertical
// plane through the grabbed pylon that faces the camera. The intersection's Y is
// the target height (clamped by Pylon.setHeight to the band). This makes the
// pylon track the cursor's world height directly, which reads correctly under a
// fixed perspective camera.

import * as THREE from "three";

/**
 * Wire pointer interaction onto a canvas/camera/pylons triple.
 *
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas - the render canvas (event source).
 * @param {THREE.Camera} opts.camera - the fixed scene camera.
 * @param {import("./pylon.js").Pylon[]} opts.pylons - grabbable pylons.
 * @returns {{ dispose: () => void, getGrabbed: () => import("./pylon.js").Pylon | null }}
 */
export function createInteraction({ canvas, camera, pylons }) {
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
    if (grabbed) return;
    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickTargets, false);
    if (hits.length === 0) return;

    grabbed = hits[0].object.userData.pylon;
    activePointerId = event.pointerId;
    grabbed.setGrabbed(true);
    setDragPlane(grabbed.object3d.position);

    // Capture the pointer so drags that leave the canvas keep updating.
    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* capture is best-effort; ignore unsupported/invalid pointer ids */
      }
    }
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!grabbed || event.pointerId !== activePointerId) return;
    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
      grabbed.setHeight(hitPoint.y); // setHeight clamps to the band
    }
    event.preventDefault();
  }

  function release(event) {
    if (!grabbed || event.pointerId !== activePointerId) return;
    grabbed.setGrabbed(false);
    grabbed = null;
    activePointerId = null;
    if (canvas.releasePointerCapture) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* may already be released; ignore */
      }
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  function dispose() {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", release);
    canvas.removeEventListener("pointercancel", release);
  }

  return { dispose, getGrabbed: () => grabbed };
}
