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
import { RaycastRegistry } from "./core/RaycastRegistry";
import type { GameMode } from "./modes/GameMode";
import { ZombieSurvival } from "./modes/ZombieSurvival";
import { ShootingRange } from "./modes/ShootingRange";
import { HUD } from "./ui/HUD";
import { GameState } from "./state/GameState";
import { findById } from "./core/utils/Lookup";
import { WEAPONS } from "./content/weapons";
import { ENEMIES } from "./content/enemies";
import { SOUNDS } from "./content/sounds";
import { MAPS } from "./content/maps";

// Placeholder mode selection until checkpoint 9's mode-select menu replaces
// this with a real runtime choice — do not build runtime mode-switching now.
// The `as` cast matters: without it, TS narrows this to the literal type of
// whatever's assigned (even under the wider annotation, since the variable
// is never reassigned), which turns the ACTIVE_MODE === "zombie" check below
// into a compile error ("no overlap") whenever this is set to "range".
type ModeName = "zombie" | "range";
const ACTIVE_MODE = "zombie" as ModeName;

const canvas = document.createElement("canvas");
document.body.appendChild(canvas);

const sceneManager = new SceneManager(canvas);
const gameState = new GameState();
const playerController = new PlayerController(
  sceneManager.camera,
  canvas,
  gameState,
);
// gameMode is assigned further down (it needs the map/weapon systems built
// first) but this callback only ever runs later, once the player has
// actually died, by which point construction has long finished.
let gameMode: GameMode;
// Releasing pointer lock on death is what makes the death-panel buttons
// clickable — PlayerState owns the alive/dead transition but not the DOM/
// pointer-lock machinery, so it's handed this as a callback rather than
// reaching into PlayerController directly. It also snapshots the active
// mode's summary lines into GameState once, at the exact moment of death,
// so the death panel can't change under the player if the mode's own state
// happens to advance in the background before Respawn is clicked.
const playerState = new PlayerState(gameState, () => {
  playerController.controls.unlock();
  gameState.deathSummaryLines = gameMode.getSummaryLines();
});
const runManager = new RunManager(gameState, playerState);

// The single shared "what can be hit/occluded by a ray" registry — every
// solid or interactable object (walls, doors, buttons, pickups, the
// placeholder interactable, enemies) registers itself here once, and every
// raycasting system (WeaponSystem's fire, EnemyAI's line-of-sight,
// InteractSystem's interact ray, HUD's label occlusion) reads the same list.
const raycastRegistry = new RaycastRegistry();

const mapDef = findById(MAPS, "test-grid");
const map = loadMap(mapDef.grid, raycastRegistry);
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
  raycastRegistry,
);

const mapEntitySystem = new MapEntitySystem(
  mapDef,
  weaponSystem,
  runManager,
  raycastRegistry,
  () => playerController.rebuildCollisionBoxes(),
);
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
raycastRegistry.register(interactableBox);

const interactSystem = new InteractSystem(sceneManager.camera, gameState, raycastRegistry);

const enemySpawnPoints = mapDef.entities
  .filter((entity) => entity.type === "enemy_spawn")
  .map((entity) => new THREE.Vector3(...entity.position));

const targetPoints = mapDef.entities
  .filter((entity) => entity.type === "target")
  .map((entity) => new THREE.Vector3(...entity.position));

gameMode =
  ACTIVE_MODE === "zombie"
    ? new ZombieSurvival(
        findById(ENEMIES, "zombie"),
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
gameMode.start();

function startNewRun(): void {
  runManager.startNewRun();
  playerController.setSpawn(spawnPosition.x, spawnPosition.z);
  playerController.controls.lock();
}

// "Main Menu" is a placeholder alias for startNewRun() until checkpoint 9
// gives it a real menu to return to.
const hud = new HUD(
  gameState,
  gameMode,
  sceneManager.camera,
  startNewRun,
  startNewRun,
  raycastRegistry,
);

canvas.addEventListener("click", () => {
  playerController.controls.lock();
});

document.addEventListener("pointerlockchange", () => {
  gameState.paused = document.pointerLockElement !== canvas;
});

const modeClock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  playerController.update();
  weaponSystem.update();
  interactSystem.update();
  // Always drain the clock so its internal reference stays fresh — otherwise
  // the frame gameplay resumes after death would report one huge deltaTime
  // spike (elapsed dead-screen time) into whichever mode is active.
  const delta = modeClock.getDelta();
  if (gameState.playerState === "alive") {
    gameMode.update(delta);
  }
  hud.update();
  sceneManager.render();
}

animate();
