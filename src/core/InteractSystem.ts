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

  update(): void {
    this.gameState.canInteract = !this.gameState.paused && this.isLookingAtInteractable();
  }

  isLookingAtInteractable(): boolean {
    const hit = this.raycast.fromCamera(
      this.camera,
      this.targets,
      INTERACT_DISTANCE,
    );
    return hit !== null && hit.object.userData.interactable === true;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "KeyE" || event.repeat) return;
    if (this.gameState.paused) return;
    this.tryInteract();
  };

  private tryInteract(): void {
    if (!this.isLookingAtInteractable()) return;
    // Placeholder action: checkpoint 6 wires this to real map entities
    // (doors/buttons/pickups). The HUD prompt is the only visible feedback
    // for now.
  }
}
