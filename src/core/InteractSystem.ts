import * as THREE from "three";
import { Raycast } from "./utils/Raycast";
import type { GameState } from "../state/GameState";

const INTERACT_DISTANCE = 4;

export class InteractSystem {
  private readonly raycast = new Raycast();
  private targets: THREE.Object3D[] = [];

  private readonly camera: THREE.Camera;
  private readonly gameState: GameState;

  constructor(camera: THREE.Camera, gameState: GameState) {
    this.camera = camera;
    this.gameState = gameState;

    window.addEventListener("keydown", this.handleKeyDown);
  }

  setTargets(targets: THREE.Object3D[]): void {
    this.targets = targets;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "KeyE" || event.repeat) return;
    if (this.gameState.paused) return;
    this.tryInteract();
  };

  private tryInteract(): void {
    const hit = this.raycast.fromCamera(
      this.camera,
      this.targets,
      INTERACT_DISTANCE,
    );
    if (!hit) return;
    if (hit.object.userData.interactable !== true) return;

    console.log(`interacted with ${hit.object.name || "placeholder"}`);
  }
}
