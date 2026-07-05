# Checkpoint 8.5: Raycast Registry Unification + Gating Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (recommended over subagent-driven-development here — the tasks are tightly coupled: main.ts and every raycasting system change signatures together, so the project won't type-check again until all wiring tasks land, which defeats the "review one task in isolation" value subagent-driven-development is built for). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four independently hand-built raycast/occlusion target lists (WeaponSystem's fire raycast, EnemyAI's line-of-sight raycast, HUD's enemy-label occlusion raycast, InteractSystem's interact raycast) with one shared `RaycastRegistry`, close the playerState/interactable/firing gating gaps found in code review, and extract two duplicated patterns (countdown timers, mesh→Box3 collision boxes) into `core/utils/`.

**Architecture:** A new `core/RaycastRegistry.ts` class (`register`/`unregister`/`getAll`) becomes the single source of truth for "what a ray can hit or be blocked by." Every system that used to receive a hand-assembled `THREE.Object3D[]` (WeaponSystem, EnemyAI, InteractSystem, HUD) instead receives a reference to the shared registry and calls `.getAll()` at raycast time. Everything that used to be manually collected into those lists (walls, doors, buttons, pickups, the placeholder box, enemies) instead registers itself once, at its own construction time, into the same registry.

**Tech Stack:** TypeScript, Three.js, Vite. No test framework exists in this project (see `package.json` — `dev`/`build`/`preview` scripts only); every checkpoint to date has been verified manually in the browser, and this plan follows that same convention instead of introducing automated tests unilaterally.

## Global Constraints

- `core/` never references `content/` or `modes/` directly — it only consumes typed interfaces. (None of the new/changed core files import content/ or modes/.)
- Shared/reusable logic (math helpers, raycasting, state machines) goes in `core/utils/`, never duplicated inline.
- Single-responsibility per file: one class/system per file, file name matches it.
- No physics engine — manual collision only; unaffected by this change, but `PlayerController`'s AABB collision path is being touched (caching only, not replaced).
- Commit at the end of every checkpoint (one commit, per this project's established CLAUDE.md workflow rule) — not one commit per task in this plan.

---

## Task 1: RaycastRegistry, Countdown, and CollisionBox utilities

**Files:**
- Create: `src/core/RaycastRegistry.ts`
- Create: `src/core/utils/Countdown.ts`
- Create: `src/core/utils/CollisionBox.ts`

**Interfaces:**
- Produces: `RaycastRegistry` class with `register(object: THREE.Object3D): void`, `unregister(object: THREE.Object3D): void`, `getAll(): THREE.Object3D[]`.
- Produces: `Countdown` class with `start(duration: number): void`, `stop(): void`, `get active(): boolean`, `update(deltaTime: number, onZero: () => void): void`.
- Produces: `computeCollisionBox(mesh: THREE.Mesh): THREE.Box3` function.

- [ ] **Step 1: Create `src/core/RaycastRegistry.ts`**

```typescript
import * as THREE from "three";

// The single source of truth for "what can be hit or occluded by a ray" —
// replaces four separately hand-built target arrays (WeaponSystem's fire
// raycast, EnemyAI's line-of-sight raycast, HUD's enemy-label occlusion
// raycast, InteractSystem's interact raycast) that drifted out of sync as
// entity types were added (checkpoint 6 doors/buttons/pickups, checkpoint 7
// dynamic enemies). Anything solid — walls, doors, buttons, pickups, the
// placeholder interactable, enemies — registers itself here once, and every
// raycasting system reads the same list.
export class RaycastRegistry {
  private readonly objects: THREE.Object3D[] = [];

  register(object: THREE.Object3D): void {
    this.objects.push(object);
  }

  unregister(object: THREE.Object3D): void {
    const index = this.objects.indexOf(object);
    if (index !== -1) this.objects.splice(index, 1);
  }

  getAll(): THREE.Object3D[] {
    return this.objects;
  }
}
```

- [ ] **Step 2: Create `src/core/utils/Countdown.ts`**

```typescript
// Counts down from a duration by deltaTime and fires a callback once it
// reaches zero — the shared shape both ZombieSurvival's round-transition
// timer and ShootingRange's per-target hit cooldown independently
// reimplemented before this was extracted. update() is a no-op while
// inactive, so callers can call it unconditionally every frame without
// checking `active` first.
export class Countdown {
  private remaining = 0;

  get active(): boolean {
    return this.remaining > 0;
  }

  start(duration: number): void {
    this.remaining = duration;
  }

  stop(): void {
    this.remaining = 0;
  }

  update(deltaTime: number, onZero: () => void): void {
    if (this.remaining <= 0) return;

    this.remaining -= deltaTime;
    if (this.remaining <= 0) {
      this.remaining = 0;
      onZero();
    }
  }
}
```

- [ ] **Step 3: Create `src/core/utils/CollisionBox.ts`**

```typescript
import * as THREE from "three";

// The one place that turns a mesh into an axis-aligned collision box —
// MapLoader's wall boxes and MapEntitySystem's door box both need exactly
// this, and used to compute it independently inline.
export function computeCollisionBox(mesh: THREE.Mesh): THREE.Box3 {
  return new THREE.Box3().setFromObject(mesh);
}
```

- [ ] **Step 4: Verify the project still compiles**

Run: `npm run build`
Expected: succeeds (these are new, unreferenced files — nothing else has changed yet, so this only catches typos).

---

## Task 2: Wire RaycastRegistry into MapLoader

**Files:**
- Modify: `src/core/MapLoader.ts`

**Interfaces:**
- Consumes: `RaycastRegistry.register(object: THREE.Object3D): void` (Task 1), `computeCollisionBox(mesh: THREE.Mesh): THREE.Box3` (Task 1).
- Produces: `loadMap(grid: number[][], raycastRegistry: RaycastRegistry): LoadedMap` — signature changed, now takes the registry and registers every wall mesh into it as it's created.

- [ ] **Step 1: Replace the full contents of `src/core/MapLoader.ts`**

```typescript
import * as THREE from "three";
import type { MapDef } from "../types";
import type { RaycastRegistry } from "./RaycastRegistry";
import { computeCollisionBox } from "./utils/CollisionBox";

export const CELL_SIZE = 2;
export const WALL_HEIGHT = 3;

export interface LoadedMap {
  group: THREE.Group;
  walls: THREE.Mesh[];
  wallBoxes: THREE.Box3[];
}

export function loadMap(grid: number[][], raycastRegistry: RaycastRegistry): LoadedMap {
  const group = new THREE.Group();
  const walls: THREE.Mesh[] = [];
  const wallBoxes: THREE.Box3[] = [];

  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const width = cols * CELL_SIZE;
  const depth = rows * CELL_SIZE;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color: 0x808080 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(width / 2 - CELL_SIZE / 2, 0, depth / 2 - CELL_SIZE / 2);
  group.add(floor);

  const wallGeometry = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (grid[row][col] !== 1) continue;

      const wall = new THREE.Mesh(wallGeometry, wallMaterial);
      wall.position.set(col * CELL_SIZE, WALL_HEIGHT / 2, row * CELL_SIZE);
      group.add(wall);
      walls.push(wall);
      wallBoxes.push(computeCollisionBox(wall));
      raycastRegistry.register(wall);
    }
  }

  return { group, walls, wallBoxes };
}

export function getSpawnPosition(map: MapDef): { x: number; y: number; z: number } {
  const spawn = map.entities.find((entity) => entity.type === "spawn");
  if (!spawn) throw new Error(`Map "${map.id}" has no spawn entity`);

  const [x, y, z] = spawn.position;
  return { x, y, z };
}
```

Note: this will not yet compile as part of the whole project (main.ts still calls `loadMap(mapDef.grid)` with one argument) — that's expected and fixed in Task 11. Don't run a full build after this step in isolation; proceed to the remaining tasks first.

---

## Task 3: Wire RaycastRegistry into MapEntitySystem + door-state-change hook

**Files:**
- Modify: `src/core/MapEntitySystem.ts`

**Interfaces:**
- Consumes: `RaycastRegistry.register` (Task 1), `computeCollisionBox` (Task 1).
- Produces: `MapEntitySystem` constructor now takes `(mapDef, weaponSystem, runManager, raycastRegistry, onDoorStateChanged: () => void)` — `onDoorStateChanged` is called every time a door's `visible` flag changes (button press, or a RunManager-triggered reset reopening it), so `PlayerController` (Task 7) can keep its cached collision boxes in sync without rebuilding them every frame.

- [ ] **Step 1: Replace the full contents of `src/core/MapEntitySystem.ts`**

```typescript
import * as THREE from "three";
import { CELL_SIZE, WALL_HEIGHT } from "./MapLoader";
import { computeCollisionBox } from "./utils/CollisionBox";
import type { MapDef, MapEntity } from "../types";
import type { WeaponSystem } from "./WeaponSystem";
import type { RunManager } from "./RunManager";
import type { RaycastRegistry } from "./RaycastRegistry";

const DOOR_COLOR = 0x8b5a2b;
const BUTTON_COLOR = 0xcc2222;
const BUTTON_EMISSIVE = 0x330000;
const BUTTON_SIZE = 0.4;
const PICKUP_COLOR = 0x22aacc;
const PICKUP_EMISSIVE = 0x003344;
const PICKUP_SIZE = 0.4;
const PICKUP_AMMO_AMOUNT = 24;

export interface DoorEntry {
  mesh: THREE.Mesh;
  box: THREE.Box3;
}

// Spawns one mesh per door/button/pickup MapEntity and wires their
// interaction behavior. Kept separate from MapLoader: MapLoader's job is
// grid-to-geometry and spawn lookup, this is entity behavior — a different
// responsibility per the single-responsibility-per-file rule.
export class MapEntitySystem {
  readonly group = new THREE.Group();
  readonly doors: DoorEntry[] = [];
  readonly interactables: THREE.Mesh[] = [];

  constructor(
    mapDef: MapDef,
    weaponSystem: WeaponSystem,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
  ) {
    const doorMeshById = new Map<string, THREE.Mesh>();

    for (const entity of mapDef.entities) {
      if (entity.type === "door") {
        doorMeshById.set(
          entity.id,
          this.createDoor(entity, runManager, raycastRegistry, onDoorStateChanged),
        );
      }
    }

    for (const entity of mapDef.entities) {
      if (entity.type === "button") {
        this.createButton(entity, doorMeshById, raycastRegistry, onDoorStateChanged);
      } else if (entity.type === "pickup") {
        this.createPickup(entity, weaponSystem, runManager, raycastRegistry);
      }
    }
  }

  get doorMeshes(): THREE.Mesh[] {
    return this.doors.map((door) => door.mesh);
  }

  private createDoor(
    entity: MapEntity,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE),
      new THREE.MeshStandardMaterial({ color: DOOR_COLOR }),
    );
    mesh.position.set(...entity.position);
    this.group.add(mesh);
    raycastRegistry.register(mesh);

    const box = computeCollisionBox(mesh);
    this.doors.push({ mesh, box });

    runManager.registerResettable(() => {
      mesh.visible = true;
      onDoorStateChanged();
    });

    return mesh;
  }

  private createButton(
    entity: MapEntity,
    doorMeshById: Map<string, THREE.Mesh>,
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
  ): void {
    const door = entity.linkedTo ? doorMeshById.get(entity.linkedTo) : undefined;
    if (!door) {
      throw new Error(
        `Button "${entity.id}" has no matching door for linkedTo "${entity.linkedTo}"`,
      );
    }

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(BUTTON_SIZE, BUTTON_SIZE, BUTTON_SIZE),
      new THREE.MeshStandardMaterial({
        color: BUTTON_COLOR,
        emissive: BUTTON_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      if (!door.visible) return; // idempotent: door already open
      door.visible = false;
      onDoorStateChanged();
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);
  }

  private createPickup(
    entity: MapEntity,
    weaponSystem: WeaponSystem,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
  ): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(PICKUP_SIZE, PICKUP_SIZE, PICKUP_SIZE),
      new THREE.MeshStandardMaterial({
        color: PICKUP_COLOR,
        emissive: PICKUP_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      if (!mesh.visible) return; // idempotent: already collected
      weaponSystem.addReserveAmmo(PICKUP_AMMO_AMOUNT);
      mesh.visible = false;
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);

    runManager.registerResettable(() => {
      mesh.visible = true;
    });
  }
}
```

Note: pickups don't get `onDoorStateChanged` — they're never part of `PlayerController`'s collision boxes, only doors are.

---

## Task 4: Wire RaycastRegistry into WeaponSystem + fix reset() firing-flag gap

**Files:**
- Modify: `src/core/WeaponSystem.ts`

**Interfaces:**
- Consumes: `RaycastRegistry.register/unregister/getAll` (Task 1).
- Produces: `WeaponSystem` constructor now takes `(camera, weapon, audioSystem, gameState, runManager, raycastRegistry)`. `addTarget()`/`removeTarget()` keep the same signatures but now delegate to the registry instead of maintaining their own array — `ShootingRange` (Task 10) keeps calling `weaponSystem.addTarget(mesh)` unchanged. `setTargets()` is removed (nothing needs to call it anymore — everything self-registers).

- [ ] **Step 1: Replace the full contents of `src/core/WeaponSystem.ts`**

```typescript
import * as THREE from "three";
import { Raycast } from "./utils/Raycast";
import type { AudioSystem } from "./AudioSystem";
import type { Weapon } from "../types";
import type { GameState } from "../state/GameState";
import type { RunManager } from "./RunManager";
import type { RaycastRegistry } from "./RaycastRegistry";

export class WeaponSystem {
  currentAmmo: number;
  reserveAmmo: number;
  isReloading = false;

  private readonly raycast = new Raycast();
  private readonly clock = new THREE.Clock();
  private readonly raycastRegistry: RaycastRegistry;

  private timeSinceLastShot = Infinity;
  private reloadTimeRemaining = 0;
  private firing = false;

  private readonly camera: THREE.Camera;
  private readonly weapon: Weapon;
  private readonly audioSystem: AudioSystem;
  private readonly gameState: GameState;

  constructor(
    camera: THREE.Camera,
    weapon: Weapon,
    audioSystem: AudioSystem,
    gameState: GameState,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
  ) {
    this.camera = camera;
    this.weapon = weapon;
    this.currentAmmo = weapon.magSize;
    this.reserveAmmo = weapon.startingReserveAmmo;
    this.audioSystem = audioSystem;
    this.gameState = gameState;
    this.raycastRegistry = raycastRegistry;

    window.addEventListener("mousedown", this.handleMouseDown);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("keydown", this.handleKeyDown);

    runManager.registerResettable(() => this.reset());
  }

  // Lets a dynamically spawned/despawned object (e.g. a ZombieSurvival enemy
  // or a ShootingRange target) join or leave the shared raycast registry
  // without WeaponSystem needing to know about rounds/spawning — it just
  // delegates to the one shared registry every raycasting system reads from.
  addTarget(target: THREE.Object3D): void {
    this.raycastRegistry.register(target);
  }

  removeTarget(target: THREE.Object3D): void {
    this.raycastRegistry.unregister(target);
  }

  addReserveAmmo(amount: number): void {
    this.reserveAmmo += amount;
  }

  reset(): void {
    this.currentAmmo = this.weapon.magSize;
    this.reserveAmmo = this.weapon.startingReserveAmmo;
    this.isReloading = false;
    this.reloadTimeRemaining = 0;
    this.timeSinceLastShot = Infinity;
    this.firing = false;
  }

  update(): void {
    const delta = this.clock.getDelta();
    this.timeSinceLastShot += delta;

    if (this.isReloading) {
      this.reloadTimeRemaining -= delta;
      if (this.reloadTimeRemaining <= 0) this.finishReload();
    } else if (
      !this.gameState.paused &&
      this.gameState.playerState === "alive" &&
      this.firing &&
      this.currentAmmo > 0 &&
      this.timeSinceLastShot >= this.weapon.fireRate
    ) {
      this.fire();
    }

    this.gameState.weaponName = this.weapon.name;
    this.gameState.currentAmmo = this.currentAmmo;
    this.gameState.reserveAmmo = this.reserveAmmo;
    this.gameState.isReloading = this.isReloading;
  }

  private fire(): void {
    this.timeSinceLastShot = 0;
    this.currentAmmo -= 1;

    const hit = this.raycast.fromCamera(this.camera, this.raycastRegistry.getAll());
    const onHit = hit?.object.userData.onHit as
      | ((damage: number) => void)
      | undefined;
    onHit?.(this.weapon.damage);

    this.audioSystem.play(this.weapon.fireSoundId);
  }

  private startReload(): void {
    if (this.isReloading) return;
    if (this.currentAmmo >= this.weapon.magSize) return;
    if (this.reserveAmmo <= 0) return;

    this.isReloading = true;
    this.reloadTimeRemaining = this.weapon.reloadTime;
  }

  private finishReload(): void {
    const needed = this.weapon.magSize - this.currentAmmo;
    const loaded = Math.min(needed, this.reserveAmmo);
    this.currentAmmo += loaded;
    this.reserveAmmo -= loaded;
    this.isReloading = false;
  }

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (event.button === 0) this.firing = true;
  };

  private readonly handleMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.firing = false;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (
      event.code === "KeyR" &&
      !this.gameState.paused &&
      this.gameState.playerState === "alive"
    ) {
      this.startReload();
    }
  };
}
```

---

## Task 5: Wire RaycastRegistry into EnemyAI + self-exclusion from its own LOS check

**Files:**
- Modify: `src/core/EnemyAI.ts`

**Interfaces:**
- Consumes: `RaycastRegistry.register/unregister/getAll` (Task 1).
- Produces: `EnemyAI` constructor drops the `weaponSystem: WeaponSystem` and `wallTargets: THREE.Object3D[]` parameters entirely, replacing both with a single `raycastRegistry: RaycastRegistry` parameter (new 9-parameter constructor: `id, def, spawnPosition, scene, camera, audioSystem, gameState, playerState, raycastRegistry`). Each instance tags its own mesh with `userData.enemyId = this.id` (consumed by HUD in Task 8 to exclude an enemy's own mesh from its own label's occlusion check).

- [ ] **Step 1: Replace the full contents of `src/core/EnemyAI.ts`**

```typescript
import * as THREE from "three";
import { Raycast } from "./utils/Raycast";
import { StateMachine } from "./utils/StateMachine";
import { applyDamage } from "./utils/Health";
import type { AudioSystem } from "./AudioSystem";
import type { PlayerState } from "./PlayerState";
import type { RaycastRegistry } from "./RaycastRegistry";
import type { EnemyDef } from "../types";
import type { GameState } from "../state/GameState";

type ZombieState = "idle" | "chase" | "attack";

const LABEL_HEIGHT_OFFSET = 1;
const SCORE_PER_HIT = 10;
const SCORE_PER_KILL = 50;

// One instance per spawned enemy — ZombieSurvival creates and destroys these
// per round, so each instance owns its own mesh, health, and state machine
// independently rather than being a single hardcoded singleton.
export class EnemyAI {
  readonly id: string;
  readonly mesh: THREE.Mesh;

  health: number;
  dead = false;

  private readonly def: EnemyDef;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly audioSystem: AudioSystem;
  private readonly gameState: GameState;
  private readonly playerState: PlayerState;
  private readonly raycastRegistry: RaycastRegistry;

  private readonly raycast = new Raycast();
  private readonly clock = new THREE.Clock();
  private readonly moveDirection = new THREE.Vector3();
  private readonly stateMachine: StateMachine<ZombieState, EnemyAI>;

  private timeSinceGrowl = 0;
  private timeSinceAttack = 0;

  constructor(
    id: string,
    def: EnemyDef,
    spawnPosition: THREE.Vector3,
    scene: THREE.Scene,
    camera: THREE.Camera,
    audioSystem: AudioSystem,
    gameState: GameState,
    playerState: PlayerState,
    raycastRegistry: RaycastRegistry,
  ) {
    this.id = id;
    this.def = def;
    this.scene = scene;
    this.camera = camera;
    this.audioSystem = audioSystem;
    this.gameState = gameState;
    this.playerState = playerState;
    this.raycastRegistry = raycastRegistry;
    this.health = def.health;

    this.mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, 1, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a6741 }),
    );
    this.mesh.position.copy(spawnPosition);
    this.mesh.userData.onHit = (damage: number): void => this.takeDamage(damage);
    this.mesh.userData.enemyId = this.id;
    this.scene.add(this.mesh);
    this.raycastRegistry.register(this.mesh);

    this.stateMachine = new StateMachine<ZombieState, EnemyAI>(
      "idle",
      {
        idle: {},
        chase: {
          onEnter: (self) => {
            self.timeSinceGrowl = 0;
          },
          onUpdate: (self, delta) => self.updateChase(delta),
        },
        attack: {
          onEnter: (self) => {
            self.timeSinceAttack = self.def.attackInterval;
          },
          onUpdate: (self, delta) => self.updateAttack(delta),
        },
      },
      this,
    );
  }

  update(): void {
    const delta = this.clock.getDelta();
    if (this.dead) return;

    const distance = this.mesh.position.distanceTo(this.camera.position);
    const hasLineOfSight = this.hasLineOfSight();

    if (distance <= this.def.meleeRange && hasLineOfSight) {
      this.stateMachine.transition("attack");
    } else if (distance <= this.def.sightRange && hasLineOfSight) {
      this.stateMachine.transition("chase");
    } else {
      this.stateMachine.transition("idle");
    }

    this.stateMachine.update(delta);

    this.gameState.enemyHealth[this.id] = {
      current: this.health,
      max: this.def.health,
      position: {
        x: this.mesh.position.x,
        y: this.mesh.position.y + LABEL_HEIGHT_OFFSET,
        z: this.mesh.position.z,
      },
    };
  }

  // Removes this enemy from the world without treating it as a kill: no
  // score, no death sound. Used both by a natural death (via onDeath below)
  // and by ZombieSurvival forcibly clearing the board on a new run. Safe to
  // call more than once — only the first call has any effect.
  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    delete this.gameState.enemyHealth[this.id];
    this.raycastRegistry.unregister(this.mesh);
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }

  private hasLineOfSight(): boolean {
    const origin = this.mesh.position;
    const toPlayer = new THREE.Vector3().subVectors(
      this.camera.position,
      origin,
    );
    const distance = toPlayer.length();
    if (distance < 1e-6) return true;

    const direction = toPlayer.normalize();
    // Excludes this enemy's own mesh: the ray originates at its center, so
    // without this filter it could immediately re-intersect its own geometry
    // and report itself as blocking its own line of sight. Other enemies are
    // deliberately left in — one zombie standing in front of another is a
    // legitimate line-of-sight blocker now that both share the one registry.
    const targets = this.raycastRegistry
      .getAll()
      .filter((object) => object !== this.mesh);
    const hit = this.raycast.fromOrigin(origin, direction, targets, distance);
    return hit === null;
  }

  private updateChase(delta: number): void {
    this.moveDirection.set(
      this.camera.position.x - this.mesh.position.x,
      0,
      this.camera.position.z - this.mesh.position.z,
    );
    if (this.moveDirection.lengthSq() > 0) {
      this.moveDirection.normalize();
      const step = this.def.speed * delta;
      this.mesh.position.x += this.moveDirection.x * step;
      this.mesh.position.z += this.moveDirection.z * step;
    }

    this.timeSinceGrowl += delta;
    if (this.timeSinceGrowl >= this.def.growlInterval) {
      this.timeSinceGrowl = 0;
      this.audioSystem.playAt(this.def.growlSoundId, this.mesh);
    }
  }

  private updateAttack(delta: number): void {
    this.timeSinceAttack += delta;
    if (this.timeSinceAttack >= this.def.attackInterval) {
      this.timeSinceAttack = 0;
      this.playerState.applyDamage(this.def.meleeDamage);
    }
  }

  private takeDamage(damage: number): void {
    if (this.dead) return;

    this.gameState.addScore(SCORE_PER_HIT);
    this.health = applyDamage(this.health, damage, () => this.onDeath());
  }

  private onDeath(): void {
    this.gameState.addScore(SCORE_PER_KILL);
    this.audioSystem.playAt(this.def.deathSoundId, this.mesh);
    this.destroy();
  }
}
```

---

## Task 6: Wire RaycastRegistry into InteractSystem + restore the interactable gate

**Files:**
- Modify: `src/core/InteractSystem.ts`

**Interfaces:**
- Consumes: `RaycastRegistry.getAll` (Task 1).
- Produces: `InteractSystem` constructor now takes `(camera, gameState, raycastRegistry)`. `setTargets()` is removed. `tryInteract()` now requires `userData.interactable === true` in addition to `userData.onInteract` existing, restoring the checkpoint-6 invariant that these are separate concerns.

- [ ] **Step 1: Replace the full contents of `src/core/InteractSystem.ts`**

```typescript
import * as THREE from "three";
import { Raycast } from "./utils/Raycast";
import type { GameState } from "../state/GameState";
import type { RaycastRegistry } from "./RaycastRegistry";

const INTERACT_DISTANCE = 4;

export class InteractSystem {
  private readonly raycast = new Raycast();
  private readonly raycastRegistry: RaycastRegistry;

  private readonly camera: THREE.Camera;
  private readonly gameState: GameState;

  constructor(camera: THREE.Camera, gameState: GameState, raycastRegistry: RaycastRegistry) {
    this.camera = camera;
    this.gameState = gameState;
    this.raycastRegistry = raycastRegistry;

    window.addEventListener("keydown", this.handleKeyDown);
  }

  update(): void {
    this.gameState.canInteract = !this.gameState.paused && this.isLookingAtInteractable();
  }

  isLookingAtInteractable(): boolean {
    const hit = this.raycast.fromCamera(
      this.camera,
      this.raycastRegistry.getAll(),
      INTERACT_DISTANCE,
    );
    return hit !== null && hit.object.userData.interactable === true;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "KeyE" || event.repeat) return;
    if (this.gameState.paused) return;
    this.tryInteract();
  };

  private tryInteract(): void {
    const hit = this.raycast.fromCamera(
      this.camera,
      this.raycastRegistry.getAll(),
      INTERACT_DISTANCE,
    );
    if (!hit || hit.object.userData.interactable !== true) return;

    const onInteract = hit.object.userData.onInteract as (() => void) | undefined;
    onInteract?.();
  }
}
```

---

## Task 7: Cache PlayerController's door collision boxes

**Files:**
- Modify: `src/core/PlayerController.ts`

**Interfaces:**
- Produces: `PlayerController.rebuildCollisionBoxes(): void` — public method that recomputes the cached `collisionBoxes` list from `wallBoxes` + currently-visible door boxes. Called internally by `setWallBoxes()`/`setDoors()`, and externally by `MapEntitySystem`'s `onDoorStateChanged` callback (wired in Task 11) every time a door's visibility actually changes.

- [ ] **Step 1: Replace the full contents of `src/core/PlayerController.ts`**

```typescript
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
  private collisionBoxes: THREE.Box3[] = [];

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
```

---

## Task 8: Wire RaycastRegistry into HUD + enemy self-exclusion for label occlusion

**Files:**
- Modify: `src/ui/HUD.ts`

**Interfaces:**
- Consumes: `RaycastRegistry.getAll` (Task 1), `mesh.userData.enemyId` tag (Task 5).
- Produces: `HUD` constructor now takes an additional `raycastRegistry: RaycastRegistry` parameter (after `onMainMenu`). `setOcclusionTargets()` is removed. `isOccluded()` now takes `(worldPos, excludeEnemyId: string)` and filters out any registry object tagged with that enemy's id, so an enemy's own mesh never occludes its own label (the label sits only ~0.1 units above the capsule's own top point, so without this exclusion a close/steep viewing angle would frequently clip the enemy's own head).

- [ ] **Step 1: Replace the full contents of `src/ui/HUD.ts`**

```typescript
import * as THREE from "three";
import { Raycast } from "../core/utils/Raycast";
import type { GameState } from "../state/GameState";
import type { GameMode } from "../modes/GameMode";
import type { RaycastRegistry } from "../core/RaycastRegistry";

const RELOAD_PROMPT_DELAY_MS = 1000;

function createDiv(styles: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, styles);
  return el;
}

function createButton(
  label: string,
  styles: Partial<CSSStyleDeclaration>,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  Object.assign(button.style, {
    pointerEvents: "auto",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: "16px",
    padding: "10px 24px",
    border: "none",
    borderRadius: "4px",
    color: "#f0f0f0",
    ...styles,
  });
  button.addEventListener("click", onClick);
  return button;
}

export class HUD {
  private readonly gameState: GameState;
  private readonly gameMode: GameMode;
  private readonly camera: THREE.Camera;
  private readonly raycastRegistry: RaycastRegistry;
  private readonly root: HTMLDivElement;

  private readonly crosshairEl: HTMLDivElement;
  private readonly weaponNameEl: HTMLDivElement;
  private readonly ammoCountEl: HTMLDivElement;
  private readonly statusEl: HTMLDivElement;
  private readonly interactEl: HTMLDivElement;
  private readonly healthEl: HTMLDivElement;
  private readonly scoreEl: HTMLDivElement;
  private readonly modeStatusEl: HTMLDivElement;
  private readonly deathPanelEl: HTMLDivElement;
  private readonly deathScoreEl: HTMLDivElement;
  private readonly deathSummaryEl: HTMLDivElement;

  private readonly enemyLabels = new Map<string, HTMLDivElement>();
  private readonly raycast = new Raycast();

  private emptySince: number | null = null;

  constructor(
    gameState: GameState,
    gameMode: GameMode,
    camera: THREE.Camera,
    onRespawn: () => void,
    onMainMenu: () => void,
    raycastRegistry: RaycastRegistry,
  ) {
    this.gameState = gameState;
    this.gameMode = gameMode;
    this.camera = camera;
    this.raycastRegistry = raycastRegistry;

    const root = createDiv({
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "10",
      fontFamily: "monospace",
      color: "#f0f0f0",
      textShadow: "0 1px 2px rgba(0, 0, 0, 0.8)",
      userSelect: "none",
    });
    this.root = root;

    this.crosshairEl = this.buildCrosshair();
    root.appendChild(this.crosshairEl);

    const promptStack = createDiv({
      position: "absolute",
      top: "56%",
      left: "50%",
      transform: "translateX(-50%)",
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "4px",
    });
    this.statusEl = createDiv({ fontSize: "14px" });
    this.interactEl = createDiv({ fontSize: "14px" });
    promptStack.appendChild(this.statusEl);
    promptStack.appendChild(this.interactEl);
    root.appendChild(promptStack);

    const ammoBox = createDiv({
      position: "absolute",
      right: "24px",
      bottom: "24px",
      textAlign: "right",
    });
    this.weaponNameEl = createDiv({
      fontSize: "13px",
      opacity: "0.8",
      letterSpacing: "0.05em",
    });
    this.ammoCountEl = createDiv({ fontSize: "22px", fontWeight: "bold" });
    ammoBox.appendChild(this.weaponNameEl);
    ammoBox.appendChild(this.ammoCountEl);
    root.appendChild(ammoBox);

    this.healthEl = createDiv({
      position: "absolute",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      fontSize: "18px",
      fontWeight: "bold",
    });
    root.appendChild(this.healthEl);

    this.scoreEl = createDiv({
      position: "absolute",
      top: "24px",
      right: "24px",
      fontSize: "16px",
      fontWeight: "bold",
    });
    root.appendChild(this.scoreEl);

    this.modeStatusEl = createDiv({
      position: "absolute",
      top: "24px",
      left: "24px",
      fontSize: "16px",
      fontWeight: "bold",
    });
    root.appendChild(this.modeStatusEl);

    this.deathPanelEl = createDiv({
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      display: "none",
      flexDirection: "column",
      alignItems: "center",
      gap: "16px",
      padding: "32px 48px",
      background: "rgba(0, 0, 0, 0.75)",
      borderRadius: "8px",
      textAlign: "center",
      pointerEvents: "auto",
    });

    const heading = createDiv({
      fontSize: "40px",
      fontWeight: "bold",
      color: "#d94040",
      letterSpacing: "0.1em",
    });
    heading.textContent = "YOU DIED";

    this.deathScoreEl = createDiv({ fontSize: "18px" });
    this.deathSummaryEl = createDiv({ fontSize: "18px", whiteSpace: "pre-line" });

    const buttonRow = createDiv({ display: "flex", gap: "16px" });
    const respawnButton = createButton(
      "Respawn",
      { background: "#3a6b3a" },
      onRespawn,
    );
    // Placeholder: identical to Respawn until checkpoint 9 gives the main
    // menu (mode select / loadout screens) real behavior to return to.
    const mainMenuButton = createButton(
      "Main Menu",
      { background: "#444" },
      onMainMenu,
    );
    buttonRow.appendChild(respawnButton);
    buttonRow.appendChild(mainMenuButton);

    this.deathPanelEl.appendChild(heading);
    this.deathPanelEl.appendChild(this.deathScoreEl);
    this.deathPanelEl.appendChild(this.deathSummaryEl);
    this.deathPanelEl.appendChild(buttonRow);
    root.appendChild(this.deathPanelEl);

    document.body.appendChild(root);
  }

  private buildCrosshair(): HTMLDivElement {
    const crosshair = createDiv({
      position: "absolute",
      top: "50%",
      left: "50%",
      width: "0",
      height: "0",
    });

    const segment = (styles: Partial<CSSStyleDeclaration>): HTMLDivElement =>
      createDiv({
        position: "absolute",
        background: "rgba(255, 255, 255, 0.85)",
        ...styles,
      });

    crosshair.appendChild(
      segment({ width: "2px", height: "6px", left: "-1px", top: "-10px" }),
    );
    crosshair.appendChild(
      segment({ width: "2px", height: "6px", left: "-1px", top: "4px" }),
    );
    crosshair.appendChild(
      segment({ width: "6px", height: "2px", left: "-10px", top: "-1px" }),
    );
    crosshair.appendChild(
      segment({ width: "6px", height: "2px", left: "4px", top: "-1px" }),
    );

    return crosshair;
  }

  update(): void {
    const alive = this.gameState.playerState === "alive";
    this.crosshairEl.style.display = alive ? "block" : "none";

    if (alive) {
      this.updateAmmo();
      this.updateStatusPrompt();
      this.updateInteractPrompt();
      this.updateHealth();
    } else {
      this.clearAliveOnlyText();
    }

    this.updateScore();
    this.updateModeStatus();
    this.updateEnemyLabels();
    this.updateDeathPanel();
  }

  private clearAliveOnlyText(): void {
    this.weaponNameEl.textContent = "";
    this.ammoCountEl.textContent = "";
    this.statusEl.textContent = "";
    this.interactEl.textContent = "";
    this.healthEl.textContent = "";
  }

  private updateAmmo(): void {
    this.weaponNameEl.textContent = this.gameState.weaponName;
    this.ammoCountEl.textContent = `${this.gameState.currentAmmo} / ${this.gameState.reserveAmmo}`;
  }

  private updateStatusPrompt(): void {
    const { currentAmmo, reserveAmmo, isReloading } = this.gameState;

    if (isReloading) {
      this.emptySince = null;
      this.statusEl.textContent = "";
      return;
    }

    if (currentAmmo === 0 && reserveAmmo === 0) {
      this.emptySince = null;
      this.statusEl.textContent = "No ammo";
      return;
    }

    if (currentAmmo === 0 && reserveAmmo > 0) {
      if (this.emptySince === null) this.emptySince = performance.now();
      const elapsed = performance.now() - this.emptySince;
      this.statusEl.textContent =
        elapsed >= RELOAD_PROMPT_DELAY_MS ? "Press R to reload" : "";
      return;
    }

    this.emptySince = null;
    this.statusEl.textContent = "";
  }

  private updateInteractPrompt(): void {
    this.interactEl.textContent = this.gameState.canInteract
      ? "Press E to interact"
      : "";
  }

  private updateHealth(): void {
    this.healthEl.textContent = `HP: ${this.gameState.playerHealth}`;
  }

  private updateScore(): void {
    this.scoreEl.textContent = `Score: ${this.gameState.score}`;
  }

  private updateModeStatus(): void {
    this.modeStatusEl.textContent = this.gameMode.getStatusLine();
  }

  private updateDeathPanel(): void {
    const dead = this.gameState.playerState === "dead";
    this.deathPanelEl.style.display = dead ? "flex" : "none";
    if (dead) {
      this.deathScoreEl.textContent = `Score: ${this.gameState.score}`;
      this.deathSummaryEl.textContent = this.gameState.deathSummaryLines.join("\n");
    }
  }

  // Debug/test aid: floating current/max labels above each enemy, projected
  // from world space every frame. Not meant to ship as-is — replace with a
  // real health bar (or hide entirely) once the game is closer to
  // presentable.
  private updateEnemyLabels(): void {
    const seen = new Set<string>();

    for (const [id, entry] of Object.entries(this.gameState.enemyHealth)) {
      seen.add(id);

      let label = this.enemyLabels.get(id);
      if (!label) {
        label = createDiv({
          position: "absolute",
          transform: "translate(-50%, -100%)",
          fontSize: "12px",
          whiteSpace: "nowrap",
        });
        this.enemyLabels.set(id, label);
        this.root.appendChild(label);
      }

      const worldPos = new THREE.Vector3(
        entry.position.x,
        entry.position.y,
        entry.position.z,
      );
      const screen = this.projectToScreen(worldPos);

      if (screen === null || this.isOccluded(worldPos, id)) {
        label.style.display = "none";
        continue;
      }

      label.style.display = "block";
      label.style.left = `${screen.x}px`;
      label.style.top = `${screen.y}px`;
      label.textContent = `${entry.current}/${entry.max}`;
    }

    for (const [id, label] of this.enemyLabels) {
      if (!seen.has(id)) {
        label.remove();
        this.enemyLabels.delete(id);
      }
    }
  }

  private projectToScreen(worldPos: THREE.Vector3): { x: number; y: number } | null {
    const toTarget = worldPos.clone().sub(this.camera.position);
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    if (toTarget.dot(forward) <= 0) return null;

    const ndc = worldPos.clone().project(this.camera);
    return {
      x: (ndc.x * 0.5 + 0.5) * window.innerWidth,
      y: (-ndc.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  // excludeEnemyId leaves the labeled enemy's own mesh out of its occlusion
  // check: the label sits only slightly above the enemy's own model, so
  // without this a close/steep viewing angle could clip the enemy's own head
  // and falsely report itself as occluding its own label.
  private isOccluded(worldPos: THREE.Vector3, excludeEnemyId: string): boolean {
    const origin = this.camera.position;
    const toTarget = worldPos.clone().sub(origin);
    const distance = toTarget.length();
    if (distance < 1e-6) return false;

    const direction = toTarget.normalize();
    const targets = this.raycastRegistry
      .getAll()
      .filter((object) => object.userData.enemyId !== excludeEnemyId);
    const hit = this.raycast.fromOrigin(origin, direction, targets, distance);
    return hit !== null;
  }
}
```

---

## Task 9: Refactor ZombieSurvival onto RaycastRegistry and Countdown

**Files:**
- Modify: `src/modes/ZombieSurvival.ts`

**Interfaces:**
- Consumes: `RaycastRegistry` (Task 1, passed through to `EnemyAI`, Task 5's new constructor shape), `Countdown` (Task 1).
- Produces: `ZombieSurvival` constructor drops `weaponSystem: WeaponSystem` and `wallTargets: THREE.Object3D[]`, replacing both with one `raycastRegistry: RaycastRegistry` parameter (new 9-parameter constructor: `enemyDef, spawnPoints, scene, camera, audioSystem, gameState, playerState, raycastRegistry, runManager`).

- [ ] **Step 1: Replace the full contents of `src/modes/ZombieSurvival.ts`**

```typescript
import * as THREE from "three";
import { EnemyAI } from "../core/EnemyAI";
import { Countdown } from "../core/utils/Countdown";
import type { GameMode } from "./GameMode";
import type { AudioSystem } from "../core/AudioSystem";
import type { PlayerState } from "../core/PlayerState";
import type { RaycastRegistry } from "../core/RaycastRegistry";
import type { RunManager } from "../core/RunManager";
import type { GameState } from "../state/GameState";
import type { EnemyDef } from "../types";

const ROUND_TRANSITION_DELAY = 3; // seconds after the last zombie dies before the next round starts

// Hardcoded on purpose (per the project's mode-building rule: modes are
// built hardcoded first, a GameMode interface only gets extracted once a
// second mode proves the shape is right — checkpoint 8's ShootingRange).
// Owns the enemy lifecycle entirely: main.ts just constructs this once and
// calls update() every frame; it doesn't touch EnemyAI directly.
export class ZombieSurvival implements GameMode {
  currentRound = 1;

  private activeEnemies: EnemyAI[] = [];
  private readonly roundTransitionCountdown = new Countdown();

  private readonly enemyDef: EnemyDef;
  private readonly spawnPoints: THREE.Vector3[];
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly audioSystem: AudioSystem;
  private readonly gameState: GameState;
  private readonly playerState: PlayerState;
  private readonly raycastRegistry: RaycastRegistry;

  constructor(
    enemyDef: EnemyDef,
    spawnPoints: THREE.Vector3[],
    scene: THREE.Scene,
    camera: THREE.Camera,
    audioSystem: AudioSystem,
    gameState: GameState,
    playerState: PlayerState,
    raycastRegistry: RaycastRegistry,
    runManager: RunManager,
  ) {
    if (spawnPoints.length === 0) {
      throw new Error("ZombieSurvival requires at least one enemy_spawn point");
    }

    this.enemyDef = enemyDef;
    this.spawnPoints = spawnPoints;
    this.scene = scene;
    this.camera = camera;
    this.audioSystem = audioSystem;
    this.gameState = gameState;
    this.playerState = playerState;
    this.raycastRegistry = raycastRegistry;

    runManager.registerResettable(() => this.resetRun());
  }

  start(): void {
    this.startRound();
  }

  update(deltaTime: number): void {
    for (const enemy of this.activeEnemies) enemy.update();

    if (this.roundTransitionCountdown.active) {
      this.roundTransitionCountdown.update(deltaTime, () => {
        this.currentRound += 1;
        this.startRound();
      });
      return;
    }

    if (
      this.activeEnemies.length > 0 &&
      this.activeEnemies.every((enemy) => enemy.dead)
    ) {
      this.roundTransitionCountdown.start(ROUND_TRANSITION_DELAY);
    }
  }

  getStatusLine(): string {
    return `Round: ${this.currentRound}`;
  }

  getSummaryLines(): string[] {
    return [`Survived ${this.currentRound} rounds`];
  }

  private zombiesForRound(round: number): number {
    return round;
  }

  private startRound(): void {
    const count = this.zombiesForRound(this.currentRound);
    this.activeEnemies = [];

    for (let i = 0; i < count; i++) {
      const spawnPoint = this.spawnPoints[i % this.spawnPoints.length];
      const enemy = new EnemyAI(
        `zombie-r${this.currentRound}-${i}`,
        this.enemyDef,
        spawnPoint,
        this.scene,
        this.camera,
        this.audioSystem,
        this.gameState,
        this.playerState,
        this.raycastRegistry,
      );
      this.activeEnemies.push(enemy);
    }
  }

  private resetRun(): void {
    for (const enemy of this.activeEnemies) enemy.destroy();
    this.activeEnemies = [];
    this.roundTransitionCountdown.stop();
    this.currentRound = 1;
    this.startRound();
  }
}
```

---

## Task 10: Refactor ShootingRange onto Countdown

**Files:**
- Modify: `src/modes/ShootingRange.ts`

**Interfaces:**
- Consumes: `Countdown` (Task 1). `weaponSystem.addTarget()` keeps the exact same signature (Task 4 made it delegate internally, so this file needs no signature change).

- [ ] **Step 1: Replace the full contents of `src/modes/ShootingRange.ts`**

```typescript
import * as THREE from "three";
import { Countdown } from "../core/utils/Countdown";
import type { GameMode } from "./GameMode";
import type { WeaponSystem } from "../core/WeaponSystem";
import type { RunManager } from "../core/RunManager";
import type { GameState } from "../state/GameState";

const TARGET_SCORE = 25;
const TARGET_COOLDOWN = 2; // seconds before a hit target becomes hittable again
const TARGET_SIZE = 0.6;
const TARGET_COLOR = 0xdddddd;

interface TargetEntry {
  mesh: THREE.Mesh;
  cooldown: Countdown;
}

// Hardcoded on purpose, like ZombieSurvival — the second mode implementing
// GameMode, proving the interface's shape rather than designing it in the
// abstract. No rounds, no enemies, no player damage: this mode never touches
// playerState at all.
export class ShootingRange implements GameMode {
  private readonly targets: TargetEntry[] = [];
  private readonly gameState: GameState;

  constructor(
    targetPositions: THREE.Vector3[],
    scene: THREE.Scene,
    weaponSystem: WeaponSystem,
    gameState: GameState,
    runManager: RunManager,
  ) {
    this.gameState = gameState;

    for (const position of targetPositions) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(TARGET_SIZE, TARGET_SIZE, TARGET_SIZE),
        new THREE.MeshStandardMaterial({ color: TARGET_COLOR }),
      );
      mesh.position.copy(position);
      scene.add(mesh);
      weaponSystem.addTarget(mesh);

      const entry: TargetEntry = { mesh, cooldown: new Countdown() };
      mesh.userData.onHit = (): void => this.hitTarget(entry);
      this.targets.push(entry);
    }

    runManager.registerResettable(() => this.resetRun());
  }

  start(): void {
    // Nothing to begin — targets are already live from construction.
  }

  update(deltaTime: number): void {
    for (const target of this.targets) {
      target.cooldown.update(deltaTime, () => {
        target.mesh.visible = true;
      });
    }
  }

  getStatusLine(): string {
    return "Shooting Range";
  }

  getSummaryLines(): string[] {
    // No natural "end" to a shooting-range session yet (no death, no win
    // condition) — see CLAUDE.md, this is an open question for checkpoint 9.
    return [];
  }

  private hitTarget(target: TargetEntry): void {
    if (!target.mesh.visible) return; // already on cooldown

    this.gameState.addScore(TARGET_SCORE);
    target.mesh.visible = false;
    target.cooldown.start(TARGET_COOLDOWN);
  }

  private resetRun(): void {
    for (const target of this.targets) {
      target.mesh.visible = true;
      target.cooldown.stop();
    }
  }
}
```

---

## Task 11: Update main.ts wiring + gate gameMode.update() on playerState

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–10 (`RaycastRegistry`, updated `loadMap`, `MapEntitySystem`, `WeaponSystem`, `InteractSystem`, `HUD`, `ZombieSurvival` constructor shapes).
- Produces: the fully-wired composition root. This is the task where the whole project should compile again.

- [ ] **Step 1: Replace the full contents of `src/main.ts`**

```typescript
import * as THREE from "three";
import { SceneManager } from "./core/Scene";
import { loadMap, getSpawnPosition } from "./core/MapLoader";
import { PlayerController } from "./core/PlayerController";
import { WeaponSystem } from "./core/WeaponSystem";
import { AudioSystem } from "./core/AudioSystem";
import { InteractSystem } from "./core/InteractSystem";
import { PlayerState } from "./core/PlayerState";
import { RunManager } from "./core/RunManager";
import { MapEntitySystem } from "./core/MapEntitySystem";
import { RaycastRegistry } from "./core/RaycastRegistry";
import type { GameMode } from "./modes/GameMode";
import { ZombieSurvival } from "./modes/ZombieSurvival";
import { ShootingRange } from "./modes/ShootingRange";
import { HUD } from "./ui/HUD";
import { GameState } from "./state/GameState";
import { findById } from "./core/utils/Lookup";
import { WEAPONS } from "./content/weapons";
import { ENEMIES } from "./content/enemies";
import { SOUNDS } from "./content/sounds";
import { MAPS } from "./content/maps";

// Placeholder mode selection until checkpoint 9's mode-select menu replaces
// this with a real runtime choice — do not build runtime mode-switching now.
// The `as` cast matters: without it, TS narrows this to the literal type of
// whatever's assigned (even under the wider annotation, since the variable
// is never reassigned), which turns the ACTIVE_MODE === "zombie" check below
// into a compile error ("no overlap") whenever this is set to "range".
type ModeName = "zombie" | "range";
const ACTIVE_MODE = "zombie" as ModeName;

const canvas = document.createElement("canvas");
document.body.appendChild(canvas);

const sceneManager = new SceneManager(canvas);
const gameState = new GameState();
const playerController = new PlayerController(
  sceneManager.camera,
  canvas,
  gameState,
);
// gameMode is assigned further down (it needs the map/weapon systems built
// first) but this callback only ever runs later, once the player has
// actually died, by which point construction has long finished.
let gameMode: GameMode;
// Releasing pointer lock on death is what makes the death-panel buttons
// clickable — PlayerState owns the alive/dead transition but not the DOM/
// pointer-lock machinery, so it's handed this as a callback rather than
// reaching into PlayerController directly. It also snapshots the active
// mode's summary lines into GameState once, at the exact moment of death,
// so the death panel can't change under the player if the mode's own state
// happens to advance in the background before Respawn is clicked.
const playerState = new PlayerState(gameState, () => {
  playerController.controls.unlock();
  gameState.deathSummaryLines = gameMode.getSummaryLines();
});
const runManager = new RunManager(gameState, playerState);

// The single shared "what can be hit/occluded by a ray" registry — every
// solid or interactable object (walls, doors, buttons, pickups, the
// placeholder interactable, enemies) registers itself here once, and every
// raycasting system (WeaponSystem's fire, EnemyAI's line-of-sight,
// InteractSystem's interact ray, HUD's label occlusion) reads the same list.
const raycastRegistry = new RaycastRegistry();

const mapDef = findById(MAPS, "test-grid");
const map = loadMap(mapDef.grid, raycastRegistry);
sceneManager.scene.add(map.group);
playerController.setWallBoxes(map.wallBoxes);
const spawnPosition = getSpawnPosition(mapDef);
playerController.setSpawn(spawnPosition.x, spawnPosition.z);

const audioSystem = new AudioSystem(sceneManager.camera);
void audioSystem.load(findById(SOUNDS, "pistol_fire"));
void audioSystem.load(findById(SOUNDS, "zombie_growl"));
void audioSystem.load(findById(SOUNDS, "zombie_death"));

const weaponSystem = new WeaponSystem(
  sceneManager.camera,
  findById(WEAPONS, "pistol"),
  audioSystem,
  gameState,
  runManager,
  raycastRegistry,
);

const mapEntitySystem = new MapEntitySystem(
  mapDef,
  weaponSystem,
  runManager,
  raycastRegistry,
  () => playerController.rebuildCollisionBoxes(),
);
sceneManager.scene.add(mapEntitySystem.group);
playerController.setDoors(mapEntitySystem.doors);

// Placeholder interactable: still hardcoded here, not a real MapEntity type —
// it predates doors/buttons/pickups (checkpoint 3) and has no map-entity
// shape of its own to migrate into.
const interactableBox = new THREE.Mesh(
  new THREE.BoxGeometry(0.6, 0.6, 0.6),
  new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x552200 }),
);
interactableBox.name = "placeholder box";
interactableBox.userData.interactable = true;
interactableBox.userData.onInteract = (): void => {
  console.log("Interacted with placeholder box");
};
interactableBox.position.set(2, 0.3, 8);
sceneManager.scene.add(interactableBox);
raycastRegistry.register(interactableBox);

const interactSystem = new InteractSystem(sceneManager.camera, gameState, raycastRegistry);

const enemySpawnPoints = mapDef.entities
  .filter((entity) => entity.type === "enemy_spawn")
  .map((entity) => new THREE.Vector3(...entity.position));

const targetPoints = mapDef.entities
  .filter((entity) => entity.type === "target")
  .map((entity) => new THREE.Vector3(...entity.position));

gameMode =
  ACTIVE_MODE === "zombie"
    ? new ZombieSurvival(
        findById(ENEMIES, "zombie"),
        enemySpawnPoints,
        sceneManager.scene,
        sceneManager.camera,
        audioSystem,
        gameState,
        playerState,
        raycastRegistry,
        runManager,
      )
    : new ShootingRange(
        targetPoints,
        sceneManager.scene,
        weaponSystem,
        gameState,
        runManager,
      );
gameMode.start();

function startNewRun(): void {
  runManager.startNewRun();
  playerController.setSpawn(spawnPosition.x, spawnPosition.z);
  playerController.controls.lock();
}

// "Main Menu" is a placeholder alias for startNewRun() until checkpoint 9
// gives it a real menu to return to.
const hud = new HUD(
  gameState,
  gameMode,
  sceneManager.camera,
  startNewRun,
  startNewRun,
  raycastRegistry,
);

canvas.addEventListener("click", () => {
  playerController.controls.lock();
});

document.addEventListener("pointerlockchange", () => {
  gameState.paused = document.pointerLockElement !== canvas;
});

const modeClock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  playerController.update();
  weaponSystem.update();
  interactSystem.update();
  // Always drain the clock so its internal reference stays fresh — otherwise
  // the frame gameplay resumes after death would report one huge deltaTime
  // spike (elapsed dead-screen time) into whichever mode is active.
  const delta = modeClock.getDelta();
  if (gameState.playerState === "alive") {
    gameMode.update(delta);
  }
  hud.update();
  sceneManager.render();
}

animate();
```

- [ ] **Step 2: Verify the project compiles**

Run: `npm run build`
Expected: succeeds with no TypeScript errors. If it doesn't, the error will point at exactly one of Tasks 2–11 having a signature mismatch — fix it there, not by patching around it in main.ts.

---

## Task 12: Manual verification, CLAUDE.md update, and commit

**Files:**
- Modify: `CLAUDE.md`

No new interfaces — this task is verification and documentation only.

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`
Open the printed local URL in a browser.

- [ ] **Step 2: Verify the registry fixes (ZombieSurvival mode, `ACTIVE_MODE = "zombie"`, the default)**

Walk through each of these and confirm the described behavior:
1. Click to lock pointer, walk to `pickup_1` (near the room's east side) or `button_1`, and stand so it's directly between you and a wall or a zombie you've lured there. Fire at whatever's behind the button/pickup: the shot should stop at the button/pickup (nothing behind it takes damage), not pass through.
2. Let a zombie walk so it's directly between you and `door_1`/`button_1`. Press E while aiming through the zombie's body: it should **not** trigger the door/button — the zombie should block the interact raycast the same way a wall would.
3. Stand close to a zombie and check its floating health-number label doesn't flicker/disappear as you move the camera around at different angles (this confirms the self-occlusion exclusion from Task 8 is working).
4. Let a zombie see you, then let it kill you. The instant the death screen ("YOU DIED") appears, confirm every other on-screen zombie **immediately** stops moving and stops growling — it should not move, attack, or make sound again until you click Respawn or Main Menu.
5. Click Respawn. Confirm: score/ammo/door/pickup/round all reset exactly as before (checkpoint 8 behavior unchanged), and the zombies that were frozen mid-chase are gone, replaced by a fresh round 1 zombie.

- [ ] **Step 3: Verify ShootingRange mode**

Temporarily edit `src/main.ts`, changing `const ACTIVE_MODE = "zombie" as ModeName;` to `const ACTIVE_MODE = "range" as ModeName;`, save, and confirm in the browser:
- No zombies spawn, HP never drops.
- Targets still award score, disappear on hit, and become hittable again after the 2-second cooldown (confirms the `Countdown` refactor in Task 10 didn't change behavior).
- Standing behind a target and firing at where a target would occlude something behind it still blocks the shot (targets were already in the registry via `weaponSystem.addTarget()`, unchanged).

Then revert `src/main.ts` back to `const ACTIVE_MODE = "zombie" as ModeName;` before committing.

- [ ] **Step 4: Verify checkpoint 1–8 behavior is otherwise unchanged**

- WASD movement collides with walls and closed doors the same as before (Task 7's caching didn't change collision behavior, only when it's recomputed).
- Reload (R), firing, and the "No ammo"/"Press R to reload" HUD prompts behave exactly as before.
- The interact prompt ("Press E to interact") still only appears when looking at something with `userData.interactable === true` (confirms Task 6's restored gate didn't break the existing button/pickup/placeholder-box prompt).

- [ ] **Step 5: Update `CLAUDE.md`**

Make these edits to `CLAUDE.md`:

In the folder structure tree, add the new files (insert `RaycastRegistry.ts` after `MapEntitySystem.ts`'s line, and `Countdown.ts`/`CollisionBox.ts` inside the `utils/` block after `Lookup.ts`'s line):

```
    RaycastRegistry.ts          [8.5, single shared "what can a ray hit/be blocked by" registry — replaces four hand-built target lists]
```

```
      Countdown.ts               [8.5, generic "count down by deltaTime, fire onZero" helper]
      CollisionBox.ts            [8.5, shared THREE.Box3.setFromObject(mesh) helper]
```

In the Checkpoints list, add a new line immediately after checkpoint 8's line:

```
8.5. Code-review fixes: RaycastRegistry unifies four hand-built raycast/occlusion lists; playerState-gated enemy AI; restored InteractSystem's interactable gate; WeaponSystem.reset() clears firing; Countdown/CollisionBox extracted to core/utils/
```

In "Current status", change the opening sentence from `Checkpoint 8 complete.` to `Checkpoint 8.5 complete.`, and append a new paragraph:

```

Checkpoint 8.5 addressed five findings from a code review of checkpoints 6–8. Root cause of three of them was the same: `main.ts` separately hand-assembled the target/gating list for `WeaponSystem`'s fire raycast, `EnemyAI`'s line-of-sight raycast, `HUD`'s enemy-label occlusion raycast, and `InteractSystem`'s interact raycast, and these had drifted out of sync as entity types were added (doors/buttons/pickups at checkpoint 6, dynamic enemies at checkpoint 7) — buttons/pickups were missing from three of the four lists, and enemies were missing from `InteractSystem`'s list entirely. `core/RaycastRegistry.ts` now replaces all four hand-built lists with one shared registry (`register()`/`unregister()`/`getAll()`): walls (`MapLoader`), doors/buttons/pickups (`MapEntitySystem`), the placeholder interactable, and every `EnemyAI` instance all self-register at construction time, and `WeaponSystem`, `EnemyAI`, `InteractSystem`, and `HUD` all read the same `getAll()` list instead of receiving a separately-built array. `WeaponSystem.addTarget()`/`removeTarget()` still exist (still called by `EnemyAI` — actually now called directly via `raycastRegistry` — and by `ShootingRange`) but now delegate to the registry instead of maintaining their own list. Two independently-introduced risks from this unification were handled explicitly rather than left to chance: `EnemyAI.hasLineOfSight()` excludes its own mesh from the registry list it raycasts against (otherwise a zombie's ray, originating at its own mesh's center, could immediately re-intersect its own geometry), and `HUD`'s enemy-label occlusion check excludes the labeled enemy's own mesh via a new `mesh.userData.enemyId` tag (the label sits only ~0.1 units above the capsule's own highest point, so without this a close/steep viewing angle would frequently clip the enemy's own head and falsely hide its own label). Verified in-browser: shooting/zombie-LOS/HUD-label-occlusion through a button or pickup now all block the same way a wall does; a zombie standing between the player and a door/button no longer lets the interact ray pass through it; and no enemy's own health label flickered from self-occlusion while circling it at close range.

Independently of the registry, three gating gaps were closed. `main.ts`'s `animate()` now gates `gameMode.update(deltaTime)` on `gameState.playerState === "alive"` — the shared `modeClock` still calls `getDelta()` every frame regardless (so it doesn't report one huge elapsed-time spike into the mode on the frame gameplay resumes), but the delta is only forwarded into `gameMode.update()` while alive, so every active `EnemyAI.update()` (driven transitively through `ZombieSurvival.update()`) simply doesn't run at all while dead — zombies freeze and stop growling/attacking the instant the player dies, verified in-browser with a second zombie still alive and out of melee range at the moment of death. `InteractSystem.tryInteract()` now checks `userData.interactable === true` in addition to `userData.onInteract`'s existence, restoring the checkpoint-6 invariant that these are separate concerns (previously any object with an `onInteract` would fire regardless of the `interactable` flag — currently harmless since every such object happens to have both set, but no longer relying on that coincidence). `WeaponSystem.reset()` now also clears the private `firing` flag alongside ammo/reload state, closing a gap where a held-mouse-button-through-death could otherwise survive a run reset.

Two duplicated patterns flagged in the review were extracted to `core/utils/`, per this project's own "shared/reusable logic goes in core/utils/, never duplicated inline" rule: `Countdown` (count down by deltaTime, fire a callback at zero) replaces `ZombieSurvival`'s hand-rolled round-transition timer and `ShootingRange`'s hand-rolled per-target cooldown, and `computeCollisionBox()` replaces the duplicated `new THREE.Box3().setFromObject(mesh)` call in both `MapLoader` (wall boxes) and `MapEntitySystem` (door box).

`PlayerController`'s door-derived collision box list (flagged as an efficiency finding — it was being rebuilt via filter+map+concat every single frame regardless of whether any door had changed) is now cached: `rebuildCollisionBoxes()` recomputes it only when `setWallBoxes()`/`setDoors()` are first called, and again whenever a door's visibility actually changes, via a new `onDoorStateChanged` callback `MapEntitySystem` invokes from both the button's `onInteract` and the door's `RunManager` reset — `main.ts` wires this to `playerController.rebuildCollisionBoxes()`. `PlayerController.update()` now just reads the cached list every frame with zero new allocations.

Not fixed this checkpoint, logged for later: `EnemyAI.update()` allocates a new object (with a nested position object) for `gameState.enemyHealth[this.id]` every frame per enemy, even when nothing changed — negligible at the round sizes this project currently reaches, revisit if profiling ever shows it matters at higher round counts.
```

Add these entries to the Decisions log (append after the existing checkpoint-8 entries):

```
- `core/RaycastRegistry.ts` (checkpoint 8.5) replaces the four independently hand-built raycast/occlusion target lists (`WeaponSystem`'s fire raycast, `EnemyAI`'s line-of-sight raycast, `HUD`'s enemy-label occlusion raycast, `InteractSystem`'s interact raycast) that had drifted out of sync — buttons/pickups were missing from three of the four, and enemies were missing from `InteractSystem`'s entirely. Anything that can be hit or occlude a ray now registers itself into this one registry at its own construction time (`MapLoader` for walls, `MapEntitySystem` for doors/buttons/pickups, `main.ts` for the placeholder interactable, `EnemyAI` for itself), and every raycasting system reads `getAll()` instead of receiving a separately-assembled array. `WeaponSystem.addTarget()`/`removeTarget()` are kept as public methods (still called by `ShootingRange`) but now just delegate to the registry rather than maintaining `WeaponSystem`'s own list.
- `EnemyAI.hasLineOfSight()` explicitly excludes its own mesh from the registry list it raycasts against (checkpoint 8.5): since all enemies now share the same registry as walls/doors (needed so `WeaponSystem` can hit them), a zombie's LOS ray — which originates at its own mesh's center — could otherwise immediately re-intersect its own geometry and report itself as blocking its own line of sight. Other enemies are deliberately left in the list: one zombie standing in front of another is a legitimate LOS blocker now that both share the registry, and this wasn't previously possible since the old hand-built `wallTargets` list never included any enemy.
- `HUD`'s enemy-label occlusion check (checkpoint 8.5) excludes the labeled enemy's own mesh via a new `mesh.userData.enemyId` tag set in `EnemyAI`'s constructor: the floating label sits only `LABEL_HEIGHT_OFFSET` (1 unit) above the enemy's position, which is only ~0.1 units above the capsule geometry's own highest point, so without this exclusion a close or steep viewing angle would frequently clip the enemy's own head and falsely hide its own label — a risk that didn't exist before checkpoint 8.5 since enemy meshes were never in `HUD`'s occlusion target list at all.
- `gameMode.update(deltaTime)` (checkpoint 8.5) is now called from `main.ts`'s `animate()` only when `gameState.playerState === "alive"` — previously it ran unconditionally, so `ZombieSurvival`'s enemies kept moving, growling, and attacking (as no-ops only because `PlayerState.applyDamage()` already guarded on alive state) for the entire time the death screen was shown. The shared `modeClock.getDelta()` is still called every frame regardless of alive state, so its internal reference stays fresh and the frame gameplay resumes doesn't see one huge deltaTime spike; only the *forwarding* of that delta into `gameMode.update()` is gated.
- `InteractSystem.tryInteract()` (checkpoint 8.5) now requires `userData.interactable === true` in addition to `userData.onInteract` existing, restoring the checkpoint-6 invariant that "can I interact with this" (`interactable`) and "what happens when I do" (`onInteract`) are separate concerns — the checkpoint-6 rewrite to a generic dispatch had dropped the `interactable` check, relying on the coincidence that every current object with `onInteract` also has `interactable: true`.
- `WeaponSystem.reset()` (checkpoint 8.5) now also clears the private `firing` flag, alongside the ammo/reload state it already reset — closing a gap where a mouse button held down at the moment of death (pointer-lock release doesn't synthesize a `mouseup`) could otherwise leave `firing` stuck `true` across a run reset.
- `core/utils/Countdown.ts` (checkpoint 8.5) extracts the "count down by deltaTime, fire a callback at zero" pattern that `ZombieSurvival`'s round-transition timer and `ShootingRange`'s per-target hit cooldown had each independently reimplemented — both now hold a `Countdown` instance instead of a raw number field.
- `core/utils/CollisionBox.ts` (checkpoint 8.5) extracts `new THREE.Box3().setFromObject(mesh)` into `computeCollisionBox()`, used by both `MapLoader` (wall boxes) and `MapEntitySystem` (door box) instead of each computing it inline.
- `PlayerController.rebuildCollisionBoxes()` (checkpoint 8.5) replaces the per-frame `wallBoxes.concat(doors.filter(...).map(...))` in `update()` with a cached `collisionBoxes` list, recomputed only when `setWallBoxes()`/`setDoors()` are called or when `MapEntitySystem`'s new `onDoorStateChanged` callback fires (wired from both the door's `RunManager` reset and the button's `onInteract`, via `main.ts` calling `playerController.rebuildCollisionBoxes()`). `PlayerController.update()`'s hot path now reads the cached list with zero new allocations per frame.
```

Add one line to the "Future mechanics" section:

```
- **`EnemyAI.update()`'s per-frame `gameState.enemyHealth` allocation**: flagged in the checkpoint 8.5 code review as an efficiency concern — a new object (with a nested position object) is allocated every frame per enemy even when health/position haven't changed. Negligible at the round sizes this project currently reaches; revisit if profiling ever shows it matters at higher round counts (e.g. once the "max concurrent alive" cap mentioned above is designed).
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Checkpoint 8.5: unify raycast targets into RaycastRegistry, close gating gaps

Fixes code-review findings from checkpoints 6-8: a single RaycastRegistry
replaces four hand-built raycast/occlusion lists (WeaponSystem, EnemyAI,
HUD, InteractSystem) that had drifted out of sync, so buttons/pickups now
block bullets/LOS/HUD occlusion and enemies now block the interact ray.
Also gates enemy AI on playerState (zombies freeze on death), restores
InteractSystem's interactable gate, fixes WeaponSystem.reset()'s firing
flag, and extracts Countdown/CollisionBox helpers to core/utils/.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Verify the commit**

Run: `git status` and `git log -1 --stat`
Expected: working tree clean, and the commit lists every file from Tasks 1–12 (RaycastRegistry.ts, Countdown.ts, CollisionBox.ts, MapLoader.ts, MapEntitySystem.ts, WeaponSystem.ts, EnemyAI.ts, InteractSystem.ts, PlayerController.ts, HUD.ts, ZombieSurvival.ts, ShootingRange.ts, main.ts, CLAUDE.md).

---

## Self-Review Notes

- **Spec coverage:** RaycastRegistry (Tasks 1,2,3,4,5,6,8,11) ✓; WeaponSystem.addTarget/removeTarget delegating (Task 4) ✓; PlayerController box caching + onDoorStateChanged (Tasks 3,7,11) ✓; playerState gating (Task 11) ✓; InteractSystem interactable gate (Task 6) ✓; WeaponSystem.reset() firing (Task 4) ✓; Countdown extraction (Tasks 1,9,10) ✓; CollisionBox extraction (Tasks 1,2,3) ✓; deferred efficiency note logged, not fixed (Task 12) ✓; CLAUDE.md status/decisions/checkpoint update + commit named "checkpoint 8.5" (Task 12) ✓.
- **New risk surfaced during planning, not in the original spec:** folding `EnemyAI` meshes into the same registry used for LOS and HUD occlusion introduces two self-intersection edge cases (a zombie's own mesh blocking its own LOS ray; a zombie's own mesh occluding its own HUD label) that could not arise under the old hand-built lists (which never included any enemy). Both are handled explicitly (self-mesh filter in `EnemyAI`, `enemyId`-tag filter in `HUD`) rather than left as a regression, and logged as decisions in Task 12.
- **Type consistency check:** `EnemyAI` constructor parameter order (`id, def, spawnPosition, scene, camera, audioSystem, gameState, playerState, raycastRegistry`) matches exactly between Task 5's class definition and Task 9's `new EnemyAI(...)` call site. `MapEntitySystem` constructor parameter order (`mapDef, weaponSystem, runManager, raycastRegistry, onDoorStateChanged`) matches between Task 3's class and Task 11's call site. `ZombieSurvival` constructor order (`enemyDef, spawnPoints, scene, camera, audioSystem, gameState, playerState, raycastRegistry, runManager`) matches between Task 9's class and Task 11's call site. `HUD` constructor order (`gameState, gameMode, camera, onRespawn, onMainMenu, raycastRegistry`) matches between Task 8's class and Task 11's call site.
