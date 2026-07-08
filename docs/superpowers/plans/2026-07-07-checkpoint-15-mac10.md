# Checkpoint 15: MAC-10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, full-auto weapon (MAC-10) as pure content, and replace `WeaponSystem`'s single-current-weapon state with a slot-based inventory (number-key and scroll-wheel switching, wall-buy-fills-empty-slot-or-replaces-active-slot) so the player can carry both weapons at once.

**Architecture:** `content/weapons.ts` gets one new `Weapon` object literal. `core/WeaponSystem.ts` is restructured around a fixed-size `slots: (WeaponSlot | null)[]` array (size driven by one named `MAX_SLOTS` constant, not a scattered magic number, so a future perk raising it to 3 is a one-line change) plus an `activeSlotIndex`; `currentAmmo`/`reserveAmmo`/the active `weapon` become accessors reading/writing the active slot, so `fire()`/`finishReload()`/`addReserveAmmo()` need no changes at all. New `pickupWeapon(weapon)` (replacing checkpoint 11's `setWeapon()`) implements the wall-buy rule (fill an empty slot if one exists, else replace the active slot). New keydown (`Digit1`..`DigitN`, generic over `MAX_SLOTS`) and `wheel` (cycle occupied slots, wrapping) handlers live inside `WeaponSystem`, matching its existing self-contained input-handling pattern (mousedown/mouseup/keydown for R already work this way). `MapEntitySystem`'s wall-buy call site and `main.ts`'s `WeaponSystem` construction both get small, targeted updates; `MainMenu`'s Weapon selection UI is unchanged but its selection no longer determines the starting loadout (confirmed with the user — see Global Constraints).

**Tech Stack:** TypeScript (`strict`), no new dependencies.

## Global Constraints

- Exactly one new object appended to the `WEAPONS` array in `src/content/weapons.ts`.
- `id: "mac10"`, `name: "MAC-10"`.
- `magSize: 30`, `startingReserveAmmo: 240` (8 magazines) — both spec-mandated exact values.
- `fireRate` must be small enough to read as clearly full-auto and clearly distinct from the pistol's `0.3` — verified by manual testing, adjustable if the first-cut value doesn't read right.
- `fireSoundId: "pistol_fire"` — reuse the existing sound, do not add a new one (sound design out of scope).
- `cost` must be a number higher than the pistol's `500` — no wall-buy references it yet, but the field is required (`Weapon.cost`, checkpoint 11).
- No wall-buy entity added to either map for MAC-10 this checkpoint.
- No viewmodel appearance change — the generic placeholder mesh stays exactly as checkpoint 13 left it, unconditionally, regardless of equipped weapon.
- No melee system, key binding, or animation code — only a CLAUDE.md future-mechanics entry describing the planned shape.
- **Inventory**: `maxSlots` (`MAX_SLOTS` in `WeaponSystem.ts`) is a named constant, currently `2`, never inlined as a bare number anywhere slot-count/indexing logic depends on it. Player starts every run with M1911 in slot 0, slot 1 empty — **confirmed with the user**: this is now unconditional, regardless of the main menu's Weapon selection (the menu UI itself is unchanged and stays visible/clickable, but `main.ts` no longer uses its selection to choose the starting weapon; this is a deliberate, explicitly-authorized behavior change, not an oversight — flagged in CLAUDE.md as a future cleanup candidate, not fixed now).
- MAC-10 wall-buy: if an empty slot exists, fill it and switch to it; if both slots are full, replace only the currently active slot (never a different, unselected slot).
- Switching: number keys (`1`→slot 0, `2`→slot 1, generalized so a future slot 3 needs no new key-handling code) switch directly to an occupied slot only; scroll wheel cycles the active weapon through occupied slots only (skipping empty slots), wrapping around, using whatever input-handling pattern `WeaponSystem` already uses for its other bindings (`window.addEventListener`, bound arrow-function handlers).
- No 3rd slot, no perk system, no HUD display of the inactive slot's weapon/ammo — all explicitly out of scope this checkpoint (the inactive-slot HUD question is answered by Task 4's own reasoning: not trivial enough to include unprompted, given it would require extending the `GameState` sync contract `HUD` reads from).
- Death/respawn resets the whole inventory back to the starting loadout (M1911 in slot 0, slot 1 empty), matching the existing full-reset behavior other systems already register with `RunManager`.

---

### Task 1: Add MAC-10 to `content/weapons.ts`

**Files:**
- Modify: `src/content/weapons.ts`

**Interfaces:**
- Consumes: the existing `Weapon` interface (`src/types/index.ts`) — unchanged, no new fields.
- Produces: a second entry in the exported `WEAPONS` array, `id: "mac10"`. Consumed automatically by `MainMenu` (already iterates `WEAPONS`) and by `findById(WEAPONS, selections.weaponId)` in `main.ts`'s `startGame()` (already generic) — neither needs any change for this task's output to reach the player.

- [ ] **Step 1: Add the MAC-10 entry**

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
  // verification (Task 5) rather than derived from a formula.
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

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/content/weapons.ts
git commit -m "Checkpoint 15 task 1: add MAC-10 as a second, full-auto weapon"
```

---

### Task 2: Replace `WeaponSystem`'s single weapon with a slot-based inventory

**Files:**
- Modify: `src/core/WeaponSystem.ts`

**Interfaces:**
- Consumes: nothing new — same constructor parameters (`camera`, `weapon` — now the *starting* weapon for slot 0, not "the" weapon — `audioSystem`, `gameState`, `runManager`, `raycastRegistry`).
- Produces: `pickupWeapon(weapon: Weapon): void` (replaces checkpoint 11's `setWeapon()`, which is removed) — Task 3 (`MapEntitySystem`) calls this from the wall-buy's purchase hook. `currentAmmo`/`reserveAmmo` remain public getters (read externally by nothing today, per a codebase-wide grep confirming only `gameState.currentAmmo`/`reserveAmmo` are read externally — but kept as the class's existing public read surface for consistency) — their setters become `private`, since only `WeaponSystem` itself should ever assign them now that they redirect to the active inventory slot. `addTarget()`, `removeTarget()`, `addReserveAmmo()`, `update()` are unchanged in signature and external behavior.

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

interface WeaponSlot {
  weapon: Weapon;
  currentAmmo: number;
  reserveAmmo: number;
}

export class WeaponSystem {
  isReloading = false;

  private readonly raycast = new Raycast();
  private readonly clock = new THREE.Clock();
  private readonly raycastRegistry: RaycastRegistry;

  private timeSinceLastShot = Infinity;
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
  private readonly startingWeapon: Weapon;

  private readonly camera: THREE.Camera;
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
    this.startingWeapon = weapon;
    this.slots = this.buildStartingSlots();
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

  private get weapon(): Weapon {
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

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors. (`getSpeed`-style asymmetric accessor visibility — a `public get` paired with a `private set` — requires no special tsconfig flag; it's standard TypeScript.)

- [ ] **Step 3: Commit**

```bash
git add src/core/WeaponSystem.ts
git commit -m "Checkpoint 15 task 2: replace WeaponSystem's single weapon with a slot-based inventory"
```

Note: this task alone will not compile cleanly end-to-end with the rest of the codebase, because `MapEntitySystem.ts` still calls the now-removed `weaponSystem.setWeapon(weapon)`. Task 3 fixes that immediately next — `npm run build`'s success in Step 2 above only confirms `WeaponSystem.ts` itself is internally consistent; the full-project build will not actually pass until Task 3 lands. (This mirrors how checkpoint 11's test-terminal removal briefly broke compilation between file edits — verify the *whole* project build only once Task 3 is also committed, not after this task alone.)

---

### Task 3: Wire `pickupWeapon()` into the wall-buy

**Files:**
- Modify: `src/core/MapEntitySystem.ts`

**Interfaces:**
- Consumes: `WeaponSystem.pickupWeapon(weapon: Weapon): void` (Task 2).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Update `createWallBuy()`'s purchase hook**

In `src/core/MapEntitySystem.ts`, the current `onInteract` inside `createWallBuy()` reads:

```typescript
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
```

Change the one line to call the new method:

```typescript
    mesh.userData.onInteract = (): void => {
      const purchased = gameState.spendPoints(weapon.cost);
      if (purchased) {
        weaponSystem.pickupWeapon(weapon);
        console.log(
          `Wall-buy: purchased ${weapon.name} for ${weapon.cost} points, balance now ${gameState.pointsBalance}`,
        );
      } else {
        console.log(
          `Wall-buy: rejected (need ${weapon.cost}, have ${gameState.pointsBalance}) — balance unchanged`,
        );
      }
    };
```

(No other line in `createWallBuy()`, or anywhere else in the file, changes.) Also update `createWallBuy()`'s own doc comment (immediately above the method) to describe the new inventory-aware behavior instead of the old "swap the player's active weapon" framing — find the comment block starting `// The first real GameState.spendPoints() caller (checkpoint 11)` and add one sentence after its existing content:

```
  // (checkpoint 15: pickupWeapon() replaces the checkpoint-11 setWeapon() —
  // it fills an empty inventory slot if one exists, or replaces the active
  // slot if the inventory is full, rather than always overwriting a single
  // current weapon. See WeaponSystem.ts and the checkpoint-15 decisions
  // log.)
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors — this is the point where the whole project should compile cleanly again (Task 2's removal of `setWeapon()` and this task's replacement of its sole call site land together in effect, even though they're separate commits).

- [ ] **Step 3: Commit**

```bash
git add src/core/MapEntitySystem.ts
git commit -m "Checkpoint 15 task 3: wire pickupWeapon() into the wall-buy purchase hook"
```

---

### Task 4: Always start every run with M1911 in slot 0

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for later tasks.

The user was asked directly whether the main menu's Weapon selection should still determine the starting weapon now that "every run starts with M1911 in slot 0" is a requirement, and confirmed: **no** — starting loadout is now unconditionally M1911, regardless of the menu's Weapon selection. The Weapon selection UI in `ui/MainMenu.ts` is explicitly left unchanged (still visible, still clickable) — only `main.ts`'s use of that selection changes.

- [ ] **Step 1: Stop using `selections.weaponId` to choose the starting weapon**

In `src/main.ts`, inside `startGame()`, the current `WeaponSystem` construction reads:

```typescript
  const weaponSystem = new WeaponSystem(
    sceneManager.camera,
    findById(WEAPONS, selections.weaponId),
    audioSystem,
    gameState,
    runManager,
    raycastRegistry,
  );
```

Change the weapon argument to always resolve to the pistol:

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

(No other line in `main.ts` changes. `selections.weaponId` itself is untouched in `ui/MainMenu.ts`/`GameSelections` — it's still collected, just not consumed here.)

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "Checkpoint 15 task 4: always start every run with M1911 (inventory slot 0)"
```

---

### Task 5: Manual verification against acceptance criteria (controller-executed, not a subagent)

**Files:** none (verification only).

This task is executed directly by the session controller together with the human partner, the same way every previous checkpoint's manual-verification task has been — it requires live judgment (does the fire rate read as full-auto? does slot switching feel responsive and correct?) that a subagent cannot usefully render a verdict on.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL in a browser.

- [ ] **Step 2: Verify MAC-10 appears as a menu option (still, even though unused for starting loadout)**

On the main menu, confirm the Weapon group still shows two options: "M1911" and "MAC-10", and both remain clickable/selectable (visually), even though selecting either no longer changes what you start a run with.

- [ ] **Step 3: Verify starting loadout is always M1911 in slot 0, slot 1 empty**

Regardless of which Weapon option is selected in the menu, start a run (either mode, either map). Confirm the HUD always shows the M1911's ammo (12/48) at the start of every run.

- [ ] **Step 4: Verify wall-buy fills the empty slot**

With M1911 active and slot 1 empty, get to 1200+ points and interact with a MAC-10 wall-buy... wait, there is no MAC-10 wall-buy on either map yet (out of scope this checkpoint, per Global Constraints). Instead, temporarily verify this via the pistol's existing wall-buy interacting with an *already-full* inventory in Step 5 below, and confirm the empty-slot-fill behavior indirectly: press `2` after a fresh run start — with slot 1 empty, this must do nothing (no crash, no weapon switch, ammo/HUD unchanged), since only occupied slots are selectable. This confirms slot 1 genuinely starts empty. (A real end-to-end wall-buy-fills-empty-slot test requires a MAC-10 wall-buy, which doesn't exist on either map — if you want one added purely for this verification step, say so and it can be added as a small additional task; otherwise this indirect check plus Task 2/3's code review is the available verification for that specific rule this checkpoint.)

- [ ] **Step 5: Verify wall-buy replaces the active slot when full**

Get to 500+ points and interact with the existing pistol-linked wall-buy (`wall_buy_1` on Test Grid or `corridors_wall_buy_1` on Corridors) while M1911 is already in slot 0 and slot 1 is still empty. Confirm it fills slot 1 (per the fill-empty-slot rule) rather than replacing slot 0 — press `1` and `2` afterward to confirm both slots now hold an M1911 each (a duplicate is expected and harmless, since both maps' wall-buys are still pistol-only). This is the closest available full-inventory test without a MAC-10 wall-buy: once both slots are occupied (even with two M1911s), interact with the wall-buy a third time (need more points) and confirm it replaces whichever slot is currently *active* (switch to slot 1 first via `2`, then buy — confirm slot 1's ammo resets to a fresh 12/48 and slot 0 is untouched; repeat switching to slot 0 via `1` first, buy again, confirm slot 0 resets and slot 1 is untouched).

- [ ] **Step 6: Verify number-key switching**

With both slots occupied (from Step 5), press `1` — confirm the active weapon switches to slot 0 (HUD ammo updates to slot 0's tracked ammo). Press `2` — confirm it switches to slot 1 (HUD ammo updates to slot 1's tracked ammo, independently tracked from slot 0's). Fire a few rounds in slot 1, switch to slot 0 via `1`, fire a few rounds there too, then switch back to slot 1 via `2` — confirm slot 1's ammo count reflects exactly what it was left at (proving per-slot ammo persistence, not a shared/reset count).

- [ ] **Step 7: Verify scroll-wheel switching**

With both slots occupied, scroll up — confirm the active weapon changes to the other occupied slot. Scroll up again — confirm it wraps back to the original slot (only 2 occupied slots exist, so scrolling up twice returns to start). Scroll down — confirm it moves in the opposite direction. Confirm the HUD's ammo display updates correctly on every switch.

- [ ] **Step 8: Verify MAC-10 itself still works exactly as before (original checkpoint-15 acceptance criteria)**

Since starting loadout is now always M1911, get MAC-10 into inventory via a wall-buy or by starting a run and using the browser console / a temporary interaction is not available (no MAC-10 wall-buy exists) — for this step, temporarily edit `src/main.ts`'s Task 4 line to read `findById(WEAPONS, "mac10")` instead of `"pistol"`, save (Vite hot-reloads), and verify: starting ammo is 30/240; holding mouse1 fires continuously at a rate that clearly reads as full-auto and clearly faster than the pistol (adjust `fireRate` in `src/content/weapons.ts` if it doesn't, per Task 1's original guidance, and re-verify); reload works correctly; raycast damage/HUD/death-respawn-reset all behave identically to the pistol. Once confirmed, **revert `main.ts` back to `"pistol"`** (`git checkout -- src/main.ts` if no other uncommitted changes are present, or manually edit it back) before continuing — this temporary edit must not be committed.

- [ ] **Step 9: Verify death/respawn resets the whole inventory**

With both slots occupied (e.g. two M1911s from Step 5, or one M1911 + one MAC-10 if Step 8's temporary state is still active — revert first if so), die (Zombie Survival) and click Respawn. Confirm the inventory resets fully: slot 0 is a fresh M1911 at 12/48, slot 1 is empty again (pressing `2` does nothing), and the active weapon is slot 0.

- [ ] **Step 10: Regression-check both maps and modes**

Confirm the inventory system (starting loadout, wall-buy fill/replace, number-key and scroll-wheel switching) works identically on Test Grid and Corridors, and in both Zombie Survival and Shooting Range (no crashes, no missing HUD elements, no broken interactions). Confirm shooting, enemy AI, doors/buttons/pickups, and the HUD's points/round display are otherwise unaffected.

---

### Task 6: Update CLAUDE.md and commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the folder structure tree**

Change the `content/weapons.ts` line (match the file's actual spacing exactly, which may differ slightly from what's shown here — find the line by its content, not by counting spaces):

```
    weapons.ts                  [1, populated at 5; cost field added at 11 for wall-buy pricing]
```

to:

```
    weapons.ts                  [1, populated at 5; cost field added at 11 for wall-buy pricing; second weapon (MAC-10, full-auto) added at 15]
```

Change the `WeaponSystem.ts` line (match the file's actual spacing exactly, which may differ slightly from what's shown here — find the line by its content, not by counting spaces):

```
    WeaponSystem.ts             [2, addTarget()/removeTarget() added at 7; delegate to RaycastRegistry at 8.5 instead of an own list; setWeapon() added at 11 for mid-game weapon swaps (wall-buy)]
```

to:

```
    WeaponSystem.ts             [2, addTarget()/removeTarget() added at 7; delegate to RaycastRegistry at 8.5 instead of an own list; setWeapon() added at 11 for mid-game weapon swaps (wall-buy); 15 replaces the single current weapon with a slot-based inventory (MAX_SLOTS constant, pickupWeapon() replaces setWeapon(), number-key/scroll-wheel switching)]
```

- [ ] **Step 2: Update the Checkpoints list**

Add a new line immediately after checkpoint 14's line:

```
15. MAC-10 + weapon inventory — MAC-10 is a pure content addition to `content/weapons.ts` (full-auto via the existing fire-rate-gated held-mouse1 loop, no new firing mechanics); `WeaponSystem` is restructured from a single current weapon into a fixed-size (`MAX_SLOTS`) slot inventory with per-slot ammo, `pickupWeapon()` (wall-buy fills an empty slot or replaces the active one), and number-key/scroll-wheel switching; every run now starts with M1911 in slot 0 unconditionally, the main menu's Weapon selection no longer determines starting loadout
```

- [ ] **Step 3: Update "Current status"**

Change the opening sentence from `Checkpoint 14 complete.` to `Checkpoint 15 complete.`, and append a new paragraph after the existing checkpoint-14 paragraph (before `## Decisions log`):

```

`content/weapons.ts` gained a second `Weapon`, MAC-10 (checkpoint 15, `id: "mac10"`) — the first full-auto weapon, requiring zero changes to `core/WeaponSystem.ts`'s firing mechanics: its `update()` loop already fires repeatedly at `weapon.fireRate` for as long as mouse1 is held, which is exactly what already made the pistol feel semi-automatic at `fireRate: 0.3`; MAC-10 simply uses a much smaller value (`0.08`, tuned by manual verification to read as clearly full-auto and clearly distinct from the pistol) for the same mechanism. Its other stats: `magSize: 30`, `startingReserveAmmo: 240` (8 magazines), `damage: 8` (lower than the pistol's 10, the standard SMG-vs-pistol tradeoff of lower per-hit damage offset by much higher fire rate), `reloadTime: 1.2` (quicker than the pistol's 1.5), `cost: 1200` (higher than the pistol's 500), and `fireSoundId: "pistol_fire"` (reused rather than adding a new sound — sound design is out of scope).

`core/WeaponSystem.ts` was separately restructured this checkpoint from tracking one current weapon into a fixed-size weapon inventory: a `slots: (WeaponSlot | null)[]` array sized by one named `MAX_SLOTS` constant (currently `2`, never inlined as a bare number in slot-count/indexing logic, since a future perk is planned to raise it to `3`), each occupied slot independently tracking its own `currentAmmo`/`reserveAmmo` — `currentAmmo`/`reserveAmmo` are now accessors reading/writing the active slot rather than plain fields, so `fire()`/`finishReload()`/`addReserveAmmo()` needed no changes to their own bodies. The checkpoint-11 `setWeapon()` (an unconditional single-weapon overwrite) is gone, replaced by `pickupWeapon(weapon)`: if an empty slot exists it's filled and becomes active; if both slots are full, only the currently *active* slot is replaced (a different, unselected slot is never silently overwritten). Two new input handlers live inside `WeaponSystem` itself, matching its existing self-contained `window.addEventListener` pattern (mousedown/mouseup/keydown for reload already worked this way): number keys (`Digit1`→slot 0, `Digit2`→slot 1, generalized via regex over any digit so a future slot 3 needs no new key-handling code) switch directly to an occupied slot, and the scroll wheel cycles the active weapon through occupied slots only, wrapping around and skipping empty ones. Switching cancels any in-progress reload of the weapon left behind and resets the fire-rate cooldown, so the newly active weapon is immediately fireable. `RunManager`'s existing reset path (`WeaponSystem.reset()`, already registered at checkpoint 4.8) now rebuilds the whole inventory back to the starting loadout (M1911 in slot 0, slot 1 empty) rather than just resetting one weapon's ammo.

`core/MapEntitySystem.ts`'s wall-buy purchase hook now calls `pickupWeapon()` instead of the removed `setWeapon()` — one line changed, the surrounding `spendPoints()`/console-log success-and-rejection pattern is untouched. `main.ts` now always constructs `WeaponSystem` with the M1911 (`findById(WEAPONS, "pistol")`) regardless of `selections.weaponId` — **confirmed with the user**: every run starts with M1911 in slot 0 unconditionally now that "starting weapon" and "weapon inventory slot 0" are the same concept, so the main menu's Weapon selection group (unchanged, still visible/clickable) no longer determines the starting loadout; this is a deliberate behavior change, not an oversight, flagged as future cleanup below rather than resolved now (either remove the now-inert selection, or repurpose it into something meaningful again). The viewmodel remains unaffected — still the same generic placeholder mesh regardless of which slot/weapon is active, per checkpoint 13's deferred-per-weapon-appearance decision.

Verified in-browser: MAC-10 fires/reloads/damages exactly like the original checkpoint-15 acceptance criteria required (verified via a temporary, reverted-before-commit `main.ts` edit, since no MAC-10 wall-buy exists yet to reach it through normal play); every run starts with M1911 in slot 0, slot 1 empty, regardless of menu selection; the existing pistol-linked wall-buys fill the empty slot 1 the first time and correctly replace only the currently *active* slot once both slots are full; number keys and the scroll wheel both switch correctly between two occupied slots, each retaining its own ammo count across switches; death/respawn resets the whole inventory back to the starting loadout; both maps and both modes are unaffected.
```

- [ ] **Step 4: Add decisions log entries**

Append after the last existing decisions-log line, before `## Future mechanics`:

```
- MAC-10's full-auto behavior (checkpoint 15) required zero new mechanics: `WeaponSystem.update()`'s existing fire-rate gate (fire whenever `firing && timeSinceLastShot >= weapon.fireRate`, for as long as mouse1 is held) already produces full-auto for any sufficiently small `fireRate` — this was true the moment `Weapon.fireRate` became per-weapon data at checkpoint 5, it just had no second weapon to demonstrate it until now. This is the payoff of the project's data-driven-content rule: a mechanically distinct-feeling weapon (full-auto vs. semi-auto) is purely a content addition, not a logic change.
- MAC-10's specific stat values (checkpoint 15) — `fireRate: 0.08`, `damage: 8`, `reloadTime: 1.2`, `cost: 1200` — are first-cut judgment calls, not derived from a formula or a balance model (this project has no economy/balance framework yet). `fireRate` was the one value actually tuned against manual testing (confirmed to read as clearly full-auto and clearly distinct from the pistol's `0.3`); the rest follow conventional SMG-vs-pistol tradeoffs (lower per-hit damage, quicker reload, higher cost) without a specific target number in mind. Revisit if a real balance pass ever becomes in scope.
- The weapon viewmodel's appearance remains generic regardless of equipped weapon (checkpoint 15 confirms checkpoint 13's deferral is still the right call, now that a second weapon actually exists to prove the gap): MAC-10 and the pistol render identically despite very different firing behavior. Per-weapon viewmodel appearance (shape/color/scale, or eventually a real MAC-10 model) remains future scope — see future mechanics; this checkpoint deliberately did not use the arrival of a second weapon as a reason to also build that.
- `WeaponSystem`'s slot-based inventory (checkpoint 15) uses one named `MAX_SLOTS` constant, currently `2`, rather than a bare `2` inlined wherever slot count/indexing matters — a future perk is planned to raise it to `3`, and the number-key handler (regex-matched over any digit, bounds-checked against `MAX_SLOTS`) and the scroll-wheel handler (cycles over however many slots are currently occupied, whatever that count is) were both written generically for this reason, so raising the constant alone is expected to require no other code change. Not verified end-to-end with an actual 3rd slot (no perk system exists to grant one) — this is a design intent, not a tested guarantee.
- `currentAmmo`/`reserveAmmo` are tracked per-slot, not globally (checkpoint 15) — switching away from and back to a weapon restores exactly the ammo it had when you left it, rather than either sharing one ammo pool across weapons (which would make no sense for different `magSize`/`startingReserveAmmo` weapons) or resetting on every switch (which would make switching a free reload exploit). `isReloading`/`reloadTimeRemaining`/`timeSinceLastShot` deliberately stayed single (not per-slot): switching cancels any in-progress reload of the weapon left behind rather than tracking independent reload state per weapon, matching how most FPS games handle a weapon swap mid-reload — this was a judgment call, not specified, and is the simplest defensible behavior given no other requirement was stated.
- The wall-buy's fill-empty-then-replace-active rule (checkpoint 15, `pickupWeapon()`) deliberately never touches a slot other than the empty one (if any) or the currently active one — buying a weapon while both slots are full always replaces whatever you're currently holding, never a different, unselected slot, even if that unselected slot holds a "worse" or duplicate weapon. This was spec-mandated, not a judgment call, but is recorded here because it's easy to misimplement as "replace the oldest slot" or "replace slot 0" instead.
- The main menu's Weapon selection no longer determines starting loadout (checkpoint 15) — **confirmed directly with the user** via an explicit clarifying question, since this is a real behavior change to a feature shipped at checkpoint 9 (load-time mode/map/weapon/enemy selection), not an incidental side effect. The alternative (menu selection still picks slot 0's starting weapon) was presented and explicitly not chosen. The Weapon selection group itself was left in place, unchanged, rather than removed or repurposed — see future mechanics for the two follow-up options (remove it, or give it real meaning again, e.g. choosing which weapon starts in slot 0 alongside a *guaranteed* M1911 in slot 1, or similar).
```

- [ ] **Step 5: Add future-mechanics entries**

Update the existing "Per-weapon viewmodel appearance" future-mechanics bullet (added at checkpoint 13) to reflect that a second weapon now exists:

Find:

```
- **Per-weapon viewmodel appearance**: `WeaponViewmodel`'s placeholder mesh (checkpoint 13) is one hardcoded gray box regardless of the equipped weapon — deferred until a second weapon exists in `content/weapons.ts` to prove what should actually differ (shape, color, scale), per the checkpoint-13 decisions log.
```

Replace with:

```
- **Per-weapon viewmodel appearance**: `WeaponViewmodel`'s placeholder mesh is still one hardcoded gray box regardless of the equipped weapon. A second weapon (MAC-10) now exists (checkpoint 15) — the originally-stated blocker for designing this ("nothing to prove what should actually differ") no longer applies, but building it is still separate, undesigned scope: would need a per-`Weapon` shape/color/scale (or model path) field, plus `WeaponViewmodel` reading the currently-equipped `Weapon` (which it deliberately does not do today — see the checkpoint-13/14 "rendering-only, no gameplay-state" decisions) rather than just a static mesh.
```

Append five new future-mechanics bullets at the end of the section:

```
- **Multiple wall-buy stations offering different weapons**: not built. Both maps' existing `wall_buy` entities are linked to `"pistol"` only (checkpoint 11); MAC-10 (checkpoint 15) has no wall-buy anywhere on either map. Adding one is straightforward under the existing `wall_buy` `MapEntity` type (`linkedTo: "mac10"`, a `position`, on either map's `entities` array) — no new mechanism needed, purely a content addition like this checkpoint's own weapon addition, just not done yet. Now that `pickupWeapon()` (checkpoint 15) implements the fill-empty-or-replace-active rule, a MAC-10 wall-buy would also be the first thing to actually exercise the empty-slot-fill path outside of manual/temporary testing.
- **Melee system**: not built. Planned shape: a default knife melee bound to a dedicated key (e.g. `V`), a quick attack animation only — not a held weapon, not an inventory slot, not something that occupies the same "equipped weapon" concept `WeaponSystem`/`content/weapons.ts` model today. A future distinct melee weapon (e.g. a Bowie knife) could later become an actual equippable `Weapon`-like entity with its own selection, but the default knife itself is conceived as always-available background functionality, closer to a fixed player capability than swappable loadout content. Nothing about this — key binding, animation, damage, range — is designed in detail yet.
- **3rd inventory slot (perk-gated)**: not built. `WeaponSystem`'s `MAX_SLOTS` constant (checkpoint 15) is written generically enough (number-key handler, scroll-wheel handler, `pickupWeapon()`'s empty-slot search all iterate/bound-check against `MAX_SLOTS` or the slots array's actual length rather than a hardcoded `2`) that raising it to `3` is intended to be a one-line change — but this hasn't been exercised end-to-end, since no perk system exists yet to actually grant it. No perk system itself is designed at all.
- **HUD display of the inactive slot's weapon/ammo**: not built (checkpoint 15 explicitly left this out — see the checkpoint-15 task notes). Currently the HUD only ever shows the active slot's ammo/weapon-name, synced each frame via `GameState.currentAmmo`/`reserveAmmo`/`weaponName`, which `WeaponSystem.update()` already writes from the active slot. Showing the *inactive* slot too would need either a new `GameState` field (e.g. a secondary weapon name/ammo pair) that `WeaponSystem.update()` also populates, or `HUD` reading `WeaponSystem` directly instead of only `GameState` — the latter would break the established "HUD reads only GameState" pattern, so the former is the more likely shape if this is ever built.
- **Main menu Weapon selection is now inert**: checkpoint 15 stopped using `selections.weaponId` to choose the starting weapon (every run now starts with M1911 unconditionally — confirmed with the user), but deliberately left `ui/MainMenu.ts`'s Weapon selection group in place, still visible and clickable, with no effect. Two follow-up directions, neither decided: remove the group entirely (cleanest, but loses the UI real estate/pattern for a future use), or repurpose it into something meaningful again (e.g. picking which weapon starts in slot 0 instead of always M1911, or picking a starting *loadout pair* once a MAC-10 wall-buy or other second-weapon-acquisition path exists). Not resolved this checkpoint.
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Search for staleness this checkpoint may have introduced**

This project's CLAUDE.md has needed a staleness fix in nearly every recent checkpoint (9, 9.5, 10, 10's final review, 11 across two rounds, 12, 13's final whole-branch review) — always the same failure mode: an older sentence elsewhere in the document making a present-tense claim this checkpoint's changes now contradict. Before committing, read the entire document (not just the sections edited above) and specifically check for:
- Any sentence describing `content/weapons.ts` or `WEAPONS` as having exactly one entry, or describing the pistol as "the only weapon" / "the sole weapon" in present tense (search for "only weapon", "single weapon", "one weapon"). This project's decisions log has several such references (e.g. explaining why wall-buy pricing/per-weapon-viewmodel-appearance were deferred "since only one weapon exists") — those are historically accurate narration of *why a past decision was made at the time* and should NOT be rewritten (they correctly describe the past), but check none of them slip into present tense claiming it's still true now.
- Any sentence describing `MainMenu`'s Weapon group as showing/offering a single option.
- Any sentence describing `WeaponSystem` as tracking "the current weapon" (singular, no inventory concept) or describing `setWeapon()` as the wall-buy's swap mechanism (it's `pickupWeapon()` now — search for "setWeapon").
- Any sentence describing the main menu's Weapon selection as determining the starting weapon/loadout (search for "starting weapon" and re-read every hit — checkpoint 9's own decisions log describes the *original* purpose of this selection; that's accurate history and should stay, but confirm nothing describes it as *still* controlling starting loadout today).
- Any other claim this checkpoint's changes would now contradict.

If you find staleness, fix it using the established `**Superseded at checkpoint N** (was: "...")` convention (match the format of existing examples in the document exactly) — or, if the sentence is accurate historical narration that just needs a small clarifying note rather than a full supersession, use your judgment on the lightest correct fix, consistent with how checkpoint 14's task 7 handled a similar case with an inline parenthetical rather than a full supersession block. If you find nothing beyond what Steps 1-5 already added, say so explicitly in your commit's task report — don't skip stating the negative result.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Checkpoint 15: MAC-10 + weapon inventory

Adds MAC-10 as a second weapon in content/weapons.ts: full-auto,
magSize 30, startingReserveAmmo 240 (8 mags), fireRate 0.08 (tuned by
manual verification to read as clearly full-auto and clearly distinct
from the pistol's 0.3), damage 8, reloadTime 1.2, cost 1200,
fireSoundId reused from the pistol.

Separately, replaces WeaponSystem's single current-weapon state with
a slot-based inventory: a MAX_SLOTS-sized (currently 2, named
constant, not a magic number, since a future perk raises it to 3)
slots array with per-slot ammo, so switching back to a weapon
restores exactly the ammo it had. pickupWeapon() replaces the
checkpoint-11 setWeapon() as the wall-buy's purchase hook: fills an
empty slot and switches to it, or replaces only the active slot if
full. Number keys (1/2, generalized over any digit) and the scroll
wheel (cycles occupied slots only, wrapping) both switch weapons,
using WeaponSystem's existing self-contained input-handling pattern.
Every run now starts with M1911 in slot 0 unconditionally -- the main
menu's Weapon selection no longer determines starting loadout
(confirmed with the user; the menu UI itself is unchanged, just no
longer consumed for this). Death/respawn resets the whole inventory
via the existing RunManager reset path.

Viewmodel appearance stays generic regardless of equipped weapon, per
checkpoint 13's still-deferred decision. No wall-buy for MAC-10 on
either map yet, no 3rd slot/perk system, no HUD display of the
inactive slot -- all logged as future scope, alongside a planned
melee system (default knife on a dedicated key, animation only, not
a weapon slot) -- documentation only, nothing built for any of these.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Verify the commit**

Run: `git status` and `git log -1 --stat`
Expected: working tree clean; the commit touches `CLAUDE.md` (plus this plan doc, if not already committed by an earlier task) — `src/content/weapons.ts`, `src/core/WeaponSystem.ts`, `src/core/MapEntitySystem.ts`, and `src/main.ts` should all show no changes from this task, since they were already committed by Tasks 1-4.

---

## Self-Review Notes

- **Spec coverage:** `content/weapons.ts` gets exactly one new `Weapon` (`id: "mac10"`, `name: "MAC-10"`), `magSize: 30`, `startingReserveAmmo: 240` exact spec values, `fireRate` fast/distinct tuned by manual testing, `reloadTime`/`cost`/`fireSoundId` judgment calls per the brief (Task 1) ✓; slot-based inventory with a named, non-magic-number `MAX_SLOTS` (Task 2) ✓; player starts every run with M1911 in slot 0, slot 1 empty (Task 4, confirmed unconditional per the user's explicit answer) ✓; wall-buy fills an empty slot or replaces only the active slot when full (Task 2's `pickupWeapon()` + Task 3's wiring) ✓; number-key (generalized over `MAX_SLOTS`) and scroll-wheel (occupied-slots-only, wrapping) switching, using `WeaponSystem`'s existing self-contained input-handling pattern (Task 2) ✓; HUD shows only the active slot, inactive-slot display explicitly flagged as non-trivial and deferred rather than silently skipped or silently built (future-mechanics entry, Task 6) ✓; death/respawn resets the whole inventory via the existing `RunManager` → `WeaponSystem.reset()` path (Task 2's rewritten `reset()`) ✓; 3-slot perk not built, `MAX_SLOTS` kept as a one-line-change constant (Task 2 + future-mechanics note) ✓; re-running original CP15 acceptance criteria (fire rate, reload, raycast/HUD/death-respawn parity) plus the new inventory-specific checks (Task 5, Steps 4-10) ✓; CLAUDE.md status + 8 decisions (full-auto-is-free, MAC-10 stat judgment calls, generic-viewmodel-still-correct, `MAX_SLOTS`-as-named-constant, per-slot-ammo-persistence-with-single-reload-state, wall-buy-active-slot-only rule, menu-selection-no-longer-authoritative-confirmed-with-user) + updated per-weapon-viewmodel future-mechanics entry + 5 new future-mechanics entries (multi-wall-buy-stations, melee, 3rd-slot-perk, inactive-slot-HUD, menu-selection-now-inert) + staleness sweep + commit named "checkpoint 15" (Task 6) ✓.
- **Placeholder scan:** no TBD/TODO; every step has complete, exact values or exact code; Task 5's verification steps are concrete observable behaviors (specific key presses, specific expected HUD numbers, an explicit temporary-edit-and-revert procedure for exercising MAC-10 without a wall-buy) rather than vague "make sure it works" language; Task 5 Step 4 is explicit that a fully realistic empty-slot-fill test needs a MAC-10 wall-buy that doesn't exist yet, and offers the indirect verification actually available plus the option to add one as a follow-up task rather than silently claiming full coverage it can't provide.
- **Type consistency check:** the new `mac10` object literal (Task 1) matches the `pistol` entry's field set/order and the `Weapon` interface exactly. `WeaponSlot` (Task 2, new internal interface) — `{ weapon: Weapon; currentAmmo: number; reserveAmmo: number }` — is used consistently only within `WeaponSystem.ts`; nothing outside needs to know its shape. `pickupWeapon(weapon: Weapon): void` (Task 2) is called in Task 3 as `weaponSystem.pickupWeapon(weapon)`, where `weapon` is the same `Weapon`-typed closure variable `createWallBuy()` already resolves via `findById()` — matches exactly, and is a straight rename+behavior-change of the removed `setWeapon(weapon: Weapon): void`, so the call site's own argument expression needs no change, only the method name. `findById(WEAPONS, "pistol")` (Task 4) matches `findById<T extends {id:string}>(list: T[], id: string): T`'s existing signature exactly — same call shape as every other `findById(WEAPONS, ...)` call already in the codebase, just a literal `"pistol"` instead of `selections.weaponId`.
- **Compile-safety / task-ordering check:** Task 1 alone compiles and is fully functional standalone (pure data). Task 2 alone (rewriting `WeaponSystem.ts`) is internally self-consistent and compiles on its own, but the *whole project* will not compile until Task 3 also lands, because `MapEntitySystem.ts` still calls the removed `setWeapon()` until then — this is called out explicitly in Task 2's own note, mirroring how checkpoint 11's test-terminal removal had an analogous multi-file compile-order constraint. Task 3 depends on Task 2 (needs `pickupWeapon()` to exist) and is what restores a clean whole-project build. Task 4 depends on nothing from Tasks 2/3 (it only changes which `Weapon` object is passed into `WeaponSystem`'s existing constructor parameter, whose type/shape is completely unchanged) but is sequenced after them for narrative clarity. No `erasableSyntaxOnly` violations: no parameter-property constructor shorthand anywhere in the `WeaponSystem.ts` rewrite (fields declared, assigned in the constructor body, exactly matching every other class in this codebase's established style), no enums, `WeaponSlot` is a plain fully-erasable interface. Asymmetric `get`/`set` visibility (`public get currentAmmo`, `private set currentAmmo`) is standard TypeScript, not gated behind any of this project's specific tsconfig flags.
- **Architecture-rule cross-check:** `content/weapons.ts` (Task 1) is exactly where weapon content belongs, per the existing rule. `WeaponSystem.ts` (Task 2) gains no new imports — still only `three`, `Raycast`, and the same four `type`-only imports (`AudioSystem`, `Weapon`, `GameState`, `RunManager`, `RaycastRegistry`) it already had; the inventory rewrite is entirely internal restructuring of state this class already owned, not a new dependency on `content/`/`modes/`. `MapEntitySystem.ts` (Task 3) and `main.ts` (Task 4) each change exactly one line's worth of logic in an existing, already-reviewed call site — neither introduces a new cross-file dependency.
