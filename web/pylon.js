// pylon.js — the pylon visual: a bicone (spinning-top) body, a torus
// "connector ring" at the waist, and a halo.
//
// A pylon is a parameter-agnostic control object: its only state that matters
// later is its *height* (Y position within the band). Interaction (M3) and MIDI
// (M4) live in later milestones; this module just builds the mesh, places it,
// and exposes a height get/set API.

import * as THREE from "three";

import { BAND } from "./config.js";

// Bright lime accent, reserved for the connector ring + halo (per palette).
const ACCENT_COLOR = 0xd2ff72;

// Mid-band resting height: pylons start centred in y ∈ [BAND.min, BAND.max].
const MID_BAND_Y = (BAND.min + BAND.max) / 2;

// Body proportions (world units = metres). The bicone is two cones joined at a
// shared base radius — the "waist" — with the connector ring riding that waist.
const WAIST_RADIUS = 0.45; // shared radius where the two cones meet
const CONE_HEIGHT = 0.9; // height of each cone (total body ≈ 2 × this)
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
   * @param {[number, number, number]} entry.position - [x, y, z] ground slot;
   *   only x and z are used for placement (y is driven by the band).
   * @param {string} entry.color - green surface color from the palette.
   */
  constructor(entry) {
    this.id = entry.id;

    const [x, , z] = entry.position;
    this._x = x;
    this._z = z;

    const surface = new THREE.MeshStandardMaterial({
      color: new THREE.Color(entry.color),
      roughness: 0.55,
      metalness: 0.1,
    });
    this._surfaceMaterial = surface;

    const group = new THREE.Group();
    group.name = `pylon:${entry.id}`;

    // Bicone body: upper cone points up, lower cone points down, joined at the
    // waist (y = 0 in the group's local frame). ConeGeometry's apex is +y and
    // its base (radius) is −y, so the upper cone sits as-is and the lower cone
    // is flipped 180° about x.
    const upperCone = new THREE.Mesh(
      new THREE.ConeGeometry(WAIST_RADIUS, CONE_HEIGHT, 32),
      surface,
    );
    upperCone.position.y = CONE_HEIGHT / 2;

    const lowerCone = new THREE.Mesh(
      new THREE.ConeGeometry(WAIST_RADIUS, CONE_HEIGHT, 32),
      surface,
    );
    lowerCone.rotation.x = Math.PI;
    lowerCone.position.y = -CONE_HEIGHT / 2;

    group.add(upperCone, lowerCone);

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

    // Halo: an emissive flat ring behind/around the waist, bright lime. Kept
    // double-sided and unlit (MeshBasicMaterial) so it glows regardless of the
    // scene lighting, evoking a sprite-like halo without a texture.
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(WAIST_RADIUS + 0.25, WAIST_RADIUS + 0.5, 48),
      new THREE.MeshBasicMaterial({
        color: ACCENT_COLOR,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    group.add(halo);

    this.object3d = group;
    // Track owned resources for disposal.
    this._meshes = [upperCone, lowerCone, ring, halo];

    // References used by interaction (M3): grabbed-state visual feedback.
    this._ring = ring;
    this._halo = halo;
    // Resting (un-grabbed) values, restored on release.
    this._restRingEmissive = ring.material.emissiveIntensity;
    this._restHaloOpacity = halo.material.opacity;

    // Raycast targets, each back-referencing this Pylon so a mesh hit can be
    // mapped to its owner (see interaction.js). The halo is excluded: it is a
    // transparent, depthWrite:false sprite-like ring and not a grab target.
    this.pickTargets = [upperCone, lowerCone, ring];
    for (const mesh of this.pickTargets) mesh.userData.pylon = this;

    // Place at ground slot and lift to the resting mid-band height.
    group.position.x = this._x;
    group.position.z = this._z;
    this.setHeight(MID_BAND_Y);
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
   * Toggle grabbed-state visual feedback: while grabbed, the connector ring and
   * halo brighten/intensify; on release they return to their resting look.
   * @param {boolean} grabbed
   */
  setGrabbed(grabbed) {
    this._ring.material.emissiveIntensity = grabbed
      ? 1.4
      : this._restRingEmissive;
    this._halo.material.opacity = grabbed ? 0.85 : this._restHaloOpacity;
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
