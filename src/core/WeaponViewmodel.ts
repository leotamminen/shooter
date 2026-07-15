import * as THREE from "three";
import { ImpulseOffset } from "./utils/ImpulseOffset";

const VIEWMODEL_FOV = 50;
const VIEWMODEL_NEAR = 0.01;
const VIEWMODEL_FAR = 10;
const WEAPON_COLOR = 0x333333;
const WEAPON_WIDTH = 0.1;
const WEAPON_HEIGHT = 0.1;
const WEAPON_LENGTH = 0.4;

// Placeholder walk-bob tuning (checkpoint 14) -- a continuous function of
// speed, not a lookup table keyed by named movement states, so any future
// higher speed (sprint, not built yet) produces proportionally more bob
// automatically. BOB_SPEED_SMOOTHING is a per-second lerp rate: it smooths
// the raw speed input (which can jump instantly between 0 and a movement
// speed as keys are pressed/released) before amplitude/frequency read from
// it, which is what makes bob both ramp in smoothly on starting to move and
// decay smoothly back to neutral on stopping -- one mechanism for both.
const BOB_FREQUENCY_SCALE = 3; // radians of phase per second, per unit of speed
const BOB_AMPLITUDE_X_SCALE = 0.008; // horizontal sway per unit of speed
const BOB_AMPLITUDE_Y_SCALE = 0.006; // vertical bob per unit of speed
const BOB_SPEED_SMOOTHING = 8; // per-second lerp rate

// Clamps the *combined* magnitude of all currently-summed impulse offsets
// (never a per-impulse cap, never a cap on how many impulses can be active)
// so a burst or held rapid-fire trigger can still visibly stack the effect
// up to this ceiling and hold there, rather than either being silently
// rejected past some count or pushing the mesh off-screen entirely. 0.15
// was chosen by visual verification in-browser (checkpoint 14) against the
// current VIEWMODEL_FOV/near-plane/base offset -- not derived from a
// formula and assumed correct -- confirmed the mesh stays fully on-screen
// even when the test impulse key was held down continuously. Revisit this
// value if VIEWMODEL_FOV, the base offset, or the viewmodel camera's
// near-plane ever change.
const MAX_IMPULSE_MAGNITUDE = 0.15;

// Near-cap jitter (checkpoint 14): additive to, never a replacement for,
// the MAX_IMPULSE_MAGNITUDE clamp above. A hard clamp alone reads as the
// weapon freezing/getting stuck rather than straining under sustained
// impulses -- this layers a small, fast wobble on top, scaled by how close
// the (pre-clamp) impulse sum is to the cap, so motion stays visible while
// the clamp is engaged. JITTER_MAX_AMPLITUDE is deliberately small relative
// to MAX_IMPULSE_MAGNITUDE and tuned by eye in-browser (checkpoint 14) for
// a "straining/kicking under sustained fire" read, not visible jank.
const JITTER_FREQUENCY = 40; // radians of phase per second (fast, independent of bob's own phase/speed)
const JITTER_MAX_AMPLITUDE = 0.01; // full jitter amplitude once at/over the cap

// The only piece of this file meant to be tuned later: every positioning
// computation below reads from this object, so a future per-weapon offset
// or a handedness toggle is a one-line change here, not a code change.
// mirrored: true flips the x offset's sign only -- nothing else about the
// mesh or camera changes.
export const VIEWMODEL_CONFIG = {
  offset: { x: 0.3, y: -0.3, z: -0.5 },
  mirrored: false,
};

// Renders the player's held weapon as a placeholder shape, always drawn in
// front of world geometry regardless of proximity to a wall. A naive
// single-pass render (the weapon mesh parented directly into the main
// scene/camera) would clip through nearby walls, since it would share the
// main scene's depth buffer -- a wall 0.3 units away is closer to the
// camera than the far side of a viewmodel gun. Instead this owns a wholly
// separate THREE.Scene/THREE.PerspectiveCamera pair, rendered as a second
// pass after the main scene with a freshly cleared depth buffer (see
// render()) and a very close near-plane, so the depth test the second pass
// runs is only ever against this file's own (trivial) geometry.
//
// Rendering-only: this class has no notion of "alive"/"dead" or any other
// gameplay state. main.ts (the composition root) decides when to call
// update()/render() based on gameState.playerState, the same way it already
// gates gameMode.update() -- keeping this file free of a GameState import.
//
// Checkpoint 14 adds two composed motion sources on top of the static base
// offset, both owned entirely by this class: a continuous, speed-driven bob
// (see update()), and a generic addImpulse() mechanism for future
// fire-kick/reload-dip/damage-flinch/weapon-switch-dip/melee-swing effects
// (none implemented yet -- see CLAUDE.md future mechanics). Every frame's
// final local position is base + bob + summed active impulses; callers only
// ever see update()/render()/addImpulse(), never the three pieces
// separately.
export class WeaponViewmodel {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly weaponMesh: THREE.Mesh;

  private smoothedSpeed = 0;
  private bobPhase = 0;
  // Checkpoint 21: the summing/clamping/jitter logic itself now lives in
  // the shared ImpulseOffset class (extracted once HandsViewmodel became a
  // second consumer) -- constructed here with the exact constants above,
  // unchanged behavior from before the extraction.
  private readonly impulseOffset = new ImpulseOffset(
    MAX_IMPULSE_MAGNITUDE,
    JITTER_FREQUENCY,
    JITTER_MAX_AMPLITUDE,
  );
  // Checkpoint 22: an external offset an outside controller (MeleeSequencer)
  // can hold nonzero to translate the weapon out of view during a melee
  // performance, independent of and additive to the bob/impulse math below
  // -- (0,0,0) whenever nothing is sequencing. See setSequencerOffset().
  private readonly sequencerOffset = new THREE.Vector3();

  constructor() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      VIEWMODEL_FOV,
      window.innerWidth / window.innerHeight,
      VIEWMODEL_NEAR,
      VIEWMODEL_FAR,
    );
    // The camera itself must be added to this scene (not just constructed)
    // so that its children -- the weapon mesh below -- are reachable when
    // the renderer traverses this scene's graph in render().
    this.scene.add(this.camera);

    // A dedicated scene has no lights of its own by default; without this
    // the MeshStandardMaterial below would render solid black.
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    this.weaponMesh = new THREE.Mesh(
      new THREE.BoxGeometry(WEAPON_WIDTH, WEAPON_HEIGHT, WEAPON_LENGTH),
      new THREE.MeshStandardMaterial({ color: WEAPON_COLOR }),
    );
    // Child of the camera, not of the scene directly: this fixes the weapon
    // rigidly in this camera's view. Because a child mesh's view-space
    // transform is always just its local offset relative to the camera that
    // renders it (the camera's own world rotation/position always cancels
    // out exactly in that math), the weapon stays put on screen regardless
    // of this camera's rotation -- there is no per-frame rotation sync, and
    // none is needed. Its local position is recomputed every frame by
    // update() below (base + bob + impulses), not set once here.
    this.camera.add(this.weaponMesh);

    window.addEventListener("resize", this.handleResize);
  }

  private readonly handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };

  // Called every frame gameplay is active, before render(). Recomputes the
  // weapon mesh's local position from three summed sources: the static
  // VIEWMODEL_CONFIG base offset, a continuous speed-driven bob, and the
  // sum of any active addImpulse() calls.
  update(speed: number, deltaTime: number): void {
    // Smoothing raw speed (which can jump instantly between 0 and a
    // movement speed as keys are pressed/released) is what makes bob
    // amplitude both ramp up smoothly during acceleration and decay
    // smoothly back to zero on stopping, from a single mechanism -- no
    // separate discrete "stopping" case.
    const smoothingRate = Math.min(1, BOB_SPEED_SMOOTHING * deltaTime);
    this.smoothedSpeed += (speed - this.smoothedSpeed) * smoothingRate;

    this.bobPhase += this.smoothedSpeed * BOB_FREQUENCY_SCALE * deltaTime;
    const bobX = Math.sin(this.bobPhase) * this.smoothedSpeed * BOB_AMPLITUDE_X_SCALE;
    // Double the phase for the vertical component: one full side-to-side
    // sway (bobX's period) spans two footsteps, and each footstep produces
    // one vertical bounce, so vertical bob completes two cycles per one
    // horizontal cycle.
    const bobY = Math.sin(this.bobPhase * 2) * this.smoothedSpeed * BOB_AMPLITUDE_Y_SCALE;

    const impulse = this.impulseOffset.update(deltaTime);

    const baseX = VIEWMODEL_CONFIG.mirrored
      ? -VIEWMODEL_CONFIG.offset.x
      : VIEWMODEL_CONFIG.offset.x;
    this.weaponMesh.position.set(
      baseX + bobX + impulse.x + this.sequencerOffset.x,
      VIEWMODEL_CONFIG.offset.y + bobY + impulse.y + this.sequencerOffset.y,
      VIEWMODEL_CONFIG.offset.z + impulse.z + this.sequencerOffset.z,
    );
  }

  // Checkpoint 22: MeleeSequencer holds this nonzero (translating the
  // weapon out of view) while retracting/returning around a melee
  // performance; zeroed by main.ts whenever the sequencer is idle so a
  // stale offset can never leak into normal rendering.
  setSequencerOffset(offset: THREE.Vector3): void {
    this.sequencerOffset.copy(offset);
  }

  // Adds a temporary offset that decays linearly from its full value back
  // to zero over decayTime seconds, then is discarded. Multiple concurrent
  // impulses sum rather than overwrite each other -- the fire-kick and
  // weapon-swap-dip hook (checkpoint 21; melee-swing already used this at
  // checkpoint 16). Consumed every frame by update() above, via the shared
  // ImpulseOffset instance -- this method's own signature is unchanged
  // from before the checkpoint-21 extraction, so no caller needed updating.
  addImpulse(offset: THREE.Vector3Like, decayTime: number): void {
    this.impulseOffset.addImpulse(offset, decayTime);
  }

  // The second render pass -- must run after the main scene's render() this
  // frame. autoClear is switched off only for this call so clearDepth()'s
  // fresh depth buffer isn't immediately re-cleared by render()'s own
  // implicit clear (which would also wipe the color buffer holding the
  // just-drawn main scene), then restored immediately after, so next
  // frame's main-scene render() still clears normally.
  render(renderer: THREE.WebGLRenderer): void {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }
}
