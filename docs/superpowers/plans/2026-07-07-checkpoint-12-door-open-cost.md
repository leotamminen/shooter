# Checkpoint 12: Door-Open Cost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a "button" `MapEntity` optionally cost points to press, reusing `GameState.spendPoints()` the same way checkpoint 11's wall-buy already does, and add the first real paid door/button pair (a gated vault room in `corridors`) to prove it.

**Architecture:** `MapEntity` gains an optional `cost?: number` field. `MapEntitySystem.createButton()` checks it: if present, `spendPoints(cost)` must succeed before the door opens; if absent, behavior is byte-for-byte identical to every button today. The idempotency guard (`!door.visible` → no-op) runs *before* any spend attempt, so a second press of an already-open paid door never charges twice.

**Tech Stack:** TypeScript, Three.js, Vite. No test framework in this project — verification is `npm run build` plus manual browser testing, per every prior checkpoint.

## Global Constraints

- `cost` on `MapEntity` is optional and defaults to "free" — every existing button on both maps (`button_1`, `corridors_button_1`) must keep working exactly as before, with zero `spendPoints()` calls, since neither gets a `cost` field.
- The idempotency check (`!door.visible`) must run **before** any spend attempt, not after — confirmed as an explicit requirement, not an assumption. Get this ordering wrong and a repeat press of an already-open paid door would charge the player again.
- The new paid door/button pair goes in `corridors` (this plan's choice, per the spec's own suggestion that it "probably reads better narratively") — a small vault room gated behind a paid door, holding a bonus pickup. The existing free doors on both maps are untouched.
- Reuse the exact `console.log` success/rejection pattern `createWallBuy()` already established in checkpoint 11 — no new feedback mechanism.

---

## Task 1: Add optional `cost` to `MapEntity`

**Files:**
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: `MapEntity.cost?: number`.

- [ ] **Step 1: Add the `cost` field to `MapEntity` in `src/types/index.ts`**

Find:

```typescript
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
```

Replace with:

```typescript
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
  cost?: number; // "button" only (checkpoint 12): pointsBalance price to open
  // the linked door; absent/undefined means free, same as every button
  // before this checkpoint. Unrelated to "wall_buy"'s price, which comes
  // from Weapon.cost, not this field.
}
```

- [ ] **Step 2: Verify the project compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (Adding an optional field to an interface is purely additive — nothing currently reads or writes `MapEntity.cost`, so no other file is affected yet.)

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "Checkpoint 12 task 1: add optional cost field to MapEntity"
```

---

## Task 2: `MapEntitySystem.createButton()` gates door-opening on cost

**Files:**
- Modify: `src/core/MapEntitySystem.ts`

**Interfaces:**
- Consumes: `MapEntity.cost` (Task 1), `GameState.spendPoints()` (existing, checkpoint 10).
- Produces: `createButton()`'s signature gains a `gameState: GameState` parameter (5th, after `onDoorStateChanged`). No change to the public `MapEntitySystem` constructor signature — `gameState` is already a constructor parameter (checkpoint 10); this task only threads it into `createButton()` internally, alongside the dispatch call site.

- [ ] **Step 1: Replace the full contents of `src/core/MapEntitySystem.ts`**

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
        this.createButton(entity, doorMeshById, raycastRegistry, onDoorStateChanged, gameState);
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

  // A button's cost (checkpoint 12) is optional — most buttons are still
  // free. The idempotency check (`!door.visible`, i.e. door already open)
  // runs BEFORE any spend attempt, not after: this is what guarantees a
  // repeat press of an already-open door's button never charges the player
  // again, the same way it already never re-opened an open door before
  // costs existed.
  private createButton(
    entity: MapEntity,
    doorMeshById: Map<string, THREE.Mesh>,
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
    gameState: GameState,
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
      if (!door.visible) return; // idempotent: door already open — checked
      // before any spend attempt below, so this never charges twice.

      if (entity.cost !== undefined) {
        const paid = gameState.spendPoints(entity.cost);
        if (!paid) {
          console.log(
            `Button "${entity.id}": rejected (need ${entity.cost}, have ${gameState.pointsBalance}) — door stays closed`,
          );
          return;
        }
        console.log(
          `Button "${entity.id}": paid ${entity.cost} points, balance now ${gameState.pointsBalance}`,
        );
      }

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

- [ ] **Step 2: Verify the project compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/MapEntitySystem.ts
git commit -m "Checkpoint 12 task 2: gate button door-opening on an optional cost"
```

---

## Task 3: Add the first paid door/button pair (corridors vault room)

**Files:**
- Modify: `src/content/maps.ts`

**Interfaces:**
- Consumes: `MapEntity.cost` (Task 1), the cost-gating behavior in `createButton()` (Task 2).

- [ ] **Step 1: Replace the full contents of `src/content/maps.ts`**

```typescript
import type { MapDef } from "../types";

// test-grid: interior pillar at row 4, col 2 doubles as a line-of-sight
// blocker for testing InteractSystem: it originally sat directly between the
// spawn point and the checkpoint-3 placeholder interactable box (deleted at
// checkpoint 11). The row-2 partition
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
//
// corridors (checkpoint 12): a small vault room (row 9, cols 7-9) was added
// south of Room B, gated by a paid door — corridors_door_2 sits at the one
// gap (row 8, col 8) in an otherwise solid partition wall between Room B and
// the vault, opened by corridors_button_2 (row 7, col 8, on the Room B side
// so it's never trapped behind its own door) at a cost of 300 points. The
// vault holds corridors_pickup_2, a bonus ammo refill — the first real
// instance of a paid button, alongside the existing free door_1/button_1
// pairs on both maps, which are untouched.
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
      [1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1],
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
      // Paid door (checkpoint 12): gates the small vault room at row 9,
      // cols 7-9, added south of Room B. corridors_door_2 is the sole gap
      // (row 8, col 8) in the partition wall between Room B and the vault —
      // rows 8's other columns are solid, so this is the only way in.
      // corridors_button_2 sits on the Room B side (row 7, col 8, not
      // inside the vault) and costs 300 points; corridors_pickup_2 inside
      // the vault is a bonus ammo refill.
      { id: "corridors_door_2", type: "door", position: [16, 1.5, 16] },
      {
        id: "corridors_button_2",
        type: "button",
        linkedTo: "corridors_door_2",
        cost: 300,
        position: [16, 0.3, 14],
      },
      { id: "corridors_pickup_2", type: "pickup", position: [16, 0.3, 18] },
    ],
  },
];
```

- [ ] **Step 2: Verify the project compiles**

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 3: Verify the new geometry by hand**

Confirm (this is a written check, not a code step — do the arithmetic and state the result in your task report):
- `corridors_door_2` at `[16, 1.5, 16]` → col 8, row 8. Grid row 8 (`[1,1,1,1,1,1,1,1,0,1,1]`) has `0` only at col 8 — every other column in that row is a wall.
- `corridors_button_2` at `[16, 0.3, 14]` → col 8, row 7. Grid row 7 (`[1,0,0,0,1,1,1,0,0,0,1]`) has `0` at col 8 — open floor, on the Room B side of the new door (not inside the vault).
- `corridors_pickup_2` at `[16, 0.3, 18]` → col 8, row 9. Grid row 9 (`[1,1,1,1,1,1,1,0,0,0,1]`) has `0` at col 8 — open floor, inside the vault.
- None of these three cells — (8,8), (8,7), (8,9) — collide with any pre-existing `corridors` entity (spawn (2,2), door_1 (5,4), button_1 (3,3), pickup_1 (8,6), enemy_spawn_1/target_1 (8,2), enemy_spawn_2/target_2 (7,6), target_3 (2,6), target_4 (8,1), wall_buy_1 (2,3)).
- Rows 7 and 9 both have walls at col 7 and col 9 flanking the open col 8 path, so there is no way to walk around `corridors_door_2` into the vault.

- [ ] **Step 4: Commit**

```bash
git add src/content/maps.ts
git commit -m "Checkpoint 12 task 3: add paid door/button pair (corridors vault room)"
```

---

## Task 4: Manual verification against acceptance criteria

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL in a browser. Open devtools console — the paid button's feedback is `console.log`, same pattern as the wall-buy.

- [ ] **Step 2: Verify existing free doors are unaffected on both maps**

Test Grid: press `button_1` — `door_1` opens immediately, no console log, no points deducted (confirm the HUD's "Points: N" doesn't move). Corridors: press `corridors_button_1` — same result.

- [ ] **Step 3: Verify the new paid door rejects below cost**

On Corridors, with fewer than 300 points, walk to `corridors_button_2` (Room B, near the new vault's entrance) and press it. Confirm: console logs a rejection naming cost 300 and the current (unchanged) balance; the door stays closed; the HUD's points don't move.

- [ ] **Step 4: Verify the new paid door opens at or above cost**

Get to 300+ points. Press `corridors_button_2` again. Confirm: console logs a payment with the new (lower) balance; the HUD's points drop by exactly 300; `corridors_door_2` opens, revealing the vault with `corridors_pickup_2` inside; walking in and interacting with the pickup refills ammo as normal.

- [ ] **Step 5: Verify no double-charge on a repeat press**

With `corridors_door_2` now open, press `corridors_button_2` again (same run, don't respawn). Confirm: nothing happens — no console log at all (the idempotency check returns before reaching the cost logic), and the HUD's points are unchanged from step 4's post-purchase balance.

- [ ] **Step 6: Regression-check unrelated mechanics**

Confirm wall-buys (both maps), shooting, HUD, and round progression are otherwise unaffected by this checkpoint's changes.

---

## Task 5: Update CLAUDE.md and commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the folder structure tree**

Update these lines:

```
    maps.ts                     [1, populated at 5; name field + second map ("corridors") added at 9.5; checkpoint-10 test_terminal scaffolding removed and replaced with one wall_buy entity per map at 11]
```
→
```
    maps.ts                     [1, populated at 5; name field + second map ("corridors") added at 9.5; checkpoint-10 test_terminal scaffolding removed and replaced with one wall_buy entity per map at 11; corridors gains a paid door/vault room at 12]
```

```
    MapEntitySystem.ts          [6, spawns door/button/pickup/wall_buy meshes from MapDef.entities; onDoorStateChanged callback added at 8.5; checkpoint-10 test_terminal scaffolding removed and replaced by createWallBuy() at 11]
```
→
```
    MapEntitySystem.ts          [6, spawns door/button/pickup/wall_buy meshes from MapDef.entities; onDoorStateChanged callback added at 8.5; checkpoint-10 test_terminal scaffolding removed and replaced by createWallBuy() at 11; createButton() gains an optional per-button cost at 12]
```

- [ ] **Step 2: Update the Checkpoints list**

Add a new line immediately after checkpoint 11's line:

```
12. Door-open cost — optional `cost` on "button" `MapEntity`, reusing `spendPoints()` the same way wall-buy already does; first paid door/button pair added to `corridors` (gated vault room + bonus pickup); confirmed the idempotency check runs before the spend attempt, not after
```

- [ ] **Step 3: Update "Current status"**

Change the opening sentence from `Checkpoint 11 complete.` to `Checkpoint 12 complete.`, and append a new paragraph after the existing checkpoint-11 paragraph (before `## Decisions log`):

```

`MapEntity` gained an optional `cost?: number` field (checkpoint 12), meaningful only for `"button"` entities: `MapEntitySystem.createButton()` checks it before opening the linked door — if present, `gameState.spendPoints(cost)` must succeed first (failure logs a rejection via the same `console.log` pattern `createWallBuy()` already established, and leaves the door closed), and if absent, behavior is unchanged from every button before this checkpoint (unconditional, free). The idempotency guard (`if (!door.visible) return;`) runs before any spend attempt, not after — verified in-browser that pressing an already-open paid door's button a second time produces no console output at all and never touches the balance a second time. `corridors` gained the first real paid door/button pair: a small vault room (row 9, cols 7-9) south of Room B, sealed behind `corridors_door_2` (the sole gap in an otherwise solid partition wall) and opened by `corridors_button_2` for 300 points, holding a bonus ammo pickup. Both maps' original free door/button pairs (`button_1`/`door_1`, `corridors_button_1`/`corridors_door_1`) are untouched. Verified in-browser: both existing free doors still open on first press with zero points deducted; the new paid door rejects below 300 (logged, balance unchanged, door stays closed) and opens at or above 300 (logged, balance drops by exactly 300, door opens); pressing the same button again afterward does nothing and does not charge a second time.
```

- [ ] **Step 4: Add decisions log entries**

Append after the last existing decisions-log line, before `## Future mechanics`:

```
- `MapEntity.cost` (checkpoint 12) reuses `wall_buy`'s `spendPoints()`-gating shape rather than inventing a second spending mechanism, but is placed differently than `wall_buy`'s price: `Weapon.cost` (checkpoint 11) lives on the weapon because many `wall_buy` entities could plausibly link to the same weapon and should agree on its price, but a button's cost has no equivalent shared "thing" to live on — it's a property of that specific door-opening interaction, not of a reusable content type. Both decisions follow the same underlying rule ("put the price wherever the priced thing actually lives"), they just land in different places because a button-and-its-door isn't a reusable content type the way a `Weapon` is.
- The idempotency check in `createButton()`'s `onInteract` (`if (!door.visible) return;`) was confirmed — not assumed — to run before the new cost-gating logic, both by code inspection and by an explicit in-browser test (checkpoint 12): pressing an already-open paid door's button produces no `console.log` at all and leaves `pointsBalance` unchanged, proving the guard short-circuits before `spendPoints()` is ever called on a repeat press.
- The first real paid door (checkpoint 12) was placed in `corridors`, not `test-grid`, per the spec's own suggestion that the second map narratively reads better for it — a small vault room gating a bonus pickup, rather than a second `wall_buy` (which would have required either reusing the sole existing weapon a third time on the same map or waiting on a second weapon that doesn't exist yet).
```

- [ ] **Step 5: Verify the project still builds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Search for staleness this checkpoint may have introduced**

This project's CLAUDE.md has needed a staleness fix in every one of the last five checkpoints (9, 9.5, 10, 10's final review, and 11 across two separate rounds) — always the same failure mode: an older sentence elsewhere in the document making a claim this checkpoint's changes now contradict. Before committing, actively search the full document (not just the sections edited above) for anything that:
- describes every button as unconditionally free (the checkpoint-6 `InteractSystem`/button decisions-log entries should still be accurate as *historical* narrative about checkpoint 6, but check they don't make an ongoing "buttons are always free" claim in present tense)
- describes `MapEntity`'s fields as a fixed, closed set that this checkpoint's `cost` field addition would now contradict
- makes any other claim this checkpoint's changes would now contradict

If you find anything, fix it using the established `**Superseded at checkpoint N** (was: "...")` convention. If you find nothing beyond what Steps 1-4 already added, say so explicitly in your commit's task report — don't skip stating the negative result.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Checkpoint 12: door-open cost

Adds an optional cost field to the "button" MapEntity type, reusing
wall-buy's spendPoints() gating shape rather than a new mechanism:
absent means free (every existing button, unchanged), present means
the linked door only opens on a successful spend, with the same
console.log success/rejection pattern wall-buy already uses. Confirmed
the idempotency check runs before the spend attempt, not after, so a
repeat press of an already-open paid door never charges twice. Adds
the first real paid door/button pair to corridors: a small vault room
gated behind a 300-point door, holding a bonus pickup. Both maps'
original free doors are untouched.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Verify the commit**

Run: `git status` and `git log -1 --stat`
Expected: working tree clean; the commit sequence since Task 1 touches `src/types/index.ts`, `src/core/MapEntitySystem.ts`, `src/content/maps.ts`, `CLAUDE.md`, plus this plan doc.

---

## Self-Review Notes

- **Spec coverage:** optional `cost` on `MapEntity`/button, undefined-means-free (Task 1) ✓; `createButton()` gates on cost, reuses `spendPoints()` + wall-buy's console.log pattern, opens unconditionally when cost is absent (Task 2) ✓; idempotency check confirmed to run before the spend attempt, both by code structure and an explicit manual test (Task 2 code + Task 4 Step 5) ✓; one paid door/button pair added to corridors, existing free doors on both maps untouched (Task 3) ✓; acceptance-criteria walkthrough including the specific double-charge check (Task 4) ✓; CLAUDE.md status/decisions (cost-on-button addition, paid-door placement) + staleness sweep + commit named "checkpoint 12" (Task 5) ✓.
- **Placeholder scan:** no TBD/TODO; every step has complete code; the geometry-verification step (Task 3, Step 3) is a concrete arithmetic check with the actual grid rows quoted, not a vague "make sure it's right."
- **Type consistency check:** `MapEntity.cost?: number` (Task 1) matches every read site: `entity.cost !== undefined` and `entity.cost` passed to `gameState.spendPoints()` in `createButton()` (Task 2) — both against the same optional field, no `MapEntity.cost` vs. a differently-named field mismatch anywhere. `createButton()`'s new signature `(entity, doorMeshById, raycastRegistry, onDoorStateChanged, gameState)` matches its one call site in the constructor's dispatch loop exactly (Task 2, same file). `corridors_button_2`'s `cost: 300` (Task 3) is a plain number literal assigned to the same optional field Task 1 defined — no type mismatch.
- **Compile-safety check:** unlike checkpoint 11's test-terminal removal (which required types/content/MapEntitySystem to land in one commit because of `noUnusedParameters`/union-literal removal), this checkpoint only *adds* an optional field — Task 1 alone compiles standalone (nothing yet reads the new field), Task 2 alone would fail to compile without Task 1 already landed (references `entity.cost`), and Task 3 alone would fail to compile without Task 1 landed (object literal specifies an unknown `cost` property) — so the three tasks must run in this exact order (1, then 2, then 3), but each is a valid, independently reviewable, independently compilable commit once its dependency is satisfied, unlike checkpoint 11 where three files had no valid intermediate ordering at all.
