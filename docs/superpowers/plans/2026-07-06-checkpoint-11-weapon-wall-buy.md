# Checkpoint 11: Weapon Wall-Buy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the checkpoint-10 test-terminal scaffolding and the checkpoint-3 placeholder interactable box, then add a real `"wall_buy"` `MapEntity` type that spends points via `GameState.spendPoints()` to swap the player's active weapon mid-game.

**Architecture:** `Weapon` gains a `cost: number` field (the price lives with the weapon, not the entity — see the decisions log for why). `MapEntity` gains a `"wall_buy"` type whose `linkedTo` points to a `Weapon.id` instead of another entity's id. `MapEntitySystem.createWallBuy()` spawns the mesh and, on interact, calls `spendPoints(weapon.cost)`; on success it calls a new `WeaponSystem.setWeapon()` (added this checkpoint — no such swap method existed before). Both checkpoint-10 and checkpoint-3 throwaway/placeholder code are deleted outright, not deprecated in place.

**Tech Stack:** TypeScript, Three.js, Vite. No test framework in this project — verification is `npm run build` plus manual browser testing, per every prior checkpoint.

## Global Constraints

- `types/index.ts`, `content/maps.ts`, and `core/MapEntitySystem.ts` all reference the `"test_terminal"` type today — removing it from any one of them without the others in the same commit breaks the build (`tsconfig.json` has `strict: true`, and comparing `entity.type === "test_terminal"` against a union that no longer includes that literal is a type error). Likewise, `MapEntitySystem`'s `gameState` constructor parameter has no consumer once `createTestTerminal()` is deleted until `createWallBuy()` is added — `tsconfig.json` has `noUnusedParameters: true`, so a commit that deletes the old consumer without adding the new one in the same commit fails to compile. These changes are combined into one task for exactly this reason, not out of laziness.
- `Weapon.cost` is the chosen home for wall-buy price (not a `cost` field on `MapEntity`) — every current wall-buy of a given weapon costs the same everywhere, and there's no in-scope reason for that to vary by placement. Log this choice in CLAUDE.md (Task 4) as directed.
- On insufficient points, a wall-buy interaction has zero effect beyond a `console.log` rejection (same pattern the deleted test terminal used) — no on-screen "insufficient funds" UI. This gap is deliberate for this checkpoint and must be logged in CLAUDE.md's Future Mechanics (Task 4).
- Both the test-terminal scaffolding and the checkpoint-3 placeholder box must be **fully deleted** — types, content entries, spawn methods, constants, imports — not commented out, not left dead in place.
- The wall-buy mechanism must work identically on both `test-grid` and `corridors`.

---

## Task 1: Delete the checkpoint-3 placeholder box

**Files:**
- Modify: `src/main.ts`

**Interfaces:** None — pure deletion, no signature changes.

- [ ] **Step 1: Remove the placeholder interactable block from `src/main.ts`**

Find:

```typescript
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
```

Replace with:

```typescript
  sceneManager.scene.add(mapEntitySystem.group);
  playerController.setDoors(mapEntitySystem.doors);

  const interactSystem = new InteractSystem(sceneManager.camera, gameState, raycastRegistry);
```

- [ ] **Step 2: Verify the project compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (`THREE` is still used elsewhere in `main.ts` — `THREE.Vector3`, `THREE.Clock` — so the import itself doesn't become unused.)

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "Checkpoint 11 task 1: delete checkpoint-3 placeholder interactable box"
```

---

## Task 2: Replace test-terminal scaffolding with the wall-buy mechanism

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/content/weapons.ts`
- Modify: `src/content/maps.ts`
- Modify: `src/core/MapEntitySystem.ts`
- Modify: `src/core/WeaponSystem.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `GameState.spendPoints()` (existing, checkpoint 10).
- Produces: `Weapon.cost: number`. `MapEntity.type` gains `"wall_buy"` (and loses `"test_terminal"`). `WeaponSystem.setWeapon(weapon: Weapon): void`. `MapEntitySystem`'s constructor gains a `weapons: Weapon[]` parameter (7th, after `gameState`).

- [ ] **Step 1: Replace the full contents of `src/types/index.ts`**

```typescript
export interface Weapon {
  id: string;
  name: string; // player-facing display text, e.g. "M1911" (id stays the lookup key)
  damage: number;
  fireRate: number; // seconds between shots
  magSize: number;
  reloadTime: number; // seconds
  startingReserveAmmo: number;
  cost: number; // pointsBalance price at a "wall_buy" MapEntity linked to this weapon's id
  fireSoundId: string; // references SoundDef.id
  model?: string; // path to .glb, added when 3D models exist
}

export interface EnemyDef {
  id: string;
  health: number;
  speed: number;
  meleeDamage: number;
  attackInterval: number; // seconds between melee attacks
  sightRange: number;
  meleeRange: number;
  growlInterval: number; // seconds between growls while chasing
  growlSoundId: string; // references SoundDef.id
  deathSoundId: string; // references SoundDef.id
  model?: string;
}

export interface MapEntity {
  id: string;
  type:
    | "door"
    | "button"
    | "pickup"
    | "spawn"
    | "enemy_spawn"
    | "target"
    | "objective"
    | "wall_buy";
  position: [number, number, number];
  linkedTo?: string; // a related entity's id (e.g. button -> door), or for
  // "wall_buy", a Weapon id in content/weapons.ts
}

export interface MapDef {
  id: string;
  name: string; // player-facing display text, e.g. "Corridors" (id stays the lookup key)
  grid: number[][]; // 0 = floor, 1 = wall
  entities: MapEntity[];
}

export interface SoundDef {
  id: string;
  path: string; // e.g. "/sounds/pistol_fire.ogg"
  volume: number;
  positional: boolean;
  loop: boolean;
}

export interface Loadout {
  weaponIds: string[];
}
```

- [ ] **Step 2: Replace the full contents of `src/content/weapons.ts`**

```typescript
import type { Weapon } from "../types";

export const WEAPONS: Weapon[] = [
  {
    id: "pistol",
    name: "M1911",
    damage: 10,
    fireRate: 0.3,
    magSize: 12,
    reloadTime: 1.5,
    startingReserveAmmo: 48,
    cost: 500,
    fireSoundId: "pistol_fire",
  },
];
```

- [ ] **Step 3: Replace the full contents of `src/content/maps.ts`**

```typescript
import type { MapDef } from "../types";

// test-grid: interior pillar at row 4, col 2 doubles as a line-of-sight
// blocker for testing InteractSystem: it sits directly between the spawn
// point and the placeholder interactable box. The row-2 partition
// (checkpoint 6) walls off the row-1 alcove behind door_1, opened by
// button_1 (row 3, next to the gap but not inside it, so it doesn't block
// the doorway itself).
//
// corridors (checkpoint 9.5): two full-sized rooms (west "Room A", cols
// 1-3; east "Room B", cols 7-9) connected by a single-file, 3-cell-long
// corridor (row 4, cols 4-6) — genuinely more corridor structure than
// test-grid's single 1-cell gap, and door_1 at the corridor's middle cell
// fully seals the only path between the two rooms, since the corridor is
// exactly one row tall (rows 3 and 5 at cols 4-6 are walls, so there's no
// way around it).
export const MAPS: MapDef[] = [
  {
    id: "test-grid",
    name: "Test Grid",
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 0, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1],
    ],
    entities: [
      { id: "spawn_1", type: "spawn", position: [8, 0, 8] },
      { id: "door_1", type: "door", position: [6, 1.5, 4] },
      {
        id: "button_1",
        type: "button",
        linkedTo: "door_1",
        position: [6, 0.3, 6],
      },
      { id: "pickup_1", type: "pickup", position: [10, 0.3, 10] },
      { id: "enemy_spawn_1", type: "enemy_spawn", position: [10, 0.9, 6] },
      { id: "enemy_spawn_2", type: "enemy_spawn", position: [4, 0.9, 10] },
      // Shooting Range targets: two share space with the enemy_spawn points
      // above (only one mode is ever active at a time) plus two more of
      // their own, for four total.
      { id: "target_1", type: "target", position: [10, 0.9, 6] },
      { id: "target_2", type: "target", position: [4, 0.9, 10] },
      { id: "target_3", type: "target", position: [10, 0.9, 12] },
      { id: "target_4", type: "target", position: [2, 0.9, 12] },
      // Wall-buy (checkpoint 11): reuses the exact position the
      // checkpoint-10 test terminal occupied (row 6, col 6) — already
      // verified open floor, not shared with any other entity, now that the
      // terminal itself is gone.
      { id: "wall_buy_1", type: "wall_buy", linkedTo: "pistol", position: [12, 0.3, 12] },
    ],
  },
  {
    id: "corridors",
    name: "Corridors",
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
    entities: [
      { id: "corridors_spawn_1", type: "spawn", position: [4, 0, 4] },
      { id: "corridors_door_1", type: "door", position: [10, 1.5, 8] },
      {
        id: "corridors_button_1",
        type: "button",
        linkedTo: "corridors_door_1",
        position: [6, 0.3, 6],
      },
      { id: "corridors_pickup_1", type: "pickup", position: [16, 0.3, 12] },
      { id: "corridors_enemy_spawn_1", type: "enemy_spawn", position: [16, 0.9, 4] },
      { id: "corridors_enemy_spawn_2", type: "enemy_spawn", position: [14, 0.9, 12] },
      // Two targets share space with the enemy_spawn points above (only one
      // mode is ever active at a time, same dual-purpose pattern as
      // test-grid), plus two more of their own.
      { id: "corridors_target_1", type: "target", position: [16, 0.9, 4] },
      { id: "corridors_target_2", type: "target", position: [14, 0.9, 12] },
      { id: "corridors_target_3", type: "target", position: [4, 0.9, 12] },
      { id: "corridors_target_4", type: "target", position: [16, 0.9, 2] },
      // Wall-buy (checkpoint 11): Room A, row 3 col 2 — open floor, not
      // shared with any other corridors entity.
      { id: "corridors_wall_buy_1", type: "wall_buy", linkedTo: "pistol", position: [4, 0.3, 6] },
    ],
  },
];
```

- [ ] **Step 4: Replace the full contents of `src/core/MapEntitySystem.ts`**

```typescript
import * as THREE from "three";
import { CELL_SIZE, WALL_HEIGHT } from "./MapLoader";
import { computeCollisionBox } from "./utils/CollisionBox";
import { findById } from "./utils/Lookup";
import type { MapDef, MapEntity, Weapon } from "../types";
import type { WeaponSystem } from "./WeaponSystem";
import type { RunManager } from "./RunManager";
import type { RaycastRegistry } from "./RaycastRegistry";
import type { GameState } from "../state/GameState";

const DOOR_COLOR = 0x8b5a2b;
const BUTTON_COLOR = 0xcc2222;
const BUTTON_EMISSIVE = 0x330000;
const BUTTON_SIZE = 0.4;
const PICKUP_COLOR = 0x22aacc;
const PICKUP_EMISSIVE = 0x003344;
const PICKUP_SIZE = 0.4;
const PICKUP_AMMO_AMOUNT = 24;
const WALL_BUY_COLOR = 0xffd700;
const WALL_BUY_EMISSIVE = 0x554400;
const WALL_BUY_SIZE = 0.5;

export interface DoorEntry {
  mesh: THREE.Mesh;
  box: THREE.Box3;
}

// Spawns one mesh per door/button/pickup/wall_buy MapEntity and wires their
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
    gameState: GameState,
    weapons: Weapon[],
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
      } else if (entity.type === "wall_buy") {
        this.createWallBuy(entity, weapons, weaponSystem, gameState, raycastRegistry);
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

  // The first real GameState.spendPoints() caller (checkpoint 11) — replaces
  // the checkpoint-10 test terminal, which only proved the mechanism worked.
  // linkedTo here is a Weapon id (content/weapons.ts), not another
  // MapEntity's id — findById() throws by name if it doesn't resolve, same
  // as every other content lookup in this codebase. No
  // RunManager.registerResettable() call: like the test terminal before it,
  // this has no visible on/off state of its own to reset — spendPoints()'s
  // effect on pointsBalance already resets via RunManager ->
  // GameState.resetScore(). What a new run does to an already-purchased
  // weapon is a separate, currently undesigned question — see CLAUDE.md
  // future mechanics.
  private createWallBuy(
    entity: MapEntity,
    weapons: Weapon[],
    weaponSystem: WeaponSystem,
    gameState: GameState,
    raycastRegistry: RaycastRegistry,
  ): void {
    if (!entity.linkedTo) {
      throw new Error(`Wall-buy "${entity.id}" has no linkedTo weapon id`);
    }
    const weapon = findById(weapons, entity.linkedTo);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_BUY_SIZE, WALL_BUY_SIZE, WALL_BUY_SIZE),
      new THREE.MeshStandardMaterial({
        color: WALL_BUY_COLOR,
        emissive: WALL_BUY_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      const purchased = gameState.spendPoints(weapon.cost);
      if (purchased) {
        weaponSystem.setWeapon(weapon);
        console.log(
          `Wall-buy: purchased ${weapon.name} for ${weapon.cost} points, balance now ${gameState.pointsBalance}`,
        );
      } else {
        console.log(
          `Wall-buy: rejected (need ${weapon.cost}, have ${gameState.pointsBalance}) — balance unchanged`,
        );
      }
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);
  }
}
```

- [ ] **Step 5: Replace the full contents of `src/core/WeaponSystem.ts`**

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
  private weapon: Weapon;
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

  // Switches the player's active weapon mid-game (checkpoint 11's wall-buy
  // is the first caller): ammo/reload state resets to the new weapon's
  // stats, the same as a fresh pickup of that weapon — a wall-buy is a full
  // weapon swap, not a top-up (that's what pickups/addReserveAmmo() are for).
  setWeapon(weapon: Weapon): void {
    this.weapon = weapon;
    this.currentAmmo = weapon.magSize;
    this.reserveAmmo = weapon.startingReserveAmmo;
    this.isReloading = false;
    this.reloadTimeRemaining = 0;
    this.timeSinceLastShot = Infinity;
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

- [ ] **Step 6: Add `WEAPONS` as the 7th argument to `MapEntitySystem`'s construction in `src/main.ts`**

Find:

```typescript
  const mapEntitySystem = new MapEntitySystem(
    mapDef,
    weaponSystem,
    runManager,
    raycastRegistry,
    () => playerController.rebuildCollisionBoxes(),
    gameState,
  );
```

Replace with:

```typescript
  const mapEntitySystem = new MapEntitySystem(
    mapDef,
    weaponSystem,
    runManager,
    raycastRegistry,
    () => playerController.rebuildCollisionBoxes(),
    gameState,
    WEAPONS,
  );
```

(`WEAPONS` is already imported at the top of `main.ts` — no new import needed.)

- [ ] **Step 7: Verify the project compiles**

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 8: Confirm no leftover references to the deleted scaffolding**

Run: `grep -rn "test_terminal\|TestTerminal\|TEST_TERMINAL" src/`
Expected: no output (zero matches anywhere in `src/`).

- [ ] **Step 9: Commit**

```bash
git add src/types/index.ts src/content/weapons.ts src/content/maps.ts src/core/MapEntitySystem.ts src/core/WeaponSystem.ts src/main.ts
git commit -m "Checkpoint 11 task 2: replace test-terminal scaffolding with weapon wall-buy"
```

---

## Task 3: Manual verification against acceptance criteria

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL in a browser. Open devtools console — the wall-buy's feedback is `console.log`, not on-screen (same as the deleted test terminal was).

- [ ] **Step 2: Confirm the test terminal and placeholder box are gone**

Start a Zombie Survival run on Test Grid. Confirm: no magenta cube (the old test terminal) anywhere, no orange cube (the old placeholder box) at its old spot near the spawn room. Confirm a new gold/yellow cube (the wall-buy) is present instead, at the test terminal's old position.

- [ ] **Step 3: Verify insufficient-points rejection**

Immediately (0 points), walk to the wall-buy and press E. Confirm the console logs a rejection naming the cost (500) and the current (unchanged) balance, and the HUD's "Points: N" doesn't move.

- [ ] **Step 4: Verify a successful purchase**

Get to 500+ points (zombie hits/kills). Press E on the wall-buy again. Confirm the console logs a purchase success with the new (lower) balance, the HUD's points visibly drop by exactly 500, and the weapon's ammo refills to a fresh magazine + full reserve (since only one weapon exists, this is a re-buy of the same weapon — confirm this by emptying/partially-spending your ammo before the purchase, then confirming it's back to full after).

- [ ] **Step 5: Verify parity on Corridors**

Reload, select Corridors map, repeat steps 2-4 there. Confirm the wall-buy is present in Room A, behaves identically (same rejection/purchase behavior, same cost).

- [ ] **Step 6: Regression-check unrelated mechanics still work**

On either map: confirm doors/buttons/pickups still function (open door via button, pickup still refills ammo), and shooting/interacting/HUD/round progression are otherwise unaffected by this checkpoint's changes.

---

## Task 4: Update CLAUDE.md and commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the folder structure tree**

Update these lines:

```
    weapons.ts                  [1, populated at 5]
```
→
```
    weapons.ts                  [1, populated at 5; cost field added at 11 for wall-buy pricing]
```

```
    maps.ts                     [1, populated at 5; name field + second map ("corridors") added at 9.5; temporary test_terminal scaffolding entity added at 10 (test-grid only), remove at 11]
```
→
```
    maps.ts                     [1, populated at 5; name field + second map ("corridors") added at 9.5; checkpoint-10 test_terminal scaffolding removed and replaced with one wall_buy entity per map at 11]
```

```
    WeaponSystem.ts             [2, addTarget()/removeTarget() added at 7; delegate to RaycastRegistry at 8.5 instead of an own list]
```
→
```
    WeaponSystem.ts             [2, addTarget()/removeTarget() added at 7; delegate to RaycastRegistry at 8.5 instead of an own list; setWeapon() added at 11 for mid-game weapon swaps (wall-buy)]
```

```
    MapEntitySystem.ts          [6, spawns door/button/pickup meshes from MapDef.entities; onDoorStateChanged callback added at 8.5; temporary test_terminal scaffolding added at 10, remove at 11]
```
→
```
    MapEntitySystem.ts          [6, spawns door/button/pickup/wall_buy meshes from MapDef.entities; onDoorStateChanged callback added at 8.5; checkpoint-10 test_terminal scaffolding removed and replaced by createWallBuy() at 11]
```

- [ ] **Step 2: Update the Checkpoints list**

Add a new line immediately after checkpoint 10's line:

```
11. Weapon wall-buy — first real GameState.spendPoints() consumer; "wall_buy" MapEntity type (Weapon.cost, linkedTo a Weapon id), WeaponSystem.setWeapon() for mid-game weapon swaps; checkpoint-10 test-terminal scaffolding and the checkpoint-3 placeholder box both deleted
```

- [ ] **Step 3: Update "Current status"**

Change the opening sentence from `Checkpoint 10 complete.` to `Checkpoint 11 complete.`, and append a new paragraph after the existing checkpoint-10 paragraph (before `## Decisions log`):

```

Both pieces of throwaway/placeholder code that predated real map-entity mechanics are gone: the checkpoint-10 test terminal (type, content entry, spawn method — it proved `spendPoints()` worked, and now a real spender exists) and the checkpoint-3 placeholder orange box in `main.ts` (it proved `onInteract` worked, and real interactables have covered that many times over since). In their place, `MapEntity` gained a `"wall_buy"` type: `linkedTo` on a `wall_buy` entity is a `Weapon.id` (looked up via the existing `findById()`, not another `MapEntity`'s id), and `Weapon` itself gained a `cost: number` field — the price lives with the weapon, not the placement (see the decisions log for why). `MapEntitySystem.createWallBuy()` spawns a gold cube per `wall_buy` entity; on interact it calls `gameState.spendPoints(weapon.cost)`, and on success calls a brand-new `WeaponSystem.setWeapon(weapon)` — the first method that can swap the player's active weapon mid-game, resetting ammo/reload state to the new weapon's stats exactly like an initial pickup would. Both `test-grid` and `corridors` now have one `wall_buy` entity each, both linked to `"pistol"` — with only one weapon currently in `content/weapons.ts`, this checkpoint's wall-buy is effectively a same-weapon re-buy (a full ammo refill), which is expected and fine; a second weapon isn't required to prove the mechanism and is explicitly later checkpoint scope. On insufficient points, the rejection is `console.log`-only (the same pattern the deleted test terminal used) — there is still no on-screen "insufficient funds" feedback; see "Future mechanics" below. Verified in-browser: the test terminal and placeholder box are both gone with no leftover references (`grep -rn "test_terminal" src/` returns nothing); interacting with the wall-buy below cost logs a rejection and leaves the HUD's points unchanged; interacting at or above cost logs a purchase, drops the displayed points by exactly the cost, and refills the weapon's ammo; this all works identically on both maps.
```

- [ ] **Step 4: Add decisions log entries**

Append after the last existing decisions-log line, before `## Future mechanics`:

```
- **`wall_buy` cost lives on `Weapon`, not on the `MapEntity`** (checkpoint 11) — considered putting `cost` on the `wall_buy` entity itself (since some games vary a wall-buy's price by location), but there's no current design need for that: every `wall_buy` linked to a given weapon should cost the same everywhere in this project's scope, and pricing per-weapon avoids the entities-can-drift-out-of-sync risk of duplicating (or worse, disagreeing on) a price across multiple placements of the same weapon. If a future checkpoint ever needs per-placement pricing, an optional `MapEntity.costOverride` could be layered on top without disturbing `Weapon.cost` as the default.
- `MapEntity`'s `"wall_buy"` type (checkpoint 11) reuses `linkedTo` for a fundamentally different reference than every other current use (button → door, both `MapEntity` ids): here it's a `Weapon.id` from `content/weapons.ts`, resolved via the same `findById()` every other content lookup already uses. `MapEntitySystem.createWallBuy()` throws by name if `linkedTo` is missing, mirroring `createButton()`'s existing "no matching door" guard — the same defensive pattern applied to a new kind of dangling reference.
- `WeaponSystem.setWeapon(weapon)` (checkpoint 11) is the first method able to change the player's active weapon mid-game — before this checkpoint, `weapon` was set once at construction and only ever reset back to itself (`reset()`). Swapping resets ammo/reload state to the new weapon's stats, treating a wall-buy as a full weapon swap rather than a top-up (`addReserveAmmo()`/pickups already own the top-up case). What a new run (`RunManager.startNewRun()` → `WeaponSystem.reset()`) does with an already-purchased weapon — keep it, or revert to the original menu-selected weapon — is not decided this checkpoint; `reset()` still resets ammo/state for *whatever weapon is currently equipped*, purchased or not. See "Future mechanics" below.
- The checkpoint-10 test terminal and the checkpoint-3 placeholder interactable box were both deleted outright (checkpoint 11), not deprecated in place — each had exactly one purpose (proving `spendPoints()` and `onInteract` respectively worked through a real interaction), that purpose is now permanently served by real mechanics, and neither had any other caller or reference anywhere in the codebase to preserve.
```

- [ ] **Step 5: Update the now-stale "Spending points" future-mechanics bullet**

Find:

```
- **Spending points**: the mechanism now exists (`GameState.spendPoints()`, checkpoint 10) and is proven working via the temporary test terminal — but every *real* spender (weapon wall-buys, paid interacts) is still undesigned. The likely shape is still extending `MapEntity`'s existing `"button"`/`"pickup"` types with a cost field rather than needing a whole new entity type per spendable thing, but that's not decided yet. Checkpoint 11's weapon wall-buy is expected to be the first real caller, at which point the checkpoint-10 test terminal (see the decisions log) should be deleted.
```

Replace with:

```
- **Superseded at checkpoint 11** (was: "**Spending points**: the mechanism now exists (`GameState.spendPoints()`, checkpoint 10) and is proven working via the temporary test terminal — but every *real* spender (weapon wall-buys, paid interacts) is still undesigned. The likely shape is still extending `MapEntity`'s existing `"button"`/`"pickup"` types with a cost field rather than needing a whole new entity type per spendable thing, but that's not decided yet. Checkpoint 11's weapon wall-buy is expected to be the first real caller, at which point the checkpoint-10 test terminal (see the decisions log) should be deleted."): the weapon wall-buy is built (see the decisions log) — it turned out to need its own `"wall_buy"` `MapEntity` type after all, not an extension of `"button"`/`"pickup"`, since neither of those types' existing behavior (door-toggling, ammo top-up) fit "swap the active weapon." Paid interacts beyond weapons (perks, other purchasables) remain undesigned.
```

- [ ] **Step 6: Add new Future Mechanics entries**

Append at the end of the "Future mechanics" section:

```
- **HUD purchase feedback**: wall-buy (and, before it, the test terminal) success/rejection is `console.log`-only — there's no on-screen "insufficient funds" or "purchased!" prompt. Worth adding once the HUD has a natural place for transient messages; not designed yet.
- **What happens to a purchased weapon on a new run**: `WeaponSystem.setWeapon()` (checkpoint 11) changes the currently-equipped weapon, and `RunManager.startNewRun()` → `WeaponSystem.reset()` resets ammo/state for whatever weapon is currently equipped at that moment — it does not revert to the weapon originally chosen at the main menu. Whether a new run should keep a purchased weapon or reset the loadout entirely is undecided; not a concern yet with only one weapon in `content/weapons.ts` (a "re-buy" and the original pick are the same weapon either way), but will need an actual decision once a second weapon exists.
```

- [ ] **Step 7: Verify the project still builds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Checkpoint 11: weapon wall-buy

Deletes the checkpoint-10 test-terminal scaffolding and the checkpoint-3
placeholder interactable box, replacing both with a real "wall_buy"
MapEntity type: linkedTo points to a Weapon id (not another entity),
Weapon gains a cost field (chosen over a per-entity cost field — logged
in the decisions log), and WeaponSystem gains its first mid-game
weapon-swap method, setWeapon(). Both test-grid and corridors get one
wall-buy each, linked to the sole existing weapon. Insufficient-funds
feedback is still console.log-only; logged as a deferred HUD gap.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Verify the commit**

Run: `git status` and `git log -1 --stat`
Expected: working tree clean; the commit sequence since Task 1 touches `src/main.ts`, `src/types/index.ts`, `src/content/weapons.ts`, `src/content/maps.ts`, `src/core/MapEntitySystem.ts`, `src/core/WeaponSystem.ts`, `CLAUDE.md`, plus this plan doc.

---

## Self-Review Notes

- **Spec coverage:** test-terminal fully deleted, type+content+spawn method (Task 2) ✓; checkpoint-3 placeholder box fully deleted (Task 1) ✓; `"wall_buy"` `MapEntity` type with `linkedTo` pointing to a `Weapon` id (Task 2) ✓; cost placement decided (on `Weapon`, logged with reasoning — Task 2 code + Task 4 decisions log) ✓; one `wall_buy` entity per map, both linked to the sole existing weapon (Task 2) ✓; `MapEntitySystem` spawns a distinct mesh, tags interactable/onInteract, calls `spendPoints()`, no-ops with a logged rejection on failure, swaps weapon via a new `WeaponSystem` method on success (Task 2) ✓; `WeaponSystem` checked for an existing swap method before assuming one needed to be added — confirmed none existed (read the full pre-checkpoint file; only `reset()`, which re-applies the *same* weapon) ✓; acceptance-criteria walkthrough including insufficient/sufficient purchase and both-maps parity (Task 3) ✓; CLAUDE.md status/decisions (`wall_buy` addition, cost decision, both removals, deferred HUD gap)/future-mechanics + commit named "checkpoint 11" (Task 4) ✓.
- **Placeholder scan:** no TBD/TODO; every step has complete code; the "grep for leftover test_terminal references" step (Task 2, Step 8) is a concrete, runnable verification, not a vague "make sure it's clean" instruction.
- **Type consistency check:** `MapEntitySystem`'s constructor order `(mapDef, weaponSystem, runManager, raycastRegistry, onDoorStateChanged, gameState, weapons)` in Task 2 matches the `main.ts` call site `new MapEntitySystem(mapDef, weaponSystem, runManager, raycastRegistry, () => ..., gameState, WEAPONS)` exactly. `createWallBuy(entity, weapons, weaponSystem, gameState, raycastRegistry)`'s parameter order matches its one call site in the same file's constructor. `WeaponSystem.setWeapon(weapon: Weapon): void` matches its one caller, `weaponSystem.setWeapon(weapon)` in `createWallBuy()`, where `weapon` is the `Weapon` object `findById()` resolved (not the raw `entity.linkedTo` string). `Weapon.cost` (Task 2, types) matches `weapon.cost` read in both `content/weapons.ts`'s object literal and `MapEntitySystem`'s `gameState.spendPoints(weapon.cost)` call.
- **Compile-safety check (the reason Task 2 is one large task, not several small ones):** confirmed `tsconfig.json` has both `strict: true` (so a removed union member breaks any remaining `===` comparison against it) and `noUnusedParameters: true` (so `MapEntitySystem`'s `gameState` parameter can't sit unused between deleting `createTestTerminal()` and adding `createWallBuy()`) — this is why types/content/MapEntitySystem/WeaponSystem/main.ts's wiring are all one task/commit rather than split further.
