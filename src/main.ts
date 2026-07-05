import * as THREE from "three";
import { SceneManager } from "./core/Scene";
import { loadMap, getSpawnPosition } from "./core/MapLoader";
import { PlayerController } from "./core/PlayerController";
import { WeaponSystem } from "./core/WeaponSystem";
import { AudioSystem } from "./core/AudioSystem";
import { InteractSystem } from "./core/InteractSystem";
import { PlayerState } from "./core/PlayerState";
import { RunManager } from "./core/RunManager";
import { MapEntitySystem } from "./core/MapEntitySystem";
import { ZombieSurvival } from "./modes/ZombieSurvival";
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
// zombieSurvival is assigned further down (it needs the map/weapon systems
// built first) but this callback only ever runs later, once the player has
// actually died, by which point construction has long finished.
let zombieSurvival: ZombieSurvival;
// Releasing pointer lock on death is what makes the death-panel buttons
// clickable — PlayerState owns the alive/dead transition but not the DOM/
// pointer-lock machinery, so it's handed this as a callback rather than
// reaching into PlayerController directly. It also snapshots the round
// number at the moment of death into GameState.roundsSurvived, kept
// separate from the live currentRound so the death panel can't change
// under the player if a round happens to advance in the background.
const playerState = new PlayerState(gameState, () => {
  playerController.controls.unlock();
  gameState.roundsSurvived = zombieSurvival.currentRound;
});
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

const mapEntitySystem = new MapEntitySystem(mapDef, weaponSystem, runManager);
sceneManager.scene.add(mapEntitySystem.group);
playerController.setDoors(mapEntitySystem.doors);

// Placeholder interactable: still hardcoded here, not a real MapEntity type —
// it predates doors/buttons/pickups (checkpoint 3) and has no map-entity
// shape of its own to migrate into.
const interactableBox = new THREE.Mesh(
  new THREE.BoxGeometry(0.6, 0.6, 0.6),
  new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x552200 }),
);
interactableBox.name = "placeholder box";
interactableBox.userData.interactable = true;
interactableBox.userData.onInteract = (): void => {
  console.log("Interacted with placeholder box");
};
interactableBox.position.set(2, 0.3, 8);
sceneManager.scene.add(interactableBox);

const interactSystem = new InteractSystem(sceneManager.camera, gameState);
interactSystem.setTargets([
  ...map.walls,
  ...mapEntitySystem.doorMeshes,
  interactableBox,
  ...mapEntitySystem.interactables,
]);

weaponSystem.setTargets([
  ...map.walls,
  ...mapEntitySystem.doorMeshes,
  interactableBox,
]);

const enemySpawnPoints = mapDef.entities
  .filter((entity) => entity.type === "enemy_spawn")
  .map((entity) => new THREE.Vector3(...entity.position));

zombieSurvival = new ZombieSurvival(
  findById(ENEMIES, "zombie"),
  enemySpawnPoints,
  sceneManager.scene,
  sceneManager.camera,
  audioSystem,
  gameState,
  playerState,
  weaponSystem,
  [...map.walls, ...mapEntitySystem.doorMeshes],
  runManager,
);

function startNewRun(): void {
  runManager.startNewRun();
  playerController.setSpawn(spawnPosition.x, spawnPosition.z);
  playerController.controls.lock();
}

// "Main Menu" is a placeholder alias for startNewRun() until checkpoint 9
// gives it a real menu to return to.
const hud = new HUD(gameState, sceneManager.camera, startNewRun, startNewRun);
hud.setOcclusionTargets([...map.walls, ...mapEntitySystem.doorMeshes]);

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
  zombieSurvival.update();
  hud.update();
  sceneManager.render();
}

animate();
