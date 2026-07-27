import * as THREE from "three";
import { Raycast, hasLineOfSight } from "./utils/Raycast";
import { Countdown } from "./utils/Countdown";
import { applyDamage } from "./utils/Health";
import { findPath, worldToGrid, gridToWorld } from "./utils/Pathfinding";
import { FREEZE_ENEMIES } from "./devConfig";
import type { AudioSystem } from "./AudioSystem";
import type { PlayerState } from "./PlayerState";
import type { RaycastRegistry } from "./RaycastRegistry";
import type { GuardDef } from "../types";
import type { GameState } from "../state/GameState";

const LABEL_HEIGHT_OFFSET = 1; // matches EnemyAI's own HUD-label convention, so the shared label rendering looks consistent between enemy types
const SCORE_PER_HIT = 10;
const SCORE_PER_KILL = 50;
const GUARD_COLOR = 0x555577; // distinct from the zombie's 0x4a6741 -- reads as "human/guard", not "zombie"
// GuardDef deliberately carries no sound-id fields of its own (see
// content/guards.ts) -- reusing an existing recorded gunshot is a
// reasonable first-cut placeholder, the same "reuse existing content
// before it gets a real dedicated asset" approach this project's own
// MAC-10/AK-47 additions used before checkpoint 23's fix gave them real
// recordings.
const GUARD_FIRE_SOUND_ID = "pistol_fire";
const PATH_RECOMPUTE_INTERVAL = 0.5; // seconds
const PATH_RECOMPUTE_DISTANCE = 2; // units -- recompute early if the player has moved at least this far since the last computed path, even before the interval elapses
const WAYPOINT_REACHED_THRESHOLD = 0.15; // units

// A brand-new enemy type built on top of core/utils/Pathfinding.ts, its own
// class rather than extending or modifying core/EnemyAI.ts -- the two enemy
// types' behavior (zombie: instant-transition idle/chase/attack toward a
// straight-line direction; guard: periodic pathfinding + ranged fire with a
// miss chance) is different enough that a shared base class would mostly
// just be shared field declarations, not shared logic. Guards are
// Campaign-only for now (see modes/Campaign.ts's spawnGuards()) -- nothing
// in ZombieSurvival constructs one.
//
// Spawns already "alerted": the alarm_button that spawns it (see
// MapEntitySystem.ts's createAlarmButton()) IS the alert, so there's no
// separate idle/patrol state to model before it starts pursuing the player.
export class GuardAI {
  readonly id: string;
  readonly mesh: THREE.Mesh;

  health: number;
  dead = false;

  private readonly def: GuardDef;
  private readonly grid: number[][];
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly audioSystem: AudioSystem;
  private readonly gameState: GameState;
  private readonly playerState: PlayerState;
  private readonly raycastRegistry: RaycastRegistry;

  private readonly raycast = new Raycast();
  private readonly clock = new THREE.Clock();
  private readonly fireCountdown = new Countdown();

  // Remaining waypoints (world x/z), consumed one at a time as each is
  // reached -- recomputed periodically, not every frame, by
  // recomputePathIfNeeded() below.
  private waypoints: { x: number; z: number }[] = [];
  private pathRecomputeTimer = 0;
  private hasComputedPathOnce = false;
  private readonly lastPathTargetPosition = new THREE.Vector3();

  constructor(
    id: string,
    def: GuardDef,
    spawnPosition: THREE.Vector3,
    grid: number[][],
    scene: THREE.Scene,
    camera: THREE.Camera,
    audioSystem: AudioSystem,
    gameState: GameState,
    playerState: PlayerState,
    raycastRegistry: RaycastRegistry,
  ) {
    this.id = id;
    this.def = def;
    this.grid = grid;
    this.scene = scene;
    this.camera = camera;
    this.audioSystem = audioSystem;
    this.gameState = gameState;
    this.playerState = playerState;
    this.raycastRegistry = raycastRegistry;
    this.health = def.health;

    this.mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, 1, 4, 8),
      new THREE.MeshStandardMaterial({ color: GUARD_COLOR }),
    );
    this.mesh.position.copy(spawnPosition);
    // Same userData.onHit/enemyId shape EnemyAI's own mesh already carries
    // -- WeaponSystem's hitscan/melee raycasts and ui/HUD.ts's health-label
    // rendering both dispatch generically off these, with zero changes
    // needed anywhere to support a second enemy type.
    this.mesh.userData.onHit = (damage: number): void => this.takeDamage(damage);
    this.mesh.userData.enemyId = this.id;
    this.scene.add(this.mesh);
    this.raycastRegistry.register(this.mesh);
  }

  update(): void {
    const delta = this.clock.getDelta();
    if (this.dead) return;

    // Dev tool (core/devConfig.ts's FREEZE_ENEMIES) -- the dev-tools task's
    // own comment on that constant asked a future task to check here too;
    // this is that future task. Health/damage/death are unaffected, same
    // reasoning as EnemyAI.ts's identical check: takeDamage()/onDeath()
    // are only ever invoked externally via mesh.userData.onHit, never from
    // anything in this method.
    if (FREEZE_ENEMIES) {
      this.syncHealthLabel();
      return;
    }

    this.fireCountdown.update(delta, () => {});

    const playerPosition = this.camera.position;
    const distance = this.mesh.position.distanceTo(playerPosition);
    const sighted = this.checkLineOfSight(playerPosition);

    if (distance <= this.def.fireRange && sighted) {
      // In range and sighted: stop advancing and attempt to fire (gated
      // by its own cooldown inside tryFire()) rather than continuing to
      // close distance once it can already engage.
      this.tryFire();
    } else {
      // Outside fireRange or without line of sight: keep pathfinding
      // toward the player instead of freezing or losing track -- the
      // entire point of giving this enemy type pathfinding the dumber
      // zombie AI doesn't have.
      this.recomputePathIfNeeded(delta, playerPosition);
      this.moveAlongPath(delta);
    }

    this.syncHealthLabel();
  }

  // Mirrors EnemyAI.destroy() exactly: removes this enemy from the world
  // without treating it as a kill (no score) -- used by a natural death
  // (via onDeath() below) and by Campaign forcibly clearing the board on a
  // new run. Safe to call more than once -- only the first call has any
  // effect.
  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    delete this.gameState.enemyHealth[this.id];
    this.raycastRegistry.unregister(this.mesh);
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }

  private checkLineOfSight(playerPosition: THREE.Vector3): boolean {
    return hasLineOfSight(
      this.raycast,
      this.mesh.position,
      playerPosition,
      this.raycastRegistry.getAll(),
      this.mesh,
    );
  }

  // Recomputes a path toward the player's current position periodically --
  // every PATH_RECOMPUTE_INTERVAL seconds, or sooner if the player has
  // moved at least PATH_RECOMPUTE_DISTANCE units since the last computed
  // path -- rather than every frame, which would be wasteful BFS work for
  // a target that usually hasn't moved far between frames.
  private recomputePathIfNeeded(delta: number, playerPosition: THREE.Vector3): void {
    this.pathRecomputeTimer += delta;
    const movedFar =
      this.lastPathTargetPosition.distanceTo(playerPosition) >= PATH_RECOMPUTE_DISTANCE;
    if (this.hasComputedPathOnce && this.pathRecomputeTimer < PATH_RECOMPUTE_INTERVAL && !movedFar) {
      return;
    }

    this.pathRecomputeTimer = 0;
    this.hasComputedPathOnce = true;
    this.lastPathTargetPosition.copy(playerPosition);

    const startCell = worldToGrid(this.mesh.position.x, this.mesh.position.z);
    const goalCell = worldToGrid(playerPosition.x, playerPosition.z);
    const path = findPath(this.grid, startCell, goalCell);
    // null (unreachable) becomes an empty waypoint list -- moveAlongPath()
    // below already no-ops on an empty list, so there's no separate
    // "can't reach the player" case to handle here.
    this.waypoints = path ? path.map((cell) => gridToWorld(cell)) : [];
  }

  private moveAlongPath(delta: number): void {
    if (this.waypoints.length === 0) return;

    const target = this.waypoints[0];
    const dx = target.x - this.mesh.position.x;
    const dz = target.z - this.mesh.position.z;
    const distance = Math.hypot(dx, dz);

    if (distance < WAYPOINT_REACHED_THRESHOLD) {
      this.waypoints.shift();
      return;
    }

    const step = Math.min(this.def.moveSpeed * delta, distance);
    this.mesh.position.x += (dx / distance) * step;
    this.mesh.position.z += (dz / distance) * step;
  }

  // Gated by fireCountdown (a random duration between fireCooldownMin/Max,
  // "max once per 2s" per spec, with a little variance so it doesn't fire
  // on a robotic fixed interval). missChance is rolled AFTER deciding to
  // fire, not before: the cooldown always resets and the fire sound always
  // plays either way, so a miss reads as a real shot that didn't land (a
  // "near miss"), not as the guard silently declining to shoot.
  private tryFire(): void {
    if (this.fireCountdown.active) return;

    const cooldown = THREE.MathUtils.lerp(
      this.def.fireCooldownMin,
      this.def.fireCooldownMax,
      Math.random(),
    );
    this.fireCountdown.start(cooldown);

    this.audioSystem.playAt(GUARD_FIRE_SOUND_ID, this.mesh);

    const missed = Math.random() < this.def.missChance;
    if (!missed) {
      this.playerState.applyDamage(this.def.damage);
    }
  }

  private takeDamage(damage: number): void {
    if (this.dead) return;
    this.gameState.addScore(SCORE_PER_HIT);
    this.health = applyDamage(this.health, damage, () => this.onDeath());
  }

  private onDeath(): void {
    this.gameState.addScore(SCORE_PER_KILL);
    this.destroy();
  }

  private syncHealthLabel(): void {
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
}
