import * as THREE from "three";
import { ImpulseOffset } from "./utils/ImpulseOffset";
import { createHandMesh } from "./utils/HandMesh";

const VIEWMODEL_FOV = 50;
const VIEWMODEL_NEAR = 0.01;
const VIEWMODEL_FAR = 10;

// Positioning (checkpoint 21) -- same VIEWMODEL_CONFIG-style pattern
// WeaponViewmodel.ts already established, one offset object per hand
// instead of a single mirrored one, since hands (unlike the single weapon
// mesh) are two independent objects that both need positioning. First-guess
// values, tune by eye in-browser.
const LEFT_HAND_OFFSET = { x: -0.18, y: -0.15, z: -0.3 };
const RIGHT_HAND_OFFSET = { x: 0.18, y: -0.15, z: -0.3 };

// Idle sway (checkpoint 21) -- deliberately NOT WeaponViewmodel's bob
// mechanism. That bob is speed-driven (ramps with PlayerController's
// measured speed, exactly zero when standing still); this sway is a
// continuous, always-on breathing/floating motion, independent of movement
// entirely. The two are similar-looking sine functions but different in
// kind (input, and the "zero at rest" behavior), so sharing one function
// would be an awkward, forced abstraction rather than real reuse -- see
// CLAUDE.md's checkpoint-21 decisions log.
const SWAY_FREQUENCY = 1.1; // radians of phase per second
const SWAY_AMPLITUDE_X = 0.006;
const SWAY_AMPLITUDE_Y = 0.004;
const LEFT_HAND_SWAY_PHASE = 0;
const RIGHT_HAND_SWAY_PHASE = Math.PI / 3;

// Impulse tuning (checkpoint 21) -- ImpulseOffset's constants are
// constructor parameters specifically so the hands can have their own,
// independently-tuned values here rather than reusing WeaponViewmodel's
// (see core/utils/ImpulseOffset.ts). Smaller than the weapon's own
// MAX_IMPULSE_MAGNITUDE (0.15), since the hands sit closer to center-screen
// and a same-size kick would read as excessive.
const HAND_MAX_IMPULSE_MAGNITUDE = 0.08;
const HAND_JITTER_FREQUENCY = 40;
const HAND_JITTER_MAX_AMPLITUDE = 0.006;

// Renders the player's bare hands, mutually exclusive with WeaponViewmodel
// -- main.ts's render loop shows exactly one of the two (or, as of
// checkpoint 22, MeleeViewmodel during a melee performance), branching on
// WeaponSystem.hasActiveWeapon() and MeleeSequencer's phase. Copies
// WeaponViewmodel's proven dual-scene/camera, second-pass depth-cleared
// render technique rather than inventing a new one -- see that file's own
// class-level comment for why a single-pass render sharing the main depth
// buffer wouldn't work.
export class HandsViewmodel {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly leftHand: THREE.Group;
  private readonly rightHand: THREE.Group;

  private swayTime = 0;
  private readonly leftImpulse = new ImpulseOffset(
    HAND_MAX_IMPULSE_MAGNITUDE,
    HAND_JITTER_FREQUENCY,
    HAND_JITTER_MAX_AMPLITUDE,
  );
  private readonly rightImpulse = new ImpulseOffset(
    HAND_MAX_IMPULSE_MAGNITUDE,
    HAND_JITTER_FREQUENCY,
    HAND_JITTER_MAX_AMPLITUDE,
  );
  // Checkpoint 22: an external offset an outside controller (MeleeSequencer)
  // can hold nonzero to translate both hands out of view during a melee
  // performance, independent of and additive to the sway/impulse math
  // above -- (0,0,0) whenever nothing is sequencing. See setSequencerOffset().
  private readonly sequencerOffset = new THREE.Vector3();

  constructor() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      VIEWMODEL_FOV,
      window.innerWidth / window.innerHeight,
      VIEWMODEL_NEAR,
      VIEWMODEL_FAR,
    );
    this.scene.add(this.camera);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    // Built once as the right hand, then cloned and mirrored for the left
    // -- not hand-built twice. Object3D.clone() copies geometry/material by
    // reference (not a deep clone), so both hands correctly share the one
    // skin material/its texture rather than duplicating it.
    this.rightHand = createHandMesh();
    this.leftHand = this.rightHand.clone();
    // Negative-determinant transform: three.js automatically flips the
    // rendered triangle winding for a mirrored object, so this doesn't need
    // material.side or any other manual correction -- confirmed visually
    // in-browser, not just assumed (see CLAUDE.md's checkpoint-21 decisions
    // log).
    this.leftHand.scale.x = -1;

    // Children of the camera, not the scene directly -- same "child
    // transform cancels the camera's own world rotation" trick
    // WeaponViewmodel's weapon mesh already relies on.
    this.camera.add(this.rightHand);
    this.camera.add(this.leftHand);

    window.addEventListener("resize", this.handleResize);
  }

  private readonly handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };

  private computeSway(phaseOffset: number): { x: number; y: number } {
    const phase = this.swayTime * SWAY_FREQUENCY + phaseOffset;
    return {
      x: Math.sin(phase) * SWAY_AMPLITUDE_X,
      y: Math.sin(phase * 0.5) * SWAY_AMPLITUDE_Y,
    };
  }

  // Called every frame gameplay is active and hasActiveWeapon() is false.
  // Recomputes both hands' local positions from their own static offset,
  // the continuous idle sway (phase-offset per hand so they don't move in
  // lockstep), their own independent summed impulses, and the shared
  // sequencer offset (checkpoint 22).
  update(deltaTime: number): void {
    this.swayTime += deltaTime;

    const leftSway = this.computeSway(LEFT_HAND_SWAY_PHASE);
    const rightSway = this.computeSway(RIGHT_HAND_SWAY_PHASE);
    const leftImpulse = this.leftImpulse.update(deltaTime);
    const rightImpulse = this.rightImpulse.update(deltaTime);

    this.leftHand.position.set(
      LEFT_HAND_OFFSET.x + leftSway.x + leftImpulse.x + this.sequencerOffset.x,
      LEFT_HAND_OFFSET.y + leftSway.y + leftImpulse.y + this.sequencerOffset.y,
      LEFT_HAND_OFFSET.z + leftImpulse.z + this.sequencerOffset.z,
    );
    this.rightHand.position.set(
      RIGHT_HAND_OFFSET.x + rightSway.x + rightImpulse.x + this.sequencerOffset.x,
      RIGHT_HAND_OFFSET.y + rightSway.y + rightImpulse.y + this.sequencerOffset.y,
      RIGHT_HAND_OFFSET.z + rightImpulse.z + this.sequencerOffset.z,
    );
  }

  // Each hand owns its own ImpulseOffset instance (constructed above) so an
  // impulse on one hand can never affect the other -- e.g. the interact
  // grab gesture (main.ts, right hand only) never nudges the left hand.
  addImpulse(hand: "left" | "right", offset: THREE.Vector3Like, decayTime: number): void {
    const target = hand === "left" ? this.leftImpulse : this.rightImpulse;
    target.addImpulse(offset, decayTime);
  }

  // Checkpoint 22: MeleeSequencer holds this nonzero (translating both
  // hands out of view together) while retracting/returning around a melee
  // performance; zeroed by main.ts whenever the sequencer is idle so a
  // stale offset can never leak into normal rendering.
  setSequencerOffset(offset: THREE.Vector3): void {
    this.sequencerOffset.copy(offset);
  }

  // The second render pass -- identical technique to WeaponViewmodel's own
  // render(), see that method's comment for why autoClear is toggled.
  render(renderer: THREE.WebGLRenderer): void {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }
}
