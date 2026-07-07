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
import { WeaponViewmodel } from "./core/WeaponViewmodel";
import type { GameMode } from "./modes/GameMode";
import { ZombieSurvival } from "./modes/ZombieSurvival";
import { ShootingRange } from "./modes/ShootingRange";
import { HUD } from "./ui/HUD";
import { MainMenu } from "./ui/MainMenu";
import type { GameSelections } from "./ui/MainMenu";
import { GameState } from "./state/GameState";
import { findById } from "./core/utils/Lookup";
import { WEAPONS } from "./content/weapons";
import { ENEMIES } from "./content/enemies";
import { SOUNDS } from "./content/sounds";
import { MAPS } from "./content/maps";

// Everything that used to run at module load now runs once, here, only
// after the main menu's Start button fires with the player's choices.
// RaycastRegistry (and every other checkpoint-8.5 singleton) is constructed
// inside this function rather than at module scope — even though this
// checkpoint only ever calls startGame() once, keeping construction scoped
// here avoids a stale-registry bug when a future mid-session menu return
// eventually calls startGame() a second time (see CLAUDE.md future
// mechanics: that return path isn't built yet).
function startGame(selections: GameSelections): void {
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
  // solid or interactable object (walls, doors, buttons, pickups, wall_buys,
  // enemies) registers itself here once, and every raycasting system
  // (WeaponSystem's fire, EnemyAI's line-of-sight, InteractSystem's interact
  // ray, HUD's label occlusion) reads the same list.
  const raycastRegistry = new RaycastRegistry();

  const mapDef = findById(MAPS, selections.mapId);
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
    findById(WEAPONS, selections.weaponId),
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
    gameState,
    WEAPONS,
  );
  sceneManager.scene.add(mapEntitySystem.group);
  playerController.setDoors(mapEntitySystem.doors);

  const interactSystem = new InteractSystem(sceneManager.camera, gameState, raycastRegistry);

  const enemySpawnPoints = mapDef.entities
    .filter((entity) => entity.type === "enemy_spawn")
    .map((entity) => new THREE.Vector3(...entity.position));

  const targetPoints = mapDef.entities
    .filter((entity) => entity.type === "target")
    .map((entity) => new THREE.Vector3(...entity.position));

  gameMode =
    selections.modeId === "zombie"
      ? new ZombieSurvival(
          findById(ENEMIES, selections.enemyId),
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

  // "Main Menu" is still a placeholder alias for startNewRun() — this
  // checkpoint's menu is load-time only; a mid-session return to
  // ui/MainMenu.ts is deliberately not built yet (see CLAUDE.md future
  // mechanics).
  const hud = new HUD(
    gameState,
    gameMode,
    sceneManager.camera,
    startNewRun,
    startNewRun,
    raycastRegistry,
  );

  const weaponViewmodel = new WeaponViewmodel();

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
    if (gameState.playerState === "alive") {
      weaponViewmodel.updateOrientation(sceneManager.camera);
      weaponViewmodel.render(sceneManager.renderer);
    }
  }

  animate();
}

const mainMenu = new MainMenu(WEAPONS, ENEMIES, MAPS, (selections) => {
  mainMenu.destroy();
  startGame(selections);
});
