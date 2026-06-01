// connections.js — the FM-algorithm depiction (M5).
//
// Draws one bright-lime line per entry in `config.CONNECTIONS`, linking the two
// pylons named in each pair (e.g. ["M1", "c2"]). The lines are PURELY a static
// picture of the FM routing: they carry NO value/depth encoding and NO
// CC-driven animation. Their only job is to follow the connected pylons' waist
// positions as those pylons are dragged vertically — so each frame we refresh
// the geometry endpoints from the live pylon positions.
//
// All pairs share a single THREE.LineSegments (two vertices per pair), which is
// the cheapest way to draw N independent segments with one draw call.

import * as THREE from "three";

import { CONNECTIONS } from "./config.js";

// Bright lime, reserved for the algorithm depiction (per palette).
const LINE_COLOR = 0xd2ff72;

/**
 * Build the connection lines and add them to the scene.
 *
 * @param {THREE.Scene} scene - the scene to add the lines to.
 * @param {import("./pylon.js").Pylon[]} pylons - pylons in config order; each
 *   exposes `id` and `object3d` (a THREE.Group whose position is its waist).
 * @returns {{ update: () => void, dispose: () => void }} `update()` should be
 *   called each render frame to keep the endpoints on the live pylon positions.
 */
export function createConnections(scene, pylons) {
  // Resolve pylon ids -> pylon, so each CONNECTIONS pair can find its endpoints.
  const byId = new Map(pylons.map((p) => [p.id, p]));

  // Each valid pair contributes two endpoints (from, to) to the segment list.
  // Skip (and warn about) any pair that names an unknown pylon rather than
  // crashing — config is the contract, but a typo shouldn't blank the scene.
  const pairs = [];
  for (const [fromId, toId] of CONNECTIONS) {
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (!from || !to) {
      console.warn(
        `connections: skipping ["${fromId}", "${toId}"] — unknown pylon id`,
      );
      continue;
    }
    pairs.push([from, to]);
  }

  // Two vertices (3 floats each) per pair. Positions are filled by update().
  const positions = new Float32Array(pairs.length * 2 * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.LineBasicMaterial({ color: LINE_COLOR });
  const lines = new THREE.LineSegments(geometry, material);
  // Static depiction: never culled out by its (empty) initial bounds.
  lines.frustumCulled = false;
  scene.add(lines);

  const positionAttr = geometry.getAttribute("position");

  /**
   * Refresh every endpoint from the connected pylons' current waist positions.
   * Pylons move vertically during drag, so this must run each frame.
   */
  function update() {
    for (let i = 0; i < pairs.length; i++) {
      const [from, to] = pairs[i];
      const a = from.object3d.position;
      const b = to.object3d.position;
      const base = i * 6;
      positions[base + 0] = a.x;
      positions[base + 1] = a.y;
      positions[base + 2] = a.z;
      positions[base + 3] = b.x;
      positions[base + 4] = b.y;
      positions[base + 5] = b.z;
    }
    positionAttr.needsUpdate = true;
  }

  // Seed the endpoints so the lines are correct on the very first frame.
  update();

  function dispose() {
    scene.remove(lines);
    geometry.dispose();
    material.dispose();
  }

  return { update, dispose };
}
