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
  // A generic, externally-set multiplier applied to gun damage only
  // (checkpoint 16) -- WeaponSystem has no notion of "rounds" itself (per
  // core/ never referencing modes/); ZombieSurvival sets this each round
  // via its own round-scaling formula (see modes/ZombieSurvival.ts). Modes
  // that never set it (e.g. ShootingRange) leave it at the default 1, i.e.
  // no scaling. Never applied to the melee attack's damage -- see
  // meleeAttack() and CLAUDE.md's checkpoint-16 decisions log.
  damageMultiplier = 1;

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
  // Checkpoint 21: nullable -- Campaign now starts with no ranged weapon at
  // all (hands only, see core/HandsViewmodel.ts), while Zombie
  // Survival/Shooting Range still pass the M1911 unconditionally. null means
  // buildStartingSlots() leaves every slot empty, not just slot 1.
  private readonly startingWeapon: RangedWeapon | null;

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
  // happened, so it can trigger viewmodel feedback -- WeaponSystem never
  // imports WeaponViewmodel/MeleeSequencer directly, the same
  // dependency-injection pattern PlayerState's onDeath callback already
  // uses. Checkpoint 22: gained a hitEnemy parameter -- meleeAttack()'s own
  // hit-detection raycast already determines this, now passed through
  // instead of discarded, so main.ts's MeleeSequencer can pick a stab vs
  // swing performance without re-deriving the same hit test.
  private readonly onMeleeAttack: (hitEnemy: boolean) => void;
  // Checkpoint 21: fired from fire() on every successful shot, scaled by
  // the active weapon's own kickStrength -- see content/weapons.ts and
  // CLAUDE.md's checkpoint-21 decisions log.
  private readonly onFire: (kickStrength: number) => void;
  // Checkpoint 21: fired whenever the active slot changes to a different,
  // already-occupied slot (number-key/scroll switching) or pickupWeapon()
  // replaces/adds a weapon while one was already active -- never on the
  // very first hands->weapon transition from an empty starting loadout
  // (see pickupWeapon() below).
  private readonly onWeaponSwap: () => void;

  constructor(
    camera: THREE.Camera,
    weapon: Weapon | null,
    meleeWeapon: Weapon,
    audioSystem: AudioSystem,
    gameState: GameState,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
    onMeleeAttack: (hitEnemy: boolean) => void,
    onFire: (kickStrength: number) => void,
    onWeaponSwap: () => void,
  ) {
    if (weapon === null) {
      this.startingWeapon = null;
    } else {
      assertRangedWeapon(weapon);
      this.startingWeapon = weapon;
    }
    assertMeleeWeapon(meleeWeapon);

    this.camera = camera;
    this.slots = this.buildStartingSlots();
    this.startingMeleeWeapon = meleeWeapon;
    this.meleeWeapon = meleeWeapon;
    this.audioSystem = audioSystem;
    this.gameState = gameState;
    this.raycastRegistry = raycastRegistry;
    this.onMeleeAttack = onMeleeAttack;
    this.onFire = onFire;
    this.onWeaponSwap = onWeaponSwap;

    window.addEventListener("mousedown", this.handleMouseDown);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("wheel", this.handleWheel, { passive: false });

    runManager.registerResettable(() => this.reset());
  }

  private buildStartingSlots(): (WeaponSlot | null)[] {
    const slots: (WeaponSlot | null)[] = new Array(MAX_SLOTS).fill(null);
    if (this.startingWeapon) {
      slots[0] = {
        weapon: this.startingWeapon,
        currentAmmo: this.startingWeapon.magSize,
        reserveAmmo: this.startingWeapon.startingReserveAmmo,
      };
    }
    return slots;
  }

  // The single source of truth for "should the hands or the weapon be
  // rendered" (checkpoint 21) -- main.ts's render loop branches on this
  // directly, and it's what gates every other weapon-dependent code path
  // below (firing, reloading, the per-frame GameState ammo sync) now that
  // an empty starting loadout is a real, reachable state.
  hasActiveWeapon(): boolean {
    return this.slots[this.activeSlotIndex] !== null;
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

  // Checkpoint 21: a no-op with no active weapon -- an ammo pickup with no
  // gun to put it in makes no sense, and the underlying reserveAmmo setter
  // would otherwise throw via the now-possibly-empty activeSlot getter.
  addReserveAmmo(amount: number): void {
    if (!this.hasActiveWeapon()) return;
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
    // Checkpoint 21: captured before mutating slots -- the swap-dip only
    // plays when a weapon is being replaced, or a second weapon becomes
    // newly active while one was already equipped. The very first pickup
    // from an empty starting loadout (Campaign) is a hands->weapon
    // transition between two entirely different rendered objects, not a
    // "dip" of the same persistent weapon model, so it's deliberately
    // excluded.
    const hadActiveWeapon = this.hasActiveWeapon();
    const emptySlotIndex = this.slots.findIndex((slot) => slot === null);
    const targetIndex = emptySlotIndex !== -1 ? emptySlotIndex : this.activeSlotIndex;
    this.slots[targetIndex] = {
      weapon,
      currentAmmo: weapon.magSize,
      reserveAmmo: weapon.startingReserveAmmo,
    };
    this.switchToSlot(targetIndex);
    if (hadActiveWeapon) this.onWeaponSwap();
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
    this.damageMultiplier = 1;
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

    // Checkpoint 21: everything below reads this.weapon/this.currentAmmo/
    // this.reserveAmmo, all of which throw via the activeSlot getter when
    // no weapon is active (Campaign's starting hands-only state) -- gated
    // on hasActiveWeapon() the same way main.ts's render loop is, rather
    // than adding a null check inside each individual access.
    if (this.hasActiveWeapon()) {
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
    } else {
      this.gameState.weaponName = "";
      this.gameState.currentAmmo = 0;
      this.gameState.reserveAmmo = 0;
      this.gameState.isReloading = false;
    }
    // Checkpoint 21 addendum: mirrors hasActiveWeapon() into GameState every
    // frame, alongside the fields above -- ui/HUD.ts reads this to decide
    // whether to render the ammo display at all, rather than reaching into
    // WeaponSystem directly.
    this.gameState.hasActiveWeapon = this.hasActiveWeapon();
  }

  private fire(): void {
    this.timeSinceLastShot = 0;
    this.currentAmmo -= 1;

    const hit = this.raycast.fromCamera(this.camera, this.raycastRegistry.getAll());
    const onHit = hit?.object.userData.onHit as
      | ((damage: number) => void)
      | undefined;
    onHit?.(this.weapon.damage * this.damageMultiplier);

    this.audioSystem.play(this.weapon.fireSoundId);
    // Checkpoint 21: fired on every successful shot, respecting the same
    // fire-rate gate update() already checks -- for a full-auto weapon this
    // means many small impulses in quick succession, exactly the
    // "rapid-fire recoil stacking to a clamped ceiling" scenario
    // checkpoint 14's own ImpulseOffset design already anticipated.
    this.onFire(this.weapon.kickStrength ?? 0);
  }

  // The melee attack itself (checkpoint 16, corrected): fired the instant V
  // is pressed, reusing the exact same userData.onHit hook and shared
  // RaycastRegistry hitscan guns already use, just with a much shorter
  // maxDistance (meleeWeapon.meleeRange). No ammo check -- melee never
  // consumes ammo, and never touches the gun slots at all. onMeleeAttack()
  // notifies main.ts so it can trigger viewmodel feedback, without
  // WeaponSystem needing to know WeaponViewmodel/MeleeSequencer exist.
  // Checkpoint 22: hitEnemy (whether this raycast actually hit something
  // with an onHit handler) is now passed through to onMeleeAttack() instead
  // of being discarded, so main.ts's MeleeSequencer can pick a stab vs
  // swing performance -- damage/hit-detection timing itself is completely
  // unchanged, only what's read from an already-existing result.
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
    this.onMeleeAttack(onHit !== undefined);
  }

  private startReload(): void {
    // Checkpoint 21: the "R" keydown handler below has no reason to know
    // about hasActiveWeapon() itself (it only ever gates on paused/alive/
    // isMeleeAttacking, matching the "V" handler's own shape) -- guarding
    // here instead keeps that symmetry and avoids the weapon getter
    // throwing when Campaign's starting hands-only state has no active
    // weapon to reload.
    if (!this.hasActiveWeapon()) return;
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
      // Checkpoint 21: the `slotIndex !== this.activeSlotIndex` guard is
      // new -- pressing the already-active slot's own number used to still
      // call switchToSlot() (harmlessly resetting reload/fire-rate timing
      // for no reason), and would now also incorrectly fire the swap-dip
      // for a no-op "switch". Both are avoided by checking this here,
      // before calling switchToSlot() at all.
      if (slotIndex < MAX_SLOTS && this.slots[slotIndex] && slotIndex !== this.activeSlotIndex) {
        this.switchToSlot(slotIndex);
        this.onWeaponSwap();
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
    // occupiedIndices.length > 1 (checked above) guarantees nextPosition
    // !== currentPosition, so this is always a real switch to a different,
    // already-occupied slot -- no extra pre-check needed before the dip
    // (checkpoint 21), unlike the number-key handler above.
    this.switchToSlot(occupiedIndices[nextPosition]);
    this.onWeaponSwap();
  };
}
