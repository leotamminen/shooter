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
    onHit?.(this.weapon.damage * this.damageMultiplier);

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
