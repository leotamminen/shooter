import * as THREE from "three";

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

// The only piece of this file meant to be tuned later: every positioning
// computation below reads from this object, so a future per-weapon offset
// or a handedness toggle is a one-line change here, not a code change.
// mirrored: true flips the x offset's sign only -- nothing else about the
// mesh or camera changes.
export const VIEWMODEL_CONFIG = {
  offset: { x: 0.3, y: -0.3, z: -0.5 },
  mirrored: false,
};

interface Impulse {
  offset: { x: number; y: number; z: number };
  elapsed: number;
  decayTime: number;
}

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
  private readonly impulses: Impulse[] = [];

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

    let impulseX = 0;
    let impulseY = 0;
    let impulseZ = 0;
    for (let i = this.impulses.length - 1; i >= 0; i--) {
      const impulse = this.impulses[i];
      impulse.elapsed += deltaTime;
      if (impulse.elapsed >= impulse.decayTime) {
        this.impulses.splice(i, 1);
        continue;
      }
      const remaining = 1 - impulse.elapsed / impulse.decayTime;
      impulseX += impulse.offset.x * remaining;
      impulseY += impulse.offset.y * remaining;
      impulseZ += impulse.offset.z * remaining;
    }

    // Clamp the combined magnitude, preserving direction -- this is what
    // lets many overlapping/rapid impulses visibly stack up to the ceiling
    // and hold there (rather than being rejected outright), while
    // guaranteeing the mesh can never be pushed past MAX_IMPULSE_MAGNITUDE
    // from its bob-adjusted base position.
    const impulseMagnitude = Math.hypot(impulseX, impulseY, impulseZ);
    if (impulseMagnitude > MAX_IMPULSE_MAGNITUDE) {
      const scale = MAX_IMPULSE_MAGNITUDE / impulseMagnitude;
      impulseX *= scale;
      impulseY *= scale;
      impulseZ *= scale;
    }

    const baseX = VIEWMODEL_CONFIG.mirrored
      ? -VIEWMODEL_CONFIG.offset.x
      : VIEWMODEL_CONFIG.offset.x;
    this.weaponMesh.position.set(
      baseX + bobX + impulseX,
      VIEWMODEL_CONFIG.offset.y + bobY + impulseY,
      VIEWMODEL_CONFIG.offset.z + impulseZ,
    );
  }

  // Adds a temporary offset that decays linearly from its full value back
  // to zero over decayTime seconds, then is discarded. Multiple concurrent
  // impulses sum rather than overwrite each other -- the intended hook for
  // future fire-kick, reload-dip, damage-flinch, weapon-switch-dip,
  // melee-swing, etc. (none implemented yet; see CLAUDE.md future
  // mechanics). Consumed every frame by update() above.
  addImpulse(offset: { x: number; y: number; z: number }, decayTime: number): void {
    this.impulses.push({ offset, elapsed: 0, decayTime });
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
