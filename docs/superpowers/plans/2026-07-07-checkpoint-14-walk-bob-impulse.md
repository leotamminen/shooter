# Checkpoint 14: Walk Bob + Generic Viewmodel Offset Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the checkpoint-13 weapon viewmodel move naturally while walking, and give it a generic, reusable "add a temporary offset that decays away" mechanism for future fire-kick/reload-dip/damage-flinch/etc.

**Architecture:** `PlayerController` gains a `getSpeed(): number` getter, measuring actual resolved horizontal displacement each frame (not the `MOVE_SPEED` constant, and not a discrete moving/not-moving flag) — this is what lets a future different movement speed (sprint) or wall-sliding automatically produce proportionally different bob with zero new code. `WeaponViewmodel` gains a per-frame `update(speed, deltaTime)` that (a) smooths that raw speed internally so bob amplitude ramps in and decays out continuously instead of snapping, deriving a continuous sinusoidal bob offset from it, and (b) advances and sums any active `addImpulse()`-registered temporary offsets (each decaying linearly to zero over its own `decayTime`). The weapon mesh's local position is recomputed every frame as `VIEWMODEL_CONFIG` base offset + bob + summed impulses — `WeaponViewmodel` owns this composition entirely; callers never see the three pieces separately.

**Tech Stack:** Three.js, TypeScript (`strict`, `noUnusedParameters`, `noUnusedLocals`, `erasableSyntaxOnly`), Vite.

## Global Constraints

- Bob must be driven by a continuous function of measured speed, not a lookup table keyed by named movement states (e.g. `"idle" | "walking"`) — no such enum may be introduced. At zero speed, no bob. Amplitude and frequency both scale with speed.
- The visible bob amplitude must both ramp in smoothly as speed increases and decay smoothly back to neutral when the player stops — from one continuous mechanism (speed smoothing), not a separate discrete "stopping" case.
- `WeaponViewmodel.addImpulse(offset: { x: number; y: number; z: number }, decayTime: number): void` must exist, be public, support multiple concurrent calls whose contributions sum (not overwrite), and each must decay linearly from its full offset to zero over `decayTime` seconds, then be discarded.
- The combined magnitude of all summed active impulse offsets must be clamped to a fixed maximum, so the weapon mesh can never be pushed off-screen or to an implausible extreme by many overlapping/rapid-fire impulses. The clamp applies to the total summed vector, never per-impulse and never as a cap on how many impulses can be active at once — spamming or holding a rapid trigger must still visibly stack the offset up to the cap and hold there, not silently reject additional impulses past some count. The specific cap value must be chosen by visual verification in-browser (does the mesh stay on-screen at the cap, given the current `VIEWMODEL_FOV`/near-plane/base offset), not guessed and assumed correct.
- A hard clamp alone reads as the weapon visually "getting stuck" rather than straining under sustained impulses (confirmed by manual testing during this checkpoint) — a small continuous jitter/wobble must be layered on top once the impulse sum is at or near the cap, additive to (not a replacement for) the hard clamp. The jitter must be near-zero for a single normal-sized impulse (so it never visibly affects the case the rest of this checkpoint already verified: one clean impulse decaying on its own) and become clearly visible only as the summed magnitude approaches the cap — a continuous, eased ramp based on proximity to the cap, not a threshold that snaps on/off. Its amplitude is tuned by eye in-browser, aiming for "straining/kicking under sustained fire," not visible jank or excessive shake.
- No specific impulse trigger call sites this checkpoint (no fire-kick, reload-dip, damage-flinch, weapon-switch-dip, or melee-swing code) — `addImpulse()` must exist and be provably reusable, but nothing in the shipped code calls it. Verification exercises it via temporary, uncommitted debug code that is removed before the final commit.
- No sprint/crouch/jump/sneak mechanics — none exist yet in this codebase, and none are introduced by this checkpoint.
- The final per-frame weapon mesh local position is `VIEWMODEL_CONFIG` base offset + bob offset + summed impulse offsets, computed entirely inside `WeaponViewmodel`; no other file needs to know how the three combine.
- Checkpoint 13's existing behavior (bottom-right static positioning when standing still, the depth-clip second-pass render, hiding on death and reappearing on respawn) must be unaffected when speed is 0 and no impulses are active.
- `erasableSyntaxOnly: true` — no constructor parameter-property shorthand, no enums (also relevant here: do not introduce a movement-state enum for bob, both because the spec forbids it and because the tsconfig would reject an enum's emitted JS).

---

### Task 1: `PlayerController` gains `getSpeed()`

**Files:**
- Modify: `src/core/PlayerController.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `getSpeed(): number` — horizontal movement speed in units/second, measured from actual resolved displacement this frame (post-collision-resolution), zero whenever paused or not alive. Task 3 (`main.ts`) calls `playerController.getSpeed()` each frame and passes it into `WeaponViewmodel.update()`.

- [ ] **Step 1: Add the `speed` field**

In `src/core/PlayerController.ts`, add a new private field alongside the existing `collisionBoxes` field (around line 32):

```typescript
  private collisionBoxes: THREE.Box3[] = [];
  private speed = 0;
```

- [ ] **Step 2: Update `update()` to track measured speed**

Replace the current `update()` method body:

```typescript
  update(): void {
    const delta = this.clock.getDelta();
    if (this.gameState.paused || this.gameState.playerState !== "alive") return;

    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.crossVectors(this.forward, WORLD_UP).normalize();

    this.moveDirection.set(0, 0, 0);
    if (this.moveState.forward) this.moveDirection.add(this.forward);
    if (this.moveState.backward) this.moveDirection.sub(this.forward);
    if (this.moveState.right) this.moveDirection.add(this.right);
    if (this.moveState.left) this.moveDirection.sub(this.right);
    if (this.moveDirection.lengthSq() > 0) this.moveDirection.normalize();

    const step = MOVE_SPEED * delta;
    let x = this.camera.position.x + this.moveDirection.x * step;
    let z = this.camera.position.z + this.moveDirection.z * step;

    for (let pass = 0; pass < COLLISION_PASSES; pass++) {
      for (const box of this.collisionBoxes) {
        ({ x, z } = this.resolveAgainstBox(x, z, box));
      }
    }

    this.camera.position.x = x;
    this.camera.position.z = z;
  }
```

with:

```typescript
  update(): void {
    const delta = this.clock.getDelta();
    if (this.gameState.paused || this.gameState.playerState !== "alive") {
      this.speed = 0;
      return;
    }

    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.crossVectors(this.forward, WORLD_UP).normalize();

    this.moveDirection.set(0, 0, 0);
    if (this.moveState.forward) this.moveDirection.add(this.forward);
    if (this.moveState.backward) this.moveDirection.sub(this.forward);
    if (this.moveState.right) this.moveDirection.add(this.right);
    if (this.moveState.left) this.moveDirection.sub(this.right);
    if (this.moveDirection.lengthSq() > 0) this.moveDirection.normalize();

    const step = MOVE_SPEED * delta;
    const prevX = this.camera.position.x;
    const prevZ = this.camera.position.z;
    let x = prevX + this.moveDirection.x * step;
    let z = prevZ + this.moveDirection.z * step;

    for (let pass = 0; pass < COLLISION_PASSES; pass++) {
      for (const box of this.collisionBoxes) {
        ({ x, z } = this.resolveAgainstBox(x, z, box));
      }
    }

    this.camera.position.x = x;
    this.camera.position.z = z;

    // Actual measured displacement this frame, not the intended MOVE_SPEED
    // constant -- this automatically reads as slower while sliding along a
    // wall, and automatically reads as faster if a future different
    // movement speed (sprint) ever exists, with no code here needing to
    // know that speed exists.
    this.speed = delta > 0 ? Math.hypot(x - prevX, z - prevZ) / delta : 0;
  }

  // Horizontal movement speed in units/second, measured from actual
  // resolved displacement this frame (post-collision). Zero whenever the
  // player is paused or not alive. Consumed by WeaponViewmodel to drive a
  // continuous, speed-proportional view-bob (checkpoint 14) -- a continuous
  // function of this value, not a discrete moving/idle state, so any future
  // different movement speed (sprint) produces proportionally more bob
  // automatically.
  getSpeed(): number {
    return this.speed;
  }
```

- [ ] **Step 3: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/PlayerController.ts
git commit -m "Checkpoint 14 task 1: add PlayerController.getSpeed()"
```

---

### Task 2: `WeaponViewmodel` gains bob + `addImpulse()`

**Files:**
- Modify: `src/core/WeaponViewmodel.ts`

**Interfaces:**
- Consumes: `speed: number` (from Task 1's `PlayerController.getSpeed()`, passed in by the caller — this file does not import `PlayerController`), `deltaTime: number` (caller-supplied, same per-frame delta `main.ts` already computes for `gameMode.update()`).
- Produces: `update(speed: number, deltaTime: number): void` — recomputes the weapon mesh's local position from base offset + bob + impulses; must be called once per frame, before `render()`. `addImpulse(offset: { x: number; y: number; z: number }, decayTime: number): void` — queues a temporary offset that linearly decays to zero over `decayTime` seconds; safe to call multiple times with overlapping decay windows (their contributions sum). Task 3 (`main.ts`) calls both.

- [ ] **Step 1: Replace the full contents of `src/core/WeaponViewmodel.ts`**

```typescript
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
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/WeaponViewmodel.ts
git commit -m "Checkpoint 14 task 2: add speed-driven bob and addImpulse() to WeaponViewmodel"
```

---

### Task 3: Wire `update()` into `main.ts`'s render loop

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `WeaponViewmodel.update(speed: number, deltaTime: number): void` (Task 2), `PlayerController.getSpeed(): number` (Task 1).
- Produces: nothing new for later tasks — Task 4 (magnitude cap), Task 5 (manual verification), and Task 6 (docs) follow.

- [ ] **Step 1: Update the render loop**

In `src/main.ts`'s `animate()`, the current relevant block reads:

```typescript
    hud.update();
    sceneManager.render();
    if (gameState.playerState === "alive") {
      weaponViewmodel.render(sceneManager.renderer);
    }
```

Change it to:

```typescript
    hud.update();
    sceneManager.render();
    if (gameState.playerState === "alive") {
      weaponViewmodel.update(playerController.getSpeed(), delta);
      weaponViewmodel.render(sceneManager.renderer);
    }
```

(This is the only change to `main.ts` — every other line, including the earlier `const delta = modeClock.getDelta();` and its own `if (gameState.playerState === "alive") { gameMode.update(delta); }` block, is unchanged. `delta` is the same per-frame value already computed for `gameMode.update()`, reused here rather than introducing a second clock.)

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "Checkpoint 14 task 3: wire WeaponViewmodel.update() into main.ts's render loop"
```

---

### Task 4: Clamp total impulse magnitude in `WeaponViewmodel`

**Files:**
- Modify: `src/core/WeaponViewmodel.ts`

**Interfaces:**
- Consumes: nothing new — this is a pure addition to `update()`'s existing impulse-summation logic (Task 2).
- Produces: no new public method or signature change — `addImpulse()` and `update()` keep the exact same signatures Task 2 already established. Only the *internal* combined-impulse magnitude that `update()` applies to the mesh position is now clamped. Task 5 (manual verification) exercises this directly.

This closes a gap identified after Task 3 landed: nothing was capping how far the summed impulse offset could push the weapon mesh. A single held key or a burst of rapid `addImpulse()` calls (the exact shape a future rapid-fire weapon's recoil would produce) could otherwise sum to an arbitrarily large offset, pushing the mesh off-screen entirely. The fix must clamp the *combined* magnitude of all currently-summed impulses to a fixed maximum — not cap how many impulses can be active, and not cap any individual impulse's own offset (a single large fire-kick impulse should still be allowed its full value; it's the *sum in flight* that needs a ceiling). This preserves "spamming visibly stacks the effect up to a cap and holds there" while guaranteeing the mesh never leaves the visible frustum.

- [ ] **Step 1: Add the magnitude-cap constant**

In `src/core/WeaponViewmodel.ts`, add a new constant alongside the existing bob-tuning constants (after `BOB_SPEED_SMOOTHING`):

```typescript
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
```

- [ ] **Step 2: Apply the clamp in `update()`**

In `update()`, the impulse-summation loop currently ends and flows directly into computing `baseX` and calling `this.weaponMesh.position.set(...)`:

```typescript
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

    const baseX = VIEWMODEL_CONFIG.mirrored
```

Insert the clamp between the loop and `const baseX = ...`:

```typescript
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
```

(Everything from `const baseX = ...` through the end of `update()`, and every other method in the file, is unchanged.)

- [ ] **Step 3: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/WeaponViewmodel.ts
git commit -m "Checkpoint 14 task 4: clamp combined impulse magnitude in WeaponViewmodel"
```

Note: `MAX_IMPULSE_MAGNITUDE`'s value (`0.15` above) was confirmed correct by manual testing — the mesh stayed fully on-screen, both vertically and horizontally, even under a sustained spam/hold test. Keep this value; Task 5 below addresses a different problem found during that same testing (the clamp reading as "stuck," not the cap's numeric value being wrong).

---

### Task 5: Add near-cap jitter to `WeaponViewmodel`

**Files:**
- Modify: `src/core/WeaponViewmodel.ts`

**Interfaces:**
- Consumes: nothing new — reads the same post-loop `impulseX`/`impulseY`/`impulseZ` and `deltaTime` already local to `update()`.
- Produces: no new public method or signature change — `addImpulse()` and `update()` keep the exact same signatures Task 2 established. Only `update()`'s internal final-position computation gains one more additive term. Task 6 (manual verification) exercises this directly.

This addresses feedback from manual testing after Task 4 landed: a hard clamp that holds the summed impulse offset perfectly static at the ceiling reads as the weapon visually freezing/getting stuck, not as recoil straining under sustained fire. The fix is additive, not a replacement for the Task 4 clamp: once the (pre-clamp) impulse magnitude is close to or at `MAX_IMPULSE_MAGNITUDE`, layer a small, fast, continuous wobble on top so there's still visible motion while the clamp is actively engaged. The jitter must stay negligible for a single normal impulse decaying on its own (low magnitude relative to the cap) and ramp up smoothly — not snap on — only as the sum approaches the cap.

- [ ] **Step 1: Add jitter tuning constants and the phase field**

In `src/core/WeaponViewmodel.ts`, add two new constants alongside `MAX_IMPULSE_MAGNITUDE`:

```typescript
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
```

Add a new private field alongside `bobPhase`:

```typescript
  private bobPhase = 0;
  private jitterPhase = 0;
```

- [ ] **Step 2: Add the jitter computation to `update()`**

The current impulse block (after Task 4) reads:

```typescript
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
```

Change it to:

```typescript
    const impulseMagnitude = Math.hypot(impulseX, impulseY, impulseZ);
    if (impulseMagnitude > MAX_IMPULSE_MAGNITUDE) {
      const scale = MAX_IMPULSE_MAGNITUDE / impulseMagnitude;
      impulseX *= scale;
      impulseY *= scale;
      impulseZ *= scale;
    }

    // Proximity to the cap, measured against the pre-clamp magnitude so it
    // reads as 1 (full jitter) throughout a spam/hold, not just at the
    // instant the sum first crosses the cap. Cubed easing keeps jitter
    // negligible at low proximity (a single normal impulse) and only makes
    // it clearly visible once several impulses have stacked close to or
    // past the cap -- a smooth ramp, not a threshold snap.
    this.jitterPhase += JITTER_FREQUENCY * deltaTime;
    const proximity = Math.min(1, impulseMagnitude / MAX_IMPULSE_MAGNITUDE);
    const jitterAmount = proximity * proximity * proximity * JITTER_MAX_AMPLITUDE;
    // Different multipliers on the two axes' phases (not both 1x) avoid a
    // clean back-and-forth line, giving a small chaotic wobble that reads
    // more like straining than a mechanical metronome.
    const jitterX = Math.sin(this.jitterPhase) * jitterAmount;
    const jitterY = Math.sin(this.jitterPhase * 1.3) * jitterAmount;

    const baseX = VIEWMODEL_CONFIG.mirrored
      ? -VIEWMODEL_CONFIG.offset.x
      : VIEWMODEL_CONFIG.offset.x;
    this.weaponMesh.position.set(
      baseX + bobX + impulseX + jitterX,
      VIEWMODEL_CONFIG.offset.y + bobY + impulseY + jitterY,
      VIEWMODEL_CONFIG.offset.z + impulseZ,
    );
```

(`impulseZ` is unaffected by jitter — the wobble is lateral/vertical only, the same two axes screen-shake conventionally uses. Everything above the impulse-summation loop, `addImpulse()`, and `render()` are unchanged.)

- [ ] **Step 3: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/WeaponViewmodel.ts
git commit -m "Checkpoint 14 task 5: add near-cap jitter so the impulse clamp doesn't read as stuck"
```

Note: `JITTER_FREQUENCY`/`JITTER_MAX_AMPLITUDE`'s starting values above are a first cut — Task 6's manual verification includes tuning them by eye. If they need adjustment, edit the constants, rebuild, and re-verify before proceeding to Task 7; note any adjustment made in that task's report.

---

### Task 6: Manual verification against acceptance criteria (controller-executed, not a subagent)

**Files:** temporary edit to `src/main.ts` (added and fully reverted within this task — no commit from this task).

This task is executed directly by the session controller together with the human partner, the same way every previous checkpoint's manual-verification task has been — not dispatched to a subagent, since it requires live interactive judgment (does the bob look natural? does it decay smoothly? does the jitter read as straining rather than jank?) that a subagent cannot usefully render a verdict on, and it involves temporarily mutating a file that must end up byte-identical to Task 3's committed state before Task 7 begins.

- [ ] **Step 1: Add temporary `addImpulse()` summation-test scaffolding**

In `src/main.ts`, inside `startGame()`, immediately after the `const weaponViewmodel = new WeaponViewmodel();` line, temporarily add:

```typescript
  // TEMPORARY CHECKPOINT 14 VERIFICATION SCAFFOLDING -- remove before commit.
  // Press 1 then 2 in quick succession (within ~0.5s) to confirm addImpulse()
  // calls sum rather than one overriding the other. Rapidly press/hold 1 to
  // confirm the combined magnitude clamp holds and the mesh stays on-screen,
  // and that near-cap jitter shows visible motion instead of freezing.
  window.addEventListener("keydown", (event) => {
    if (event.code === "Digit1") {
      weaponViewmodel.addImpulse({ x: 0.04, y: 0, z: 0 }, 0.5);
    }
    if (event.code === "Digit2") {
      weaponViewmodel.addImpulse({ x: 0, y: 0.04, z: 0 }, 0.5);
    }
  });
```

(Each test impulse's own magnitude, `0.04`, is deliberately well below `MAX_IMPULSE_MAGNITUDE` (`0.15`) — a single press alone must stay far from the cap, so Step 5's jitter check can cleanly distinguish "one impulse, no jitter" from "several stacked, jitter visible." Reaching the cap now requires stacking roughly four or more overlapping presses, which spamming/holding the key still does easily within the 0.5s decay window.)

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Open the printed local URL in a browser.

- [ ] **Step 3: Verify bob at rest and while walking**

Start a run (either mode, either map). Stand still: confirm the weapon shows no bob (matches checkpoint 13's static bottom-right position exactly). Start walking (any direction, WASD): confirm a natural back-and-forth (horizontal) and up-and-down (vertical) motion appears, and that it increases smoothly as you begin moving rather than snapping on at full amplitude the instant a key is pressed.

- [ ] **Step 4: Verify smooth decay on stopping**

While walking, release all movement keys. Confirm the bob amplitude visibly decays back down to neutral (static position) over a short, smooth interval rather than cutting off abruptly the instant the key is released.

- [ ] **Step 5: Verify the `addImpulse()` summation test, and that a single impulse shows no jitter**

Press `1`, then within about half a second press `2`. Confirm the weapon visibly displaces further (a combined horizontal+vertical offset larger than either alone) while both impulses overlap, then confirm it decays back to its normal bob/base position as both impulses expire. This confirms the two calls' contributions summed rather than the second overriding the first. Repeat pressing `1` alone and `2` alone individually — confirm each decays back to neutral correctly on its own, AND confirm a single press shows no visible jitter/wobble (the new Task 5 jitter must be negligible at this low a magnitude, well below the cap).

- [ ] **Step 6: Verify the magnitude cap holds, with visible jitter instead of freezing (spam/hold test)**

Rapidly press `1` repeatedly (or hold it down, if the browser auto-repeats `keydown`) for at least a couple of seconds — each press queues another overlapping impulse, so without a cap the summed offset would grow without bound. Confirm: the offset visibly grows at first, then stops growing and holds at a fixed maximum (never exceeding it) — but unlike Task 4's clamp alone, it must NOT sit perfectly static at that maximum; confirm a small continuous wobble/jitter is now visible while held at the cap, reading as the weapon straining/kicking under sustained fire rather than freezing. The weapon mesh must remain visibly on-screen (not clipped off the edge) for the entire duration, including at peak spam, with the jitter included. Confirm releasing and immediately re-spamming reaches the same held maximum (with the same jitter) again. If the jitter looks like visible jank/excessive shake, or isn't noticeable enough, or the mesh ever leaves the visible area, stop, adjust `JITTER_FREQUENCY`/`JITTER_MAX_AMPLITUDE` in `src/core/WeaponViewmodel.ts` (Task 5's file), rebuild, and re-test this step before continuing — note the final chosen values and why in this task's outcome. (`MAX_IMPULSE_MAGNITUDE` itself was already confirmed correct in an earlier pass of this same testing and should not need to change here.)

- [ ] **Step 7: Regression-check checkpoint 13 behavior**

Confirm: the weapon still sits bottom-right at rest, still never clips through walls (walk nose-to-wall while stationary), still disappears the instant the player dies and reappears correctly on Respawn. Confirm shooting, HUD, interacting with doors/buttons/pickups/wall-buys, and enemy AI are otherwise unaffected.

- [ ] **Step 8: Remove the temporary scaffolding**

Delete the `window.addEventListener("keydown", ...)` block added in Step 1 from `src/main.ts`. Run `git diff src/main.ts` and confirm it reports no changes (the file is now byte-identical to Task 3's committed state). Run `npm run build` once more to confirm it still succeeds with the scaffolding removed.

---

### Task 7: Update CLAUDE.md and commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the folder structure tree**

Change the checkpoint-13 `WeaponViewmodel.ts` line:

```
    WeaponViewmodel.ts           [13, static-positioned placeholder viewmodel — own scene/camera, rendered as a second depth-cleared pass so it never clips through world geometry]
```

to:

```
    WeaponViewmodel.ts           [13, static-positioned placeholder viewmodel — own scene/camera, rendered as a second depth-cleared pass so it never clips through world geometry; 14 adds continuous speed-driven bob and a generic addImpulse() offset-composition mechanism, with the combined impulse magnitude clamped so the mesh can never be pushed off-screen, plus a small near-cap jitter so the clamp reads as straining rather than freezing]
```

And change the `PlayerController.ts` line:

```
    PlayerController.ts           [1, collision boxes cached at 8.5 — see decisions log]
```

to:

```
    PlayerController.ts           [1, collision boxes cached at 8.5 — see decisions log; getSpeed() added at 14 for WeaponViewmodel's walk bob]
```

- [ ] **Step 2: Update the Checkpoints list**

Add a new line immediately after checkpoint 13's line:

```
14. Walk bob + generic viewmodel offset composition — `PlayerController.getSpeed()` (measured, not intended, displacement) drives a continuous speed-scaled bob in `WeaponViewmodel`; `addImpulse(offset, decayTime)` is a generic, provably-summing temporary-offset mechanism with no trigger call sites yet, with the combined summed magnitude clamped (visually tuned) so it can never push the mesh off-screen, plus a small near-cap jitter (also visually tuned) so sustained stacking reads as straining rather than freezing static
```

- [ ] **Step 3: Update "Current status"**

Change the opening sentence from `Checkpoint 13 complete.` to `Checkpoint 14 complete.`, and append a new paragraph after the existing checkpoint-13 paragraph (before `## Decisions log`):

```

`PlayerController` gained `getSpeed(): number` (checkpoint 14), measuring actual resolved horizontal displacement each frame — not the `MOVE_SPEED` constant, and not a discrete moving/idle flag — so it automatically reads lower while sliding along a wall and would automatically read higher under any future different movement speed (sprint, not built) with no code change needed anywhere that consumes it. `core/WeaponViewmodel.ts` gained a per-frame `update(speed, deltaTime)`, called from `main.ts`'s `animate()` right before `render()`, that composes the weapon mesh's local position from three sources every frame: the static `VIEWMODEL_CONFIG` base offset (checkpoint 13, unchanged), a continuous walk bob, and the sum of any active `addImpulse()` calls. The bob smooths the raw incoming speed internally (a per-second lerp) before deriving amplitude and frequency from it — this single smoothing step is what makes the bob both ramp in smoothly as the player starts moving and decay back to neutral smoothly when they stop, rather than needing a separate "stopping" case. `addImpulse(offset, decayTime)` is a new, generic mechanism: each call queues a temporary offset that decays linearly to zero over `decayTime` seconds, and multiple concurrent calls sum rather than overwrite each other. The *combined* magnitude of all currently-summed impulses is clamped to a fixed ceiling (`MAX_IMPULSE_MAGNITUDE`, chosen by visual verification against the current `VIEWMODEL_FOV`/near-plane/base offset, not derived from a formula and assumed correct) — the clamp applies to the total summed vector, never to an individual impulse and never as a limit on how many impulses can be active, so spamming or holding a rapid trigger still visibly stacks the offset up to the cap and holds there rather than being silently rejected. A hard clamp alone, tested in-browser, visibly read as the weapon freezing/getting stuck rather than straining under sustained fire, so `update()` also layers a small, fast, continuous jitter on top once the (pre-clamp) impulse magnitude is close to or at the cap — scaled by a cubed-eased proximity measure so it stays negligible for one normal impulse and only becomes clearly visible once several have stacked near or past the cap, additive to the clamp rather than a replacement for it. Verified in-browser via two temporary, uncommitted debug key bindings: overlapping impulses summed to a visibly larger combined offset than either alone and decayed back to neutral correctly; a single press alone showed no visible jitter; spamming/holding one of the two keys repeatedly showed the offset grow, then hold at the cap with a small continuous wobble instead of freezing static, reading as straining/kicking under sustained fire, with the mesh remaining fully on-screen throughout. That scaffolding was removed before this checkpoint's commit, and nothing in the shipped code calls `addImpulse()` yet (no fire-kick, reload-dip, damage-flinch, weapon-switch-dip, or melee-swing trigger exists — see future mechanics). Verified in-browser: standing still shows no bob (matching checkpoint 13 exactly), walking produces a smoothly increasing back-and-forth/up-down motion, releasing movement keys decays it back to neutral rather than cutting abruptly, and checkpoint 13's positioning/depth-clip/death-hide behavior are all otherwise unaffected.
```

- [ ] **Step 4: Add decisions log entries**

Append after the last existing decisions-log line, before `## Future mechanics`:

```
- Walk bob (checkpoint 14) is driven by a continuous function of `PlayerController.getSpeed()` — itself measured from actual resolved displacement, not the `MOVE_SPEED` constant — rather than a lookup table keyed by a discrete movement-state enum (e.g. `"idle" | "walking"`). No such enum exists anywhere in this codebase and none was introduced. This is deliberate: a continuous formula means any future different movement speed (sprint, not built yet) automatically produces proportionally more bob the moment it exists, with zero changes to `WeaponViewmodel` or `PlayerController` — a state-keyed lookup table would need a new entry (and a decision about where sprint's threshold sits) every time a new speed tier was added.
- `WeaponViewmodel.addImpulse(offset, decayTime)` (checkpoint 14) is a generic, weapon/trigger-agnostic mechanism, deliberately built before any real trigger exists: each call queues an offset that decays linearly to zero over `decayTime` seconds, and `update()` sums every still-active impulse's contribution every frame. This is the intended integration point for fire-kick, reload-dip, damage-flinch, weapon-switch-dip, and melee-swing (none implemented this checkpoint — see future mechanics); building the summing mechanism generically now, rather than a single-slot "current kick offset" field, is what lets those effects overlap correctly later (e.g. a reload-dip still in progress when a shot fires) without a redesign.
- The bob's raw speed input is smoothed internally by `WeaponViewmodel` (a per-second lerp, `BOB_SPEED_SMOOTHING`) before being used to derive amplitude/frequency, rather than smoothing happening in `PlayerController` or being left unsmoothed. `PlayerController.getSpeed()` reports the true instantaneous measured speed (useful in its own right, unsmoothed, for any future consumer); the smoothing is purely a presentation concern of how the bob *looks*, so it belongs entirely inside the rendering-only `WeaponViewmodel`, not leaked into `PlayerController` or a third file.
- `MAX_IMPULSE_MAGNITUDE` (checkpoint 14) clamps the *combined* magnitude of all currently-summed active impulses, not any individual impulse's own offset and not how many impulses can be active at once — a rapid-fire weapon's recoil (not built yet) is exactly the shape of input this needs to handle correctly: many overlapping `addImpulse()` calls in quick succession, which should visibly stack the effect up to a fixed ceiling and hold there, not be silently capped by count (which would look like recoil "running out" arbitrarily) and not be left unclamped (which could push the mesh off-screen entirely, discovered as a gap after the base bob/impulse mechanism was already built and verified). The clamp preserves direction (scales the summed vector down proportionally when it exceeds the cap) rather than clipping each axis independently, so a diagonal impulse combination still decays toward the base position along a straight line rather than snapping onto a box boundary. The specific value (`0.15`) was chosen and confirmed by visual verification in-browser against the current `VIEWMODEL_FOV`/near-plane/base offset — spamming/holding the checkpoint-14 test impulse key showed the mesh staying fully on-screen at the cap — not derived from a frustum-geometry formula and assumed correct; revisit if `VIEWMODEL_FOV`, the base offset, or the near-plane ever change.
- A hard clamp on impulse magnitude, tested in-browser immediately after being built, visibly read as the weapon freezing/getting stuck at the ceiling rather than straining under sustained fire — this was caught by manual testing, not anticipated in the original design. Rather than replacing the clamp (the cap's actual value was already confirmed correct — the problem was the clamp holding perfectly static, not the ceiling being wrong), checkpoint 14 adds a small additive near-cap jitter: a fast sine wobble on the X/Y axes, scaled by a cubed-eased function of how close the (pre-clamp) impulse magnitude is to `MAX_IMPULSE_MAGNITUDE`. Cubed (not linear) easing was chosen specifically so the jitter stays negligible for one normal-sized impulse decaying on its own — the case the rest of this checkpoint already verified independently — and only becomes clearly visible once several impulses have stacked close to or past the cap, rather than a linear ramp that would introduce a small but noticeable wobble even on an ordinary single shot. The two axes use different phase multipliers (not both the same sine) deliberately, to avoid reading as a mechanical back-and-forth metronome and instead read as a small chaotic strain. `JITTER_FREQUENCY`/`JITTER_MAX_AMPLITUDE` were tuned by eye in-browser for a "straining/kicking under sustained fire" read.
```

- [ ] **Step 5: Update future-mechanics entries**

Find the three checkpoint-13 future-mechanics bullets (added at checkpoint 13: "Weapon fire/reload viewmodel animation", "Weapon idle sway/bob", "Per-weapon viewmodel appearance"). The "Weapon idle sway/bob" bullet is now implemented — replace it (do not just delete it; mark it superseded, following this document's established convention) with:

```
- **Superseded at checkpoint 14** (was: "**Weapon idle sway/bob**: also not built at checkpoint 13 — no subtle idle movement or footstep-driven bob on the viewmodel mesh. Would likely read from `PlayerController`'s movement state the same way a future fire animation would read from `WeaponSystem`'s state, but the exact approach isn't designed yet."): walk bob is now built — see the checkpoint-14 decisions log (`PlayerController.getSpeed()` driving a continuous bob inside `WeaponViewmodel`). Still not built: any *idle* bob while standing completely still (checkpoint 14's bob is exactly zero at zero speed, by design) — a subtle idle sway independent of movement speed remains undesigned and is a distinct, still-open future mechanic from what checkpoint 14 built.
```

Update the "Weapon fire/reload viewmodel animation" bullet to name the new integration point (replace its text with):

```
- **Weapon fire/reload viewmodel animation**: still not built. `WeaponViewmodel.addImpulse(offset, decayTime)` (checkpoint 14) is the intended integration point — `WeaponSystem` already tracks firing/reloading state in `GameState`; a later checkpoint would call `addImpulse()` from `WeaponSystem`'s fire/reload call sites (a fire-kick offset with a short decay, a reload-dip offset with a longer one) rather than building a second, separate animation mechanism.
```

Leave "Per-weapon viewmodel appearance" unchanged.

Append two new future-mechanics bullets at the end of the section:

```
- **Damage-flinch, weapon-switch-dip, and melee-swing viewmodel impulses**: none built. Like fire/reload animation above, each would be a new call site into `WeaponViewmodel.addImpulse()` (checkpoint 14) from wherever that event is already detected (`PlayerState.applyDamage()` for flinch, `WeaponSystem.setWeapon()` for switch-dip, a future melee system for swing) — the composition mechanism itself needs no changes to support any of them.
- **Idle bob (distinct from checkpoint 14's walk bob)**: checkpoint 14's bob is a continuous function of measured speed and is exactly zero when standing still, by design (see the checkpoint-14 decisions log). A separate subtle sway while genuinely idle (not moving at all) — the kind of "the gun is still slightly alive in your hands" motion many FPS games have — is a distinct, still-undesigned mechanic, not something checkpoint 14's speed-driven bob covers by definition.
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Search for staleness this checkpoint may have introduced**

This project's CLAUDE.md has needed a staleness fix in nearly every recent checkpoint (9, 9.5, 10, 10's final review, 11 across two rounds, 12, and — via the final whole-branch review — 13) — always the same failure mode: an older sentence elsewhere in the document making a present-tense claim this checkpoint's changes now contradict. Before committing, read the entire document (not just the sections edited above) and specifically check for:
- Any sentence describing `WeaponViewmodel`'s weapon mesh position as static/fixed/set-once (checkpoint 13's own paragraph described it that way — confirm it isn't left describing a now-obsolete one-time position, since Task 2 replaced the constructor's one-time `position.set()` with a per-frame `update()` recompute).
- Any sentence describing `PlayerController` as having no notion of "speed" as a concept.
- Any sentence describing `addImpulse()`'s combined offset as unbounded/uncapped (there shouldn't be one, since the cap was added within this same checkpoint before any commit — but confirm nothing describes the mechanism that way).
- Any sentence describing the magnitude clamp as producing a perfectly static hold at the cap (it no longer does, once Task 5's jitter is layered on top — this framing appeared in Task 4's own code comment before Task 5 existed; confirm it doesn't linger anywhere describing final shipped behavior).
- Any other claim this checkpoint's changes would now contradict.

If you find staleness, fix it using the established `**Superseded at checkpoint N** (was: "...")` convention (match the format of existing examples in the document exactly). If you find nothing beyond what Steps 1-5 already added, say so explicitly in your commit's task report — don't skip stating the negative result.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Checkpoint 14: walk bob + generic viewmodel offset composition

Adds PlayerController.getSpeed(), measuring actual resolved horizontal
displacement each frame rather than the MOVE_SPEED constant or a
discrete moving/idle flag. WeaponViewmodel.update(speed, deltaTime)
composes the weapon mesh's per-frame local position from three summed
sources: the checkpoint-13 static base offset, a continuous
speed-driven bob (raw speed is smoothed internally so amplitude both
ramps in and decays out smoothly, from one mechanism), and the sum of
any active WeaponViewmodel.addImpulse(offset, decayTime) calls -- a
new generic mechanism where multiple concurrent impulses sum rather
than override each other, with the combined summed magnitude clamped
to a fixed, visually-verified ceiling (MAX_IMPULSE_MAGNITUDE) so no
burst or held rapid trigger can push the mesh off-screen -- the clamp
applies to the total summed vector only, never per-impulse and never
a count limit, so spamming still visibly stacks up to the cap and
holds there. A small near-cap jitter (also visually tuned) is layered
additively on top once the sum is close to the cap, since a hard clamp
alone read as the weapon freezing rather than straining under
sustained fire -- negligible for one normal impulse, clearly visible
only once several have stacked near or past the cap. Verified via
temporary debug key bindings (removed before this commit) that queued
two overlapping impulses (showed a combined offset larger than either
alone, no jitter on a single press) and, separately, spammed one
repeatedly to confirm the magnitude cap holds, the jitter reads as
straining rather than freezing, and the mesh stays on-screen
throughout. No specific impulse trigger
(fire/reload/damage/switch/melee) is wired up yet -- addImpulse()
is the named integration point for each, logged in future mechanics.
No sprint/crouch/jump was built. Checkpoint 13's positioning,
depth-clip fix, and death/respawn hide behavior are unaffected.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Verify the commit**

Run: `git status` and `git log -1 --stat`
Expected: working tree clean; the commit touches `CLAUDE.md` (plus this plan doc, if not already committed by an earlier task) — `src/main.ts` should show no changes from this task, since Task 6 fully reverted its temporary scaffolding before Task 7 began.

---

## Self-Review Notes

- **Spec coverage:** continuous, speed-driven (not state-keyed) bob (Task 1 + Task 2) ✓; amplitude and frequency both scale with speed (Task 2) ✓; zero bob at zero speed, smooth ramp-in and smooth decay-to-neutral from one mechanism (Task 2's speed smoothing) ✓; `addImpulse(offset, decayTime)` generic, linear decay, multiple concurrent calls sum (Task 2) ✓; combined impulse magnitude clamped, not per-impulse, not count-limited, value visually verified (Task 4) ✓; near-cap jitter layered additively on top of the clamp, negligible at low proximity, clearly visible near the cap, tuned by eye (Task 5) ✓; final position = base + bob + clamped-summed impulses + near-cap jitter, composed entirely inside `WeaponViewmodel` (Task 2 + Task 4 + Task 5) ✓; no impulse trigger call sites shipped, `addImpulse()` proven reusable (including the cap holding under spam, and jitter distinguishing single-press from stacked) via temporary test code that is removed before commit (Task 6) ✓; no sprint/crouch/jump (no task builds any of these) ✓; checkpoint 13 behavior unaffected at rest (Task 6, Step 3 first half + Step 7) ✓; CLAUDE.md status + decisions (speed-driven design, `addImpulse()` mechanism, smoothing-lives-in-WeaponViewmodel, magnitude-cap rationale and value, near-cap jitter rationale) + updated future-mechanics naming `addImpulse()` as the integration point for each future trigger + staleness sweep + commit named "checkpoint 14" (Task 7) ✓.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code; Task 6's verification steps are concrete observable behaviors (bob presence/absence, smooth ramp/decay, summation via a specific reproducible key-press sequence, the cap holding steady under a spam/hold test, jitter visible near the cap but absent on a single press), not vague "make sure it feels right" language; the temporary scaffolding's exact code (including its deliberately-sized 0.04 test impulses, well below the 0.15 cap) is given in full, not described abstractly.
- **Type consistency check:** `PlayerController.getSpeed(): number` (Task 1) is called in Task 3 as `playerController.getSpeed()`, passed positionally as the first argument to `WeaponViewmodel.update(speed: number, deltaTime: number): void` (Task 2) — both `number`, matches. `addImpulse(offset: { x: number; y: number; z: number }, decayTime: number): void` (Task 2, signature unchanged by Task 4 and Task 5) is called in Task 6's temporary scaffolding with object literals matching that exact shape (`{ x: 0.04, y: 0, z: 0 }`, a `number` second argument) — matches. `Impulse` (Task 2's internal interface) is used consistently within the same file only; nothing outside `WeaponViewmodel.ts` needs to know its shape, so no cross-task drift risk. `MAX_IMPULSE_MAGNITUDE` (Task 4) and `JITTER_FREQUENCY`/`JITTER_MAX_AMPLITUDE` (Task 5) are private, unexported `number` constants — no other task references them by name except CLAUDE.md prose (Task 7), which quotes their values rather than importing them, so no type-level drift risk there either.
- **Compile-safety / task-ordering check:** Task 1 alone adds a new field and method to an existing class with no new imports — compiles standalone (an unused-until-later exported method doesn't trigger `noUnusedLocals`/`noUnusedParameters`, which flag unused *locals*/*parameters* within a scope, not unused public methods). Task 2 alone (rewriting `WeaponViewmodel.ts`) compiles standalone too — `update()`'s `speed`/`deltaTime` parameters are both read inside the method body (no unused-parameter violation), and the file's only external dependency is `three`, unchanged from checkpoint 13. Task 3 depends on both Task 1 (`getSpeed()`) and Task 2 (`update()`) already being landed; alone, without them, it would fail to compile — so Tasks 1 and 2 must precede Task 3, but Tasks 1 and 2 have no dependency on each other and their relative order doesn't matter. Task 4 depends only on Task 2 (it edits the same file, inserting code between two blocks Task 2 already established) and must follow it, but has no dependency on Task 3. Task 5 depends only on Task 4 (it inserts code between Task 4's clamp block and the final `position.set()` call, and reads the same post-clamp `impulseMagnitude`/`impulseX`/`impulseY`/`impulseZ` locals Task 4 already computes) — it must follow Task 4, but like Task 4, has no dependency on Task 3. No `erasableSyntaxOnly` violations: `Impulse` is a plain (fully erasable) interface, no enum is introduced anywhere, and `WeaponViewmodel`'s fields are declared then assigned in the constructor/field-initializer positions already established in checkpoint 13's style (no parameter-property shorthand); Task 4's `MAX_IMPULSE_MAGNITUDE` and Task 5's `JITTER_FREQUENCY`/`JITTER_MAX_AMPLITUDE` are all plain `const number`s, same pattern as every other tuning constant in the file.
- **Architecture-rule cross-check:** `PlayerController.ts` gains no new imports (Task 1). `WeaponViewmodel.ts` still imports only `three` (Task 2 + Task 4 + Task 5) — `speed`/`deltaTime` arrive as plain `number` parameters from the caller, so the file never imports `PlayerController` or `GameState`, preserving the checkpoint-13 "rendering-only, no gameplay logic" property this checkpoint's own spec explicitly requires stay true. Task 4's clamp and Task 5's jitter are both pure math on already-local `number` variables (`Math.hypot`, `Math.sin`), introducing no new dependency.
