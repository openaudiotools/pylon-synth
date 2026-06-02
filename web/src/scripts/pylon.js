// pylon.js — the pylon visual: a square bipyramid (spinning-top) body and a
// torus "connector ring" at the waist.
//
// A pylon is a parameter-agnostic control object: its only state that matters
// later is its *height* (Y position within the band). Interaction (M3) and MIDI
// (M4) live in later milestones; this module just builds the mesh, places it,
// and exposes a height get/set API.

import * as THREE from "three";

import { BAND, PLAY_HALF } from "./config.js";

// Bright lime accent, reserved for the connector ring (per palette).
const ACCENT_COLOR = 0xd2ff72;

// Mid-band resting height: pylons start centred in y ∈ [BAND.min, BAND.max].
const MID_BAND_Y = (BAND.min + BAND.max) / 2;

// Body proportions (world units = metres). The bipyramid is two square pyramids
// joined at a shared square base — the "waist" — with the connector ring riding
// that waist. WAIST_RADIUS is the circumradius of the square (corner distance).
const WAIST_RADIUS = 0.45; // circumradius of the square waist
const PYRAMID_HEIGHT = 0.9; // height of each pyramid (total body ≈ 2 × this)
const RING_TUBE = 0.08; // tube radius of the torus connector ring

/**
 * A single pylon. Construct one per `config.PYLONS` entry.
 *
 * The mesh is grouped under `pylon.object3d`; add that to the scene. The whole
 * group is translated to the entry's [x, z] and lifted to its current height.
 */
export class Pylon {
  /**
   * @param {object} entry - a `config.PYLONS` entry.
   * @param {string} entry.id - operator id (e.g. "M1").
   * @param {[number, number, number]} entry.position - [x, y, z]. x and z set
   *   the ground slot. y sets the starting height when it falls within the band
   *   y ∈ [BAND.min, BAND.max]; otherwise the pylon starts at mid-band. Height
   *   is still driven by drag/MIDI after load.
   * @param {string} entry.color - green surface color from the palette.
   */
  constructor(entry) {
    this.id = entry.id;

    const [x, y, z] = entry.position;
    this._x = x;
    this._z = z;
    // Use the config Y as the resting height if it's a sensible in-band value,
    // else fall back to mid-band (keeps entries with y outside the band, e.g. 0).
    this._initialY = y >= BAND.min && y <= BAND.max ? y : MID_BAND_Y;

    const surface = new THREE.MeshStandardMaterial({
      color: new THREE.Color(entry.color),
      roughness: 0.55,
      metalness: 0.1,
    });
    this._surfaceMaterial = surface;

    const group = new THREE.Group();
    group.name = `pylon:${entry.id}`;

    // Bipyramid body: upper pyramid points up, lower pyramid points down, joined
    // at the square waist (y = 0 in the group's local frame). A 4-sided
    // ConeGeometry is a square pyramid; three.js places a base corner toward +Z,
    // so an edge faces the camera, giving the vertical ridge silhouette from the
    // design. The apex is +y and the base is −y, so the upper pyramid sits as-is
    // and the lower pyramid is flipped 180° about x.
    const upperPyramid = new THREE.Mesh(
      new THREE.ConeGeometry(WAIST_RADIUS, PYRAMID_HEIGHT, 4),
      surface,
    );
    upperPyramid.position.y = PYRAMID_HEIGHT / 2;

    const lowerPyramid = new THREE.Mesh(
      new THREE.ConeGeometry(WAIST_RADIUS, PYRAMID_HEIGHT, 4),
      surface,
    );
    lowerPyramid.rotation.x = Math.PI;
    lowerPyramid.position.y = -PYRAMID_HEIGHT / 2;

    group.add(upperPyramid, lowerPyramid);

    // Connector ring: a torus at the waist, lying in the horizontal plane.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(WAIST_RADIUS + RING_TUBE * 0.5, RING_TUBE, 16, 48),
      new THREE.MeshStandardMaterial({
        color: ACCENT_COLOR,
        emissive: new THREE.Color(ACCENT_COLOR),
        emissiveIntensity: 0.6,
        roughness: 0.4,
        metalness: 0.2,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    this.object3d = group;
    // Track owned resources for disposal.
    this._meshes = [upperPyramid, lowerPyramid, ring];

    // References used by interaction (M3): grabbed-state visual feedback.
    this._ring = ring;
    // Resting (un-grabbed) values, restored on release.
    this._restRingEmissive = ring.material.emissiveIntensity;

    // Raycast targets, each back-referencing this Pylon so a mesh hit can be
    // mapped to its owner (see interaction.js).
    this.pickTargets = [upperPyramid, lowerPyramid, ring];
    for (const mesh of this.pickTargets) mesh.userData.pylon = this;

    // Place at ground slot and lift to the resting mid-band height.
    group.position.x = this._x;
    group.position.z = this._z;
    this.setHeight(this._initialY);
  }

  /**
   * Current height (Y, in metres) of the pylon's waist within the band.
   * @returns {number}
   */
  getHeight() {
    return this.object3d.position.y;
  }

  /**
   * Set the pylon's height, clamped to the band y ∈ [BAND.min, BAND.max].
   * @param {number} y - desired height in metres.
   * @returns {number} the clamped height actually applied.
   */
  setHeight(y) {
    const clamped = Math.min(BAND.max, Math.max(BAND.min, y));
    this.object3d.position.y = clamped;
    return clamped;
  }

  /**
   * Current ground slot (X/Z, in metres). Height is tracked separately by
   * `getHeight`; this is the position on the XZ plane the pylon was dragged to.
   * @returns {{ x: number, z: number }}
   */
  getGroundPosition() {
    return { x: this._x, z: this._z };
  }

  /**
   * Move the pylon on the XZ ground plane, clamped to the play area
   * x,z ∈ [-PLAY_HALF, PLAY_HALF]. Height (Y) is unchanged.
   * @param {number} x - desired X in metres.
   * @param {number} z - desired Z in metres.
   * @returns {{ x: number, z: number }} the clamped position actually applied.
   */
  setGroundPosition(x, z) {
    this._x = Math.min(PLAY_HALF, Math.max(-PLAY_HALF, x));
    this._z = Math.min(PLAY_HALF, Math.max(-PLAY_HALF, z));
    this.object3d.position.x = this._x;
    this.object3d.position.z = this._z;
    return { x: this._x, z: this._z };
  }

  /**
   * Normalized height in [0, 1]: `(y - BAND.min) / (BAND.max - BAND.min)`.
   *
   * This is the parameter-agnostic value downstream MIDI (M4) consumes — it
   * maps linearly across the full CC range. Because height is always clamped to
   * the band by `setHeight`, this is already within [0, 1].
   * @returns {number}
   */
  getNormalized() {
    return (this.getHeight() - BAND.min) / (BAND.max - BAND.min);
  }

  /**
   * Toggle grabbed-state visual feedback: while grabbed, the connector ring
   * brightens; on release it returns to its resting look.
   * @param {boolean} grabbed
   */
  setGrabbed(grabbed) {
    this._ring.material.emissiveIntensity = grabbed
      ? 1.4
      : this._restRingEmissive;
  }

  /** Release GPU resources owned by this pylon. */
  dispose() {
    for (const mesh of this._meshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}

/**
 * Build a pylon per `config.PYLONS` entry and add each to the scene.
 *
 * @param {THREE.Scene} scene - the scene to add the pylons to.
 * @param {Array<object>} entries - `config.PYLONS`.
 * @returns {Pylon[]} the created pylons, in config order.
 */
export function createPylons(scene, entries) {
  return entries.map((entry) => {
    const pylon = new Pylon(entry);
    scene.add(pylon.object3d);
    return pylon;
  });
}
