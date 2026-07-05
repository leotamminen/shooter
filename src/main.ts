import * as THREE from "three";
import { SceneManager } from "./core/Scene";
import { loadMap, getSpawnPosition } from "./core/MapLoader";
import { PlayerController } from "./core/PlayerController";
import { WeaponSystem } from "./core/WeaponSystem";
import { AudioSystem } from "./core/AudioSystem";
import { InteractSystem } from "./core/InteractSystem";
import { EnemyAI } from "./core/EnemyAI";
import { PlayerState } from "./core/PlayerState";
import { RunManager } from "./core/RunManager";
import { HUD } from "./ui/HUD";
import { GameState } from "./state/GameState";
import { findById } from "./core/utils/Lookup";
import { WEAPONS } from "./content/weapons";
import { ENEMIES } from "./content/enemies";
import { SOUNDS } from "./content/sounds";
import { MAPS } from "./content/maps";

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
const runManager = new RunManager(gameState, playerState);

const mapDef = findById(MAPS, "test-grid");
const map = loadMap(mapDef.grid);
sceneManager.scene.add(map.group);
playerController.setWallBoxes(map.wallBoxes);
const spawnPosition = getSpawnPosition(mapDef);
playerController.setSpawn(spawnPosition.x, spawnPosition.z);

const audioSystem = new AudioSystem(sceneManager.camera);
void audioSystem.load(findById(SOUNDS, "pistol_fire"));
void audioSystem.load(findById(SOUNDS, "zombie_growl"));
void audioSystem.load(findById(SOUNDS, "zombie_death"));

const weaponSystem = new WeaponSystem(
  sceneManager.camera,
  findById(WEAPONS, "pistol"),
  audioSystem,
  gameState,
  runManager,
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

// Zombie stats now come from content/enemies.ts; its mesh and spawn position
// are still hardcoded here until map entities gain an "enemy" type
// (checkpoint 6/7).
const zombieMesh = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.4, 1, 4, 8),
  new THREE.MeshStandardMaterial({ color: 0x4a6741 }),
);
zombieMesh.position.set(10, 0.9, 4);
sceneManager.scene.add(zombieMesh);

const zombie = new EnemyAI(
  "zombie-1",
  findById(ENEMIES, "zombie"),
  zombieMesh,
  sceneManager.camera,
  audioSystem,
  gameState,
  playerState,
  runManager,
);
zombie.setWallTargets(map.walls);

weaponSystem.setTargets([...map.walls, interactableBox, zombieMesh]);

function startNewRun(): void {
  runManager.startNewRun();
  playerController.setSpawn(spawnPosition.x, spawnPosition.z);
  playerController.controls.lock();
}

// "Main Menu" is a placeholder alias for startNewRun() until checkpoint 9
// gives it a real menu to return to.
const hud = new HUD(gameState, sceneManager.camera, startNewRun, startNewRun);
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
