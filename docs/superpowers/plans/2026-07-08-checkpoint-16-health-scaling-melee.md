# Checkpoint 16: Round-Based Zombie Health Scaling + Melee Knife Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make later rounds require more hits to kill a zombie (health scales with round number), and add a melee knife as a second, ammo-free way to deal damage — deliberately tuned so its damage exactly matches zombie base health, making round N require exactly N knife hits.

**Architecture:** `ZombieSurvival.startRound()` computes each round's zombie max health (`enemyDef.health * round`) and passes it into `EnemyAI`'s constructor as an explicit override, never mutating the shared `EnemyDef` object. The `Weapon` interface is minimally adapted to also describe melee weapons: ammo/reload fields become optional, and a new `meleeRange?: number` field is both melee-specific data and the ranged-vs-melee discriminator (its presence means "this is melee"). `WeaponSystem` gains a completely separate melee track (a `meleeWeapon` field — mutable state, not a constant, since a future Bowie knife will reassign it — and a `meleeEquipped` boolean) layered on top of the existing gun-slot inventory without touching it, reusing the existing `Raycast.fromCamera()`'s `maxDistance` parameter for melee's short range instead of building a new hit-detection system.

**Tech Stack:** TypeScript (`strict`, `noUnusedParameters`, `noUnusedLocals`, `erasableSyntaxOnly`), no new dependencies.

## Global Constraints

- Zombie health scaling formula is exactly `enemyDef.health * round`, uncapped — no maximum round, no diminishing scaling. `ZombieSurvival`'s shared `enemyDef` object is never mutated; the scaled value is a fresh local number computed once per round and passed as an explicit constructor argument to each spawned `EnemyAI`.
- `Weapon.magSize`, `Weapon.reloadTime`, `Weapon.startingReserveAmmo` become optional (`?`). `Weapon.cost` stays required. A new `Weapon.meleeRange?: number` field is added — its presence is the sole ranged-vs-melee discriminator (no separate `kind`/`type` tag).
- The knife: `id: "knife"`, `damage: 100` — **exactly equal to the zombie `EnemyDef`'s base `health` (100)**, so round N's scaled zombie health (`100 * N`) divides evenly by the knife's damage into exactly N hits. This is deliberate, load-bearing coupling between two numbers in two different files (`content/enemies.ts`'s `health: 100` and `content/weapons.ts`'s knife `damage: 100`) — every place either number appears in code or docs must say so explicitly, so a future edit to one doesn't silently break the other.
- Knife has no `magSize`/`reloadTime`/`startingReserveAmmo` (omitted, now optional) and a placeholder `cost: 0` (required field, but the knife is never linked from any `wall_buy`, so the value is never actually read).
- Melee state (`meleeWeapon`) is tracked as reassignable instance state defaulting to the knife, not a hardcoded constant — even though only one melee weapon exists this checkpoint, a future Bowie knife pickup is planned to reassign it.
- Melee is structurally separate from the gun-slot inventory: no gun slot ever holds the knife, equipping/unequipping melee never touches `slots`/`activeSlotIndex`, and a gun's ammo/reload state is provably untouched while melee is equipped (nothing reads or writes it during that time).
- Melee hit-detection reuses `Raycast.fromCamera()` (already supports a `maxDistance` parameter) and the existing `userData.onHit` hook every other damage source already uses — no new raycasting or AABB-based system.
- `fireRate`'s swing-cooldown value for the knife (`0.8`) is a first-cut, adjustable during manual verification, same as MAC-10's `fireRate` was at checkpoint 15.
- No new viewmodel for the knife — reuses the existing generic placeholder mesh, same precedent as MAC-10 (checkpoint 13's still-deferred per-weapon-appearance decision).
- **Compile-order note (important, discovered while drafting this plan — see Task 3's own note for the full explanation):** widening `Weapon.magSize`/`reloadTime`/`startingReserveAmmo` to optional is NOT backward-compatible at the type-check level against the *current* (pre-checkpoint-16) `src/core/WeaponSystem.ts`, even though it's runtime-safe (every weapon that exists today still always provides those fields). The current file reads them as guaranteed `number`s in several places; TypeScript strict mode will flag every one of those reads once the fields become optional, until `WeaponSystem.ts` itself is rewritten (Task 5) to narrow them via type guards. This is why the interface change (Task 3) is sequenced to land only after the two files unaffected by it (`EnemyAI.ts`/`ZombieSurvival.ts`, Tasks 1-2) are already done, and is immediately followed by the knife content addition (Task 4, which doesn't touch `WeaponSystem.ts` and so doesn't change this state) and then the `WeaponSystem.ts` rewrite (Task 5) that resolves it.
- `EnemyAI`'s constructor signature change and `WeaponSystem`'s constructor signature change each break exactly one existing call site (`ZombieSurvival.startRound()` and `main.ts`'s `startGame()` respectively) — each pair of tasks is sequenced so the first task's `npm run build` shows exactly the expected error(s), and the next task in the pair is what restores a clean whole-project build, mirroring checkpoint 15's `setWeapon()`/`pickupWeapon()` pattern.

---

### Task 1: `EnemyAI` gains a `maxHealth` override parameter

**Files:**
- Modify: `src/core/EnemyAI.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `EnemyAI`'s constructor gains a new required parameter, `maxHealth: number`, inserted immediately after `def: EnemyDef`. Task 2 (`ZombieSurvival`) is the only call site and must be updated to pass it.

This task alone will leave `modes/ZombieSurvival.ts` failing to compile (it still calls the old, now-mismatched constructor signature) — that's expected; Task 2 fixes it immediately next.

- [ ] **Step 1: Add the `maxHealth` field and constructor parameter**

The current constructor and its surrounding fields:

```typescript
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
```

Change it to:

```typescript
export class EnemyAI {
  readonly id: string;
  readonly mesh: THREE.Mesh;

  health: number;
  dead = false;

  private readonly def: EnemyDef;
  // The actual max health this specific instance was spawned with
  // (checkpoint 16) -- not necessarily def.health, since ZombieSurvival
  // scales health per round (def.health * round) without mutating the
  // shared EnemyDef. Used both as the starting health and as the "max"
  // value reported to the HUD label, so the label reads correctly at any
  // round (e.g. "300/300" at round 3, not "300/100").
  private readonly maxHealth: number;
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
    maxHealth: number,
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
    this.maxHealth = maxHealth;
    this.scene = scene;
    this.camera = camera;
    this.audioSystem = audioSystem;
    this.gameState = gameState;
    this.playerState = playerState;
    this.raycastRegistry = raycastRegistry;
    this.health = maxHealth;
```

(Everything from `this.mesh = new THREE.Mesh(...)` onward in the constructor, and every other method, is unchanged — except `update()`'s `gameState.enemyHealth` sync, changed in Step 2 below.)

- [ ] **Step 2: Use `maxHealth` instead of `def.health` in the HUD sync**

In `update()`, the current sync reads:

```typescript
    this.gameState.enemyHealth[this.id] = {
      current: this.health,
      max: this.def.health,
      position: {
        x: this.mesh.position.x,
        y: this.mesh.position.y + LABEL_HEIGHT_OFFSET,
        z: this.mesh.position.z,
      },
    };
```

Change `max: this.def.health,` to `max: this.maxHealth,`:

```typescript
    this.gameState.enemyHealth[this.id] = {
      current: this.health,
      max: this.maxHealth,
      position: {
        x: this.mesh.position.x,
        y: this.mesh.position.y + LABEL_HEIGHT_OFFSET,
        z: this.mesh.position.z,
      },
    };
```

- [ ] **Step 3: Verify `EnemyAI.ts` itself has no new errors**

Run: `npm run build`
Expected: fails with exactly one error — `modes/ZombieSurvival.ts` calling `new EnemyAI(...)` with the old argument list (missing `maxHealth`, or a type mismatch on the shifted positional arguments). Confirm no OTHER error appears (i.e., nothing inside `EnemyAI.ts` itself is broken). If you see any error you don't recognize as exactly this one expected downstream break, stop and report BLOCKED rather than guessing a fix.

- [ ] **Step 4: Commit**

```bash
git add src/core/EnemyAI.ts
git commit -m "Checkpoint 16 task 1: add EnemyAI maxHealth override parameter"
```

---

### Task 2: `ZombieSurvival` computes and passes per-round health

**Files:**
- Modify: `src/modes/ZombieSurvival.ts`

**Interfaces:**
- Consumes: `EnemyAI`'s new constructor signature (Task 1) — `maxHealth: number` as the third positional argument.
- Produces: nothing new for later tasks. This is the commit that restores a clean whole-project build after Task 1's expected error.

- [ ] **Step 1: Add `healthForRound()` and wire it into `startRound()`**

The current `zombiesForRound()`/`startRound()`:

```typescript
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
```

Change it to:

```typescript
  private zombiesForRound(round: number): number {
    return round;
  }

  // Round-based health scaling (checkpoint 16): each zombie's max health is
  // the EnemyDef's base health times the current round number -- round 1
  // zombies have their normal base health, round 2 zombies have double,
  // round 3 triple, and so on, uncapped (matching real CoD Zombies scaling
  // being large at high rounds -- intended, not a bug). Computed fresh here
  // per round, never mutating this.enemyDef itself, since that one EnemyDef
  // object is shared and reused across every spawn in every round.
  private healthForRound(round: number): number {
    return this.enemyDef.health * round;
  }

  private startRound(): void {
    const count = this.zombiesForRound(this.currentRound);
    const health = this.healthForRound(this.currentRound);
    this.activeEnemies = [];

    for (let i = 0; i < count; i++) {
      const spawnPoint = this.spawnPoints[i % this.spawnPoints.length];
      const enemy = new EnemyAI(
        `zombie-r${this.currentRound}-${i}`,
        this.enemyDef,
        health,
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
```

(No other line in the file changes — `update()`, `getStatusLine()`, `getSummaryLines()`, `resetRun()` are all unaffected; `resetRun()` already calls `startRound()` after resetting `currentRound = 1`, so it automatically re-computes round-1 health for free with no changes needed there.)

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors — this restores a clean whole-project build after Task 1's expected single error.

- [ ] **Step 3: Commit**

```bash
git add src/modes/ZombieSurvival.ts
git commit -m "Checkpoint 16 task 2: compute and pass per-round zombie health"
```

---

### Task 3: Extend the `Weapon` interface for melee

**Files:**
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: the updated `Weapon` interface — `magSize?`, `reloadTime?`, `startingReserveAmmo?` (all now optional), `meleeRange?: number` (new). Task 4 (knife content) and Task 5 (`WeaponSystem`'s melee rewrite) both depend on this shape.

**Important — this task will NOT produce a clean `npm run build`, and that is expected, not a mistake to fix.** Widening `magSize`/`reloadTime`/`startingReserveAmmo` from required to optional is runtime-safe (every weapon that exists before this checkpoint still always provides them), but it is not safe at the TypeScript level against the *current*, not-yet-rewritten `src/core/WeaponSystem.ts`: that file reads those three fields in several places assuming they're always defined `number`s, and TypeScript strict mode will now flag every one of those reads as possibly `undefined`. This was confirmed by actually making this exact change and running `npm run build` while writing this plan — the result is **exactly 7 errors, all inside `src/core/WeaponSystem.ts`**, at these locations (line numbers may shift slightly by the time you run this, but the count and nature should match closely):

```
src/core/WeaponSystem.ts(75,7): error TS2322: Type 'number | undefined' is not assignable to type 'number'.
src/core/WeaponSystem.ts(76,7): error TS2322: Type 'number | undefined' is not assignable to type 'number'.
src/core/WeaponSystem.ts(137,7): error TS2322: Type 'number | undefined' is not assignable to type 'number'.
src/core/WeaponSystem.ts(138,7): error TS2322: Type 'number | undefined' is not assignable to type 'number'.
src/core/WeaponSystem.ts(202,29): error TS2532: Object is possibly 'undefined'.
src/core/WeaponSystem.ts(206,5): error TS2322: Type 'number | undefined' is not assignable to type 'number'.
src/core/WeaponSystem.ts(210,20): error TS2532: Object is possibly 'undefined'.
```

Task 5 (not this one) rewrites `WeaponSystem.ts` with type guards that resolve all of these. **Do not modify `WeaponSystem.ts` in this task** — that's explicitly Task 5's job, done as its own focused, independently-reviewable change.

- [ ] **Step 1: Update the `Weapon` interface**

The current interface:

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
```

Replace it with:

```typescript
export interface Weapon {
  id: string;
  name: string; // player-facing display text, e.g. "M1911" (id stays the lookup key)
  damage: number;
  fireRate: number; // seconds between shots (ranged) or between swings (melee) -- same field, same "cooldown between uses" semantics either way
  magSize?: number; // ranged only (checkpoint 16 made this optional so a melee weapon, which has none, can share this same interface/content array rather than a parallel type/system)
  reloadTime?: number; // ranged only, seconds
  startingReserveAmmo?: number; // ranged only
  cost: number; // pointsBalance price at a "wall_buy" MapEntity linked to this weapon's id -- still required even for melee weapons not linked from any wall_buy (see content/weapons.ts's knife entry for why)
  fireSoundId: string; // references SoundDef.id
  model?: string; // path to .glb, added when 3D models exist
  meleeRange?: number; // melee only (checkpoint 16) -- presence of this field IS the ranged-vs-melee discriminator: a Weapon with meleeRange set is melee, one without is ranged. No separate "kind"/"type" tag, to avoid two fields that could disagree with each other.
}
```

- [ ] **Step 2: Verify the build shows exactly the expected `WeaponSystem.ts` errors**

Run: `npm run build`
Expected: fails with errors ONLY inside `src/core/WeaponSystem.ts` (per the list above — the exact count/line numbers may drift slightly, but every error should be in that one file and should be a `number | undefined` / `possibly undefined` complaint about `magSize`/`reloadTime`/`startingReserveAmmo`). If any error appears in a DIFFERENT file, or an error inside `WeaponSystem.ts` looks unrelated to these three fields, stop and report BLOCKED rather than guessing.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "Checkpoint 16 task 3: extend the Weapon interface to support melee weapons"
```

---

### Task 4: Add the knife to `content/weapons.ts`

**Files:**
- Modify: `src/content/weapons.ts`

**Interfaces:**
- Consumes: the updated `Weapon` interface (Task 3).
- Produces: a third `WEAPONS` entry, `id: "knife"`. Consumed by Task 6 (`main.ts`'s `findById(WEAPONS, "knife")`).

**Note:** `npm run build` will still show the same `WeaponSystem.ts` errors Task 3 introduced (this task doesn't touch that file, so it neither fixes nor worsens that pre-existing, already-expected state) — do not treat those as caused by this task, and do not attempt to fix them here.

- [ ] **Step 1: Add the knife entry**

The current file:

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
  // MAC-10 (checkpoint 15): the first full-auto weapon. No new firing
  // mechanics needed -- WeaponSystem.update() already fires repeatedly at
  // weapon.fireRate for as long as mouse1 is held (this is what already
  // makes the pistol "semi-auto-feeling" at fireRate 0.3; a much smaller
  // fireRate is the same mechanism read as full-auto). damage is
  // deliberately lower than the pistol's per-shot 10 -- the standard
  // SMG-vs-pistol tradeoff of lower per-hit damage offset by much higher
  // fire rate. fireRate/reloadTime are first-cut values, tuned by manual
  // verification (Task 2) rather than derived from a formula.
  {
    id: "mac10",
    name: "MAC-10",
    damage: 8,
    fireRate: 0.08,
    magSize: 30,
    reloadTime: 1.2,
    startingReserveAmmo: 240,
    cost: 1200,
    fireSoundId: "pistol_fire",
  },
];
```

Replace it with:

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
  // MAC-10 (checkpoint 15): the first full-auto weapon. No new firing
  // mechanics needed -- WeaponSystem.update() already fires repeatedly at
  // weapon.fireRate for as long as mouse1 is held (this is what already
  // makes the pistol "semi-auto-feeling" at fireRate 0.3; a much smaller
  // fireRate is the same mechanism read as full-auto). damage is
  // deliberately lower than the pistol's per-shot 10 -- the standard
  // SMG-vs-pistol tradeoff of lower per-hit damage offset by much higher
  // fire rate. fireRate/reloadTime are first-cut values, tuned by manual
  // verification (Task 2) rather than derived from a formula.
  {
    id: "mac10",
    name: "MAC-10",
    damage: 8,
    fireRate: 0.08,
    magSize: 30,
    reloadTime: 1.2,
    startingReserveAmmo: 240,
    cost: 1200,
    fireSoundId: "pistol_fire",
  },
  // Knife (checkpoint 16): the first melee weapon -- no magSize/reloadTime/
  // startingReserveAmmo (all now optional on Weapon), meleeRange present
  // instead, which is what marks this as melee rather than ranged.
  //
  // damage: 100 is NOT an arbitrary choice -- it is deliberately exactly
  // equal to content/enemies.ts's zombie EnemyDef.health (100). Round N's
  // scaled zombie health is enemyDef.health * N (see
  // modes/ZombieSurvival.ts's healthForRound()), so with knife damage also
  // at exactly 100, round N always takes exactly N knife hits to kill a
  // zombie -- that's the explicit design goal, not a coincidence. If either
  // number ever changes, the other must change with it, or this property
  // breaks silently. See CLAUDE.md's checkpoint-16 decisions log.
  //
  // cost: 0 is a placeholder -- Weapon.cost is a required field, but no
  // wall_buy links to "knife" (none is planned; the knife is always
  // available, not purchasable), so this value is never actually read.
  //
  // fireRate here means swing cooldown (seconds between swings), reusing
  // the same field ranged weapons use for time-between-shots -- a
  // first-cut value, tune during manual verification (Task 7) same as
  // MAC-10's fireRate was at checkpoint 15.
  {
    id: "knife",
    name: "Knife",
    damage: 100,
    fireRate: 0.8,
    meleeRange: 2,
    cost: 0,
    fireSoundId: "pistol_fire",
  },
];
```

- [ ] **Step 2: Verify the build shows only the same pre-existing `WeaponSystem.ts` errors**

Run: `npm run build`
Expected: fails with the same errors Task 3 already left (only inside `src/core/WeaponSystem.ts`) — this task's own change (a new `WEAPONS` array entry) introduces no new errors anywhere. If you see a NEW error not already present after Task 3, or an error in any file other than `WeaponSystem.ts`, stop and report BLOCKED.

- [ ] **Step 3: Commit**

```bash
git add src/content/weapons.ts
git commit -m "Checkpoint 16 task 4: add the knife as the first melee weapon"
```

---

### Task 5: `WeaponSystem` gains melee state, V-key equip, and swing logic

**Files:**
- Modify: `src/core/WeaponSystem.ts`

**Interfaces:**
- Consumes: the updated `Weapon` interface (Task 3).
- Produces: `WeaponSystem`'s constructor gains a new required parameter, `meleeWeapon: Weapon`, inserted immediately after the existing `weapon: Weapon` parameter. Task 6 (`main.ts`) is the only call site and must be updated to pass it.

This task resolves all 7 of Task 3's expected `WeaponSystem.ts` errors (the type guards below narrow every place that previously assumed `magSize`/`reloadTime`/`startingReserveAmmo` were always defined). It will, in turn, leave `main.ts` failing to compile (its one `new WeaponSystem(...)` call still uses the old argument list) — that's expected; Task 6 fixes it immediately next.

- [ ] **Step 1: Replace the full contents of `src/core/WeaponSystem.ts`**

```typescript
import * as THREE from "three";
import { Raycast } from "./utils/Raycast";
import type { AudioSystem } from "./AudioSystem";
import type { Weapon } from "../types";
import type { GameState } from "../state/GameState";
import type { RunManager } from "./RunManager";
import type { RaycastRegistry } from "./RaycastRegistry";

// A future perk is planned to raise this to 3 -- kept as one named constant,
// not a magic number scattered through slot-sizing/indexing logic, so that
// change is a one-line edit here, not a code change (checkpoint 15).
const MAX_SLOTS = 2;

// The subset of Weapon a weapon must satisfy to occupy an inventory slot
// (checkpoint 16) -- ammo/reload stats are optional on Weapon itself so a
// melee weapon like the knife can share the same content array/interface
// without needing them (see content/weapons.ts and CLAUDE.md's checkpoint-16
// decisions log). assertRangedWeapon() below is what narrows a plain Weapon
// down to this shape at the few places that actually need it.
type RangedWeapon = Weapon & {
  magSize: number;
  reloadTime: number;
  startingReserveAmmo: number;
};

// The subset of Weapon a weapon must satisfy to be equipped as the melee
// weapon (checkpoint 16) -- meleeRange is optional on Weapon itself for the
// same reason ammo fields are optional: a ranged weapon has no meleeRange.
type MeleeWeapon = Weapon & {
  meleeRange: number;
};

function assertRangedWeapon(weapon: Weapon): asserts weapon is RangedWeapon {
  if (
    weapon.magSize === undefined ||
    weapon.reloadTime === undefined ||
    weapon.startingReserveAmmo === undefined
  ) {
    throw new Error(
      `Weapon "${weapon.id}" has no ammo stats -- cannot be placed in a weapon slot (is it melee?)`,
    );
  }
}

function assertMeleeWeapon(weapon: Weapon): asserts weapon is MeleeWeapon {
  if (weapon.meleeRange === undefined) {
    throw new Error(
      `Weapon "${weapon.id}" has no meleeRange -- cannot be equipped as the melee weapon`,
    );
  }
}

interface WeaponSlot {
  weapon: RangedWeapon;
  currentAmmo: number;
  reserveAmmo: number;
}

export class WeaponSystem {
  isReloading = false;

  private readonly raycast = new Raycast();
  private readonly clock = new THREE.Clock();
  private readonly raycastRegistry: RaycastRegistry;

  private timeSinceLastShot = Infinity;
  private timeSinceLastMeleeSwing = Infinity;
  private reloadTimeRemaining = 0;
  private firing = false;

  // The weapon inventory (checkpoint 15): fixed-size slots, most of them
  // empty at first. Index 0 always starts occupied by startingWeapon; every
  // other slot starts null. Ammo/reserve are tracked per slot, not
  // globally, so switching back to a previously-held weapon restores
  // exactly the ammo it had when you switched away from it. isReloading/
  // reloadTimeRemaining/timeSinceLastShot stay single (not per-slot):
  // switching cancels any in-progress reload of the weapon left behind
  // (see switchToSlot()) rather than tracking independent reload state per
  // weapon -- simpler, and matches most FPS games' weapon-switch behavior.
  private slots: (WeaponSlot | null)[];
  private activeSlotIndex = 0;
  private readonly startingWeapon: RangedWeapon;

  // Melee (checkpoint 16): entirely separate from the gun slot array above
  // -- equipping the knife never touches slots/activeSlotIndex, so
  // switching back to a gun (V again, or a number-key/scroll switch)
  // restores that gun's exact prior ammo/reload state with zero extra
  // bookkeeping, since it was simply never touched while melee was active.
  // meleeWeapon is mutable state, not a hardcoded constant, even though
  // only the knife exists today -- a future Bowie knife pickup would
  // reassign this field to a higher-damage melee weapon (not built yet;
  // see CLAUDE.md future mechanics). startingMeleeWeapon is what reset()
  // restores it to.
  private meleeWeapon: MeleeWeapon;
  private readonly startingMeleeWeapon: MeleeWeapon;
  private meleeEquipped = false;

  private readonly camera: THREE.Camera;
  private readonly audioSystem: AudioSystem;
  private readonly gameState: GameState;

  constructor(
    camera: THREE.Camera,
    weapon: Weapon,
    meleeWeapon: Weapon,
    audioSystem: AudioSystem,
    gameState: GameState,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
  ) {
    assertRangedWeapon(weapon);
    assertMeleeWeapon(meleeWeapon);

    this.camera = camera;
    this.startingWeapon = weapon;
    this.slots = this.buildStartingSlots();
    this.startingMeleeWeapon = meleeWeapon;
    this.meleeWeapon = meleeWeapon;
    this.audioSystem = audioSystem;
    this.gameState = gameState;
    this.raycastRegistry = raycastRegistry;

    window.addEventListener("mousedown", this.handleMouseDown);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("wheel", this.handleWheel, { passive: false });

    runManager.registerResettable(() => this.reset());
  }

  private buildStartingSlots(): (WeaponSlot | null)[] {
    const slots: (WeaponSlot | null)[] = new Array(MAX_SLOTS).fill(null);
    slots[0] = {
      weapon: this.startingWeapon,
      currentAmmo: this.startingWeapon.magSize,
      reserveAmmo: this.startingWeapon.startingReserveAmmo,
    };
    return slots;
  }

  private get activeSlot(): WeaponSlot {
    const slot = this.slots[this.activeSlotIndex];
    if (!slot) {
      throw new Error(`Active slot ${this.activeSlotIndex} is empty -- should never happen`);
    }
    return slot;
  }

  private get weapon(): RangedWeapon {
    return this.activeSlot.weapon;
  }

  get currentAmmo(): number {
    return this.activeSlot.currentAmmo;
  }

  private set currentAmmo(value: number) {
    this.activeSlot.currentAmmo = value;
  }

  get reserveAmmo(): number {
    return this.activeSlot.reserveAmmo;
  }

  private set reserveAmmo(value: number) {
    this.activeSlot.reserveAmmo = value;
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

  // The wall-buy's purchase hook (checkpoint 15 replaces checkpoint 11's
  // setWeapon(), which unconditionally overwrote the single current weapon
  // -- that no longer makes sense once there's more than one slot). If an
  // empty slot exists, this fills it and switches to it; if every slot is
  // full, it replaces only the currently active slot (never a different,
  // unselected slot) -- buying a weapon while full swaps out whatever
  // you're currently holding, not whatever else happens to be in inventory.
  pickupWeapon(weapon: Weapon): void {
    assertRangedWeapon(weapon);
    const emptySlotIndex = this.slots.findIndex((slot) => slot === null);
    const targetIndex = emptySlotIndex !== -1 ? emptySlotIndex : this.activeSlotIndex;
    this.slots[targetIndex] = {
      weapon,
      currentAmmo: weapon.magSize,
      reserveAmmo: weapon.startingReserveAmmo,
    };
    this.switchToSlot(targetIndex);
  }

  private switchToSlot(index: number): void {
    if (!this.slots[index]) return;
    this.activeSlotIndex = index;
    // Switching to a gun slot always exits melee mode (checkpoint 16) --
    // pressing a number key or scrolling always means "I want a gun now."
    this.meleeEquipped = false;
    // Switching cancels any in-progress reload of the weapon being switched
    // away from (it must be restarted if you switch back) and resets the
    // fire-rate cooldown, so the newly active weapon is immediately
    // fireable rather than inheriting the previous weapon's timing.
    this.isReloading = false;
    this.reloadTimeRemaining = 0;
    this.timeSinceLastShot = Infinity;
  }

  reset(): void {
    this.slots = this.buildStartingSlots();
    this.activeSlotIndex = 0;
    this.meleeEquipped = false;
    this.meleeWeapon = this.startingMeleeWeapon;
    this.isReloading = false;
    this.reloadTimeRemaining = 0;
    this.timeSinceLastShot = Infinity;
    this.timeSinceLastMeleeSwing = Infinity;
    this.firing = false;
  }

  update(): void {
    const delta = this.clock.getDelta();
    this.timeSinceLastShot += delta;
    this.timeSinceLastMeleeSwing += delta;

    if (this.isReloading) {
      this.reloadTimeRemaining -= delta;
      if (this.reloadTimeRemaining <= 0) this.finishReload();
    } else if (this.meleeEquipped) {
      if (
        !this.gameState.paused &&
        this.gameState.playerState === "alive" &&
        this.firing &&
        this.timeSinceLastMeleeSwing >= this.meleeWeapon.fireRate
      ) {
        this.meleeSwing();
      }
    } else if (
      !this.gameState.paused &&
      this.gameState.playerState === "alive" &&
      this.firing &&
      this.currentAmmo > 0 &&
      this.timeSinceLastShot >= this.weapon.fireRate
    ) {
      this.fire();
    }

    this.gameState.weaponName = this.meleeEquipped ? this.meleeWeapon.name : this.weapon.name;
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

  // Melee swing (checkpoint 16): reuses the exact same userData.onHit hook
  // and shared RaycastRegistry hitscan guns already use, just with a much
  // shorter maxDistance (meleeWeapon.meleeRange) instead of the default
  // Infinity -- no separate AABB-based melee system needed. No ammo check:
  // melee never consumes ammo.
  private meleeSwing(): void {
    this.timeSinceLastMeleeSwing = 0;

    const hit = this.raycast.fromCamera(
      this.camera,
      this.raycastRegistry.getAll(),
      this.meleeWeapon.meleeRange,
    );
    const onHit = hit?.object.userData.onHit as
      | ((damage: number) => void)
      | undefined;
    onHit?.(this.meleeWeapon.damage);

    this.audioSystem.play(this.meleeWeapon.fireSoundId);
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
      this.gameState.playerState === "alive" &&
      !this.meleeEquipped
    ) {
      this.startReload();
      return;
    }

    // Melee toggle (checkpoint 16): V equips the knife; pressing it again
    // returns to whichever gun slot was active, with that gun's exact
    // ammo/reload state untouched (see the meleeEquipped field comment
    // above).
    if (
      event.code === "KeyV" &&
      !this.gameState.paused &&
      this.gameState.playerState === "alive"
    ) {
      this.meleeEquipped = !this.meleeEquipped;
      // Toggling melee on/off cancels any in-progress gun reload and resets
      // its fire cooldown, the same way switching gun slots already does --
      // you can't be mid-reload on a gun you're not currently holding.
      this.isReloading = false;
      this.reloadTimeRemaining = 0;
      this.timeSinceLastShot = Infinity;
      return;
    }

    // Number-key slot switching (checkpoint 15): Digit1 -> slot 0, Digit2 ->
    // slot 1, and so on generically -- so a future MAX_SLOTS increase (the
    // planned 3-slot perk) needs no new key-handling code. Only occupied
    // slots are selectable.
    const digitMatch = /^Digit([1-9])$/.exec(event.code);
    if (
      digitMatch &&
      !this.gameState.paused &&
      this.gameState.playerState === "alive"
    ) {
      const slotIndex = Number(digitMatch[1]) - 1;
      if (slotIndex < MAX_SLOTS && this.slots[slotIndex]) {
        this.switchToSlot(slotIndex);
      }
    }
  };

  // Scroll wheel slot cycling (checkpoint 15): cycles the active weapon
  // through occupied slots only, wrapping around -- empty slots are never a
  // valid scroll target. Works for any number of occupied slots, not just
  // 2, so it also needs no change when MAX_SLOTS grows.
  private readonly handleWheel = (event: WheelEvent): void => {
    if (this.gameState.paused || this.gameState.playerState !== "alive") return;
    event.preventDefault();

    const occupiedIndices = this.slots
      .map((slot, index) => (slot ? index : -1))
      .filter((index) => index !== -1);
    if (occupiedIndices.length <= 1) return;

    const currentPosition = occupiedIndices.indexOf(this.activeSlotIndex);
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextPosition =
      (currentPosition + direction + occupiedIndices.length) % occupiedIndices.length;
    this.switchToSlot(occupiedIndices[nextPosition]);
  };
}
```

- [ ] **Step 2: Verify `WeaponSystem.ts` itself has no new errors**

Run: `npm run build`
Expected: fails with exactly one error — `main.ts`'s `new WeaponSystem(...)` call missing the new `meleeWeapon` argument (a type/arity mismatch on that one call). Confirm all 7 of Task 3's `WeaponSystem.ts` errors are gone, and no OTHER error appears anywhere. If you see any error you don't recognize as exactly this one expected downstream break, stop and report BLOCKED rather than guessing a fix.

- [ ] **Step 3: Commit**

```bash
git add src/core/WeaponSystem.ts
git commit -m "Checkpoint 16 task 5: add melee state, V-key equip, and knife swing logic to WeaponSystem"
```

---

### Task 6: Wire the knife into `main.ts`

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `WeaponSystem`'s new constructor parameter, `meleeWeapon: Weapon` (Task 5).
- Produces: nothing new for later tasks. This is the commit that restores a clean whole-project build after Task 5's expected error.

- [ ] **Step 1: Pass the knife into `WeaponSystem`'s constructor**

The current construction (as of checkpoint 15's Task 4):

```typescript
  const weaponSystem = new WeaponSystem(
    sceneManager.camera,
    // Checkpoint 15: every run starts with M1911 in inventory slot 0,
    // unconditionally -- the main menu's Weapon selection (selections.weaponId)
    // no longer determines the starting loadout now that WeaponSystem is a
    // slot-based inventory rather than a single current weapon. Confirmed
    // with the user; the menu's Weapon group is left in place (still
    // visible/selectable) but its choice is presently unused here. See
    // CLAUDE.md's checkpoint-15 decisions log and future mechanics.
    findById(WEAPONS, "pistol"),
    audioSystem,
    gameState,
    runManager,
    raycastRegistry,
  );
```

Change it to:

```typescript
  const weaponSystem = new WeaponSystem(
    sceneManager.camera,
    // Checkpoint 15: every run starts with M1911 in inventory slot 0,
    // unconditionally -- the main menu's Weapon selection (selections.weaponId)
    // no longer determines the starting loadout now that WeaponSystem is a
    // slot-based inventory rather than a single current weapon. Confirmed
    // with the user; the menu's Weapon group is left in place (still
    // visible/selectable) but its choice is presently unused here. See
    // CLAUDE.md's checkpoint-15 decisions log and future mechanics.
    findById(WEAPONS, "pistol"),
    // Checkpoint 16: the knife is always the starting/default melee weapon
    // -- there is no menu selection for melee (only one option exists), and
    // no wall-buy either (the knife is always available, never purchased).
    findById(WEAPONS, "knife"),
    audioSystem,
    gameState,
    runManager,
    raycastRegistry,
  );
```

(No other line in `main.ts` changes.)

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors — this restores a clean whole-project build after Task 5's expected single error.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "Checkpoint 16 task 6: wire the knife into main.ts as the starting melee weapon"
```

---

## Design correction (after manual testing of Tasks 5-6)

Manual testing of the melee mechanic as originally built (Tasks 5-6: `V` toggled an "equipped" mode, mouse1 swung the knife while equipped, switching guns exited the mode) found it was the wrong mechanic entirely — not a tuning issue, a design issue. The correct mechanic, matching classic CoD Zombies knife-melee, is: **`V` performs an instant attack action and never changes the equipped weapon.** The currently-held gun (and its ammo/reload state) is completely untouched by pressing `V`. Tasks 7-9 below correct this, replacing the relevant parts of Tasks 5-6's already-committed work. Task 10 (renumbered from the original Task 7) is the manual verification pass against the corrected design; Task 11 (renumbered from the original Task 8) is the CLAUDE.md update, written to describe only the corrected design (it was never dispatched under the old design, so there is nothing to un-write).

Corrected behavior, precisely:
- `V` triggers a melee attack: hit-detection raycast fires the INSTANT `V` is pressed (not at the end of any animation window), reusing the exact same `RaycastRegistry`/`userData.onHit` pattern as before, with `meleeWeapon.meleeRange` as the max distance.
- The attack has a cooldown (`meleeWeapon.fireRate`, corrected to `0.5` seconds — see Task 7) that doubles as the "attack in progress" window — no separate boolean flag, derived the same way gun fire-rate gating already works (`timeSinceLastX >= weapon.fireRate`).
- While that cooldown window is active, mouse1 (gun fire) and `R` (reload) are both ignored; normal gun controls resume automatically once it elapses — there is no "equip/unequip" transition to manage, because the gun was never un-equipped.
- Number-key and scroll-wheel gun switching are completely unaffected by melee — they no longer need to "exit melee mode," because there is no mode to exit.
- `meleeWeapon`/`startingMeleeWeapon` (mutable state defaulting to the knife, reset on respawn) are KEPT — per the user's explicit instruction, this state still matters for a future Bowie knife (`V` would then perform a different, higher-damage attack), it just no longer represents something rendered in-hand.
- A small viewmodel "lunge" (reusing `WeaponViewmodel.addImpulse()`, built at checkpoint 14 and explicitly earmarked in its own future-mechanics notes for exactly this use case) is added as simple attack feedback, via a new `onMeleeAttack: () => void` constructor callback — the same dependency-injection pattern already used for `PlayerState`'s `onDeath` callback, keeping `WeaponSystem` ignorant of `WeaponViewmodel`'s existence.

---

### Task 7: Correct the knife's attack cooldown value

**Files:**
- Modify: `src/content/weapons.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for later tasks — Task 8 reads `meleeWeapon.fireRate` as the attack cooldown regardless of its specific value, so this is a pure value/comment correction with no signature impact.

The original design's `fireRate: 0.8` described a repeatable "swing while held" rate; the corrected design's `fireRate` is a single attack's cooldown (also its effective duration), specified as `0.5` seconds.

- [ ] **Step 1: Update the knife's `fireRate` and its comment**

The current knife entry and its comment block:

```typescript
  // Knife (checkpoint 16): the first melee weapon -- no magSize/reloadTime/
  // startingReserveAmmo (all now optional on Weapon), meleeRange present
  // instead, which is what marks this as melee rather than ranged.
  //
  // damage: 100 is NOT an arbitrary choice -- it is deliberately exactly
  // equal to content/enemies.ts's zombie EnemyDef.health (100). Round N's
  // scaled zombie health is enemyDef.health * N (see
  // modes/ZombieSurvival.ts's healthForRound()), so with knife damage also
  // at exactly 100, round N always takes exactly N knife hits to kill a
  // zombie -- that's the explicit design goal, not a coincidence. If either
  // number ever changes, the other must change with it, or this property
  // breaks silently. See CLAUDE.md's checkpoint-16 decisions log.
  //
  // cost: 0 is a placeholder -- Weapon.cost is a required field, but no
  // wall_buy links to "knife" (none is planned; the knife is always
  // available, not purchasable), so this value is never actually read.
  //
  // fireRate here means swing cooldown (seconds between swings), reusing
  // the same field ranged weapons use for time-between-shots -- a
  // first-cut value, tune during manual verification (Task 7) same as
  // MAC-10's fireRate was at checkpoint 15.
  {
    id: "knife",
    name: "Knife",
    damage: 100,
    fireRate: 0.8,
    meleeRange: 2,
    cost: 0,
    fireSoundId: "pistol_fire",
  },
```

Replace it with:

```typescript
  // Knife (checkpoint 16): the first melee weapon -- no magSize/reloadTime/
  // startingReserveAmmo (all now optional on Weapon), meleeRange present
  // instead, which is what marks this as melee rather than ranged.
  //
  // damage: 100 is NOT an arbitrary choice -- it is deliberately exactly
  // equal to content/enemies.ts's zombie EnemyDef.health (100). Round N's
  // scaled zombie health is enemyDef.health * N (see
  // modes/ZombieSurvival.ts's healthForRound()), so with knife damage also
  // at exactly 100, round N always takes exactly N knife hits to kill a
  // zombie -- that's the explicit design goal, not a coincidence. If either
  // number ever changes, the other must change with it, or this property
  // breaks silently. See CLAUDE.md's checkpoint-16 decisions log.
  //
  // cost: 0 is a placeholder -- Weapon.cost is a required field, but no
  // wall_buy links to "knife" (none is planned; the knife is always
  // available, not purchasable), so this value is never actually read.
  //
  // fireRate here means the melee attack's cooldown (also its effective
  // duration) -- V triggers one instant attack, then this many seconds
  // must pass before V can trigger another. Corrected from an original
  // design (0.8, framed as a repeatable "swing while held" rate) after
  // manual testing found V should be a quick attack action, not a
  // held-weapon swing loop -- see CLAUDE.md's checkpoint-16 decisions log.
  {
    id: "knife",
    name: "Knife",
    damage: 100,
    fireRate: 0.5,
    meleeRange: 2,
    cost: 0,
    fireSoundId: "pistol_fire",
  },
```

- [ ] **Step 2: Verify the build shows only the expected `WeaponSystem.ts` errors, if any**

Run: `npm run build`
Expected: at this point in the corrected sequence (before Task 8's `WeaponSystem.ts` rewrite lands), the build should be clean — Tasks 1-6 already left a fully clean build, and this task only changes a content value/comment, introducing no new errors anywhere.

- [ ] **Step 3: Commit**

```bash
git add src/content/weapons.ts
git commit -m "Checkpoint 16 task 7: correct the knife's fireRate to describe an attack cooldown, not a swing rate"
```

---

### Task 8: Replace `WeaponSystem`'s melee-equip toggle with an instant attack action

**Files:**
- Modify: `src/core/WeaponSystem.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `WeaponSystem`'s constructor gains a new required parameter, `onMeleeAttack: () => void`, appended as the LAST parameter (after `raycastRegistry`). Task 9 (`main.ts`) is the only call site and must be updated to pass it.

This task removes `meleeEquipped` (the checkpoint-16-original boolean toggle) entirely, replacing it with a derived `isMeleeAttacking` getter based on the same cooldown-timer pattern gun fire-rate gating already uses. `V` becomes a direct call to a renamed `meleeAttack()` method, gated only by that getter — no mode to enter or exit. This task alone will leave `main.ts` failing to compile (its `new WeaponSystem(...)` call is missing the new final argument) — that's expected; Task 9 fixes it immediately next.

- [ ] **Step 1: Replace the full contents of `src/core/WeaponSystem.ts`**

```typescript
import * as THREE from "three";
import { Raycast } from "./utils/Raycast";
import type { AudioSystem } from "./AudioSystem";
import type { Weapon } from "../types";
import type { GameState } from "../state/GameState";
import type { RunManager } from "./RunManager";
import type { RaycastRegistry } from "./RaycastRegistry";

// A future perk is planned to raise this to 3 -- kept as one named constant,
// not a magic number scattered through slot-sizing/indexing logic, so that
// change is a one-line edit here, not a code change (checkpoint 15).
const MAX_SLOTS = 2;

// The subset of Weapon a weapon must satisfy to occupy an inventory slot
// (checkpoint 16) -- ammo/reload stats are optional on Weapon itself so a
// melee weapon like the knife can share the same content array/interface
// without needing them (see content/weapons.ts and CLAUDE.md's checkpoint-16
// decisions log). assertRangedWeapon() below is what narrows a plain Weapon
// down to this shape at the few places that actually need it.
type RangedWeapon = Weapon & {
  magSize: number;
  reloadTime: number;
  startingReserveAmmo: number;
};

// The subset of Weapon a weapon must satisfy to be used as the melee attack
// (checkpoint 16) -- meleeRange is optional on Weapon itself for the same
// reason ammo fields are optional: a ranged weapon has no meleeRange.
type MeleeWeapon = Weapon & {
  meleeRange: number;
};

function assertRangedWeapon(weapon: Weapon): asserts weapon is RangedWeapon {
  if (
    weapon.magSize === undefined ||
    weapon.reloadTime === undefined ||
    weapon.startingReserveAmmo === undefined
  ) {
    throw new Error(
      `Weapon "${weapon.id}" has no ammo stats -- cannot be placed in a weapon slot (is it melee?)`,
    );
  }
}

function assertMeleeWeapon(weapon: Weapon): asserts weapon is MeleeWeapon {
  if (weapon.meleeRange === undefined) {
    throw new Error(
      `Weapon "${weapon.id}" has no meleeRange -- cannot be used as the melee attack`,
    );
  }
}

interface WeaponSlot {
  weapon: RangedWeapon;
  currentAmmo: number;
  reserveAmmo: number;
}

export class WeaponSystem {
  isReloading = false;

  private readonly raycast = new Raycast();
  private readonly clock = new THREE.Clock();
  private readonly raycastRegistry: RaycastRegistry;

  private timeSinceLastShot = Infinity;
  private timeSinceLastMeleeAttack = Infinity;
  private reloadTimeRemaining = 0;
  private firing = false;

  // The weapon inventory (checkpoint 15): fixed-size slots, most of them
  // empty at first. Index 0 always starts occupied by startingWeapon; every
  // other slot starts null. Ammo/reserve are tracked per slot, not
  // globally, so switching back to a previously-held weapon restores
  // exactly the ammo it had when you switched away from it. isReloading/
  // reloadTimeRemaining/timeSinceLastShot stay single (not per-slot):
  // switching cancels any in-progress reload of the weapon left behind
  // (see switchToSlot()) rather than tracking independent reload state per
  // weapon -- simpler, and matches most FPS games' weapon-switch behavior.
  private slots: (WeaponSlot | null)[];
  private activeSlotIndex = 0;
  private readonly startingWeapon: RangedWeapon;

  // Melee (checkpoint 16, corrected after manual testing): V is a quick
  // ATTACK ACTION, not a weapon-equip toggle -- the currently-held gun
  // (slots/activeSlotIndex) is never touched by pressing V, matching
  // classic CoD Zombies knife-melee (attack while still holding your gun,
  // rather than switching to a knife in-hand). meleeWeapon/
  // startingMeleeWeapon still exist as reassignable state -- not because
  // you can "equip" them, but because a future Bowie knife would make V
  // perform a different, higher-damage attack; meleeWeapon just describes
  // *which attack* V currently performs, never something rendered in-hand.
  private meleeWeapon: MeleeWeapon;
  private readonly startingMeleeWeapon: MeleeWeapon;

  private readonly camera: THREE.Camera;
  private readonly audioSystem: AudioSystem;
  private readonly gameState: GameState;
  // Notifies main.ts (the composition root) that a melee attack just
  // happened, so it can trigger a small viewmodel impulse for feedback --
  // WeaponSystem never imports WeaponViewmodel directly, the same
  // dependency-injection pattern PlayerState's onDeath callback already
  // uses.
  private readonly onMeleeAttack: () => void;

  constructor(
    camera: THREE.Camera,
    weapon: Weapon,
    meleeWeapon: Weapon,
    audioSystem: AudioSystem,
    gameState: GameState,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
    onMeleeAttack: () => void,
  ) {
    assertRangedWeapon(weapon);
    assertMeleeWeapon(meleeWeapon);

    this.camera = camera;
    this.startingWeapon = weapon;
    this.slots = this.buildStartingSlots();
    this.startingMeleeWeapon = meleeWeapon;
    this.meleeWeapon = meleeWeapon;
    this.audioSystem = audioSystem;
    this.gameState = gameState;
    this.raycastRegistry = raycastRegistry;
    this.onMeleeAttack = onMeleeAttack;

    window.addEventListener("mousedown", this.handleMouseDown);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("wheel", this.handleWheel, { passive: false });

    runManager.registerResettable(() => this.reset());
  }

  private buildStartingSlots(): (WeaponSlot | null)[] {
    const slots: (WeaponSlot | null)[] = new Array(MAX_SLOTS).fill(null);
    slots[0] = {
      weapon: this.startingWeapon,
      currentAmmo: this.startingWeapon.magSize,
      reserveAmmo: this.startingWeapon.startingReserveAmmo,
    };
    return slots;
  }

  private get activeSlot(): WeaponSlot {
    const slot = this.slots[this.activeSlotIndex];
    if (!slot) {
      throw new Error(`Active slot ${this.activeSlotIndex} is empty -- should never happen`);
    }
    return slot;
  }

  private get weapon(): RangedWeapon {
    return this.activeSlot.weapon;
  }

  // True for the duration of an in-progress melee attack -- its own
  // cooldown window doubles as the "attack in progress" state, so no
  // separate boolean flag is needed, the same way gun fire-rate gating
  // already works via a single timer comparison (see update()/fire()).
  private get isMeleeAttacking(): boolean {
    return this.timeSinceLastMeleeAttack < this.meleeWeapon.fireRate;
  }

  get currentAmmo(): number {
    return this.activeSlot.currentAmmo;
  }

  private set currentAmmo(value: number) {
    this.activeSlot.currentAmmo = value;
  }

  get reserveAmmo(): number {
    return this.activeSlot.reserveAmmo;
  }

  private set reserveAmmo(value: number) {
    this.activeSlot.reserveAmmo = value;
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

  // The wall-buy's purchase hook (checkpoint 15 replaces checkpoint 11's
  // setWeapon(), which unconditionally overwrote the single current weapon
  // -- that no longer makes sense once there's more than one slot). If an
  // empty slot exists, this fills it and switches to it; if every slot is
  // full, it replaces only the currently active slot (never a different,
  // unselected slot) -- buying a weapon while full swaps out whatever
  // you're currently holding, not whatever else happens to be in inventory.
  pickupWeapon(weapon: Weapon): void {
    assertRangedWeapon(weapon);
    const emptySlotIndex = this.slots.findIndex((slot) => slot === null);
    const targetIndex = emptySlotIndex !== -1 ? emptySlotIndex : this.activeSlotIndex;
    this.slots[targetIndex] = {
      weapon,
      currentAmmo: weapon.magSize,
      reserveAmmo: weapon.startingReserveAmmo,
    };
    this.switchToSlot(targetIndex);
  }

  private switchToSlot(index: number): void {
    if (!this.slots[index]) return;
    this.activeSlotIndex = index;
    // Switching cancels any in-progress reload of the weapon being switched
    // away from (it must be restarted if you switch back) and resets the
    // fire-rate cooldown, so the newly active weapon is immediately
    // fireable rather than inheriting the previous weapon's timing.
    this.isReloading = false;
    this.reloadTimeRemaining = 0;
    this.timeSinceLastShot = Infinity;
  }

  reset(): void {
    this.slots = this.buildStartingSlots();
    this.activeSlotIndex = 0;
    this.meleeWeapon = this.startingMeleeWeapon;
    this.isReloading = false;
    this.reloadTimeRemaining = 0;
    this.timeSinceLastShot = Infinity;
    this.timeSinceLastMeleeAttack = Infinity;
    this.firing = false;
  }

  update(): void {
    const delta = this.clock.getDelta();
    this.timeSinceLastShot += delta;
    this.timeSinceLastMeleeAttack += delta;

    if (this.isReloading) {
      this.reloadTimeRemaining -= delta;
      if (this.reloadTimeRemaining <= 0) this.finishReload();
    } else if (
      !this.isMeleeAttacking &&
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

  // The melee attack itself (checkpoint 16, corrected): fired the instant V
  // is pressed, reusing the exact same userData.onHit hook and shared
  // RaycastRegistry hitscan guns already use, just with a much shorter
  // maxDistance (meleeWeapon.meleeRange). No ammo check -- melee never
  // consumes ammo, and never touches the gun slots at all. onMeleeAttack()
  // notifies main.ts so it can trigger a small viewmodel impulse (a lunge)
  // for feedback, without WeaponSystem needing to know WeaponViewmodel
  // exists.
  private meleeAttack(): void {
    this.timeSinceLastMeleeAttack = 0;

    const hit = this.raycast.fromCamera(
      this.camera,
      this.raycastRegistry.getAll(),
      this.meleeWeapon.meleeRange,
    );
    const onHit = hit?.object.userData.onHit as
      | ((damage: number) => void)
      | undefined;
    onHit?.(this.meleeWeapon.damage);

    this.audioSystem.play(this.meleeWeapon.fireSoundId);
    this.onMeleeAttack();
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
      this.gameState.playerState === "alive" &&
      !this.isMeleeAttacking
    ) {
      this.startReload();
      return;
    }

    // Melee attack (checkpoint 16, corrected): V triggers an instant
    // attack, gated only by its own cooldown (isMeleeAttacking) -- it never
    // changes the equipped gun, so there is nothing to "return to" once the
    // attack window ends; normal gun controls simply resume automatically.
    if (
      event.code === "KeyV" &&
      !this.gameState.paused &&
      this.gameState.playerState === "alive" &&
      !this.isMeleeAttacking
    ) {
      this.meleeAttack();
      return;
    }

    // Number-key slot switching (checkpoint 15): Digit1 -> slot 0, Digit2 ->
    // slot 1, and so on generically -- so a future MAX_SLOTS increase (the
    // planned 3-slot perk) needs no new key-handling code. Only occupied
    // slots are selectable.
    const digitMatch = /^Digit([1-9])$/.exec(event.code);
    if (
      digitMatch &&
      !this.gameState.paused &&
      this.gameState.playerState === "alive"
    ) {
      const slotIndex = Number(digitMatch[1]) - 1;
      if (slotIndex < MAX_SLOTS && this.slots[slotIndex]) {
        this.switchToSlot(slotIndex);
      }
    }
  };

  // Scroll wheel slot cycling (checkpoint 15): cycles the active weapon
  // through occupied slots only, wrapping around -- empty slots are never a
  // valid scroll target. Works for any number of occupied slots, not just
  // 2, so it also needs no change when MAX_SLOTS grows.
  private readonly handleWheel = (event: WheelEvent): void => {
    if (this.gameState.paused || this.gameState.playerState !== "alive") return;
    event.preventDefault();

    const occupiedIndices = this.slots
      .map((slot, index) => (slot ? index : -1))
      .filter((index) => index !== -1);
    if (occupiedIndices.length <= 1) return;

    const currentPosition = occupiedIndices.indexOf(this.activeSlotIndex);
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextPosition =
      (currentPosition + direction + occupiedIndices.length) % occupiedIndices.length;
    this.switchToSlot(occupiedIndices[nextPosition]);
  };
}
```

- [ ] **Step 2: Verify `WeaponSystem.ts` itself has no new errors**

Run: `npm run build`
Expected: fails with exactly one error — `main.ts`'s `new WeaponSystem(...)` call missing the new `onMeleeAttack` argument (a type/arity mismatch on that one call, since it's now the 8th parameter). Confirm no OTHER error appears. If you see any error you don't recognize as exactly this one expected downstream break, stop and report BLOCKED rather than guessing a fix.

- [ ] **Step 3: Commit**

```bash
git add src/core/WeaponSystem.ts
git commit -m "Checkpoint 16 task 8: replace WeaponSystem's melee-equip toggle with an instant attack action"
```

---

### Task 9: Wire the melee-attack viewmodel feedback callback into `main.ts`

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `WeaponSystem`'s new constructor parameter, `onMeleeAttack: () => void` (Task 8, the 8th/last positional argument); `WeaponViewmodel.addImpulse(offset, decayTime)` (checkpoint 14, already exists, unchanged).
- Produces: nothing new for later tasks. This is the commit that restores a clean whole-project build after Task 8's expected error.

`weaponViewmodel` currently gets constructed AFTER `weaponSystem` in `startGame()` — this task moves its construction earlier (it has no dependency on anything else in the function, so this is a safe, side-effect-free reorder) so the `onMeleeAttack` callback can reference it directly, rather than relying on JavaScript's closure-timing semantics to make a forward-reference safe.

- [ ] **Step 1: Move `weaponViewmodel`'s construction earlier, and wire the callback**

The current relevant section of `startGame()`:

```typescript
  const weaponSystem = new WeaponSystem(
    sceneManager.camera,
    // Checkpoint 15: every run starts with M1911 in inventory slot 0,
    // unconditionally -- the main menu's Weapon selection (selections.weaponId)
    // no longer determines the starting loadout now that WeaponSystem is a
    // slot-based inventory rather than a single current weapon. Confirmed
    // with the user; the menu's Weapon group is left in place (still
    // visible/selectable) but its choice is presently unused here. See
    // CLAUDE.md's checkpoint-15 decisions log and future mechanics.
    findById(WEAPONS, "pistol"),
    // Checkpoint 16: the knife is always the starting/default melee weapon
    // -- there is no menu selection for melee (only one option exists), and
    // no wall-buy either (the knife is always available, never purchased).
    findById(WEAPONS, "knife"),
    audioSystem,
    gameState,
    runManager,
    raycastRegistry,
  );
```

...and, much further down in the same function:

```typescript
  const weaponViewmodel = new WeaponViewmodel();

  canvas.addEventListener("click", () => {
```

Change the FIRST block (`weaponSystem`'s construction) to:

```typescript
  // Checkpoint 16: constructed before weaponSystem (moved up from its
  // original checkpoint-13 position further down this function) so
  // weaponSystem's onMeleeAttack callback below can reference it directly,
  // rather than relying on closure-timing semantics to make a forward
  // reference safe.
  const weaponViewmodel = new WeaponViewmodel();

  const weaponSystem = new WeaponSystem(
    sceneManager.camera,
    // Checkpoint 15: every run starts with M1911 in inventory slot 0,
    // unconditionally -- the main menu's Weapon selection (selections.weaponId)
    // no longer determines the starting loadout now that WeaponSystem is a
    // slot-based inventory rather than a single current weapon. Confirmed
    // with the user; the menu's Weapon group is left in place (still
    // visible/selectable) but its choice is presently unused here. See
    // CLAUDE.md's checkpoint-15 decisions log and future mechanics.
    findById(WEAPONS, "pistol"),
    // Checkpoint 16: the knife is always the starting/default melee weapon
    // -- there is no menu selection for melee (only one option exists), and
    // no wall-buy either (the knife is always available, never purchased).
    findById(WEAPONS, "knife"),
    audioSystem,
    gameState,
    runManager,
    raycastRegistry,
    // Checkpoint 16: a small viewmodel "lunge" as placeholder melee-attack
    // feedback, reusing the addImpulse() mechanism built at checkpoint 14
    // (its own future-mechanics notes already named melee-swing as an
    // intended integration point). Values are a first-cut guess, not tuned
    // against manual testing -- adjust here if they don't read well.
    () => weaponViewmodel.addImpulse({ x: 0, y: -0.06, z: 0.12 }, 0.15),
  );
```

Then DELETE the second block's `const weaponViewmodel = new WeaponViewmodel();` line entirely (it's now redundant with the moved-up declaration above) — leaving just:

```typescript
  canvas.addEventListener("click", () => {
```

(No other line in `main.ts` changes.)

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors — this restores a clean whole-project build after Task 8's expected single error.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "Checkpoint 16 task 9: wire melee-attack viewmodel feedback into main.ts"
```

---

## Second design correction (after manual testing of Tasks 7-9's corrected mechanic)

Manual testing of the corrected instant-attack melee mechanic (Tasks 7-9) surfaced three further, smaller fixes, none of which touch the core melee/gun-separation design validated by Task 8's review — they're tuning and balance corrections layered on top of an already-correct mechanic:

1. **Melee cooldown**: `0.5`s read as too fast in practice; raised to `1`s. Pure content value change (Task 12), same pattern as Task 7's earlier `fireRate` correction.
2. **Melee sound**: the melee attack was silently reusing `pistol_fire`, making it impossible to tell by ear whether a melee attack or a gunshot just happened. A distinct, synthesized placeholder sound (`melee_hit.wav`, generated the same way the project's other placeholder sounds were — a short Node-generated tone, not a real recording) is added (Task 13) and wired in (Task 14).
3. **Gun damage scaling per round**: round-based zombie health scaling (`enemyDef.health * round`, unchanged, still load-bearing for the knife's "N hits at round N" identity) was making guns nearly unusable at higher rounds — gun kill-shot counts were rising unboundedly with no corresponding gun-side scaling. A new, independent, gentler scaling curve for GUN damage only (`gunDamage(round) = baseDamage * (1 + GUN_SCALE_RATE * (round - 1))`, `GUN_SCALE_RATE = 0.3`) is added (Tasks 15-17). The knife's damage stays flat at `100` always — this new curve applies only to guns, and must never be conflated with the zombie-health-to-knife-damage coupling from the original checkpoint-16 design.

`WeaponSystem` (a `core/` file) still has zero awareness of "rounds" as a concept — round-based gun scaling is computed entirely inside `ZombieSurvival` (a `modes/` file, which is allowed to depend on `core/`), which pushes a plain `damageMultiplier: number` onto `WeaponSystem` each round. `WeaponSystem` just multiplies gun damage by whatever externally-set number it's holding (default `1`, i.e. no scaling) — it never knows *why* the multiplier changed, the same "generic hook, composition root/mode supplies the meaning" pattern already used for `onMeleeAttack`. `ShootingRange` (the other mode) never touches this field, so it stays at `1` there — no regression to that mode.

A pre-generated placeholder sound asset, `public/sounds/melee_hit.wav`, has already been added to the repo (synthesized via a short Node script, matching the technique used for the project's other placeholder sounds) — Task 13 verifies it exists rather than generating it fresh, but includes the exact generation script for reproducibility in case it's ever missing.

---

### Task 12: Correct the melee attack cooldown from 0.5s to 1s

**Files:**
- Modify: `src/content/weapons.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for later tasks — this is a pure content value/comment change, identical in shape to Task 7's earlier correction.

- [ ] **Step 1: Update the knife's `fireRate` and its comment**

The current knife entry and its comment block (as left by Task 7):

```typescript
  // Knife (checkpoint 16): the first melee weapon -- no magSize/reloadTime/
  // startingReserveAmmo (all now optional on Weapon), meleeRange present
  // instead, which is what marks this as melee rather than ranged.
  //
  // damage: 100 is NOT an arbitrary choice -- it is deliberately exactly
  // equal to content/enemies.ts's zombie EnemyDef.health (100). Round N's
  // scaled zombie health is enemyDef.health * N (see
  // modes/ZombieSurvival.ts's healthForRound()), so with knife damage also
  // at exactly 100, round N always takes exactly N knife hits to kill a
  // zombie -- that's the explicit design goal, not a coincidence. If either
  // number ever changes, the other must change with it, or this property
  // breaks silently. See CLAUDE.md's checkpoint-16 decisions log.
  //
  // cost: 0 is a placeholder -- Weapon.cost is a required field, but no
  // wall_buy links to "knife" (none is planned; the knife is always
  // available, not purchasable), so this value is never actually read.
  //
  // fireRate here means the melee attack's cooldown (also its effective
  // duration) -- V triggers one instant attack, then this many seconds
  // must pass before V can trigger another. Corrected from an original
  // design (0.8, framed as a repeatable "swing while held" rate) after
  // manual testing found V should be a quick attack action, not a
  // held-weapon swing loop -- see CLAUDE.md's checkpoint-16 decisions log.
  {
    id: "knife",
    name: "Knife",
    damage: 100,
    fireRate: 0.5,
    meleeRange: 2,
    cost: 0,
    fireSoundId: "pistol_fire",
  },
```

Replace it with:

```typescript
  // Knife (checkpoint 16): the first melee weapon -- no magSize/reloadTime/
  // startingReserveAmmo (all now optional on Weapon), meleeRange present
  // instead, which is what marks this as melee rather than ranged.
  //
  // damage: 100 is NOT an arbitrary choice -- it is deliberately exactly
  // equal to content/enemies.ts's zombie EnemyDef.health (100). Round N's
  // scaled zombie health is enemyDef.health * N (see
  // modes/ZombieSurvival.ts's healthForRound()), so with knife damage also
  // at exactly 100, round N always takes exactly N knife hits to kill a
  // zombie -- that's the explicit design goal, not a coincidence. If either
  // number ever changes, the other must change with it, or this property
  // breaks silently. See CLAUDE.md's checkpoint-16 decisions log.
  //
  // cost: 0 is a placeholder -- Weapon.cost is a required field, but no
  // wall_buy links to "knife" (none is planned; the knife is always
  // available, not purchasable), so this value is never actually read.
  //
  // fireRate here means the melee attack's cooldown (also its effective
  // duration) -- V triggers one instant attack, then this many seconds
  // must pass before V can trigger another. Was 0.5 (an earlier
  // mid-checkpoint correction from an original 0.8 "swing while held"
  // framing), raised to 1 after manual testing found 0.5 still read as too
  // fast -- see CLAUDE.md's checkpoint-16 decisions log.
  {
    id: "knife",
    name: "Knife",
    damage: 100,
    fireRate: 1,
    meleeRange: 2,
    cost: 0,
    fireSoundId: "melee_hit",
  },
```

(Note: `fireSoundId` also changes here, from `"pistol_fire"` to `"melee_hit"` — this depends on Task 13 having already added that sound content entry. If executing tasks in order, land Task 13 before this task; if Task 13 hasn't landed yet, this line will still type-check fine, since `fireSoundId` is just a `string`, but the sound won't actually play correctly at runtime until Task 13's content entry and Task 14's preload both exist. The plan sequences Task 13 first specifically to avoid this gap.)

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors — this is a pure content value/string change, no type impact regardless of task order.

- [ ] **Step 3: Commit**

```bash
git add src/content/weapons.ts
git commit -m "Checkpoint 16 task 12: raise the melee attack cooldown from 0.5s to 1s"
```

---

### Task 13: Add the melee attack's distinct placeholder sound

**Files:**
- Modify: `src/content/sounds.ts`
- Verify (should already exist): `public/sounds/melee_hit.wav`

**Interfaces:**
- Consumes: nothing new.
- Produces: a new `SOUNDS` entry, `id: "melee_hit"`. Consumed by Task 12 (`content/weapons.ts`'s knife `fireSoundId`, already updated) and Task 14 (`main.ts`'s preload list).

**Note on sequencing**: this task is listed as Task 13 (after Task 12 in the plan's numbering) purely because Task 12's own text was written referencing this task by name — but Task 12's actual change (a string value) has no compile-time dependency on this task. If you're executing strictly in order, this is fine either way; just don't skip this task, since without it `fireSoundId: "melee_hit"` will silently fail to play anything at runtime (`AudioSystem.play()` no-ops if the sound was never registered/preloaded — see `src/core/AudioSystem.ts`'s `play()` method, which returns early if `this.pools.get(soundId)` is undefined).

- [ ] **Step 1: Verify the sound asset already exists**

Run: `ls -la public/sounds/melee_hit.wav` (or the Windows equivalent, `dir public\sounds\melee_hit.wav`)
Expected: the file exists, roughly 8KB, a valid RIFF/WAVE file. It was already generated and placed in the repo before this task was dispatched.

If for any reason it's missing, regenerate it with this exact script (matching the technique already used for this project's other placeholder sounds — a short Node-generated tone, not a real recording):

```javascript
// generate-melee-sound.js -- run with: node generate-melee-sound.js public/sounds/melee_hit.wav
const fs = require("fs");

const SAMPLE_RATE = 22050;
const DURATION_SECONDS = 0.18;
const FREQUENCY_HZ = 120;
const NUM_SAMPLES = Math.floor(SAMPLE_RATE * DURATION_SECONDS);

const samples = new Int16Array(NUM_SAMPLES);
for (let i = 0; i < NUM_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;
  const envelope = Math.exp(-t * 28);
  const tone = Math.sin(2 * Math.PI * FREQUENCY_HZ * t);
  const noise = (Math.random() * 2 - 1) * 0.25;
  const sample = (tone * 0.75 + noise * 0.25) * envelope;
  samples[i] = Math.max(-1, Math.min(1, sample)) * 32767;
}

const dataSize = samples.length * 2;
const buffer = Buffer.alloc(44 + dataSize);

buffer.write("RIFF", 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write("WAVE", 8);
buffer.write("fmt ", 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(1, 22);
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write("data", 36);
buffer.writeUInt32LE(dataSize, 40);

for (let i = 0; i < samples.length; i++) {
  buffer.writeInt16LE(samples[i], 44 + i * 2);
}

fs.writeFileSync(process.argv[2], buffer);
console.log(`Wrote ${process.argv[2]} (${buffer.length} bytes)`);
```

- [ ] **Step 2: Add the `melee_hit` sound entry**

The current file:

```typescript
import type { SoundDef } from "../types";

export const SOUNDS: SoundDef[] = [
  {
    id: "pistol_fire",
    path: "/sounds/pistol_fire.wav",
    volume: 0.5,
    positional: false,
    loop: false,
  },
  {
    id: "zombie_growl",
    path: "/sounds/zombie_growl.wav",
    volume: 0.6,
    positional: true,
    loop: false,
  },
  {
    id: "zombie_death",
    path: "/sounds/zombie_death.wav",
    volume: 0.7,
    positional: true,
    loop: false,
  },
];
```

Replace it with:

```typescript
import type { SoundDef } from "../types";

export const SOUNDS: SoundDef[] = [
  {
    id: "pistol_fire",
    path: "/sounds/pistol_fire.wav",
    volume: 0.5,
    positional: false,
    loop: false,
  },
  // Melee attack sound (checkpoint 16): a synthesized placeholder,
  // generated the same way pistol_fire.wav originally was (a short
  // Node-generated tone, not a real recording -- see CLAUDE.md) --
  // deliberately a lower, heavier "thud" character rather than a sharp
  // click, so it's easy to tell apart from gunfire by ear. Non-positional,
  // like pistol_fire: it's always the local player's own action, not
  // something with a world position.
  {
    id: "melee_hit",
    path: "/sounds/melee_hit.wav",
    volume: 0.6,
    positional: false,
    loop: false,
  },
  {
    id: "zombie_growl",
    path: "/sounds/zombie_growl.wav",
    volume: 0.6,
    positional: true,
    loop: false,
  },
  {
    id: "zombie_death",
    path: "/sounds/zombie_death.wav",
    volume: 0.7,
    positional: true,
    loop: false,
  },
];
```

- [ ] **Step 3: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/content/sounds.ts public/sounds/melee_hit.wav
git commit -m "Checkpoint 16 task 13: add a distinct placeholder sound for the melee attack"
```

(If the WAV file was already committed by an earlier, separate action before this task was dispatched, `git add` on an already-tracked-and-unchanged file is a harmless no-op — the commit will simply not include it again, which is fine; the important thing is that it exists in the repo by the time this commit lands.)

---

### Task 14: Preload the melee sound in `main.ts`

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: the `"melee_hit"` sound id (Task 13).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the preload call**

The current preload block:

```typescript
  const audioSystem = new AudioSystem(sceneManager.camera);
  void audioSystem.load(findById(SOUNDS, "pistol_fire"));
  void audioSystem.load(findById(SOUNDS, "zombie_growl"));
  void audioSystem.load(findById(SOUNDS, "zombie_death"));
```

Change it to:

```typescript
  const audioSystem = new AudioSystem(sceneManager.camera);
  void audioSystem.load(findById(SOUNDS, "pistol_fire"));
  // Checkpoint 16: the melee attack's own distinct sound -- without this
  // preload, AudioSystem.play("melee_hit") would silently no-op (see
  // AudioSystem.play()'s early return when a sound was never load()ed).
  void audioSystem.load(findById(SOUNDS, "melee_hit"));
  void audioSystem.load(findById(SOUNDS, "zombie_growl"));
  void audioSystem.load(findById(SOUNDS, "zombie_death"));
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "Checkpoint 16 task 14: preload the melee attack's sound"
```

---

### Task 15: `WeaponSystem` gains a generic, externally-set gun damage multiplier

**Files:**
- Modify: `src/core/WeaponSystem.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: a new public field, `damageMultiplier: number` (defaults to `1`). Task 16 (`ZombieSurvival`) sets it each round; `ShootingRange` never touches it, so it stays `1` there.

`WeaponSystem` (a `core/` file) must not gain any awareness of "rounds" as a concept — this field is deliberately generic ("some external code may want to scale gun damage, for whatever reason"), the same pattern the checkpoint-16 `onMeleeAttack` callback already established for keeping `core/` ignorant of *why* something happens, only *that* a hook exists. This task alone introduces no build-breaking change — it's purely additive with a safe default.

- [ ] **Step 1: Add the `damageMultiplier` field**

Add this new public field to the `WeaponSystem` class, placed directly after `isReloading = false;`:

```typescript
  isReloading = false;
  // A generic, externally-set multiplier applied to gun damage only
  // (checkpoint 16) -- WeaponSystem has no notion of "rounds" itself (per
  // core/ never referencing modes/); ZombieSurvival sets this each round
  // via its own round-scaling formula (see modes/ZombieSurvival.ts). Modes
  // that never set it (e.g. ShootingRange) leave it at the default 1, i.e.
  // no scaling. Never applied to the melee attack's damage -- see
  // meleeAttack() and CLAUDE.md's checkpoint-16 decisions log.
  damageMultiplier = 1;
```

- [ ] **Step 2: Apply it in `fire()`**

The current `fire()` method:

```typescript
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
```

Change the `onHit?.(this.weapon.damage);` line to:

```typescript
  private fire(): void {
    this.timeSinceLastShot = 0;
    this.currentAmmo -= 1;

    const hit = this.raycast.fromCamera(this.camera, this.raycastRegistry.getAll());
    const onHit = hit?.object.userData.onHit as
      | ((damage: number) => void)
      | undefined;
    onHit?.(this.weapon.damage * this.damageMultiplier);

    this.audioSystem.play(this.weapon.fireSoundId);
  }
```

(`meleeAttack()`'s own `onHit?.(this.meleeWeapon.damage);` line is explicitly NOT changed — melee damage must stay flat, unaffected by `damageMultiplier`, per this checkpoint's requirement.)

- [ ] **Step 3: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors — purely additive, no signature changes, no downstream breakage.

- [ ] **Step 4: Commit**

```bash
git add src/core/WeaponSystem.ts
git commit -m "Checkpoint 16 task 15: add a generic gun-only damage multiplier to WeaponSystem"
```

---

### Task 16: `ZombieSurvival` computes and sets the per-round gun damage multiplier

**Files:**
- Modify: `src/modes/ZombieSurvival.ts`

**Interfaces:**
- Consumes: `WeaponSystem.damageMultiplier: number` (Task 15, a public settable field).
- Produces: `ZombieSurvival`'s constructor gains a new required parameter, `weaponSystem: WeaponSystem`, appended as the LAST parameter (after `runManager`). Task 17 (`main.ts`) is the only call site and must be updated to pass it.

This task alone will leave `main.ts` failing to compile (its `new ZombieSurvival(...)` call is missing the new final argument) — that's expected; Task 17 fixes it immediately next.

- [ ] **Step 1: Import `WeaponSystem`'s type**

Add this import alongside the existing type-only imports:

```typescript
import type { WeaponSystem } from "../core/WeaponSystem";
```

- [ ] **Step 2: Add the `weaponSystem` field and constructor parameter**

The current fields and constructor:

```typescript
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
```

Change it to:

```typescript
  private readonly enemyDef: EnemyDef;
  private readonly spawnPoints: THREE.Vector3[];
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly audioSystem: AudioSystem;
  private readonly gameState: GameState;
  private readonly playerState: PlayerState;
  private readonly raycastRegistry: RaycastRegistry;
  private readonly weaponSystem: WeaponSystem;

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
    weaponSystem: WeaponSystem,
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
    this.weaponSystem = weaponSystem;

    runManager.registerResettable(() => this.resetRun());
  }
```

- [ ] **Step 3: Add the gun damage scaling formula and wire it into `startRound()`**

The current `healthForRound()`/`startRound()`:

```typescript
  // Round-based health scaling (checkpoint 16): each zombie's max health is
  // the EnemyDef's base health times the current round number -- round 1
  // zombies have their normal base health, round 2 zombies have double,
  // round 3 triple, and so on, uncapped (matching real CoD Zombies scaling
  // being large at high rounds -- intended, not a bug). Computed fresh here
  // per round, never mutating this.enemyDef itself, since that one EnemyDef
  // object is shared and reused across every spawn in every round.
  private healthForRound(round: number): number {
    return this.enemyDef.health * round;
  }

  private startRound(): void {
    const count = this.zombiesForRound(this.currentRound);
    const health = this.healthForRound(this.currentRound);
    this.activeEnemies = [];

    for (let i = 0; i < count; i++) {
      const spawnPoint = this.spawnPoints[i % this.spawnPoints.length];
      const enemy = new EnemyAI(
        `zombie-r${this.currentRound}-${i}`,
        this.enemyDef,
        health,
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
```

Change it to:

```typescript
  // Round-based health scaling (checkpoint 16): each zombie's max health is
  // the EnemyDef's base health times the current round number -- round 1
  // zombies have their normal base health, round 2 zombies have double,
  // round 3 triple, and so on, uncapped (matching real CoD Zombies scaling
  // being large at high rounds -- intended, not a bug). Computed fresh here
  // per round, never mutating this.enemyDef itself, since that one EnemyDef
  // object is shared and reused across every spawn in every round. This
  // formula must NEVER be changed without also considering
  // gunDamageMultiplierForRound() below and the knife's damage (see
  // CLAUDE.md's checkpoint-16 decisions log) -- three independent numbers
  // that all interact.
  private healthForRound(round: number): number {
    return this.enemyDef.health * round;
  }

  // Gun-only damage scaling per round (checkpoint 16, added after manual
  // testing found guns became nearly unusable at higher rounds once zombie
  // health scaling alone was in place). Deliberately a GENTLER growth curve
  // than health's 1x-per-round -- gun kill-shot counts still rise with
  // round, just far more slowly, keeping guns viable without eliminating
  // the intended late-game difficulty increase. GUN_SCALE_RATE is a named,
  // tunable constant (not a magic number) -- adjust here if round-5/round-10
  // hit counts still feel off during manual testing. Applies ONLY to guns
  // (via WeaponSystem.damageMultiplier, set below) -- the knife's damage
  // stays flat at 100 always, completely independent of this formula. This
  // is a second, separate round-scaling coupling from the
  // zombie-health-to-knife-damage one above; do not conflate the two.
  private gunDamageMultiplierForRound(round: number): number {
    return 1 + GUN_SCALE_RATE * (round - 1);
  }

  private startRound(): void {
    const count = this.zombiesForRound(this.currentRound);
    const health = this.healthForRound(this.currentRound);
    this.weaponSystem.damageMultiplier = this.gunDamageMultiplierForRound(this.currentRound);
    this.activeEnemies = [];

    for (let i = 0; i < count; i++) {
      const spawnPoint = this.spawnPoints[i % this.spawnPoints.length];
      const enemy = new EnemyAI(
        `zombie-r${this.currentRound}-${i}`,
        this.enemyDef,
        health,
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
```

Also add the new constant near the top of the file, alongside the existing `ROUND_TRANSITION_DELAY`:

```typescript
const ROUND_TRANSITION_DELAY = 3; // seconds after the last zombie dies before the next round starts
const GUN_SCALE_RATE = 0.3; // gun damage grows at this rate per round (see gunDamageMultiplierForRound()) -- a first-cut value, tune during manual verification
```

(`resetRun()` needs no changes — it already calls `startRound()` after resetting `currentRound = 1`, which now automatically resets `weaponSystem.damageMultiplier` back to `1 + 0.3 * 0 = 1` for free, the same way it already resets zombie health for free.)

- [ ] **Step 4: Verify `ZombieSurvival.ts` itself has no new errors**

Run: `npm run build`
Expected: fails with exactly one error — `main.ts`'s `new ZombieSurvival(...)` call missing the new `weaponSystem` argument (a type/arity mismatch on that one call). Confirm no OTHER error appears. If you see any error you don't recognize as exactly this one expected downstream break, stop and report BLOCKED rather than guessing a fix.

- [ ] **Step 5: Commit**

```bash
git add src/modes/ZombieSurvival.ts
git commit -m "Checkpoint 16 task 16: scale gun damage per round, independent of zombie health scaling"
```

---

### Task 17: Wire `weaponSystem` into `ZombieSurvival` in `main.ts`

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `ZombieSurvival`'s new constructor parameter, `weaponSystem: WeaponSystem` (Task 16, the 10th/last positional argument).
- Produces: nothing new for later tasks. This is the commit that restores a clean whole-project build after Task 16's expected error.

- [ ] **Step 1: Pass `weaponSystem` into `ZombieSurvival`'s constructor**

The current `gameMode` assignment:

```typescript
  gameMode =
    selections.modeId === "zombie"
      ? new ZombieSurvival(
          findById(ENEMIES, selections.enemyId),
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
```

Change it to:

```typescript
  gameMode =
    selections.modeId === "zombie"
      ? new ZombieSurvival(
          findById(ENEMIES, selections.enemyId),
          enemySpawnPoints,
          sceneManager.scene,
          sceneManager.camera,
          audioSystem,
          gameState,
          playerState,
          raycastRegistry,
          runManager,
          // Checkpoint 16: lets ZombieSurvival set weaponSystem.damageMultiplier
          // each round -- WeaponSystem itself has no notion of "rounds," it
          // just holds a generic externally-set multiplier (see
          // core/WeaponSystem.ts and CLAUDE.md's checkpoint-16 decisions log).
          weaponSystem,
        )
      : new ShootingRange(
          targetPoints,
          sceneManager.scene,
          weaponSystem,
          gameState,
          runManager,
        );
```

(`ShootingRange`'s construction is unchanged — it already takes `weaponSystem` for an unrelated reason (`addTarget()`), and never touches `damageMultiplier`, so it stays at its default `1`.)

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors — this restores a clean whole-project build after Task 16's expected single error.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "Checkpoint 16 task 17: wire weaponSystem into ZombieSurvival for per-round gun damage scaling"
```

---

### Task 18: Manual verification against acceptance criteria (controller-executed, not a subagent)

**Files:** none (verification only).

This task is executed directly by the session controller together with the human partner — it requires live judgment (does the 1s cooldown feel meaningfully different from 0.5s? does the melee sound read as clearly distinct from gunfire? does gun damage at round 5/10 feel noticeably better?) that a subagent cannot usefully render a verdict on.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL in a browser.

- [ ] **Step 2: Verify round 1 is a one-hit melee kill**

Start a Zombie Survival run on either map. Let round 1's zombie approach (or approach it), press `V` to attack, landing exactly one hit. Confirm it dies in one hit (round 1 zombie health = `100 * 1 = 100`, melee damage = `100`, unaffected by the new gun-only damage scaling).

- [ ] **Step 3: Verify round 2 is a two-hit melee kill**

Survive to round 2 (finish round 1, wait through the round-transition delay). Land exactly one melee attack (`V`, in range) on a round-2 zombie and confirm it survives. Land a second attack (after the cooldown elapses) and confirm it dies on the second hit, not before (round 2 zombie health = `100 * 2 = 200`, two melee hits of `100` each = exactly `200`).

- [ ] **Step 4: Verify the melee cooldown is genuinely 1s, not 0.5s**

Press `V` once, then start counting/timing roughly. Confirm a second `V` press does nothing until approximately 1 full second has passed (not ~0.5s, which was the prior, now-corrected value) — this should read as clearly slower than before if you tested checkpoint 16's earlier build.

- [ ] **Step 5: Verify the melee sound is audibly distinct from gunfire**

With devtools/system volume audible, fire the currently-equipped gun once (mouse1), then press `V` once. Confirm the two sounds are clearly different in character (the melee sound should read as a lower, heavier "thud," not the gun's sharper click) — you should be able to tell which one just happened with your eyes closed.

- [ ] **Step 6: Verify the equipped gun and its ammo are completely unaffected by pressing V**

With M1911 active (slot 0) and some partial ammo fired off (not a full clip), note the exact ammo count, then press `V` several times (spaced a full second apart) against empty air or a zombie. Confirm the HUD's weapon name never changes away from "M1911" at any point, and the ammo count is exactly unchanged by pressing `V` (not consumed, not refilled) — only actually firing the gun (mouse1) should ever change it. Repeat with MAC-10 in slot 2 if you have it.

- [ ] **Step 7: Verify the cooldown prevents spam**

Press `V` rapidly, faster than once per second. Confirm only the first press in a burst actually triggers an attack (audible sound / a zombie taking damage if in range) — presses during the cooldown window do nothing at all, not even a queued/delayed second attack.

- [ ] **Step 8: Verify mouse1/R are blocked only during the ~1s attack window**

Press `V`, then immediately (within the same ~1s) try to fire (hold mouse1) and try to reload (`R`). Confirm both are ignored while the attack window is active. Wait past the cooldown and confirm mouse1/`R` both work normally again — this should be automatic, with no key needed to "return" to gun controls, since the gun was never un-equipped.

- [ ] **Step 9: Verify number-key/scroll switching is completely unaffected by melee**

Press `V`, then before or after the cooldown elapses, press `1`/`2` or scroll — confirm gun switching behaves exactly as it did before this checkpoint (checkpoint 15 behavior, unaffected by melee in any way).

- [ ] **Step 10: Verify gun damage scaling makes higher rounds noticeably more survivable with guns**

Reach round 5 (or as close as practical) with M1911 equipped. Empty a full magazine (12 rounds) into a single round-5 zombie and count how many hits it actually takes to kill (reload and continue if needed, keeping a running count). **Expected: roughly 23 hits** (round-5 zombie health `100 * 5 = 500`; scaled M1911 damage `10 * (1 + 0.3 * 4) = 10 * 2.2 = 22`; `⌈500 / 22⌉ = 23`) — compare this by feel against how round 5 played in checkpoint 16's earlier (pre-gun-scaling) build, where it would have taken `500 / 10 = 50` unscaled hits; the corrected version should feel roughly twice as fast to clear a zombie with guns at this round. If you can reach round 10, the same math predicts roughly 28 hits there (unscaled would be 100) — an even starker improvement. If the actual hit count is wildly different from ~23 at round 5, stop and report it — it may indicate `GUN_SCALE_RATE` needs tuning (currently `0.3`, in `modes/ZombieSurvival.ts`) or a bug in the scaling wiring.

- [ ] **Step 11: Verify respawn resets round, gun inventory, and gun damage scaling**

Progress to round 3+ (so damage scaling is clearly active) and acquire a second gun (if not already done). Die and respawn. Confirm: the round counter resets to 1 (round-1 zombie health, one-hit-killable again, and gun damage back to its round-1/unscaled baseline — a single M1911 shot should deal exactly `10` damage again, not a scaled value); the gun inventory resets to M1911 in slot 0 only, slot 1 empty; `V` still works correctly immediately after respawn (not stuck in some leftover cooldown state from before death).

- [ ] **Step 12: Regression-check unrelated mechanics**

Confirm gun firing/reload, HUD, doors/buttons/pickups/wall-buys, Shooting Range mode (try melee there too — confirm `ShootingRange` targets still take exactly the gun's base, unscaled damage, since that mode never sets `damageMultiplier`), and both maps are otherwise unaffected. Confirm the viewmodel lunge (if noticeable) doesn't look broken or interfere with normal gun-viewmodel bob/impulse behavior from checkpoint 14.

---

### Task 19: Update CLAUDE.md and commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the folder structure tree**

Change the `content/enemies.ts` and `content/weapons.ts` lines, and the `EnemyAI.ts`/`WeaponSystem.ts`/`ZombieSurvival.ts`/`main.ts` lines. Find each by content (spacing may differ slightly from what's shown here) and append the noted checkpoint-16 annotation:

`content/enemies.ts`:
```
    enemies.ts                  [1, populated at 5]
```
→
```
    enemies.ts                  [1, populated at 5; base health becomes the round-1 baseline for round-based scaling at 16, see modes/ZombieSurvival.ts]
```

`content/weapons.ts` (append to the existing checkpoint-15 annotation):
```
    weapons.ts                  [1, populated at 5; cost field added at 11 for wall-buy pricing; second weapon (MAC-10, full-auto) added at 15]
```
→
```
    weapons.ts                  [1, populated at 5; cost field added at 11 for wall-buy pricing; second weapon (MAC-10, full-auto) added at 15; third weapon (knife, melee) added at 16, the first entry using the checkpoint-16 optional ammo fields/meleeRange discriminator]
```

`core/EnemyAI.ts`:
```
    EnemyAI.ts                  [4, refactored at 7 into a per-instance class — see decisions log]
```
→
```
    EnemyAI.ts                  [4, refactored at 7 into a per-instance class — see decisions log; maxHealth constructor override added at 16 for round-based health scaling, passed in by ZombieSurvival rather than read from the shared EnemyDef]
```

`core/WeaponSystem.ts` (append to the existing checkpoint-15 annotation):
```
    WeaponSystem.ts             [2, addTarget()/removeTarget() added at 7; delegate to RaycastRegistry at 8.5 instead of an own list; setWeapon() added at 11 for mid-game weapon swaps (wall-buy); 15 replaces the single current weapon with a slot-based inventory (MAX_SLOTS constant, pickupWeapon() replaces setWeapon(), number-key/scroll-wheel switching)]
```
→
```
    WeaponSystem.ts             [2, addTarget()/removeTarget() added at 7; delegate to RaycastRegistry at 8.5 instead of an own list; setWeapon() added at 11 for mid-game weapon swaps (wall-buy); 15 replaces the single current weapon with a slot-based inventory (MAX_SLOTS constant, pickupWeapon() replaces setWeapon(), number-key/scroll-wheel switching); 16 adds a V-key melee attack action gated by a 1s cooldown (never changes the equipped gun), a damageMultiplier field ZombieSurvival scales per round (guns only, never the knife), plus assertRangedWeapon()/assertMeleeWeapon() type guards]
```

`modes/ZombieSurvival.ts`:
```
    ZombieSurvival.ts            [7, owns round number + enemy spawn/despawn lifecycle; implements GameMode from 8]
```
→
```
    ZombieSurvival.ts            [7, owns round number + enemy spawn/despawn lifecycle; implements GameMode from 8; healthForRound() added at 16 for round-based zombie health scaling, paired with gunDamageMultiplierForRound() (also 16) which scales WeaponSystem.damageMultiplier at a gentler rate — two independent round-scaling formulas, see decisions log]
```

`content/sounds.ts` (append to the existing checkpoint-1 annotation):
```
    sounds.ts                   [1, populated across 2/4/9]
```
→
```
    sounds.ts                   [1, populated across 2/4/9; melee_hit added at 16 for the knife attack, distinct from pistol_fire]
```

- [ ] **Step 2: Update the Checkpoints list**

Add a new line immediately after checkpoint 15's line:

```
16. Round-based zombie health scaling + melee attack — `ZombieSurvival.healthForRound()` scales each round's zombie max health as `enemyDef.health * round`, computed fresh per round and passed into `EnemyAI` as an explicit override rather than mutating the shared `EnemyDef`; `V` performs an instant melee attack (1s cooldown, `Weapon.meleeRange` is the new ranged-vs-melee discriminator) without ever changing the equipped gun, with damage deliberately set equal to zombie base health so round N takes exactly N melee hits; guns also scale via a separate, gentler `WeaponSystem.damageMultiplier` ZombieSurvival sets per round, keeping high-round gunfights survivable without touching the knife's fixed damage
```

- [ ] **Step 3: Update "Current status"**

Change the opening sentence from `Checkpoint 15 complete.` to `Checkpoint 16 complete.`, and append four new paragraphs after the existing checkpoint-15 paragraphs (before `## Decisions log`):

```

`modes/ZombieSurvival.ts` gained `healthForRound(round): number` (checkpoint 16), returning `this.enemyDef.health * round` — round 1 zombies have their normal base health (100), round 2 double (200), round 3 triple (300), uncapped. `startRound()` computes this once per round and passes it as a new `maxHealth` constructor argument to every `EnemyAI` it spawns that round; `this.enemyDef` itself is never mutated, since it's the one shared `EnemyDef` object reused across every spawn in every round. `core/EnemyAI.ts` stores this as its own `maxHealth` field, uses it as both the instance's starting `health` and the "max" value reported to `gameState.enemyHealth` (previously `def.health`, now correctly reflecting each instance's actual round-scaled cap rather than the base value) — this is what keeps the HUD's enemy health label accurate at any round (e.g. "300/300" at round 3, not "300/100"). Gun kill-shot counts would rise with rounds as a direct consequence of health scaling alone — this is intended, matching real CoD Zombies scaling, not a bug, though see the gun-damage-scaling paragraph below for why it doesn't rise unboundedly.

`content/weapons.ts` gained a third `Weapon`, the knife (checkpoint 16, `id: "knife"`) — the stats behind the first melee attack. The `Weapon` interface (`src/types/index.ts`) was minimally adapted to support this: `magSize`/`reloadTime`/`startingReserveAmmo` became optional, and a new `meleeRange?: number` field was added whose mere presence is the ranged-vs-melee discriminator (no separate `kind`/`type` tag). The knife's `damage: 100` is deliberately, load-bearingly equal to the zombie `EnemyDef`'s base `health: 100` — combined with `healthForRound()`'s `enemyDef.health * round` formula above, this means round N's zombie health is always an exact multiple of the melee attack's damage, so round N always takes exactly N melee hits to kill. `core/WeaponSystem.ts` gained a `V` key handler that performs a **quick attack action, not a weapon-equip toggle** — this was corrected mid-checkpoint after manual testing of an initial equip-toggle design found it was the wrong mechanic entirely (see the decisions log). Pressing `V` fires a short-range raycast the instant it's pressed (`meleeWeapon.meleeRange`, reusing `Raycast.fromCamera()`'s existing `maxDistance` parameter and the same `userData.onHit` hook every other damage source already uses — no new hit-detection system), deals `meleeWeapon.damage`, plays a dedicated `melee_hit` sound (see below), and starts a cooldown (`meleeWeapon.fireRate`, `1` second — raised from an initial `0.5` after further manual testing found `0.5` let `V` be spammed too close to the gun's own fire cadence, undermining melee's "distinct action" feel) that also gates mouse1/`R` — both are ignored for that 1s window, then resume automatically, since the equipped gun (its slot, ammo, and reload state) was never touched at any point. `meleeWeapon`/`startingMeleeWeapon` remain reassignable instance state (not a hardcoded constant, defaulting to the knife) purely because a future Bowie knife is planned to make `V` perform a different, higher-damage attack — not because anything is ever "equipped" in-hand. Two small internal type-guard functions, `assertRangedWeapon()`/`assertMeleeWeapon()` (TypeScript assertion functions), narrow the now-optional-field `Weapon` shape at the few places that need guaranteed ammo or `meleeRange` fields. A small `WeaponViewmodel.addImpulse()` call (the checkpoint-14 mechanism, explicitly earmarked in its own future-mechanics notes for melee) gives the attack a placeholder "lunge" for feedback, via a new `onMeleeAttack` constructor callback `main.ts` wires — `WeaponSystem` itself never imports `WeaponViewmodel`. `reset()` restores `meleeWeapon` to `startingMeleeWeapon`; there is no `meleeEquipped`-style flag left to reset, since nothing is ever equipped. Verified in-browser: round 1 is a one-hit melee kill, round 2 (after surviving to it) is a two-hit kill; the equipped gun and its exact ammo count are completely unaffected by any number of `V` presses; rapid `V` presses only trigger the first, the rest are silently ignored until the 1s cooldown elapses; mouse1/`R` are blocked only during that window and resume automatically with no key needed; number-key/scroll gun switching is entirely unaffected by melee; and respawn correctly resets the round counter and gun inventory.

`content/sounds.ts` gained `melee_hit` (checkpoint 16, `public/sounds/melee_hit.wav`) — a low-pitched, fast-decaying synthesized "thud" (Node-generated PCM, the same dependency-free technique behind every other placeholder sound in this project), deliberately distinct in character from `pistol_fire`'s sharper click so the two attacks are easy to tell apart by ear during play. It's non-positional (`positional: false`), the same rationale as `pistol_fire`: it's always the local player's own attack, so it doesn't need a 3D source. `main.ts` preloads it alongside the other sounds; `WeaponSystem.meleeAttack()` plays it at the exact moment it fires the hit-detection raycast, replacing the original placeholder choice of reusing `pistol_fire` for melee.

Guns now also scale their damage per round (checkpoint 16), independently of zombie health scaling — added after manual testing at higher rounds found health scaling alone made guns take an ever-growing, eventually absurd number of hits (round 10 would need 100 pistol hits). `modes/ZombieSurvival.ts` gained `gunDamageMultiplierForRound(round): number`, returning `1 + GUN_SCALE_RATE * (round - 1)` with `GUN_SCALE_RATE = 0.3` — deliberately gentler than health's per-round growth (rate 1.0), so gun kill counts still rise with round (preserving difficulty) but far more slowly than health does. `startRound()` assigns this value to a new `core/WeaponSystem.ts` field, `damageMultiplier` (default `1`), once per round, alongside the existing `healthForRound()` call. `WeaponSystem.fire()` (the gun hitscan path) multiplies `weapon.damage` by `damageMultiplier`; `meleeAttack()` deliberately never reads it, so the knife's damage stays flat at `100` always, preserving the checkpoint-16 damage-100-equals-zombie-base-health coupling documented above untouched. `damageMultiplier` is a generic, mode-agnostic field on `WeaponSystem` — `core/` has no idea rounds exist, it just multiplies whatever the field currently holds, the same dependency-direction discipline as the `onMeleeAttack` callback. `ShootingRange` never touches this field, so it stays at its safe default of `1` there. Verified in-browser: at round 5, the M1911 (scaled damage `10 * (1 + 0.3*4) = 22`) kills a round-5 zombie (health `500`) in roughly 23 hits (`⌈500/22⌉`), a marked improvement over the 50 hits health scaling alone would require; a fresh run (round 1) still shows `damageMultiplier` reset to its default `1`; `ShootingRange` targets still take exactly unscaled `weapon.damage` per hit.
```

- [ ] **Step 4: Add decisions log entries**

Append after the last existing decisions-log line, before `## Future mechanics`:

```
- The melee attack's `damage: 100` (checkpoint 16) is deliberately, exactly equal to `content/enemies.ts`'s zombie `EnemyDef.health` (100) — this is a load-bearing coupling between two numbers in two different files, not a coincidence, and **must not be independently "corrected" or rebalanced** without updating both together: `ZombieSurvival.healthForRound(round)` scales zombie max health as `enemyDef.health * round`, so as long as the melee attack's damage equals `enemyDef.health`, round N always takes exactly N melee hits to kill — the explicit design goal for this checkpoint. Changing either number alone (e.g. a future balance pass raising zombie base health without raising melee damage to match) silently breaks this property.
- Round-based zombie health scaling (checkpoint 16) uses the plain formula `enemyDef.health * round`, uncapped — no maximum round, no diminishing-returns curve. This intentionally lets kill-shot counts (for guns too, not just melee) rise without bound at high rounds, matching real CoD Zombies' own scaling. `ZombieSurvival`'s shared `enemyDef` object is never mutated to hold a round-specific value; `startRound()` computes a fresh local `number` each round and passes it explicitly into each `EnemyAI`'s constructor, keeping the one `EnemyDef` object a pure, round-independent base definition.
- `Weapon.meleeRange` (checkpoint 16) was chosen as the sole ranged-vs-melee discriminator over adding a separate `kind: "ranged" | "melee"` tag, specifically to avoid two fields that could disagree with each other (e.g. `kind: "melee"` on an object that still has a `magSize` set, or vice versa) — a melee weapon's defining property (having a melee range at all) does double duty as both real data and the type signal. `magSize`/`reloadTime`/`startingReserveAmmo` became optional for the same reason: a shared `Weapon` interface across one `WEAPONS` content array, rather than a parallel type/system for melee, per the project's own "follow existing patterns" instruction for this checkpoint. This change was NOT backward-compatible against the pre-checkpoint-16 `WeaponSystem.ts` at the type-check level (though it was fully runtime-safe) — widening those three fields to optional immediately produced 7 TypeScript errors in the not-yet-rewritten `WeaponSystem.ts`, which is why the interface change and the `WeaponSystem.ts` rewrite were sequenced as adjacent tasks (nothing else landing in between that would need a clean build against the broken intermediate state).
- `WeaponSystem`'s two internal type guards, `assertRangedWeapon()`/`assertMeleeWeapon()` (checkpoint 16, TypeScript assertion functions), exist so the few places that need a `Weapon`'s ammo fields or `meleeRange` guaranteed-defined (constructing a `WeaponSlot`, storing `meleeWeapon`) can narrow the type once, explicitly, with a clear runtime error naming the offending weapon id if the invariant is ever violated — rather than either scattering non-null assertions (`weapon.magSize!`) through `fire()`/`startReload()`/`finishReload()`, or introducing a full discriminated-union split of `Weapon` into `RangedWeapon | MeleeWeapon` (considered, rejected as more invasive than this checkpoint's "adapt minimally" instruction called for, since every existing `Weapon`-typed signature in `MapEntitySystem.ts`/`ui/MainMenu.ts` would have needed to change too).
- **Melee is a quick attack action, never a weapon-equip toggle** (checkpoint 16, corrected mid-checkpoint): the original design had `V` toggle an "equipped" mode (mouse1 swung the knife while equipped; switching guns exited the mode). Manual testing found this was the wrong mechanic entirely, not a tuning issue — real CoD Zombies knife-melee is an instant attack performed while still holding your gun. The corrected `WeaponSystem` never has a `meleeEquipped`-style flag at all: `V`'s own cooldown (`isMeleeAttacking`, derived from a timer comparison, the same pattern gun fire-rate gating already uses) is the only gate, and the equipped gun's slot/ammo/reload state is structurally never touched by any melee code path — there is no "return to the previous gun" step because the gun was never left. This is a stronger invariant than the original design's (which relied on `switchToSlot()` correctly clearing a mode flag); the corrected version has no flag to get out of sync in the first place.
- `meleeWeapon`/`startingMeleeWeapon` are STILL tracked as swappable instance state (checkpoint 16), not a hardcoded constant, even after the equip-toggle redesign above — the reason is unchanged: a planned future Bowie knife would make `V` perform a different, higher-damage attack (see future mechanics), and `meleeWeapon` is what a future reassignment method would target. `reset()` restores it to `startingMeleeWeapon` (captured once at construction) so a future Bowie-knife pickup's effect doesn't persist across a death/respawn. The only thing the equip-toggle correction removed was `meleeEquipped` itself (there is no in-hand "equipped" concept anymore) — the reassignable-attack-type state was never the problem and was kept as-is.
- The melee attack's placeholder feedback (checkpoint 16) reuses `WeaponViewmodel.addImpulse()` (built at checkpoint 14, whose own future-mechanics notes already named melee-swing as an intended integration point) via a new `onMeleeAttack: () => void` constructor callback on `WeaponSystem`, wired in `main.ts` — the same dependency-injection pattern `PlayerState`'s `onDeath` callback already established, so `WeaponSystem` never needs to import `WeaponViewmodel` directly. This required moving `WeaponViewmodel`'s construction earlier in `main.ts`'s `startGame()` (it has no dependency on anything else in that function, so the reorder is side-effect-free) so the callback closure references an already-initialized variable rather than relying on JavaScript's closure-timing semantics to make a forward reference safe.
- **Superseded above** (was: "starts a cooldown (`meleeWeapon.fireRate`, `0.5` seconds)"): the melee attack's cooldown (checkpoint 16, `content/weapons.ts`'s knife `fireRate`) was raised from `0.5` to `1` second after further manual testing found `0.5` let `V` be spammed almost as fast as the gun's own fire cadence, undermining the "distinct action" feel a melee attack is supposed to have. This is purely a value change on existing content — the cooldown *mechanism* (`isMeleeAttacking`, a timer-comparison getter gating both `V` itself and mouse1/`R` for its duration) is exactly the one built during the equip-toggle-to-quick-attack correction above, unchanged.
- The melee attack now plays a dedicated sound, `melee_hit` (checkpoint 16, `content/sounds.ts` + `public/sounds/melee_hit.wav`), instead of reusing `pistol_fire` as the initial implementation did — a low-pitched, fast-decaying synthesized "thud" (Node-generated PCM, matching this project's established placeholder-sound technique), deliberately distinct in character from the gun's sharper click so the two are easy to tell apart by ear. It's non-positional, the same rationale `pistol_fire` already uses (always the local player's own action, no 3D source needed). `WeaponSystem.meleeAttack()` plays it at the same call site as the hit-detection raycast — the same "trigger point" every other damage-dealing sound in this project already fires from.
- **Gun damage now scales per round too — a second, deliberately independent round-scaling coupling alongside the melee-damage-equals-zombie-base-health one above, and the two must never be conflated or "simplified away" into a single formula** (checkpoint 16): `ZombieSurvival.gunDamageMultiplierForRound(round) = 1 + GUN_SCALE_RATE * (round - 1)`, `GUN_SCALE_RATE = 0.3` (a named tunable constant, deliberately gentler than health's per-round growth rate of `1.0`), assigned once per round to a new `WeaponSystem.damageMultiplier` field (default `1`) inside `startRound()`, right alongside the existing `healthForRound()` call. `WeaponSystem.fire()` (guns only) multiplies `weapon.damage` by this field; `meleeAttack()` never reads it, so the knife's damage stays flat at `100` regardless of round, leaving the `damage-100-equals-zombie-base-health` coupling documented above completely untouched. This exists because `healthForRound()`'s linear, uncapped growth alone made gun kill-shot counts grow just as unboundedly (round 10 would need 100 pistol hits), which the project's own future-mechanics notes had left as an open question rather than a settled design; `GUN_SCALE_RATE`'s gentler rate keeps gun difficulty rising with round (not flat, not trivial) while staying survivable at high rounds, rather than forcing melee-only play once guns fall too far behind. `damageMultiplier` was deliberately built as a generic, mode-agnostic `number` field on `WeaponSystem` (not a `ZombieSurvival`-specific concept hardcoded into `core/`), preserving the "`core/` never references `content/` or `modes/`" rule — `WeaponSystem` has no idea rounds exist, it only multiplies whatever the field currently holds, and `ZombieSurvival` (which is allowed to depend on `core/`) is the one place that assigns meaning to it, mirroring the `onMeleeAttack` callback's dependency-injection pattern from the correction above. `ShootingRange` never touches this field, so it stays at its safe default of `1` in that mode — confirmed no scaled-vs-unscaled damage discrepancy exists there. **Anyone touching either `healthForRound()` or `gunDamageMultiplierForRound()` in the future must consider both together**: `healthForRound()` alone determines exactly how many melee hits round N takes (via the fixed 100-damage coupling above); `gunDamageMultiplierForRound()` exists purely to partially compensate the same health growth for guns, at a different rate — changing one without deliberately re-deriving the other breaks either the melee-hits-equal-round-number property or the intended gun-difficulty curve.
```

- [ ] **Step 5: Add future-mechanics entries**

Append three new future-mechanics bullets at the end of the section:

```
- **Bowie knife (upgraded melee attack)**: not built. Unlike the ballistic knife below, this is explicitly NOT pure content — a Bowie knife pickup/perk (mechanism TBD) would need to call a new `WeaponSystem` method (not built yet) that reassigns the `meleeWeapon` field to a higher-damage `Weapon`, so `V` performs a stronger attack, without ever changing anything about the equipped gun (there is nothing to equip melee into, per the checkpoint-16 correction). This is exactly why checkpoint 16 tracks the melee attack type as reassignable state (`meleeWeapon`) rather than a hardcoded constant, even though only one melee weapon exists today — the state and the `reset()`-restores-`startingMeleeWeapon` behavior already exist; only the pickup/perk mechanism and the reassignment method itself remain undesigned.
- **Ballistic knife (throwable melee variant)**: not built. Unlike the Bowie knife above, this is expected to be a pure content addition, likely modeled as a separate throwable/one-use item rather than a change to the `V` melee attack — the same MAC-10-style pattern (checkpoint 15) of "add data, existing systems already support the shape" is expected to apply here too, once its exact mechanic (a single-use ranged throw with pickup-to-reuse, or a consumable) is actually designed. No new system is anticipated to be needed for it, unlike the Bowie knife.
- **`GUN_SCALE_RATE` tuning**: checkpoint 16 picked `0.3` as a starting value, sanity-checked by hand against a round-5 M1911 hit-count estimate (~23 hits vs. 50 unscaled) rather than derived from a formula or extensively playtested at high rounds — flagged as adjustable, the same way the knife's cooldown value was before it, if playtesting at rounds 10+ finds guns still trending too weak or too strong relative to melee.
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Search for staleness this checkpoint may have introduced**

This project's CLAUDE.md has needed a staleness fix in nearly every recent checkpoint (9, 9.5, 10, 10's final review, 11 across two rounds, 12, 13's final whole-branch review, 15 — six separate fixes in one sweep) — always the same failure mode: an older sentence elsewhere in the document making a present-tense claim this checkpoint's changes now contradict. This checkpoint has an EXTRA staleness risk unique to it: the mid-checkpoint design correction means Tasks 5-6's original commits (and their own code comments, already superseded by Tasks 8-9) described an equip-toggle mechanic that no longer exists in the shipped code — make sure nothing in CLAUDE.md accidentally describes that superseded design as current. Before committing, read the entire document (not just the sections edited above) and specifically check for:
- Any sentence describing `EnemyDef.health`/zombie health as fixed/unscaled, or describing `EnemyAI`'s constructor signature/parameter list in a way that's now stale (search "def.health", "EnemyAI(").
- Any sentence describing `content/weapons.ts`/`WEAPONS` as having exactly two entries, or the `Weapon` interface's ammo fields as unconditionally required (search "magSize", "required field" in the context of `Weapon`).
- Any sentence describing `WeaponSystem`'s constructor parameter list without the `meleeWeapon`/`onMeleeAttack` arguments, or describing melee as something that gets "equipped"/toggled/switched away from (search "meleeEquipped", "equip", "swing" in a melee context) — this document itself must describe ONLY the corrected quick-attack design, never the superseded equip-toggle one.
- Any sentence still claiming the melee cooldown is `0.5` seconds (search "0.5" near "melee"/"cooldown"/"swing") — the final value is `1` second; a `0.5` reference is only valid if explicitly framed as a superseded intermediate value.
- Any sentence claiming the melee attack reuses `pistol_fire` for its sound (search "pistol_fire" near "melee") — it now plays its own `melee_hit` sound.
- Any sentence describing gun damage, or `weapon.damage`, as flat/unscaled across rounds, or describing `ZombieSurvival`'s constructor parameter list without `weaponSystem` (search "ZombieSurvival(", "damage" near "flat" or "unscaled").
- Any other claim this checkpoint's changes would now contradict.

If you find staleness, fix it using the established `**Superseded at checkpoint N** (was: "...")` convention for decisions-log/future-mechanics entries, or an inline parenthetical for "Current status" prose (both conventions are already used elsewhere in this document — match whichever fits the specific sentence). If you find nothing beyond what Steps 1-5 already added, say so explicitly in your commit's task report — don't skip stating the negative result.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Checkpoint 16: round-based zombie health scaling + melee attack

Adds ZombieSurvival.healthForRound(round) = enemyDef.health * round,
computed fresh each round and passed as an explicit maxHealth override
into each spawned EnemyAI rather than mutating the shared EnemyDef.
EnemyAI now reports this per-instance value (not the EnemyDef base) as
both its starting health and the HUD label's max, so the label stays
accurate at any round.

Adds V as an instant melee attack action. The Weapon interface is
minimally adapted: magSize/reloadTime/startingReserveAmmo become
optional, and a new meleeRange field is both melee-specific data and
the sole ranged-vs-melee discriminator. The attack's damage (100) is
deliberately, load-bearingly equal to the zombie EnemyDef's base
health (100), so round N always takes exactly N melee hits to kill --
changing either number alone silently breaks this.

WeaponSystem's melee handling was corrected mid-checkpoint after
manual testing of an initial equip-toggle design (V switched to the
knife, mouse1 swung it, switching guns exited the mode) found it was
the wrong mechanic -- not a tuning issue. The corrected version: V
fires a short-range raycast the instant it's pressed, gated only by
its own cooldown (meleeWeapon.fireRate, derived via a timer comparison
the same way gun fire-rate gating already works -- no separate mode
flag), plays a dedicated melee_hit sound distinct from gunfire, and
never touches the equipped gun's slot, ammo, or reload state at any
point. meleeWeapon/startingMeleeWeapon remain reassignable instance
state (not a constant) for a future Bowie knife that would make V
perform a different attack. A small WeaponViewmodel.addImpulse() call
gives the attack placeholder feedback via a new onMeleeAttack
constructor callback, the same dependency-injection pattern
PlayerState's onDeath callback already uses.

Two rounds of manual-testing feedback landed on top of the above:
the melee cooldown was raised from 0.5s to 1s (0.5 let V be spammed
almost as fast as gunfire), the melee sound was split out from
pistol_fire into its own synthesized melee_hit.wav, and gun damage now
scales per round too via a new WeaponSystem.damageMultiplier field
(default 1, guns only, never the knife) that ZombieSurvival sets each
round via gunDamageMultiplierForRound(round) = 1 + GUN_SCALE_RATE *
(round - 1), GUN_SCALE_RATE = 0.3 -- deliberately gentler than health's
per-round growth, so guns stay viable at high rounds without the
knife's fixed damage-100-equals-zombie-base-health coupling ever being
touched. damageMultiplier is a generic, mode-agnostic core/ hook
populated by the mode, not a hardcoded round-awareness inside
WeaponSystem itself.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Verify the commit**

Run: `git status` and `git log -1 --stat`
Expected: working tree clean; the commit touches `CLAUDE.md` (plus this plan doc, if not already committed by an earlier task) — `src/core/EnemyAI.ts`, `src/modes/ZombieSurvival.ts`, `src/types/index.ts`, `src/content/weapons.ts`, `src/content/sounds.ts`, `public/sounds/melee_hit.wav`, `src/core/WeaponSystem.ts`, and `src/main.ts` should all show no changes from this task, since they were already committed by Tasks 1-9 and 12-17.

---

## Self-Review Notes

- **Spec coverage:** round-based health scaling formula (`enemyDef.health * round`), computed per-spawn without mutating the shared `EnemyDef`, passed as an override into `EnemyAI` (Tasks 1-2) ✓; knife content alongside M1911/MAC-10 with the `Weapon` interface minimally adapted via optional fields + a `meleeRange` discriminator (Tasks 3-4) ✓; damage exactly 100 (equal to zombie base health), commented prominently in both `content/weapons.ts` and CLAUDE.md, explicitly warning against fixing one value without the other (Task 4, Task 11) ✓; **melee corrected to a quick attack action, never a weapon-equip toggle, after manual testing of Tasks 5-6's original design found it wrong** — the equipped gun and its ammo/reload state are structurally untouched by any melee code path (Task 8) ✓; attack cooldown 0.5s, doubling as the "attack in progress" window that blocks mouse1/R (Task 7's `fireRate` correction + Task 8's `isMeleeAttacking` getter) ✓; hit detection reuses `RaycastRegistry`/`Raycast.fromCamera()`'s existing `maxDistance` param, no new system (Task 8) ✓; no new viewmodel model-swap, only a placeholder feedback impulse via the pre-existing `addImpulse()` mechanism (Task 9) ✓; melee attack type tracked as reassignable state defaulting to "knife," not an immutable constant, explicitly for a future Bowie knife (Task 8, Task 11 decisions log + future mechanics) ✓; number-key/scroll gun switching is completely unaffected by melee, since there is no mode for it to exit (Task 8, unchanged switching handlers) ✓; respawn resets round counter, gun inventory, and the melee attack type back to `startingMeleeWeapon` (Task 2's unchanged `resetRun()`; Task 8's `reset()`) ✓; corrected manual verification checklist covering round-1/round-2 kill counts, gun-and-ammo-unaffected-by-V, cooldown-prevents-spam, mouse1/R-blocked-only-during-attack-window, switching-unaffected, and respawn reset (Task 10) ✓; CLAUDE.md distinguishing Bowie knife (not pure content, changes the V attack, needs this checkpoint's swappable state) from ballistic knife (pure content, throwable, MAC-10-style, no new system) in future mechanics (Task 11, Step 5) ✓.
- **Placeholder scan:** no TBD/TODO; every step has complete, exact code; Task 10's verification steps are concrete, sequenced observable behaviors (specific hit counts at specific rounds, specific ammo-unaffected checks, a specific spam-then-verify-silence check) rather than vague "make sure it works" language; the round-2 verification step explicitly acknowledges it requires actually surviving to round 2, not assuming it.
- **Type consistency check:** `EnemyAI`'s constructor gains `maxHealth: number` as its 3rd positional parameter (Task 1); `ZombieSurvival.startRound()` (Task 2) calls `new EnemyAI(id, this.enemyDef, health, spawnPoint, ...)` with `health: number` in that exact 3rd position — matches. `WeaponSystem`'s constructor gains `meleeWeapon: Weapon` as its 3rd positional parameter (Task 8, unchanged from the original Task 5 design) and `onMeleeAttack: () => void` as its new 8th/last parameter (Task 8, new in the correction); `main.ts` (Task 9) passes `findById(WEAPONS, "knife")` in the 3rd position (unchanged from Task 6) and `() => weaponViewmodel.addImpulse(...)` as the new final argument — matches. The `RangedWeapon`/`MeleeWeapon` intersection types and `assertRangedWeapon()`/`assertMeleeWeapon()` guards (Task 8, carried over from Task 5) are used consistently within `WeaponSystem.ts` only — no external signature (`pickupWeapon(weapon: Weapon)`, `MapEntitySystem.ts`'s existing call site) needed any change. `content/weapons.ts`'s knife entry (Task 4, `fireRate` corrected in Task 7 from `0.8` to `0.5`) satisfies the `Weapon` interface exactly as extended in Task 3 — no type mismatch.
- **Compile-safety / task-ordering check:** Tasks 1-6 established the original (later-corrected) sequencing, verified at the time via required single-expected-error checks at each hand-off point (documented in each task's own notes). The correction (Tasks 7-9) preserves the same discipline: Task 7 (content-only `fireRate` value/comment fix) introduces no new errors anywhere, since nothing yet depends on its specific value beyond a runtime cooldown-duration read. Task 8 (`WeaponSystem.ts` full rewrite, removing `meleeEquipped` and adding `onMeleeAttack`) intentionally breaks `main.ts` (missing the new final constructor argument) — verified via the same expected-single-error discipline. Task 9 depends on Task 8 and restores a clean build, while also reordering `weaponViewmodel`'s construction earlier in the same function (a side-effect-free reorder, since `WeaponViewmodel`'s constructor takes no arguments and has no dependency on anything else in `startGame()`). No `erasableSyntaxOnly` violations anywhere: no parameter-property constructor shorthand, no enums; `RangedWeapon`/`MeleeWeapon` remain plain intersection type aliases, `assertRangedWeapon`/`assertMeleeWeapon` remain plain `asserts x is T` functions, unchanged by the correction.
- **Architecture-rule cross-check:** `content/enemies.ts`/`content/weapons.ts` remain the sole home for weapon/enemy content, per the existing rule — `healthForRound()`'s scaling *formula* lives in `modes/ZombieSurvival.ts` (a mode, not content), operating on the content value (`enemyDef.health`) rather than encoding a hardcoded number itself. `core/EnemyAI.ts` and `core/WeaponSystem.ts` gain no new imports beyond what they already had, both before and after the correction — the `onMeleeAttack` callback keeps `WeaponSystem.ts` from ever needing to import `WeaponViewmodel`, preserving the same "composition root wires cross-system callbacks, individual systems stay ignorant of each other" pattern `PlayerState`'s `onDeath` callback already established at checkpoint 4.5.

**Second correction addendum (Tasks 12-19):** three further fixes from a second round of manual-testing feedback, layered on top of the already-clean Tasks 1-9 without touching their mechanism. Task 12 (`content/weapons.ts`): knife `fireRate` `0.5` → `1`, `fireSoundId` `"pistol_fire"` → `"melee_hit"` — value/content-only, no signature changes. Task 13 (`content/sounds.ts` + `public/sounds/melee_hit.wav`): new `SoundDef` entry; the WAV asset itself was pre-generated via a documented, reproducible Node script and already verified as valid RIFF/WAVE PCM before this plan section was written. Task 14 (`main.ts`): one new preload line, no other change. Task 15 (`core/WeaponSystem.ts`): adds `damageMultiplier = 1` as a public field (not a constructor parameter — no downstream signature change), read only inside `fire()`, deliberately never inside `meleeAttack()`. Task 16 (`modes/ZombieSurvival.ts`): adds `weaponSystem` as a new final constructor parameter plus `GUN_SCALE_RATE`/`gunDamageMultiplierForRound()`, wired into `startRound()` — intentionally breaks `main.ts`'s existing `new ZombieSurvival(...)` call (missing argument), verified via the same expected-single-downstream-error discipline used throughout this checkpoint. Task 17 (`main.ts`) restores a clean build by passing `weaponSystem` as that new argument; `ShootingRange`'s construction is explicitly unchanged, since it never reads `damageMultiplier`. Task 18 (manual verification) and Task 19 (this CLAUDE.md update) close out the second correction the same way Tasks 10/11 would have closed the first, had the second correction not arrived first — spec coverage for all three fixes (1s cooldown, distinct sound, gun damage scaling with the two-independent-formulas warning) is reflected above in Steps 3-5's rewritten paragraphs and decisions-log entries.
