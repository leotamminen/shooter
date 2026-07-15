import * as THREE from "three";
import type { Weapon } from "../types";
import { ImpulseOffset } from "./utils/ImpulseOffset";
import { createAK47Mesh } from "./utils/WeaponMesh";

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

// Checkpoint 23 fix: the AK-47's own local offset relative to displayGroup,
// separate from the generic box's VIEWMODEL_CONFIG offset above -- sharing
// that exact offset ("at parity by construction," checkpoint 23) was fine
// for a same-sized placeholder box, but left far too little of the AK-47's
// longer, more detailed silhouette actually on screen. Shifts it up (less
// negative Y) and left (less positive X) from the generic box's position;
// z is unchanged, keeping the same scale/distance the mesh's own geometry
// was already sized against. Tuned by eye in-browser, no exact target
// value -- only ever added to ak47Mesh's own local position, never to
// VIEWMODEL_CONFIG itself, so the generic box (M1911/MAC-10) is completely
// unaffected.
const AK47_OFFSET = { x: -0.15, y: 0.18, z: 0 };

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
//
// Checkpoint 23: update() gains an activeWeapon parameter so this class can
// pick which mesh to display -- the generic box (every weapon before this
// checkpoint, and M1911/MAC-10 still today) or utils/WeaponMesh.ts's
// createAK47Mesh() (only for weapon id "ak47"). This is the one real
// behavior change of that checkpoint; the base+bob+impulse+sequencer
// position math below is otherwise unaffected and now applies to a wrapper
// group (displayGroup) instead of a single mesh directly, so it keeps
// working identically regardless of which child is currently visible.
export class WeaponViewmodel {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  // Checkpoint 23: the object actually repositioned every frame (base +
  // bob + impulse + sequencer offset) is now this wrapper group, not a
  // single mesh directly -- genericMesh/ak47Mesh are both its children,
  // both built once at construction and left alone thereafter, toggled via
  // .visible rather than added/removed/rebuilt on every weapon switch. Both
  // sit at local (0,0,0) within displayGroup, so swapping which one is
  // shown never changes the base offset math below.
  private readonly displayGroup: THREE.Group;
  private readonly genericMesh: THREE.Mesh;
  private readonly ak47Mesh: THREE.Group;
  // Checkpoint 23: the weapon id displayGroup's visible child was last set
  // for -- update() only touches the two meshes' .visible flags when this
  // actually changes, not every frame, per this checkpoint's own
  // "swap, don't rebuild every frame" requirement. null covers both "no
  // active weapon" (Campaign unarmed -- HandsViewmodel renders instead, but
  // WeaponViewmodel.update() is simply never called then) and any future
  // weapon id this file doesn't special-case.
  private lastWeaponId: string | null = null;

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

    // Child of the camera, not of the scene directly: this fixes the weapon
    // rigidly in this camera's view. Because a child mesh's view-space
    // transform is always just its local offset relative to the camera that
    // renders it (the camera's own world rotation/position always cancels
    // out exactly in that math), the weapon stays put on screen regardless
    // of this camera's rotation -- there is no per-frame rotation sync, and
    // none is needed. Its local position is recomputed every frame by
    // update() below (base + bob + impulses), not set once here.
    this.displayGroup = new THREE.Group();
    this.camera.add(this.displayGroup);

    this.genericMesh = new THREE.Mesh(
      new THREE.BoxGeometry(WEAPON_WIDTH, WEAPON_HEIGHT, WEAPON_LENGTH),
      new THREE.MeshStandardMaterial({ color: WEAPON_COLOR }),
    );
    this.displayGroup.add(this.genericMesh);

    // Checkpoint 23: built once here, alongside the generic mesh, rather
    // than lazily on first switch to AK-47 -- it's cheap procedural boxes,
    // same as every other mesh in this project, so there's no real cost to
    // building it up front and no benefit to deferring it. Starts hidden;
    // update() below decides which of the two is actually shown.
    this.ak47Mesh = createAK47Mesh();
    this.ak47Mesh.visible = false;
    this.ak47Mesh.position.set(AK47_OFFSET.x, AK47_OFFSET.y, AK47_OFFSET.z);
    this.displayGroup.add(this.ak47Mesh);

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
  update(speed: number, deltaTime: number, activeWeapon: Weapon | null): void {
    // Checkpoint 23: swap which mesh is displayed only when the equipped
    // weapon's id actually changed since last frame -- everything else
    // (mouse-move-driven camera rotation, bob, impulses) changes every
    // frame regardless, but there's no reason to touch two .visible flags
    // on every one of those. Every weapon id other than "ak47" (including
    // null, e.g. a theoretical future call before a weapon exists) keeps
    // showing the generic box, unchanged from every checkpoint before this
    // one -- M1911 and MAC-10 are not special-cased individually, "not
    // ak47" is the only branch.
    const weaponId = activeWeapon?.id ?? null;
    if (weaponId !== this.lastWeaponId) {
      this.lastWeaponId = weaponId;
      const showAK47 = weaponId === "ak47";
      this.ak47Mesh.visible = showAK47;
      this.genericMesh.visible = !showAK47;
    }

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
    this.displayGroup.position.set(
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
