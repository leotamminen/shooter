import * as THREE from "three";
import { EnemyAI } from "../core/EnemyAI";
import { Countdown } from "../core/utils/Countdown";
import type { GameMode } from "./GameMode";
import type { AudioSystem } from "../core/AudioSystem";
import type { PlayerState } from "../core/PlayerState";
import type { RaycastRegistry } from "../core/RaycastRegistry";
import type { RunManager } from "../core/RunManager";
import type { GameState } from "../state/GameState";
import type { EnemyDef } from "../types";

const ROUND_TRANSITION_DELAY = 3; // seconds after the last zombie dies before the next round starts

// Hardcoded on purpose (per the project's mode-building rule: modes are
// built hardcoded first, a GameMode interface only gets extracted once a
// second mode proves the shape is right — checkpoint 8's ShootingRange).
// Owns the enemy lifecycle entirely: main.ts just constructs this once and
// calls update() every frame; it doesn't touch EnemyAI directly.
export class ZombieSurvival implements GameMode {
  currentRound = 1;

  private activeEnemies: EnemyAI[] = [];
  private readonly roundTransitionCountdown = new Countdown();

  private readonly enemyDef: EnemyDef;
  private readonly spawnPoints: THREE.Vector3[];
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly audioSystem: AudioSystem;
  private readonly gameState: GameState;
  private readonly playerState: PlayerState;
  private readonly raycastRegistry: RaycastRegistry;

  constructor(
    enemyDef: EnemyDef,
    spawnPoints: THREE.Vector3[],
    scene: THREE.Scene,
    camera: THREE.Camera,
    audioSystem: AudioSystem,
    gameState: GameState,
    playerState: PlayerState,
    raycastRegistry: RaycastRegistry,
    runManager: RunManager,
  ) {
    if (spawnPoints.length === 0) {
      throw new Error("ZombieSurvival requires at least one enemy_spawn point");
    }

    this.enemyDef = enemyDef;
    this.spawnPoints = spawnPoints;
    this.scene = scene;
    this.camera = camera;
    this.audioSystem = audioSystem;
    this.gameState = gameState;
    this.playerState = playerState;
    this.raycastRegistry = raycastRegistry;

    runManager.registerResettable(() => this.resetRun());
  }

  start(): void {
    this.startRound();
  }

  update(deltaTime: number): void {
    for (const enemy of this.activeEnemies) enemy.update();

    if (this.roundTransitionCountdown.active) {
      this.roundTransitionCountdown.update(deltaTime, () => {
        this.currentRound += 1;
        this.startRound();
      });
      return;
    }

    if (
      this.activeEnemies.length > 0 &&
      this.activeEnemies.every((enemy) => enemy.dead)
    ) {
      this.roundTransitionCountdown.start(ROUND_TRANSITION_DELAY);
    }
  }

  getStatusLine(): string {
    return `Round: ${this.currentRound}`;
  }

  getSummaryLines(): string[] {
    return [`Survived ${this.currentRound} rounds`];
  }

  private zombiesForRound(round: number): number {
    return round;
  }

  // Round-based health scaling (checkpoint 16): each zombie's max health is
  // the EnemyDef's base health times the current round number -- round 1
  // zombies have their normal base health, round 2 zombies have double,
  // round 3 triple, and so on, uncapped (matching real CoD Zombies scaling
  // being large at high rounds -- intended, not a bug). Computed fresh here
  // per round, never mutating this.enemyDef itself, since that one EnemyDef
  // object is shared and reused across every spawn in every round.
  private healthForRound(round: number): number {
    return this.enemyDef.health * round;
  }

  private startRound(): void {
    const count = this.zombiesForRound(this.currentRound);
    const health = this.healthForRound(this.currentRound);
    this.activeEnemies = [];

    for (let i = 0; i < count; i++) {
      const spawnPoint = this.spawnPoints[i % this.spawnPoints.length];
      const enemy = new EnemyAI(
        `zombie-r${this.currentRound}-${i}`,
        this.enemyDef,
        health,
        spawnPoint,
        this.scene,
        this.camera,
        this.audioSystem,
        this.gameState,
        this.playerState,
        this.raycastRegistry,
      );
      this.activeEnemies.push(enemy);
    }
  }

  private resetRun(): void {
    for (const enemy of this.activeEnemies) enemy.destroy();
    this.activeEnemies = [];
    this.roundTransitionCountdown.stop();
    this.currentRound = 1;
    this.startRound();
  }
}
