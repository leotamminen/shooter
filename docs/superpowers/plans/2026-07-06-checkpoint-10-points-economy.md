# Checkpoint 10: Points Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `pointsBalance` a real, spendable currency: add `GameState.spendPoints()`, switch the HUD's live top-right display from `score` to `pointsBalance`, and add a temporary "test terminal" interactable that proves `spendPoints()` gates and deducts correctly through a real player interaction.

**Architecture:** `GameState.spendPoints(amount)` is a single guarded mutator, following the same pattern as the existing `addScore()`/`resetScore()` (only `pointsBalance` is ever touched by spending; `score` stays the untouched permanent total). The test terminal is implemented as a new, explicitly-temporary `MapEntity` type (`"test_terminal"`) spawned by `MapEntitySystem` the same way buttons/pickups already are — not hardcoded in `main.ts` — so it's data-driven and trivially deletable at checkpoint 11 by removing one type, one content entry, and one spawn method.

**Tech Stack:** TypeScript, Three.js, Vite, plain DOM. No test framework in this project — verification is `npm run build` plus manual browser testing, per every prior checkpoint.

## Global Constraints

- `addScore()` is unchanged: it still increments `score` and `pointsBalance` together. `spendPoints()` is the *only* thing that ever decrements `pointsBalance`, and never touches `score`.
- `spendPoints(amount)` returns `false` and makes **no change** to `pointsBalance` if `pointsBalance < amount`; otherwise it deducts `amount` and returns `true`.
- `RunManager.startNewRun()`'s existing reset (`GameState.resetScore()` zeroing both `score` and `pointsBalance` together) must still hold after this checkpoint — this plan does not touch `resetScore()` or `RunManager`, so this is a verification item (Task 4), not a code change.
- HUD's live top-right number switches from `score` to `pointsBalance` ("Points: N"). The death panel keeps showing `score` ("Score: N"), unchanged — this is the first point at which the two numbers can actually differ in what a player sees.
- The test terminal is explicit, temporary scaffolding: mark it clearly in code (comments calling out "CHECKPOINT 10 SCAFFOLDING — delete at checkpoint 11") and in CLAUDE.md, since checkpoint 11's weapon wall-buy is expected to be the first *real* `spendPoints()` caller and this entity should be deleted once it exists.
- The test terminal must live in `content/maps.ts`'s `test-grid` entities (data-driven, spawned by `MapEntitySystem`), not hardcoded in `main.ts` like the older checkpoint-3 placeholder box — this is what makes it trivially deletable later (remove the type, the content entry, and the one spawn method, and it's gone).

---

## Task 1: `GameState.spendPoints()`

**Files:**
- Modify: `src/state/GameState.ts`

**Interfaces:**
- Produces: `GameState.spendPoints(amount: number): boolean`.

- [ ] **Step 1: Add `spendPoints()` to `src/state/GameState.ts`**

Find the existing `resetScore()` method:

```typescript
  resetScore(): void {
    this.score = 0;
    this.pointsBalance = 0;
  }
```

Add `spendPoints()` directly after it (same class body, still before the `enemyHealth`/`deathSummaryLines` fields):

```typescript
  resetScore(): void {
    this.score = 0;
    this.pointsBalance = 0;
  }

  // The only mutator that ever decrements pointsBalance — addScore() only
  // ever increases both score and pointsBalance together, so this is where
  // the two numbers can finally diverge. score (the permanent total) is
  // never touched here.
  spendPoints(amount: number): boolean {
    if (this.pointsBalance < amount) return false;
    this.pointsBalance -= amount;
    return true;
  }
```

- [ ] **Step 2: Verify the project compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/state/GameState.ts
git commit -m "Checkpoint 10 task 1: add GameState.spendPoints()"
```

---

## Task 2: HUD's live display switches from score to pointsBalance

**Files:**
- Modify: `src/ui/HUD.ts`

**Interfaces:**
- Renames the private field `scoreEl` to `pointsEl` and the private method `updateScore()` to `updatePointsBalance()` — internal to `HUD`, no other file references either name.
- Death panel's `deathScoreEl`/`updateDeathPanel()` are unchanged — still read `gameState.score`.

- [ ] **Step 1: Rename the field declaration**

Find:

```typescript
  private readonly scoreEl: HTMLDivElement;
```

Replace with:

```typescript
  private readonly pointsEl: HTMLDivElement;
```

- [ ] **Step 2: Rename the field's construction in the constructor**

Find:

```typescript
    this.scoreEl = createDiv({
      position: "absolute",
      top: "24px",
      right: "24px",
      fontSize: "16px",
      fontWeight: "bold",
    });
    root.appendChild(this.scoreEl);
```

Replace with:

```typescript
    this.pointsEl = createDiv({
      position: "absolute",
      top: "24px",
      right: "24px",
      fontSize: "16px",
      fontWeight: "bold",
    });
    root.appendChild(this.pointsEl);
```

- [ ] **Step 3: Update the call site in `update()`**

Find:

```typescript
    this.updateScore();
    this.updateModeStatus();
```

Replace with:

```typescript
    this.updatePointsBalance();
    this.updateModeStatus();
```

- [ ] **Step 4: Rename and repoint the update method**

Find:

```typescript
  private updateScore(): void {
    this.scoreEl.textContent = `Score: ${this.gameState.score}`;
  }
```

Replace with:

```typescript
  private updatePointsBalance(): void {
    this.pointsEl.textContent = `Points: ${this.gameState.pointsBalance}`;
  }
```

- [ ] **Step 5: Confirm the death panel is untouched**

Find (should already read exactly this — no edit needed, this step is a verification, not a change):

```typescript
  private updateDeathPanel(): void {
    const dead = this.gameState.playerState === "dead";
    this.deathPanelEl.style.display = dead ? "flex" : "none";
    if (dead) {
      this.deathScoreEl.textContent = `Score: ${this.gameState.score}`;
      this.deathSummaryEl.textContent = this.gameState.deathSummaryLines.join("\n");
    }
  }
```

If this method's body differs from the above (e.g. someone already touched it), stop and report — it must keep reading `gameState.score`, not `pointsBalance`.

- [ ] **Step 6: Verify the project compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/HUD.ts
git commit -m "Checkpoint 10 task 2: HUD live display switches from score to pointsBalance"
```

---

## Task 3: Test-terminal scaffolding (type, content entity, spawn logic, wiring)

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/content/maps.ts`
- Modify: `src/core/MapEntitySystem.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `GameState.spendPoints()` (Task 1).
- Produces: `MapEntity.type` gains `"test_terminal"`. `MapEntitySystem`'s constructor gains a `gameState: GameState` parameter (appended as the 6th/last parameter, after `onDoorStateChanged`).

- [ ] **Step 1: Add the temporary `"test_terminal"` type to `MapEntity` in `src/types/index.ts`**

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
    | "objective";
  position: [number, number, number];
  linkedTo?: string; // e.g. a door linked to the button that opens it
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
    // CHECKPOINT 10 SCAFFOLDING — remove this variant, MapEntitySystem's
    // createTestTerminal(), and every content/maps.ts entity using it, once
    // checkpoint 11's weapon wall-buy adds the first real
    // GameState.spendPoints() caller.
    | "test_terminal";
  position: [number, number, number];
  linkedTo?: string; // e.g. a door linked to the button that opens it
}
```

- [ ] **Step 2: Add the test terminal entity to `test-grid` in `src/content/maps.ts`**

Find the end of `test-grid`'s `entities` array:

```typescript
      { id: "target_3", type: "target", position: [10, 0.9, 12] },
      { id: "target_4", type: "target", position: [2, 0.9, 12] },
    ],
  },
  {
    id: "corridors",
```

Replace with (adds one entity, changes nothing else):

```typescript
      { id: "target_3", type: "target", position: [10, 0.9, 12] },
      { id: "target_4", type: "target", position: [2, 0.9, 12] },
      // CHECKPOINT 10 SCAFFOLDING — remove this entity (and the
      // "test_terminal" MapEntity type in types/index.ts, and
      // MapEntitySystem.createTestTerminal()) once checkpoint 11's weapon
      // wall-buy adds the first real GameState.spendPoints() caller. Placed
      // at row 6, col 6 — open floor, not shared with any other entity.
      { id: "test_terminal_1", type: "test_terminal", position: [12, 0.3, 12] },
    ],
  },
  {
    id: "corridors",
```

- [ ] **Step 3: Replace the full contents of `src/core/MapEntitySystem.ts`**

```typescript
import * as THREE from "three";
import { CELL_SIZE, WALL_HEIGHT } from "./MapLoader";
import { computeCollisionBox } from "./utils/CollisionBox";
import type { MapDef, MapEntity } from "../types";
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

// CHECKPOINT 10 SCAFFOLDING — delete these four constants and
// createTestTerminal() below once checkpoint 11's weapon wall-buy adds the
// first real GameState.spendPoints() caller. This whole entity exists only
// to prove spendPoints() gates/deducts correctly through a real player
// interaction, not synthetic testing.
const TEST_TERMINAL_COLOR = 0xff00ff;
const TEST_TERMINAL_EMISSIVE = 0x550055;
const TEST_TERMINAL_SIZE = 0.4;
const TEST_TERMINAL_COST = 50;

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
    gameState: GameState,
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
      } else if (entity.type === "test_terminal") {
        this.createTestTerminal(entity, gameState, raycastRegistry);
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

  // CHECKPOINT 10 SCAFFOLDING — delete this method (and the four constants
  // above, the "test_terminal" MapEntity type in types/index.ts, and its
  // content/maps.ts entry) once checkpoint 11's weapon wall-buy adds the
  // first real spendPoints() caller. No RunManager.registerResettable()
  // call here: unlike doors/pickups, this entity has no visible on/off
  // state to reset — pointsBalance itself already resets on its own, via
  // RunManager -> GameState.resetScore().
  private createTestTerminal(
    entity: MapEntity,
    gameState: GameState,
    raycastRegistry: RaycastRegistry,
  ): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(TEST_TERMINAL_SIZE, TEST_TERMINAL_SIZE, TEST_TERMINAL_SIZE),
      new THREE.MeshStandardMaterial({
        color: TEST_TERMINAL_COLOR,
        emissive: TEST_TERMINAL_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      const spent = gameState.spendPoints(TEST_TERMINAL_COST);
      if (spent) {
        console.log(
          `Test terminal: spent ${TEST_TERMINAL_COST} points, balance now ${gameState.pointsBalance}`,
        );
      } else {
        console.log(
          `Test terminal: rejected (need ${TEST_TERMINAL_COST}, have ${gameState.pointsBalance}) — balance unchanged`,
        );
      }
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);
  }
}
```

- [ ] **Step 4: Pass `gameState` into the `MapEntitySystem` construction in `src/main.ts`**

Find:

```typescript
  const mapEntitySystem = new MapEntitySystem(
    mapDef,
    weaponSystem,
    runManager,
    raycastRegistry,
    () => playerController.rebuildCollisionBoxes(),
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
  );
```

- [ ] **Step 5: Verify the project compiles**

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/content/maps.ts src/core/MapEntitySystem.ts src/main.ts
git commit -m "Checkpoint 10 task 3: add temporary test-terminal scaffolding for spendPoints()"
```

---

## Task 4: Manual verification against acceptance criteria

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL in a browser. Open the browser's devtools console — the test terminal's feedback is `console.log`, not on-screen.

- [ ] **Step 2: Verify the HUD's top-right number now tracks pointsBalance**

Start a Zombie Survival run (Test Grid, default weapon/enemy). Confirm the top-right HUD number reads "Points: 0" at the start, and increases on hits/kills exactly as "Score: N" used to (both numbers move together at this point, since nothing has been spent yet).

- [ ] **Step 3: Verify the test terminal rejects an insufficient balance**

Immediately after spawning (0 points), walk to the test terminal (magenta cube, test-grid row 6 area) and press E. Confirm in the devtools console: a rejection message naming the required cost and the current (unchanged) balance. Confirm the HUD's displayed number does not change.

- [ ] **Step 4: Verify the test terminal spends correctly once you have enough points**

Get at least 50 points (a few zombie hits/kills). Press E on the test terminal again. Confirm in the console: a success message with the new (lower) balance, and confirm the HUD's displayed "Points: N" visibly drops by exactly 50.

- [ ] **Step 5: Verify the death panel still shows the permanent score, not the spent-down balance**

After spending at least once (so `pointsBalance < score`), let the player die. Confirm the death panel shows "Score: N" using the higher, never-decremented total — not the lower, spent-down `pointsBalance` the HUD's live corner was showing moments earlier.

- [ ] **Step 6: Verify a new run resets pointsBalance to 0 alongside score**

Click Respawn (or Main Menu, currently the same alias). Confirm the HUD's top-right number resets to "Points: 0" and stays in sync with a freshly-zeroed score from that point on — the existing `RunManager`/`GameState.resetScore()` reset path is unmodified by this checkpoint and still zeroes both together.

---

## Task 5: Update CLAUDE.md and commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the folder structure tree**

Update these lines:

```
    GameState.ts                [1]
```
→
```
    GameState.ts                [1, spendPoints() added at 10 — the first real pointsBalance spender-gate]
```

```
    MapEntitySystem.ts          [6, spawns door/button/pickup meshes from MapDef.entities; onDoorStateChanged callback added at 8.5]
```
→
```
    MapEntitySystem.ts          [6, spawns door/button/pickup meshes from MapDef.entities; onDoorStateChanged callback added at 8.5; temporary test_terminal scaffolding added at 10, remove at 11]
```

```
    maps.ts                     [1, populated at 5; name field + second map ("corridors") added at 9.5]
```
→
```
    maps.ts                     [1, populated at 5; name field + second map ("corridors") added at 9.5; temporary test_terminal scaffolding entity added at 10 (test-grid only), remove at 11]
```

```
    HUD.ts                      [3.5, gameplay overlay: crosshair/ammo/reload/interact prompts]
                                 [7 adds round display + death-panel rounds-survived text]
                                 [8 both now sourced from the active GameMode, not GameState fields]
                                 [8.5 reads its occlusion target list from RaycastRegistry, excluding the labeled enemy's own mesh]
```
→
```
    HUD.ts                      [3.5, gameplay overlay: crosshair/ammo/reload/interact prompts]
                                 [7 adds round display + death-panel rounds-survived text]
                                 [8 both now sourced from the active GameMode, not GameState fields]
                                 [8.5 reads its occlusion target list from RaycastRegistry, excluding the labeled enemy's own mesh]
                                 [10 live top-right display switches from score to pointsBalance ("Points: N"); death panel still shows score]
```

- [ ] **Step 2: Update the Checkpoints list**

Add a new line immediately after checkpoint 9.5's line:

```
10. Points economy — GameState.spendPoints() (the first real pointsBalance spender-gate), HUD's live top-right display switches from score to pointsBalance, temporary test-terminal scaffolding proving the gate works (removed at 11)
```

- [ ] **Step 3: Update "Current status"**

Change the opening sentence from `Checkpoint 9.5 complete.` to `Checkpoint 10 complete.`, and append a new paragraph after the existing checkpoint-9.5 paragraph (before `## Decisions log`):

```

`GameState.spendPoints(amount): boolean` (checkpoint 10) is the first mutator that can ever decrement `pointsBalance` — it returns `false` and changes nothing if the balance is insufficient, otherwise deducts `amount` and returns `true`; `score` is never touched by it, and `addScore()` is completely unchanged (still increments both together). `ui/HUD.ts`'s live top-right corner now reads `pointsBalance` ("Points: N") instead of `score` — the death panel is unchanged and still shows `score` ("Score: N"), so this is the first checkpoint where the two numbers can actually diverge in front of the player, exactly as the original checkpoint-5-era design intended. A temporary "test terminal" interactable (a magenta cube, `content/maps.ts`'s `test-grid` map only, id `test_terminal_1`) exists purely to prove `spendPoints()` gates and deducts correctly through a real interaction rather than synthetic testing: pressing E on it calls `spendPoints(50)` and `console.log`s either the new balance (success) or a rejection naming the shortfall (failure, balance left unchanged). It's implemented as a new, explicitly-temporary `MapEntity` type (`"test_terminal"`) spawned by `MapEntitySystem`, not hardcoded in `main.ts` — data-driven like doors/buttons/pickups, so removing it at checkpoint 11 (once the weapon wall-buy becomes the first *real* `spendPoints()` caller) is one type, one content entry, and one spawn method, all clearly marked "CHECKPOINT 10 SCAFFOLDING" in code. Verified in-browser: the HUD's top-right number tracks `pointsBalance` and rises on hits/kills exactly as `score` used to; interacting with the terminal below 50 points logs a rejection and leaves the displayed number unchanged; interacting with 50+ points logs success and the displayed number visibly drops by 50; dying still shows the higher, un-decremented `score` on the death panel even after spending; and Respawn/Main Menu still zeroes both `score` and `pointsBalance` together, unchanged from before this checkpoint.
```

- [ ] **Step 4: Update the now-outdated decisions-log entry about spending**

Find:

```
- `score` is a permanent total, never decreased; `pointsBalance` is the future spendable currency for wall-buys etc. They start identical (both incremented together via `GameState.addScore()`, a single mutator so they can't drift out of sync by accident) but will diverge once spending exists (checkpoint 6+, spending only decrements `pointsBalance`). Do not conflate them later.
```

Replace with:

```
- **Superseded at checkpoint 10** (was: "`score` is a permanent total, never decreased; `pointsBalance` is the future spendable currency for wall-buys etc. They start identical (both incremented together via `GameState.addScore()`, a single mutator so they can't drift out of sync by accident) but will diverge once spending exists (checkpoint 6+, spending only decrements `pointsBalance`). Do not conflate them later."): spending now exists — `GameState.spendPoints()` is the one mutator that ever decrements `pointsBalance`, and `score` still never decreases. The two numbers can now genuinely diverge the first time a player spends, which is exactly why `ui/HUD.ts`'s live corner reads `pointsBalance` while the death panel still reads `score` (see the checkpoint-10 decisions below).
```

- [ ] **Step 5: Add new decisions log entries**

Append after the entry you just updated in Step 4 (or after the last existing decisions-log line if the log has grown past that point — search for it, don't assume a fixed line number), before `## Future mechanics`:

```
- `GameState.spendPoints(amount)` (checkpoint 10) mirrors `addScore()`'s "one guarded mutator" shape: callers never touch `pointsBalance` directly, they call a method that enforces the rule (here, "can't go negative") and reports success/failure via a boolean return rather than throwing — a caller like the test terminal (or checkpoint 11's real wall-buy) is expected to branch on the return value, not assume it always succeeds.
- `ui/HUD.ts`'s live top-right display was switched from `score` to `pointsBalance` (checkpoint 10) — renamed `scoreEl`/`updateScore()` to `pointsEl`/`updatePointsBalance()` in the same change, since keeping the old names while displaying a different field would be misleading to the next reader. The death panel's `deathScoreEl`/`updateDeathPanel()` were deliberately left reading `score` and left unrenamed — the death panel's whole point is showing the permanent run total, not the currently-spendable balance.
- The checkpoint-10 test terminal is implemented as a `MapEntity` (`"test_terminal"`, spawned by `MapEntitySystem`), not hardcoded in `main.ts` like the checkpoint-3 placeholder interactable box — deliberately, so that deleting it at checkpoint 11 is a clean, self-contained removal (one type, one content entry, one spawn method) rather than requiring surgery on `main.ts`'s composition-root code the way the checkpoint-3 box still would. Every piece is commented "CHECKPOINT 10 SCAFFOLDING" specifically so a future reader (or the checkpoint-11 implementer) can find and remove all of it via a single search.
```

- [ ] **Step 6: Update the now-partially-stale "Spending points" future-mechanics bullet**

Find:

```
- **Spending points**: weapon wall-buys and paid interacts, drawing from `pointsBalance` (not `score`), extending `MapEntity`'s existing `"button"`/`"pickup"` types with a cost field. Not designed yet.
```

Replace with:

```
- **Spending points**: the mechanism now exists (`GameState.spendPoints()`, checkpoint 10) and is proven working via the temporary test terminal — but every *real* spender (weapon wall-buys, paid interacts) is still undesigned. The likely shape is still extending `MapEntity`'s existing `"button"`/`"pickup"` types with a cost field rather than needing a whole new entity type per spendable thing, but that's not decided yet. Checkpoint 11's weapon wall-buy is expected to be the first real caller, at which point the checkpoint-10 test terminal (see the decisions log) should be deleted.
```

- [ ] **Step 7: Verify the project still builds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Checkpoint 10: points economy — pointsBalance becomes real currency

Adds GameState.spendPoints(amount): boolean, the first mutator that can
decrement pointsBalance (score is never touched, addScore() unchanged).
ui/HUD.ts's live top-right display switches from score to pointsBalance
("Points: N"); the death panel keeps showing the permanent score. A
temporary "test terminal" MapEntity (test-grid only) proves spendPoints()
gates and deducts correctly through a real interaction — clearly marked
as checkpoint-10 scaffolding to be deleted once checkpoint 11's weapon
wall-buy becomes the first real spender.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Verify the commit**

Run: `git status` and `git log -1 --stat`
Expected: working tree clean; the commit (or the sequence since Task 1) touches `src/state/GameState.ts`, `src/ui/HUD.ts`, `src/types/index.ts`, `src/content/maps.ts`, `src/core/MapEntitySystem.ts`, `src/main.ts`, `CLAUDE.md`, plus this plan doc.

---

## Self-Review Notes

- **Spec coverage:** `GameState.spendPoints()` with exact guard/return semantics (Task 1) ✓; `addScore()` unchanged, `score` never touched by spending (Task 1, verified by inspection — no edit to `addScore()`) ✓; `RunManager`'s existing reset still zeroing both together, confirmed not regressed since neither `RunManager` nor `resetScore()` are touched by this plan (Task 4, Step 6 verifies this end-to-end) ✓; HUD live display swap to `pointsBalance`, death panel unchanged (Task 2) ✓; temporary test terminal, data-driven via `content/maps.ts`, distinct color, fixed cost, console.log on both outcomes, clearly marked scaffolding (Task 3) ✓; acceptance-criteria walkthrough including the specific insufficient-then-sufficient-then-death-then-respawn sequence (Task 4) ✓; CLAUDE.md status/decisions/future-mechanics + commit named "checkpoint 10" (Task 5) ✓.
- **Placeholder scan:** no TBD/TODO; every step has complete code; the test terminal's position was checked against every existing `test-grid` entity to confirm no cell collision (row 6, col 6 — `target_3` at row 6 col 5, `target_4` at row 6 col 1, neither collides).
- **Type consistency check:** `spendPoints(amount: number): boolean` (Task 1) matches its only caller, `gameState.spendPoints(TEST_TERMINAL_COST)` (Task 3) — same single numeric argument, boolean checked via `if (spent)`. `MapEntitySystem`'s constructor gains `gameState: GameState` as its 6th parameter (Task 3) — matches the call site in `main.ts`, which appends `gameState` as the 6th argument in the same task, after the existing 5. `pointsEl`/`updatePointsBalance()` (Task 2) are used consistently — declared, constructed, and called from the one place each, no leftover `scoreEl`/`updateScore()` reference remains in `HUD.ts` after Task 2 (verified: the only other `score`-named symbol in that file is `deathScoreEl`/`updateDeathPanel()`, which is explicitly meant to stay as-is).
