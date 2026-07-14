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

  // Checkpoint 20: also writes the looked-at interactable's own
  // userData.interactPrompt into gameState.interactPromptText each frame
  // (null when not looking at one) -- ui/HUD.ts reads this instead of a
  // hardcoded generic string, matching this project's "HUD reads only
  // GameState" rule. Falls back to a generic "Press E to interact" string
  // if userData.interactable is true but userData.interactPrompt was
  // somehow left unset -- defensive, shouldn't normally trigger now that
  // every MapEntitySystem.create*() method sets one.
  update(): void {
    if (this.gameState.paused) {
      this.gameState.canInteract = false;
      this.gameState.interactPromptText = null;
      return;
    }

    const hit = this.raycast.fromCamera(
      this.camera,
      this.raycastRegistry.getAll(),
      INTERACT_DISTANCE,
    );

    if (hit === null || hit.object.userData.interactable !== true) {
      this.gameState.canInteract = false;
      this.gameState.interactPromptText = null;
      return;
    }

    this.gameState.canInteract = true;
    const prompt = hit.object.userData.interactPrompt as string | undefined;
    this.gameState.interactPromptText = prompt ?? "Press E to interact";
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
