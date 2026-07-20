import * as THREE from "three";
import { Raycast } from "../core/utils/Raycast";
import { Countdown } from "../core/utils/Countdown";
import { SHOW_DEV_COORDINATES } from "../core/devConfig";
import type { GameState } from "../state/GameState";
import type { GameMode } from "../modes/GameMode";
import type { RaycastRegistry } from "../core/RaycastRegistry";

const RELOAD_PROMPT_DELAY_MS = 1000;
// Checkpoint 20: how long a feedback message stays on screen before
// ui/HUD.ts clears it, via the same Countdown utility ZombieSurvival's
// round timer and ShootingRange's target cooldown already use. Seconds,
// matching every other Countdown consumer's deltaTime unit.
const FEEDBACK_DISPLAY_DURATION = 2.5;

function createDiv(styles: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, styles);
  return el;
}

function createButton(
  label: string,
  styles: Partial<CSSStyleDeclaration>,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  Object.assign(button.style, {
    pointerEvents: "auto",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: "16px",
    padding: "10px 24px",
    border: "none",
    borderRadius: "4px",
    color: "#f0f0f0",
    ...styles,
  });
  button.addEventListener("click", onClick);
  return button;
}

export class HUD {
  private readonly gameState: GameState;
  private readonly gameMode: GameMode;
  private readonly camera: THREE.Camera;
  private readonly raycastRegistry: RaycastRegistry;
  private readonly root: HTMLDivElement;

  private readonly crosshairEl: HTMLDivElement;
  // Checkpoint 21 addendum: the whole weapon-name-plus-count block, hidden
  // entirely (not just blanked) whenever gameState.hasActiveWeapon is
  // false -- see updateAmmo() below.
  private readonly ammoBoxEl: HTMLDivElement;
  private readonly weaponNameEl: HTMLDivElement;
  private readonly ammoCountEl: HTMLDivElement;
  private readonly statusEl: HTMLDivElement;
  private readonly interactEl: HTMLDivElement;
  private readonly feedbackEl: HTMLDivElement;
  private readonly healthEl: HTMLDivElement;
  private readonly pointsEl: HTMLDivElement;
  private readonly modeStatusEl: HTMLDivElement;
  private readonly deathPanelEl: HTMLDivElement;
  private readonly deathScoreEl: HTMLDivElement;
  private readonly deathSummaryEl: HTMLDivElement;
  // Dev tool (see core/devConfig.ts's SHOW_DEV_COORDINATES): null, not just
  // hidden via CSS, whenever the flag is off -- no element is ever created,
  // so there's nothing left over to accidentally show, style, or query.
  private readonly devCoordinatesEl: HTMLDivElement | null;
  private readonly getPlayerPosition: () => { x: number; z: number };

  private readonly enemyLabels = new Map<string, HTMLDivElement>();
  private readonly raycast = new Raycast();
  private readonly feedbackCountdown = new Countdown();

  private emptySince: number | null = null;
  private lastFeedbackMessage: string | null = null;

  constructor(
    gameState: GameState,
    gameMode: GameMode,
    camera: THREE.Camera,
    onRespawn: () => void,
    onMainMenu: () => void,
    raycastRegistry: RaycastRegistry,
    // Dev tool: a narrow injected callback, not a whole PlayerController
    // reference -- the same "inject exactly the function needed" shape
    // MapEntitySystem's getPlayerPosition/teleportPlayer callbacks already
    // established for the paired-teleport mechanism, reusing
    // PlayerController.getPosition() itself rather than adding a second way
    // to read the player's live x/z.
    getPlayerPosition: () => { x: number; z: number },
  ) {
    this.gameState = gameState;
    this.gameMode = gameMode;
    this.camera = camera;
    this.raycastRegistry = raycastRegistry;
    this.getPlayerPosition = getPlayerPosition;

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

    this.crosshairEl = this.buildCrosshair();
    root.appendChild(this.crosshairEl);

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

    // Checkpoint 20: a separate, distinctly colored element for transient
    // rejection/flavor feedback -- positioned below promptStack so it
    // never visually overlaps the interact prompt when both are showing
    // at once (e.g. looking at a wall-buy the instant its purchase is
    // rejected).
    this.feedbackEl = createDiv({
      position: "absolute",
      top: "64%",
      left: "50%",
      transform: "translateX(-50%)",
      fontSize: "14px",
      color: "#ffaa33",
      textAlign: "center",
      maxWidth: "480px",
    });
    root.appendChild(this.feedbackEl);

    this.ammoBoxEl = createDiv({
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
    this.ammoBoxEl.appendChild(this.weaponNameEl);
    this.ammoBoxEl.appendChild(this.ammoCountEl);
    root.appendChild(this.ammoBoxEl);

    this.healthEl = createDiv({
      position: "absolute",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      fontSize: "18px",
      fontWeight: "bold",
    });
    root.appendChild(this.healthEl);

    this.pointsEl = createDiv({
      position: "absolute",
      top: "24px",
      right: "24px",
      fontSize: "16px",
      fontWeight: "bold",
    });
    root.appendChild(this.pointsEl);

    this.modeStatusEl = createDiv({
      position: "absolute",
      top: "24px",
      left: "24px",
      fontSize: "16px",
      fontWeight: "bold",
    });
    root.appendChild(this.modeStatusEl);

    this.deathPanelEl = createDiv({
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      display: "none",
      flexDirection: "column",
      alignItems: "center",
      gap: "16px",
      padding: "32px 48px",
      background: "rgba(0, 0, 0, 0.75)",
      borderRadius: "8px",
      textAlign: "center",
      pointerEvents: "auto",
    });

    const heading = createDiv({
      fontSize: "40px",
      fontWeight: "bold",
      color: "#d94040",
      letterSpacing: "0.1em",
    });
    heading.textContent = "YOU DIED";

    this.deathScoreEl = createDiv({ fontSize: "18px" });
    this.deathSummaryEl = createDiv({ fontSize: "18px", whiteSpace: "pre-line" });

    const buttonRow = createDiv({ display: "flex", gap: "16px" });
    const respawnButton = createButton(
      "Respawn",
      { background: "#3a6b3a" },
      onRespawn,
    );
    // Placeholder: identical to Respawn until checkpoint 9 gives the main
    // menu (mode select / loadout screens) real behavior to return to.
    const mainMenuButton = createButton(
      "Main Menu",
      { background: "#444" },
      onMainMenu,
    );
    buttonRow.appendChild(respawnButton);
    buttonRow.appendChild(mainMenuButton);

    this.deathPanelEl.appendChild(heading);
    this.deathPanelEl.appendChild(this.deathScoreEl);
    this.deathPanelEl.appendChild(this.deathSummaryEl);
    this.deathPanelEl.appendChild(buttonRow);
    root.appendChild(this.deathPanelEl);

    // Dev tool (core/devConfig.ts's SHOW_DEV_COORDINATES): deliberately
    // styled to be unmistakable as a development overlay, never confusable
    // with a real HUD element (even in a screenshot) -- an explicit "[DEV]"
    // prefix, a color no other HUD element uses, a small dedicated
    // background panel (every other HUD text element renders directly over
    // the game with no backing box), and bottom-left, a corner nothing else
    // in this file occupies.
    if (SHOW_DEV_COORDINATES) {
      this.devCoordinatesEl = createDiv({
        position: "absolute",
        left: "12px",
        bottom: "12px",
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ff33cc",
        background: "rgba(0, 0, 0, 0.55)",
        padding: "4px 8px",
        borderRadius: "4px",
        whiteSpace: "pre-line",
      });
      root.appendChild(this.devCoordinatesEl);
    } else {
      this.devCoordinatesEl = null;
    }

    document.body.appendChild(root);
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

  update(deltaTime: number): void {
    const alive = this.gameState.playerState === "alive";
    this.crosshairEl.style.display = alive ? "block" : "none";

    if (alive) {
      this.updateAmmo();
      this.updateStatusPrompt();
      this.updateInteractPrompt();
      this.updateHealth();
      this.updateFeedbackMessage(deltaTime);
    } else {
      this.clearAliveOnlyText();
    }

    this.updatePointsBalance();
    this.updateModeStatus();
    this.updateEnemyLabels();
    this.updateDeathPanel();
    this.updateDevCoordinates();
  }

  private clearAliveOnlyText(): void {
    this.weaponNameEl.textContent = "";
    this.ammoCountEl.textContent = "";
    this.statusEl.textContent = "";
    this.interactEl.textContent = "";
    this.healthEl.textContent = "";
    this.feedbackEl.textContent = "";
  }

  private updateAmmo(): void {
    // Checkpoint 21 addendum: hidden entirely (not "0 / 0") with no active
    // weapon -- HandsViewmodel's own rendering already tells the player
    // they're unarmed, the same reasoning as updateStatusPrompt()'s "No
    // ammo" fix below.
    this.ammoBoxEl.style.display = this.gameState.hasActiveWeapon ? "" : "none";
    if (!this.gameState.hasActiveWeapon) return;

    this.weaponNameEl.textContent = this.gameState.weaponName;
    this.ammoCountEl.textContent = `${this.gameState.currentAmmo} / ${this.gameState.reserveAmmo}`;
  }

  private updateStatusPrompt(): void {
    const { currentAmmo, reserveAmmo, isReloading, weaponName } = this.gameState;

    // Checkpoint 21: no active weapon at all (Campaign's starting
    // hands-only state, see WeaponSystem.hasActiveWeapon()) is a different
    // case from a real weapon that's simply run dry -- "No ammo" would
    // misleadingly imply the player is holding an empty gun. Nothing to
    // show here in that case; HandsViewmodel's own rendering (bare hands,
    // not a weapon) already tells the player they're unarmed.
    if (weaponName === "") {
      this.emptySince = null;
      this.statusEl.textContent = "";
      return;
    }

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

  // Checkpoint 20: reads the per-entity text InteractSystem wrote this
  // frame instead of a hardcoded generic string -- "Press E to interact"
  // is now InteractSystem's own defensive fallback, not a decision made
  // here. Visibility is unchanged: an empty string renders as nothing.
  private updateInteractPrompt(): void {
    this.interactEl.textContent = this.gameState.interactPromptText ?? "";
  }

  // Checkpoint 20: HUD owns clearing gameState.feedbackMessage after a
  // fixed display duration, the same "HUD owns presentation timing, not
  // gameplay logic" pattern the reload-prompt delay above already
  // established. A new message is detected by comparing against the
  // previously-rendered value each frame, which (re)starts the countdown
  // -- an identical message shown twice in a row does not restart it, a
  // deliberate consequence of this comparison, not a bug.
  private updateFeedbackMessage(deltaTime: number): void {
    const message = this.gameState.feedbackMessage;
    if (message !== null && message !== this.lastFeedbackMessage) {
      this.feedbackCountdown.start(FEEDBACK_DISPLAY_DURATION);
    }
    this.lastFeedbackMessage = message;

    this.feedbackCountdown.update(deltaTime, () => {
      this.gameState.feedbackMessage = null;
    });

    this.feedbackEl.textContent = this.gameState.feedbackMessage ?? "";
  }

  private updateHealth(): void {
    this.healthEl.textContent = `HP: ${this.gameState.playerHealth}`;
  }

  private updatePointsBalance(): void {
    this.pointsEl.textContent = `Points: ${this.gameState.pointsBalance}`;
  }

  private updateModeStatus(): void {
    this.modeStatusEl.textContent = this.gameMode.getStatusLine();
  }

  // Dev tool (core/devConfig.ts's SHOW_DEV_COORDINATES): a no-op every
  // frame when the element was never created (flag off) -- checked once
  // here rather than at every call site, since this is the only call site.
  // x/z come from PlayerController.getPosition() (already built for the
  // paired-teleport mechanism); y is read directly off the camera this
  // class already holds a reference to for its own occlusion/projection
  // math, since getPosition() only exposes x/z (the teleport mechanism has
  // no use for y, this project has no verticality) -- not a second way to
  // read x/z, just the one axis getPosition() doesn't cover.
  private updateDevCoordinates(): void {
    if (!this.devCoordinatesEl) return;

    const { x, z } = this.getPlayerPosition();
    const y = this.camera.position.y;
    const yawDegrees = this.computeYawDegrees();

    this.devCoordinatesEl.textContent =
      `[DEV] x: ${x.toFixed(2)}  y: ${y.toFixed(2)}  z: ${z.toFixed(2)}\n` +
      `yaw: ${yawDegrees.toFixed(0)}°`;
  }

  // Decomposes the camera's quaternion with an explicit YXZ Euler order --
  // the same order PointerLockControls itself uses internally to compose
  // rotation from mouse movement -- rather than reading camera.rotation.y
  // directly, whose own Euler order defaults to XYZ and would give a
  // different (and generally wrong, once pitch is non-zero) decomposition
  // of the same quaternion. Normalized to [0, 360) rather than THREE's
  // native (-180, 180] so the printed value matches what a MapEntity's
  // rotationY field actually expects (always a non-negative degree value in
  // this project's existing content).
  private computeYawDegrees(): number {
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    euler.setFromQuaternion(this.camera.quaternion, "YXZ");
    const degrees = THREE.MathUtils.radToDeg(euler.y);
    return ((degrees % 360) + 360) % 360;
  }

  private updateDeathPanel(): void {
    const dead = this.gameState.playerState === "dead";
    this.deathPanelEl.style.display = dead ? "flex" : "none";
    if (dead) {
      this.deathScoreEl.textContent = `Score: ${this.gameState.score}`;
      this.deathSummaryEl.textContent = this.gameState.deathSummaryLines.join("\n");
    }
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

      if (screen === null || this.isOccluded(worldPos, id)) {
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

  // excludeEnemyId leaves the labeled enemy's own mesh out of its occlusion
  // check: the label sits only slightly above the enemy's own model, so
  // without this a close/steep viewing angle could clip the enemy's own head
  // and falsely report itself as occluding its own label. This is a string
  // comparison against each enemy's own unique id (tagged onto its mesh as
  // userData.enemyId in EnemyAI's constructor), not a shared type/tag — ids
  // are guaranteed unique per live enemy (the same invariant
  // gameState.enemyHealth's dictionary keys already rely on), so this can
  // never exclude a different enemy's mesh.
  private isOccluded(worldPos: THREE.Vector3, excludeEnemyId: string): boolean {
    const origin = this.camera.position;
    const toTarget = worldPos.clone().sub(origin);
    const distance = toTarget.length();
    if (distance < 1e-6) return false;

    const direction = toTarget.normalize();
    const targets = this.raycastRegistry
      .getAll()
      .filter((object) => object.userData.enemyId !== excludeEnemyId);
    const hit = this.raycast.fromOrigin(origin, direction, targets, distance);
    return hit !== null;
  }
}
