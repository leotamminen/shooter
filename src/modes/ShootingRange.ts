import * as THREE from "three";
import { Countdown } from "../core/utils/Countdown";
import type { GameMode } from "./GameMode";
import type { WeaponSystem } from "../core/WeaponSystem";
import type { RunManager } from "../core/RunManager";
import type { GameState } from "../state/GameState";

const TARGET_SCORE = 25;
const TARGET_COOLDOWN = 2; // seconds before a hit target becomes hittable again
const TARGET_SIZE = 0.6;
const TARGET_COLOR = 0xdddddd;

interface TargetEntry {
  mesh: THREE.Mesh;
  cooldown: Countdown;
}

// Hardcoded on purpose, like ZombieSurvival — the second mode implementing
// GameMode, proving the interface's shape rather than designing it in the
// abstract. No rounds, no enemies, no player damage: this mode never touches
// playerState at all.
export class ShootingRange implements GameMode {
  private readonly targets: TargetEntry[] = [];
  private readonly gameState: GameState;

  constructor(
    targetPositions: THREE.Vector3[],
    scene: THREE.Scene,
    weaponSystem: WeaponSystem,
    gameState: GameState,
    runManager: RunManager,
  ) {
    this.gameState = gameState;

    for (const position of targetPositions) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(TARGET_SIZE, TARGET_SIZE, TARGET_SIZE),
        new THREE.MeshStandardMaterial({ color: TARGET_COLOR }),
      );
      mesh.position.copy(position);
      scene.add(mesh);
      weaponSystem.addTarget(mesh);

      const entry: TargetEntry = { mesh, cooldown: new Countdown() };
      mesh.userData.onHit = (): void => this.hitTarget(entry);
      this.targets.push(entry);
    }

    runManager.registerResettable(() => this.resetRun());
  }

  start(): void {
    // Nothing to begin — targets are already live from construction.
  }

  update(deltaTime: number): void {
    for (const target of this.targets) {
      target.cooldown.update(deltaTime, () => {
        target.mesh.visible = true;
      });
    }
  }

  getStatusLine(): string {
    return "Shooting Range";
  }

  getSummaryLines(): string[] {
    // No natural "end" to a shooting-range session yet (no death, no win
    // condition) — see CLAUDE.md, this is an open question for checkpoint 9.
    return [];
  }

  private hitTarget(target: TargetEntry): void {
    if (!target.mesh.visible) return; // already on cooldown

    this.gameState.addScore(TARGET_SCORE);
    target.mesh.visible = false;
    target.cooldown.start(TARGET_COOLDOWN);
  }

  private resetRun(): void {
    for (const target of this.targets) {
      target.mesh.visible = true;
      target.cooldown.stop();
    }
  }
}
