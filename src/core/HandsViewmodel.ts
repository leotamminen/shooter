import * as THREE from "three";
import { ImpulseOffset } from "./utils/ImpulseOffset";

const VIEWMODEL_FOV = 50;
const VIEWMODEL_NEAR = 0.01;
const VIEWMODEL_FAR = 10;

// Simple procedural-box hands (checkpoint 21) -- the same "no external
// models/assets, everything's a box" aesthetic every other placeholder mesh
// in this project already uses (ComputerMesh.ts, the coiled power cable,
// the desk/chair decorations). Not anatomically precise: a palm slab, four
// fanned fingers with a slight relaxed curl, and an opposable-looking thumb
// is enough to read as "a hand" at viewmodel scale and distance.
const PALM_SIZE: [number, number, number] = [0.09, 0.025, 0.11];
const FINGER_SIZE: [number, number, number] = [0.018, 0.018, 0.055];
const THUMB_SIZE: [number, number, number] = [0.02, 0.02, 0.05];

// Local +Z is "toward the fingertips" (away from the wrist), matching the
// same local-space convention ComputerMesh.ts uses for "toward the front."
const PALM_HALF_DEPTH = PALM_SIZE[2] / 2;
const FINGER_X_POSITIONS = [-0.03, -0.01, 0.01, 0.03];
// Slight per-finger variation, not identical rotations, so the hand doesn't
// read as four mechanically-identical rods -- first-guess values within the
// -20/-35 degree range, tuned by eye in-browser.
const FINGER_CURL_DEGREES = [-22, -30, -32, -25];
const FINGER_Z = PALM_HALF_DEPTH + FINGER_SIZE[2] / 2 - 0.01;

const THUMB_POSITION: [number, number, number] = [-0.055, -0.005, 0.01];
const THUMB_ROTATION_Y_DEGREES = 45;
const THUMB_ROTATION_Z_DEGREES = 45;

// Skin texture (checkpoint 21): same technique as ComputerMesh.ts's
// createScreenTexture() -- drawn once onto an offscreen canvas, not
// per-frame, and reused as the one shared material map across every hand
// part on both hands (cloning the right hand's group for the left, see
// createHandGroup()/HandsViewmodel's constructor below, reuses the same
// material/geometry references rather than duplicating them).
const SKIN_TEXTURE_SIZE = 64;
const SKIN_BASE_COLOR = "#d9a978";
const SKIN_BLOTCH_COLORS = ["#c69465", "#e8bd94"];
const SKIN_BLOTCH_COUNT = 10;

function createSkinTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = SKIN_TEXTURE_SIZE;
  canvas.height = SKIN_TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("createSkinTexture: 2D canvas context unavailable");
  }

  ctx.fillStyle = SKIN_BASE_COLOR;
  ctx.fillRect(0, 0, SKIN_TEXTURE_SIZE, SKIN_TEXTURE_SIZE);

  ctx.globalAlpha = 0.18;
  for (let i = 0; i < SKIN_BLOTCH_COUNT; i++) {
    ctx.fillStyle = SKIN_BLOTCH_COLORS[i % SKIN_BLOTCH_COLORS.length];
    const x = Math.random() * SKIN_TEXTURE_SIZE;
    const y = Math.random() * SKIN_TEXTURE_SIZE;
    const radius = 3 + Math.random() * 7;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Builds one hand (palm + four fingers + thumb) as a THREE.Group, all
// sharing the one material passed in. Always built as the "right" hand
// (thumb toward -X, i.e. toward the body's center when held at the right
// hip) -- the left hand is never hand-built separately, see
// HandsViewmodel's constructor, which clones this group and flips
// scale.x to mirror it instead.
function createHandGroup(material: THREE.MeshStandardMaterial): THREE.Group {
  const group = new THREE.Group();

  const palm = new THREE.Mesh(new THREE.BoxGeometry(...PALM_SIZE), material);
  group.add(palm);

  FINGER_X_POSITIONS.forEach((x, index) => {
    const finger = new THREE.Mesh(new THREE.BoxGeometry(...FINGER_SIZE), material);
    finger.position.set(x, 0, FINGER_Z);
    finger.rotation.x = THREE.MathUtils.degToRad(FINGER_CURL_DEGREES[index]);
    group.add(finger);
  });

  const thumb = new THREE.Mesh(new THREE.BoxGeometry(...THUMB_SIZE), material);
  thumb.position.set(...THUMB_POSITION);
  thumb.rotation.set(
    0,
    THREE.MathUtils.degToRad(THUMB_ROTATION_Y_DEGREES),
    THREE.MathUtils.degToRad(THUMB_ROTATION_Z_DEGREES),
  );
  group.add(thumb);

  return group;
}

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
// -- main.ts's render loop shows exactly one of the two, branching on
// WeaponSystem.hasActiveWeapon() (see CLAUDE.md's checkpoint-21 decisions
// log). Copies WeaponViewmodel's proven dual-scene/camera, second-pass
// depth-cleared render technique rather than inventing a new one -- see
// that file's own class-level comment for why a single-pass render sharing
// the main depth buffer wouldn't work.
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

    const skinMaterial = new THREE.MeshStandardMaterial({ map: createSkinTexture() });

    // Built once as the right hand, then cloned and mirrored for the left
    // -- not hand-built twice. Object3D.clone() copies geometry/material by
    // reference (not a deep clone), so both hands correctly share the one
    // skinMaterial/its texture rather than duplicating it.
    this.rightHand = createHandGroup(skinMaterial);
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
  // lockstep), and their own independent summed impulses.
  update(deltaTime: number): void {
    this.swayTime += deltaTime;

    const leftSway = this.computeSway(LEFT_HAND_SWAY_PHASE);
    const rightSway = this.computeSway(RIGHT_HAND_SWAY_PHASE);
    const leftImpulse = this.leftImpulse.update(deltaTime);
    const rightImpulse = this.rightImpulse.update(deltaTime);

    this.leftHand.position.set(
      LEFT_HAND_OFFSET.x + leftSway.x + leftImpulse.x,
      LEFT_HAND_OFFSET.y + leftSway.y + leftImpulse.y,
      LEFT_HAND_OFFSET.z + leftImpulse.z,
    );
    this.rightHand.position.set(
      RIGHT_HAND_OFFSET.x + rightSway.x + rightImpulse.x,
      RIGHT_HAND_OFFSET.y + rightSway.y + rightImpulse.y,
      RIGHT_HAND_OFFSET.z + rightImpulse.z,
    );
  }

  // Each hand owns its own ImpulseOffset instance (constructed above) so an
  // impulse on one hand can never affect the other -- e.g. the interact
  // grab gesture (main.ts, right hand only) never nudges the left hand.
  addImpulse(hand: "left" | "right", offset: THREE.Vector3Like, decayTime: number): void {
    const target = hand === "left" ? this.leftImpulse : this.rightImpulse;
    target.addImpulse(offset, decayTime);
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
