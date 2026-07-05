import * as THREE from "three";
import { Raycast } from "./utils/Raycast";
import { StateMachine } from "./utils/StateMachine";
import { applyDamage } from "./utils/Health";
import type { AudioSystem } from "./AudioSystem";
import type { PlayerState } from "./PlayerState";
import type { WeaponSystem } from "./WeaponSystem";
import type { EnemyDef } from "../types";
import type { GameState } from "../state/GameState";

type ZombieState = "idle" | "chase" | "attack";

const LABEL_HEIGHT_OFFSET = 1;
const SCORE_PER_HIT = 10;
const SCORE_PER_KILL = 50;

// One instance per spawned enemy — ZombieSurvival creates and destroys these
// per round, so each instance owns its own mesh, health, and state machine
// independently rather than being a single hardcoded singleton.
export class EnemyAI {
  readonly id: string;
  readonly mesh: THREE.Mesh;

  health: number;
  dead = false;

  private readonly def: EnemyDef;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly audioSystem: AudioSystem;
  private readonly gameState: GameState;
  private readonly playerState: PlayerState;
  private readonly weaponSystem: WeaponSystem;
  private readonly wallTargets: THREE.Object3D[];

  private readonly raycast = new Raycast();
  private readonly clock = new THREE.Clock();
  private readonly moveDirection = new THREE.Vector3();
  private readonly stateMachine: StateMachine<ZombieState, EnemyAI>;

  private timeSinceGrowl = 0;
  private timeSinceAttack = 0;

  constructor(
    id: string,
    def: EnemyDef,
    spawnPosition: THREE.Vector3,
    scene: THREE.Scene,
    camera: THREE.Camera,
    audioSystem: AudioSystem,
    gameState: GameState,
    playerState: PlayerState,
    weaponSystem: WeaponSystem,
    wallTargets: THREE.Object3D[],
  ) {
    this.id = id;
    this.def = def;
    this.scene = scene;
    this.camera = camera;
    this.audioSystem = audioSystem;
    this.gameState = gameState;
    this.playerState = playerState;
    this.weaponSystem = weaponSystem;
    this.wallTargets = wallTargets;
    this.health = def.health;

    this.mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, 1, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a6741 }),
    );
    this.mesh.position.copy(spawnPosition);
    this.mesh.userData.onHit = (damage: number): void => this.takeDamage(damage);
    this.scene.add(this.mesh);
    this.weaponSystem.addTarget(this.mesh);

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

  update(): void {
    const delta = this.clock.getDelta();
    if (this.dead) return;

    const distance = this.mesh.position.distanceTo(this.camera.position);
    const hasLineOfSight = this.hasLineOfSight();

    if (distance <= this.def.meleeRange && hasLineOfSight) {
      this.stateMachine.transition("attack");
    } else if (distance <= this.def.sightRange && hasLineOfSight) {
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

  // Removes this enemy from the world without treating it as a kill: no
  // score, no death sound. Used both by a natural death (via onDeath below)
  // and by ZombieSurvival forcibly clearing the board on a new run. Safe to
  // call more than once — only the first call has any effect.
  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    delete this.gameState.enemyHealth[this.id];
    this.weaponSystem.removeTarget(this.mesh);
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
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
    if (this.timeSinceGrowl >= this.def.growlInterval) {
      this.timeSinceGrowl = 0;
      this.audioSystem.playAt(this.def.growlSoundId, this.mesh);
    }
  }

  private updateAttack(delta: number): void {
    this.timeSinceAttack += delta;
    if (this.timeSinceAttack >= this.def.attackInterval) {
      this.timeSinceAttack = 0;
      this.playerState.applyDamage(this.def.meleeDamage);
    }
  }

  private takeDamage(damage: number): void {
    if (this.dead) return;

    this.gameState.addScore(SCORE_PER_HIT);
    this.health = applyDamage(this.health, damage, () => this.onDeath());
  }

  private onDeath(): void {
    this.gameState.addScore(SCORE_PER_KILL);
    this.audioSystem.playAt(this.def.deathSoundId, this.mesh);
    this.destroy();
  }
}
