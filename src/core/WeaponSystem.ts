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
