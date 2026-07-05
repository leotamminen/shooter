import * as THREE from "three";
import { Raycast } from "../core/utils/Raycast";
import type { GameState } from "../state/GameState";

const RELOAD_PROMPT_DELAY_MS = 1000;

function createDiv(styles: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, styles);
  return el;
}

export class HUD {
  private readonly gameState: GameState;
  private readonly camera: THREE.Camera;
  private readonly root: HTMLDivElement;

  private readonly weaponNameEl: HTMLDivElement;
  private readonly ammoCountEl: HTMLDivElement;
  private readonly statusEl: HTMLDivElement;
  private readonly interactEl: HTMLDivElement;
  private readonly healthEl: HTMLDivElement;
  private readonly scoreEl: HTMLDivElement;
  private readonly deathOverlayEl: HTMLDivElement;

  private readonly enemyLabels = new Map<string, HTMLDivElement>();
  private readonly raycast = new Raycast();
  private occlusionTargets: THREE.Object3D[] = [];

  private emptySince: number | null = null;

  constructor(gameState: GameState, camera: THREE.Camera) {
    this.gameState = gameState;
    this.camera = camera;

    const root = createDiv({
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "10",
      fontFamily: "monospace",
      color: "#f0f0f0",
      textShadow: "0 1px 2px rgba(0, 0, 0, 0.8)",
      userSelect: "none",
    });
    this.root = root;

    root.appendChild(this.buildCrosshair());

    const promptStack = createDiv({
      position: "absolute",
      top: "56%",
      left: "50%",
      transform: "translateX(-50%)",
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "4px",
    });
    this.statusEl = createDiv({ fontSize: "14px" });
    this.interactEl = createDiv({ fontSize: "14px" });
    promptStack.appendChild(this.statusEl);
    promptStack.appendChild(this.interactEl);
    root.appendChild(promptStack);

    const ammoBox = createDiv({
      position: "absolute",
      right: "24px",
      bottom: "24px",
      textAlign: "right",
    });
    this.weaponNameEl = createDiv({
      fontSize: "13px",
      opacity: "0.8",
      letterSpacing: "0.05em",
    });
    this.ammoCountEl = createDiv({ fontSize: "22px", fontWeight: "bold" });
    ammoBox.appendChild(this.weaponNameEl);
    ammoBox.appendChild(this.ammoCountEl);
    root.appendChild(ammoBox);

    this.healthEl = createDiv({
      position: "absolute",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      fontSize: "18px",
      fontWeight: "bold",
    });
    root.appendChild(this.healthEl);

    this.scoreEl = createDiv({
      position: "absolute",
      top: "24px",
      right: "24px",
      fontSize: "16px",
      fontWeight: "bold",
    });
    root.appendChild(this.scoreEl);

    this.deathOverlayEl = createDiv({
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      fontSize: "48px",
      fontWeight: "bold",
      color: "#d94040",
      letterSpacing: "0.1em",
      textAlign: "center",
    });
    root.appendChild(this.deathOverlayEl);

    document.body.appendChild(root);
  }

  setOcclusionTargets(targets: THREE.Object3D[]): void {
    this.occlusionTargets = targets;
  }

  private buildCrosshair(): HTMLDivElement {
    const crosshair = createDiv({
      position: "absolute",
      top: "50%",
      left: "50%",
      width: "0",
      height: "0",
    });

    const segment = (styles: Partial<CSSStyleDeclaration>): HTMLDivElement =>
      createDiv({
        position: "absolute",
        background: "rgba(255, 255, 255, 0.85)",
        ...styles,
      });

    crosshair.appendChild(
      segment({ width: "2px", height: "6px", left: "-1px", top: "-10px" }),
    );
    crosshair.appendChild(
      segment({ width: "2px", height: "6px", left: "-1px", top: "4px" }),
    );
    crosshair.appendChild(
      segment({ width: "6px", height: "2px", left: "-10px", top: "-1px" }),
    );
    crosshair.appendChild(
      segment({ width: "6px", height: "2px", left: "4px", top: "-1px" }),
    );

    return crosshair;
  }

  update(): void {
    this.updateAmmo();
    this.updateStatusPrompt();
    this.updateInteractPrompt();
    this.updateHealth();
    this.updateScore();
    this.updateEnemyLabels();
    this.updateDeathOverlay();
  }

  private updateAmmo(): void {
    this.weaponNameEl.textContent = this.gameState.weaponName;
    this.ammoCountEl.textContent = `${this.gameState.currentAmmo} / ${this.gameState.reserveAmmo}`;
  }

  private updateStatusPrompt(): void {
    const { currentAmmo, reserveAmmo, isReloading } = this.gameState;

    if (isReloading) {
      this.emptySince = null;
      this.statusEl.textContent = "";
      return;
    }

    if (currentAmmo === 0 && reserveAmmo === 0) {
      this.emptySince = null;
      this.statusEl.textContent = "No ammo";
      return;
    }

    if (currentAmmo === 0 && reserveAmmo > 0) {
      if (this.emptySince === null) this.emptySince = performance.now();
      const elapsed = performance.now() - this.emptySince;
      this.statusEl.textContent =
        elapsed >= RELOAD_PROMPT_DELAY_MS ? "Press R to reload" : "";
      return;
    }

    this.emptySince = null;
    this.statusEl.textContent = "";
  }

  private updateInteractPrompt(): void {
    this.interactEl.textContent = this.gameState.canInteract
      ? "Press E to interact"
      : "";
  }

  private updateHealth(): void {
    this.healthEl.textContent = `HP: ${this.gameState.playerHealth}`;
  }

  private updateScore(): void {
    this.scoreEl.textContent = `Score: ${this.gameState.score}`;
  }

  private updateDeathOverlay(): void {
    this.deathOverlayEl.textContent =
      this.gameState.playerState === "dead" ? "YOU DIED" : "";
  }

  // Debug/test aid: floating current/max labels above each enemy, projected
  // from world space every frame. Not meant to ship as-is — replace with a
  // real health bar (or hide entirely) once the game is closer to
  // presentable.
  private updateEnemyLabels(): void {
    const seen = new Set<string>();

    for (const [id, entry] of Object.entries(this.gameState.enemyHealth)) {
      seen.add(id);

      let label = this.enemyLabels.get(id);
      if (!label) {
        label = createDiv({
          position: "absolute",
          transform: "translate(-50%, -100%)",
          fontSize: "12px",
          whiteSpace: "nowrap",
        });
        this.enemyLabels.set(id, label);
        this.root.appendChild(label);
      }

      const worldPos = new THREE.Vector3(
        entry.position.x,
        entry.position.y,
        entry.position.z,
      );
      const screen = this.projectToScreen(worldPos);

      if (screen === null || this.isOccluded(worldPos)) {
        label.style.display = "none";
        continue;
      }

      label.style.display = "block";
      label.style.left = `${screen.x}px`;
      label.style.top = `${screen.y}px`;
      label.textContent = `${entry.current}/${entry.max}`;
    }

    for (const [id, label] of this.enemyLabels) {
      if (!seen.has(id)) {
        label.remove();
        this.enemyLabels.delete(id);
      }
    }
  }

  private projectToScreen(worldPos: THREE.Vector3): { x: number; y: number } | null {
    const toTarget = worldPos.clone().sub(this.camera.position);
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    if (toTarget.dot(forward) <= 0) return null;

    const ndc = worldPos.clone().project(this.camera);
    return {
      x: (ndc.x * 0.5 + 0.5) * window.innerWidth,
      y: (-ndc.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  private isOccluded(worldPos: THREE.Vector3): boolean {
    const origin = this.camera.position;
    const toTarget = worldPos.clone().sub(origin);
    const distance = toTarget.length();
    if (distance < 1e-6) return false;

    const direction = toTarget.normalize();
    const hit = this.raycast.fromOrigin(
      origin,
      direction,
      this.occlusionTargets,
      distance,
    );
    return hit !== null;
  }
}
