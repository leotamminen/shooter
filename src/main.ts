import { SceneManager } from "./core/Scene";
import { loadMap } from "./core/MapLoader";
import { PlayerController } from "./core/PlayerController";
import { WeaponSystem } from "./core/WeaponSystem";
import { AudioSystem } from "./core/AudioSystem";
import { GameState } from "./state/GameState";
import type { Weapon, SoundDef } from "./types";

const TEST_GRID: number[][] = [
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1],
];

// Placeholder weapon/sound, hardcoded here until content/weapons.ts and
// content/sounds.ts are populated in checkpoint 5.
const PLACEHOLDER_WEAPON: Weapon = {
  id: "pistol",
  damage: 10,
  fireRate: 0.3,
  magSize: 12,
  reloadTime: 1.5,
  fireSoundId: "pistol_fire",
};

const PLACEHOLDER_RESERVE_AMMO = 48;

const PLACEHOLDER_FIRE_SOUND: SoundDef = {
  id: "pistol_fire",
  path: "/sounds/pistol_fire.wav",
  volume: 0.5,
  positional: false,
  loop: false,
};

const canvas = document.createElement("canvas");
document.body.appendChild(canvas);

const sceneManager = new SceneManager(canvas);
const gameState = new GameState();
const playerController = new PlayerController(
  sceneManager.camera,
  canvas,
  gameState,
);

const map = loadMap(TEST_GRID);
sceneManager.scene.add(map.group);
playerController.setWallBoxes(map.wallBoxes);
playerController.setSpawn(8, 8);

const audioSystem = new AudioSystem(sceneManager.camera);
void audioSystem.load(PLACEHOLDER_FIRE_SOUND);

const weaponSystem = new WeaponSystem(
  sceneManager.camera,
  PLACEHOLDER_WEAPON,
  PLACEHOLDER_RESERVE_AMMO,
  audioSystem,
  gameState,
);
weaponSystem.setTargets(map.walls);

canvas.addEventListener("click", () => {
  playerController.controls.lock();
});

document.addEventListener("pointerlockchange", () => {
  gameState.paused = document.pointerLockElement !== canvas;
});

function animate(): void {
  requestAnimationFrame(animate);
  playerController.update();
  weaponSystem.update();
  sceneManager.render();
}

animate();
