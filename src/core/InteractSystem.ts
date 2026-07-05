import * as THREE from "three";
import { Raycast } from "./utils/Raycast";
import type { GameState } from "../state/GameState";
import type { RaycastRegistry } from "./RaycastRegistry";

const INTERACT_DISTANCE = 4;

export class InteractSystem {
  private readonly raycast = new Raycast();
  private readonly raycastRegistry: RaycastRegistry;

  private readonly camera: THREE.Camera;
  private readonly gameState: GameState;

  constructor(camera: THREE.Camera, gameState: GameState, raycastRegistry: RaycastRegistry) {
    this.camera = camera;
    this.gameState = gameState;
    this.raycastRegistry = raycastRegistry;

    window.addEventListener("keydown", this.handleKeyDown);
  }

  update(): void {
    this.gameState.canInteract = !this.gameState.paused && this.isLookingAtInteractable();
  }

  isLookingAtInteractable(): boolean {
    const hit = this.raycast.fromCamera(
      this.camera,
      this.raycastRegistry.getAll(),
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
    const hit = this.raycast.fromCamera(
      this.camera,
      this.raycastRegistry.getAll(),
      INTERACT_DISTANCE,
    );
    if (!hit || hit.object.userData.interactable !== true) return;

    const onInteract = hit.object.userData.onInteract as (() => void) | undefined;
    onInteract?.();
  }
}
