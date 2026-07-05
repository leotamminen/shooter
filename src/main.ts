import * as THREE from "three";
import { SceneManager } from "./core/Scene";
import { loadMap } from "./core/MapLoader";
import { PlayerController } from "./core/PlayerController";
import { WeaponSystem } from "./core/WeaponSystem";
import { AudioSystem } from "./core/AudioSystem";
import { InteractSystem } from "./core/InteractSystem";
import { EnemyAI } from "./core/EnemyAI";
import { PlayerState } from "./core/PlayerState";
import { HUD } from "./ui/HUD";
import { GameState } from "./state/GameState";
import type { Weapon, SoundDef, EnemyDef } from "./types";

// Interior pillar at row 4, col 2 doubles as a line-of-sight blocker for
// testing InteractSystem: it sits directly between the spawn point and the
// placeholder interactable box.
const TEST_GRID: number[][] = [
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1],
];

// Placeholder weapon/sound, hardcoded here until content/weapons.ts and
// content/sounds.ts are populated in checkpoint 5.
const PLACEHOLDER_WEAPON: Weapon = {
  id: "pistol",
  name: "M1911",
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

// Placeholder enemy/sounds, hardcoded here until content/enemies.ts and
// content/sounds.ts are populated in checkpoint 5.
const PLACEHOLDER_ZOMBIE: EnemyDef = {
  id: "zombie",
  health: 100,
  speed: 1.6,
  meleeDamage: 10,
  attackInterval: 1,
  growlSoundId: "zombie_growl",
  deathSoundId: "zombie_death",
};

const PLACEHOLDER_GROWL_SOUND: SoundDef = {
  id: "zombie_growl",
  path: "/sounds/zombie_growl.wav",
  volume: 0.6,
  positional: true,
  loop: false,
};

const PLACEHOLDER_DEATH_SOUND: SoundDef = {
  id: "zombie_death",
  path: "/sounds/zombie_death.wav",
  volume: 0.7,
  positional: true,
  loop: false,
};

const SPAWN_X = 8;
const SPAWN_Z = 8;

const canvas = document.createElement("canvas");
document.body.appendChild(canvas);

const sceneManager = new SceneManager(canvas);
const gameState = new GameState();
const playerController = new PlayerController(
  sceneManager.camera,
  canvas,
  gameState,
);
// Releasing pointer lock on death is what makes the death-panel buttons
// clickable — PlayerState owns the alive/dead transition but not the DOM/
// pointer-lock machinery, so it's handed this as a callback rather than
// reaching into PlayerController directly.
const playerState = new PlayerState(gameState, () =>
  playerController.controls.unlock(),
);

const map = loadMap(TEST_GRID);
sceneManager.scene.add(map.group);
playerController.setWallBoxes(map.wallBoxes);
playerController.setSpawn(SPAWN_X, SPAWN_Z);

const audioSystem = new AudioSystem(sceneManager.camera);
void audioSystem.load(PLACEHOLDER_FIRE_SOUND);
void audioSystem.load(PLACEHOLDER_GROWL_SOUND);
void audioSystem.load(PLACEHOLDER_DEATH_SOUND);

const weaponSystem = new WeaponSystem(
  sceneManager.camera,
  PLACEHOLDER_WEAPON,
  PLACEHOLDER_RESERVE_AMMO,
  audioSystem,
  gameState,
);

// Placeholder interactable, hardcoded here until map entities (doors,
// buttons, pickups) are added in checkpoint 6.
const interactableBox = new THREE.Mesh(
  new THREE.BoxGeometry(0.6, 0.6, 0.6),
  new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x552200 }),
);
interactableBox.name = "placeholder box";
interactableBox.userData.interactable = true;
interactableBox.position.set(2, 0.3, 8);
sceneManager.scene.add(interactableBox);

const interactSystem = new InteractSystem(sceneManager.camera, gameState);
interactSystem.setTargets([...map.walls, interactableBox]);

// Placeholder zombie, hardcoded here until content/enemies.ts is populated
// in checkpoint 5.
const zombieMesh = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.4, 1, 4, 8),
  new THREE.MeshStandardMaterial({ color: 0x4a6741 }),
);
zombieMesh.position.set(10, 0.9, 4);
sceneManager.scene.add(zombieMesh);

const zombie = new EnemyAI(
  "zombie-1",
  PLACEHOLDER_ZOMBIE,
  zombieMesh,
  sceneManager.camera,
  audioSystem,
  gameState,
  playerState,
);
zombie.setWallTargets(map.walls);

weaponSystem.setTargets([...map.walls, interactableBox, zombieMesh]);

function respawn(): void {
  playerState.respawn();
  playerController.setSpawn(SPAWN_X, SPAWN_Z);
  playerController.controls.lock();
}

// "Main Menu" is a placeholder alias for respawn() until checkpoint 9 gives
// it a real menu to return to.
const hud = new HUD(gameState, sceneManager.camera, respawn, respawn);
hud.setOcclusionTargets(map.walls);

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
  interactSystem.update();
  zombie.update();
  hud.update();
  sceneManager.render();
}

animate();
