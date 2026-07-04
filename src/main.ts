import { SceneManager } from "./core/Scene";
import { loadMap } from "./core/MapLoader";
import { PlayerController } from "./core/PlayerController";
import { GameState } from "./state/GameState";

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

canvas.addEventListener("click", () => {
  playerController.controls.lock();
});

document.addEventListener("pointerlockchange", () => {
  gameState.paused = document.pointerLockElement !== canvas;
});

function animate(): void {
  requestAnimationFrame(animate);
  playerController.update();
  sceneManager.render();
}

animate();
