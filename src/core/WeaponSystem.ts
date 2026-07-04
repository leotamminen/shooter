import * as THREE from "three";
import { Raycast } from "./utils/Raycast";
import type { AudioSystem } from "./AudioSystem";
import type { Weapon } from "../types";
import type { GameState } from "../state/GameState";

export class WeaponSystem {
  currentAmmo: number;
  reserveAmmo: number;
  isReloading = false;

  private readonly raycast = new Raycast();
  private readonly clock = new THREE.Clock();
  private targets: THREE.Object3D[] = [];

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
    reserveAmmo: number,
    audioSystem: AudioSystem,
    gameState: GameState,
  ) {
    this.camera = camera;
    this.weapon = weapon;
    this.currentAmmo = weapon.magSize;
    this.reserveAmmo = reserveAmmo;
    this.audioSystem = audioSystem;
    this.gameState = gameState;

    window.addEventListener("mousedown", this.handleMouseDown);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("keydown", this.handleKeyDown);
  }

  setTargets(targets: THREE.Object3D[]): void {
    this.targets = targets;
  }

  update(): void {
    const delta = this.clock.getDelta();
    this.timeSinceLastShot += delta;

    if (this.isReloading) {
      this.reloadTimeRemaining -= delta;
      if (this.reloadTimeRemaining <= 0) this.finishReload();
      return;
    }

    if (this.gameState.paused || !this.firing) return;
    if (this.currentAmmo <= 0) return;
    if (this.timeSinceLastShot < this.weapon.fireRate) return;

    this.fire();
  }

  private fire(): void {
    this.timeSinceLastShot = 0;
    this.currentAmmo -= 1;
    this.raycast.fromCamera(this.camera, this.targets);
    this.audioSystem.play(this.weapon.fireSoundId);
    console.log(`fired ${this.weapon.id}: ${this.currentAmmo}/${this.reserveAmmo}`);
  }

  private startReload(): void {
    if (this.isReloading) return;
    if (this.currentAmmo >= this.weapon.magSize) return;
    if (this.reserveAmmo <= 0) return;

    this.isReloading = true;
    this.reloadTimeRemaining = this.weapon.reloadTime;
    console.log(`reloading ${this.weapon.id}...`);
  }

  private finishReload(): void {
    const needed = this.weapon.magSize - this.currentAmmo;
    const loaded = Math.min(needed, this.reserveAmmo);
    this.currentAmmo += loaded;
    this.reserveAmmo -= loaded;
    this.isReloading = false;
    console.log(`reloaded ${this.weapon.id}: ${this.currentAmmo}/${this.reserveAmmo}`);
  }

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (event.button === 0) this.firing = true;
  };

  private readonly handleMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.firing = false;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "KeyR" && !this.gameState.paused) this.startReload();
  };
}
