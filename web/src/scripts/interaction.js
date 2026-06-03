// interaction.js — click-hold pylon drag + right-drag camera orbit (M3).
//
// PRIMARY button (left): grab a pylon on pointerdown (raycaster pick), then on
// pointermove drag it on the XZ ground plane (Pylon.setGroundPosition); release
// on pointerup/pointercancel.
// SECONDARY button (right): if a pylon is under the cursor, drag it on the Y
// axis / height (Pylon.setHeight); otherwise drag to orbit the camera around the
// band centre via the scene's orbit() callback.
// The buttons/targets are arbitrated in onPointerDown so the two never fight
// over the same drag.
//
// XZ mapping: the pointer ray is intersected with a horizontal plane at the
// grabbed pylon's current height; the intersection's X/Z is the target slot.
// Height mapping: the ray is intersected with a vertical plane through the pylon
// that faces the camera; the intersection's Y is the target height. Either way
// the pylon tracks the cursor under the current camera.

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
 * @param {(pylon: import("./pylon.js").Pylon) => void} [opts.onSelect] - called
 *   with the pylon under the cursor on a double-click (sideview selection).
 * @param {() => boolean} [opts.isBlocked] - when it returns true, drag/orbit and
 *   selection are ignored (e.g. while the sideview is open).
 * @returns {{ dispose: () => void, getGrabbed: () => import("./pylon.js").Pylon | null }}
 */
export function createInteraction({
  canvas,
  camera,
  pylons,
  orbit,
  onSelect,
  isBlocked,
}) {
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
  // Drag mode locked at pointerdown: "xz" (plain) or "height" (Shift held).
  let dragMode = "xz";

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

  // Build a horizontal plane (normal +Y) through `point`, so the ray reads an
  // X/Z slot at the grabbed pylon's current height for an XZ-ground drag.
  function setHorizontalPlane(point) {
    planeNormal.set(0, 1, 0);
    dragPlane.setFromNormalAndCoplanarPoint(planeNormal, point);
  }

  // Pick the pylon under the current pointer, or null. Assumes updatePointer +
  // raycaster.setFromCamera were called for this event.
  function pickPylon() {
    const hits = raycaster.intersectObjects(pickTargets, false);
    return hits.length ? hits[0].object.userData.pylon : null;
  }

  // Begin a pylon drag: lock the mode, set the matching drag plane, capture.
  function grab(pylon, event, mode) {
    grabbed = pylon;
    activePointerId = event.pointerId;
    dragMode = mode;
    grabbed.setGrabbed(true);
    if (mode === "height") {
      setDragPlane(pylon.object3d.position); // vertical plane facing camera
    } else {
      setHorizontalPlane(pylon.object3d.position); // horizontal ground plane
    }
    capture(event.pointerId);
    event.preventDefault();
  }

  function onPointerDown(event) {
    // While blocked (e.g. sideview open) the scene is non-interactive: swallow
    // all drag/orbit starts so the focused framing stays put.
    if (isBlocked?.()) return;

    // Secondary button (right): drag a pylon on the Y axis (height) if one is
    // under the cursor; otherwise orbit the camera.
    if (event.button === 2) {
      if (orbiting || grabbed) return;
      updatePointer(event);
      raycaster.setFromCamera(pointer, camera);
      const pylon = pickPylon();
      if (pylon) {
        grab(pylon, event, "height");
        return;
      }
      // Empty space → orbit the camera (if enabled).
      if (!orbit) return;
      orbiting = true;
      orbitPointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      capture(event.pointerId);
      event.preventDefault();
      return;
    }

    // Primary button (left): drag a pylon on the XZ ground plane.
    if (event.button !== 0 || grabbed || orbiting) return;
    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);
    const pylon = pickPylon();
    if (pylon) grab(pylon, event, "xz");
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
      if (dragMode === "height") {
        grabbed.setHeight(hitPoint.y); // setHeight clamps to the band
      } else {
        grabbed.setGroundPosition(hitPoint.x, hitPoint.z); // clamps to play area
      }
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

  // Double-click a pylon to select it (opens the sideview). Reuses the same
  // raycaster pick as drag; ignored while blocked or when no handler is wired.
  function onDoubleClick(event) {
    if (!onSelect || isBlocked?.()) return;
    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);
    const pylon = pickPylon();
    if (pylon) {
      onSelect(pylon);
      event.preventDefault();
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("dblclick", onDoubleClick);

  function dispose() {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", release);
    canvas.removeEventListener("pointercancel", release);
    canvas.removeEventListener("contextmenu", onContextMenu);
    canvas.removeEventListener("dblclick", onDoubleClick);
  }

  return { dispose, getGrabbed: () => grabbed };
}
