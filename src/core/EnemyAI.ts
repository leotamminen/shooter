import * as THREE from "three";
import { Raycast } from "./utils/Raycast";
import { StateMachine } from "./utils/StateMachine";
import type { AudioSystem } from "./AudioSystem";
import type { EnemyDef } from "../types";
import type { GameState } from "../state/GameState";

type ZombieState = "idle" | "chase" | "attack";

const SIGHT_RANGE = 15;
const MELEE_RANGE = 1.5;
const GROWL_INTERVAL = 3; // seconds between growls while chasing
const LABEL_HEIGHT_OFFSET = 1;

export class EnemyAI {
  readonly id: string;
  readonly mesh: THREE.Mesh;

  health: number;

  private readonly def: EnemyDef;
  private readonly camera: THREE.Camera;
  private readonly audioSystem: AudioSystem;
  private readonly gameState: GameState;

  private readonly raycast = new Raycast();
  private readonly clock = new THREE.Clock();
  private readonly moveDirection = new THREE.Vector3();
  private readonly stateMachine: StateMachine<ZombieState, EnemyAI>;

  private wallTargets: THREE.Object3D[] = [];
  private timeSinceGrowl = 0;
  private timeSinceAttack = 0;
  private dead = false;

  constructor(
    id: string,
    def: EnemyDef,
    mesh: THREE.Mesh,
    camera: THREE.Camera,
    audioSystem: AudioSystem,
    gameState: GameState,
  ) {
    this.id = id;
    this.def = def;
    this.mesh = mesh;
    this.camera = camera;
    this.audioSystem = audioSystem;
    this.gameState = gameState;
    this.health = def.health;

    mesh.userData.onHit = (damage: number): void => this.takeDamage(damage);

    this.stateMachine = new StateMachine<ZombieState, EnemyAI>(
      "idle",
      {
        idle: {},
        chase: {
          onEnter: (self) => {
            self.timeSinceGrowl = 0;
          },
          onUpdate: (self, delta) => self.updateChase(delta),
        },
        attack: {
          onEnter: (self) => {
            self.timeSinceAttack = self.def.attackInterval;
          },
          onUpdate: (self, delta) => self.updateAttack(delta),
        },
      },
      this,
    );
  }

  setWallTargets(targets: THREE.Object3D[]): void {
    this.wallTargets = targets;
  }

  update(): void {
    const delta = this.clock.getDelta();
    if (this.dead) return;

    const distance = this.mesh.position.distanceTo(this.camera.position);
    const hasLineOfSight = this.hasLineOfSight();

    if (distance <= MELEE_RANGE && hasLineOfSight) {
      this.stateMachine.transition("attack");
    } else if (distance <= SIGHT_RANGE && hasLineOfSight) {
      this.stateMachine.transition("chase");
    } else {
      this.stateMachine.transition("idle");
    }

    this.stateMachine.update(delta);

    this.gameState.enemyHealth[this.id] = {
      current: this.health,
      max: this.def.health,
      position: {
        x: this.mesh.position.x,
        y: this.mesh.position.y + LABEL_HEIGHT_OFFSET,
        z: this.mesh.position.z,
      },
    };
  }

  private hasLineOfSight(): boolean {
    const origin = this.mesh.position;
    const toPlayer = new THREE.Vector3().subVectors(
      this.camera.position,
      origin,
    );
    const distance = toPlayer.length();
    if (distance < 1e-6) return true;

    const direction = toPlayer.normalize();
    const hit = this.raycast.fromOrigin(
      origin,
      direction,
      this.wallTargets,
      distance,
    );
    return hit === null;
  }

  private updateChase(delta: number): void {
    this.moveDirection.set(
      this.camera.position.x - this.mesh.position.x,
      0,
      this.camera.position.z - this.mesh.position.z,
    );
    if (this.moveDirection.lengthSq() > 0) {
      this.moveDirection.normalize();
      const step = this.def.speed * delta;
      this.mesh.position.x += this.moveDirection.x * step;
      this.mesh.position.z += this.moveDirection.z * step;
    }

    this.timeSinceGrowl += delta;
    if (this.timeSinceGrowl >= GROWL_INTERVAL) {
      this.timeSinceGrowl = 0;
      this.audioSystem.playAt(this.def.growlSoundId, this.mesh);
    }
  }

  private updateAttack(delta: number): void {
    this.timeSinceAttack += delta;
    if (this.timeSinceAttack >= this.def.attackInterval) {
      this.timeSinceAttack = 0;
      this.gameState.playerHealth = Math.max(
        0,
        this.gameState.playerHealth - this.def.meleeDamage,
      );
    }
  }

  private takeDamage(damage: number): void {
    if (this.dead) return;

    this.health = Math.max(0, this.health - damage);
    if (this.health <= 0) this.die();
  }

  private die(): void {
    this.dead = true;
    this.audioSystem.playAt(this.def.deathSoundId, this.mesh);
    this.mesh.parent?.remove(this.mesh);
    delete this.gameState.enemyHealth[this.id];
  }
}
