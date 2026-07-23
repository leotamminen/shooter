import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import type { GameState } from "../state/GameState";
import type { DoorEntry } from "./MapEntitySystem";

export const PLAYER_RADIUS = 0.4;
const EYE_HEIGHT = 1.7;
const MOVE_SPEED = 4; // units per second
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const COLLISION_PASSES = 3;

// Mouse-look constants, matching PointerLockControls' own defaults exactly
// (0.002 sensitivity, +-90 degree pitch clamp) -- this class replicates that
// library's rotation math itself rather than relying on its built-in
// mousemove handler, see the constructor's own comment for why.
const MOUSE_SENSITIVITY = 0.002;
const MAX_PITCH = Math.PI / 2;
// Camera-stutter fix: clamps each mousemove event's raw movementX/movementY
// before it's applied to rotation. Confirmed via a captured log from real
// play (not a guess) -- an isolated event reported movementX: 301,
// movementY: 60 with pointer lock continuously engaged the whole time (no
// nearby pointerlockchange), against a normal 1-14px baseline for every
// other event in the same window. This is a known, accepted characteristic
// of the Pointer Lock API (occasional coalesced/oversized deltas), not a
// bug in any of our own rotation-affecting systems -- see CLAUDE.md's
// decisions log. 50 leaves comfortable headroom above the observed normal
// baseline (topping out around 14) while still being far below the
// confirmed anomalous spike (301).
const MAX_MOUSE_DELTA = 50;

interface MoveState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
}

export class PlayerController {
  readonly controls: PointerLockControls;

  private readonly moveState: MoveState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
  };

  private readonly clock = new THREE.Clock();
  private wallBoxes: THREE.Box3[] = [];
  private doors: DoorEntry[] = [];
  private collisionBoxes: THREE.Box3[] = [];
  private speed = 0;

  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly moveDirection = new THREE.Vector3();

  private readonly camera: THREE.PerspectiveCamera;
  private readonly gameState: GameState;
  private readonly domElement: HTMLElement;
  private readonly euler = new THREE.Euler(0, 0, 0, "YXZ");

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    gameState: GameState,
  ) {
    this.camera = camera;
    this.gameState = gameState;
    this.domElement = domElement;
    this.controls = new PointerLockControls(camera, domElement);
    // Camera-stutter fix: PointerLockControls' own built-in mousemove
    // listener (registered by its constructor) applies event.movementX/Y to
    // camera rotation completely raw, with no way to clamp an anomalous
    // single-event spike before it's applied. disconnect() removes that
    // listener (and its pointerlockchange/pointerlockerror ones, both
    // unused elsewhere in this codebase -- confirmed nothing reads
    // controls.isLocked or listens for controls' own dispatched
    // lock/unlock/change events; gameState.paused is driven by main.ts's
    // own separate pointerlockchange listener) so handleMouseMove below --
    // replicating the exact same rotation math, just with clamped input --
    // is the only thing ever touching camera rotation. .lock()/.unlock()
    // themselves are untouched by disconnect() (they call
    // requestPointerLock()/exitPointerLock() directly, not through the
    // connect/disconnect-managed listeners), so every existing
    // playerController.controls.lock()/.unlock() call site elsewhere in
    // this codebase keeps working exactly as before.
    this.controls.disconnect();
    this.camera.position.set(0, EYE_HEIGHT, 0);

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    document.addEventListener("mousemove", this.handleMouseMove);
  }

  // Replicates PointerLockControls' own onMouseMove exactly (same 0.002
  // sensitivity, same YXZ-order Euler, same +-90 degree pitch clamp -- this
  // project never customizes pointerSpeed/minPolarAngle/maxPolarAngle
  // anywhere, confirmed via a repo-wide search, so replicating the library's
  // hardcoded defaults here is not a behavior change), with one addition:
  // each event's raw movementX/movementY is clamped to +-MAX_MOUSE_DELTA
  // before use. Only engaged while pointer lock is actually held by this
  // element -- checked directly against document.pointerLockElement, not a
  // cached flag, so this can never go stale the way a disconnected
  // library's own isLocked field would.
  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.domElement) return;

    const movementX = THREE.MathUtils.clamp(event.movementX, -MAX_MOUSE_DELTA, MAX_MOUSE_DELTA);
    const movementY = THREE.MathUtils.clamp(event.movementY, -MAX_MOUSE_DELTA, MAX_MOUSE_DELTA);

    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= movementX * MOUSE_SENSITIVITY;
    this.euler.x -= movementY * MOUSE_SENSITIVITY;
    this.euler.x = THREE.MathUtils.clamp(this.euler.x, -MAX_PITCH, MAX_PITCH);
    this.camera.quaternion.setFromEuler(this.euler);
  };

  setWallBoxes(wallBoxes: THREE.Box3[]): void {
    this.wallBoxes = wallBoxes;
    this.rebuildCollisionBoxes();
  }

  setDoors(doors: DoorEntry[]): void {
    this.doors = doors;
    this.rebuildCollisionBoxes();
  }

  // Recomputes the cached closed-door-plus-wall collision list. Called once
  // whenever wallBoxes/doors are (re)assigned, and again by MapEntitySystem's
  // onDoorStateChanged hook every time a door's visibility actually changes
  // (button press, or a RunManager reset reopening it) — not every frame,
  // since door state changes are rare compared to the movement update rate.
  rebuildCollisionBoxes(): void {
    this.collisionBoxes = this.wallBoxes.concat(
      this.doors.filter((door) => door.mesh.visible).map((door) => door.box),
    );
  }

  setSpawn(x: number, z: number): void {
    this.camera.position.set(x, EYE_HEIGHT, z);
  }

  // Paired-terminal teleport: identical positional-reset logic to setSpawn()
  // (x/z only, same EYE_HEIGHT), reused rather than duplicated -- the two
  // methods only differ in when/why they're called. Deliberately takes no
  // yaw/rotation parameter and never touches camera rotation in either
  // direction: the player's facing must survive a teleport untouched, since
  // the whole point is a silent reposition, not a re-orientation.
  teleportTo(x: number, z: number): void {
    this.setSpawn(x, z);
  }

  // Live x/z read of the player's current position, for anything that needs
  // to compute a position relative to where the player actually is right
  // now (e.g. the paired-terminal teleport's relative-offset math) rather
  // than a fixed/assumed stance.
  getPosition(): { x: number; z: number } {
    return { x: this.camera.position.x, z: this.camera.position.z };
  }

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

  private resolveAgainstBox(
    x: number,
    z: number,
    box: THREE.Box3,
  ): { x: number; z: number } {
    const clampedX = THREE.MathUtils.clamp(x, box.min.x, box.max.x);
    const clampedZ = THREE.MathUtils.clamp(z, box.min.z, box.max.z);

    const dx = x - clampedX;
    const dz = z - clampedZ;
    const distance = Math.hypot(dx, dz);

    if (distance >= PLAYER_RADIUS) {
      return { x, z };
    }

    if (distance < 1e-6) {
      // Player center has fully penetrated the box footprint, so clamping
      // returns the center itself and the separating vector is zero-length.
      // Push out along whichever axis has the smaller overlap instead.
      const overlapMinX = x - box.min.x;
      const overlapMaxX = box.max.x - x;
      const overlapMinZ = z - box.min.z;
      const overlapMaxZ = box.max.z - z;

      const leastX = Math.min(overlapMinX, overlapMaxX);
      const leastZ = Math.min(overlapMinZ, overlapMaxZ);

      if (leastX < leastZ) {
        const pushX =
          overlapMinX < overlapMaxX
            ? -(overlapMinX + PLAYER_RADIUS)
            : overlapMaxX + PLAYER_RADIUS;
        return { x: x + pushX, z };
      }

      const pushZ =
        overlapMinZ < overlapMaxZ
          ? -(overlapMinZ + PLAYER_RADIUS)
          : overlapMaxZ + PLAYER_RADIUS;
      return { x, z: z + pushZ };
    }

    const pushDistance = PLAYER_RADIUS - distance;
    const nx = dx / distance;
    const nz = dz / distance;
    return { x: x + nx * pushDistance, z: z + nz * pushDistance };
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.setMoveState(event.code, true);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.setMoveState(event.code, false);
  };

  private setMoveState(code: string, value: boolean): void {
    switch (code) {
      case "KeyW":
        this.moveState.forward = value;
        break;
      case "KeyS":
        this.moveState.backward = value;
        break;
      case "KeyA":
        this.moveState.left = value;
        break;
      case "KeyD":
        this.moveState.right = value;
        break;
    }
  }
}
