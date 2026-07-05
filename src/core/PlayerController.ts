import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import type { GameState } from "../state/GameState";
import type { DoorEntry } from "./MapEntitySystem";

export const PLAYER_RADIUS = 0.4;
const EYE_HEIGHT = 1.7;
const MOVE_SPEED = 4; // units per second
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const COLLISION_PASSES = 3;

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

  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly moveDirection = new THREE.Vector3();

  private readonly camera: THREE.PerspectiveCamera;
  private readonly gameState: GameState;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    gameState: GameState,
  ) {
    this.camera = camera;
    this.gameState = gameState;
    this.controls = new PointerLockControls(camera, domElement);
    this.camera.position.set(0, EYE_HEIGHT, 0);

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
  }

  setWallBoxes(wallBoxes: THREE.Box3[]): void {
    this.wallBoxes = wallBoxes;
  }

  setDoors(doors: DoorEntry[]): void {
    this.doors = doors;
  }

  setSpawn(x: number, z: number): void {
    this.camera.position.set(x, EYE_HEIGHT, z);
  }

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

    // Closed (visible) doors collide the same as walls; an opened door is
    // just excluded from this list for the frame, no separate open/closed
    // bookkeeping needed here.
    const boxes = this.wallBoxes.concat(
      this.doors.filter((door) => door.mesh.visible).map((door) => door.box),
    );

    for (let pass = 0; pass < COLLISION_PASSES; pass++) {
      for (const box of boxes) {
        ({ x, z } = this.resolveAgainstBox(x, z, box));
      }
    }

    this.camera.position.x = x;
    this.camera.position.z = z;
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
