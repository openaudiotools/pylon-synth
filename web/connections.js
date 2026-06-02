// connections.js — the FM-algorithm depiction (M5).
//
// Draws one bright-lime line per entry in `config.CONNECTIONS`, linking the two
// pylons named in each pair (e.g. ["M1", "c2"]). The lines are a static picture
// of the FM routing — they carry NO value/depth encoding — but a small circle
// sprite travels along each one from the SOURCE operator to the TARGET, pulsing
// as it goes, to show the direction signal flows through the algorithm. The
// motion is purely decorative (steady, not CC-driven). Each frame we refresh
// the line endpoints AND the sprite positions from the live pylon waists.
//
// All pairs share a single THREE.LineSegments (two vertices per pair), which is
// the cheapest way to draw N independent segments with one draw call.

import * as THREE from "three";

import { CONNECTIONS } from "./config.js";

// Bright lime, reserved for the algorithm depiction (per palette).
const LINE_COLOR = 0xd2ff72;

// Travelling pulse: seconds for one sprite to cross source → target, and its
// base size in world units (waist radius is ~0.45 for reference).
const TRIP_SECONDS = 1.6;
const SPRITE_SIZE = 0.3;

/**
 * Build a soft circular sprite texture (radial gradient, transparent edge) once
 * and share it across all pulse sprites.
 * @returns {THREE.CanvasTexture}
 */
function makePulseTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, "rgba(255, 255, 255, 1)");
  g.addColorStop(0.3, "rgba(210, 255, 114, 1)");
  g.addColorStop(1, "rgba(210, 255, 114, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

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

  // One travelling pulse sprite per pair. Each needs its own material (opacity
  // differs per sprite as it fades in/out along its trip) but they all share a
  // single texture. `offset` staggers the sprites so they don't move in unison.
  const pulseTexture = makePulseTexture();
  const sprites = pairs.map((_, i) => {
    const mat = new THREE.SpriteMaterial({
      map: pulseTexture,
      color: LINE_COLOR,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.frustumCulled = false;
    scene.add(sprite);
    return { sprite, mat, offset: i / Math.max(pairs.length, 1) };
  });

  // Steady wall-clock time base for the (non-CC-driven) pulse motion.
  const startTime = performance.now();

  /**
   * Refresh every line endpoint from the connected pylons' current waist
   * positions, then advance each pulse sprite along its segment. Pylons move
   * on the XZ plane and in Y during drag, so this must run each frame.
   */
  function update() {
    const elapsed = (performance.now() - startTime) / 1000;
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

      // Travel source (a) → target (b), looping; fade in at the source and out
      // at the target, with a faster size pulse layered on top.
      const { sprite, mat, offset } = sprites[i];
      const t = (elapsed / TRIP_SECONDS + offset) % 1;
      sprite.position.set(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
        a.z + (b.z - a.z) * t,
      );
      const fade = Math.sin(t * Math.PI);
      const pulse = 0.75 + 0.25 * Math.sin(elapsed * 8 + i);
      const s = SPRITE_SIZE * pulse * (0.4 + 0.6 * fade);
      sprite.scale.set(s, s, 1);
      mat.opacity = fade;
    }
    positionAttr.needsUpdate = true;
  }

  // Seed the endpoints so the lines are correct on the very first frame.
  update();

  function dispose() {
    scene.remove(lines);
    geometry.dispose();
    material.dispose();
    for (const { sprite, mat } of sprites) {
      scene.remove(sprite);
      mat.dispose();
    }
    pulseTexture.dispose();
  }

  return { update, dispose };
}
