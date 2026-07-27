import * as THREE from "three";
import type { GameMode } from "./GameMode";
import type { RunManager } from "../core/RunManager";
import { EnemyAI } from "../core/EnemyAI";
import { GuardAI } from "../core/GuardAI";
import type { AudioSystem } from "../core/AudioSystem";
import type { PlayerState } from "../core/PlayerState";
import type { RaycastRegistry } from "../core/RaycastRegistry";
import type { GameState } from "../state/GameState";
import type { EnemyDef, GuardDef } from "../types";
import { generateVaultPin } from "../core/utils/RandomPin";

type CampaignStage = "find_password" | "power_terminal" | "unlock_data_center" | "complete";

// Hardcoded per this project's mode-building rule -- the third GameMode
// implementation, built directly against the already-extracted interface
// (ZombieSurvival/ShootingRange proved its shape at checkpoints 7-8) rather
// than generalizing further. Checkpoint 19 reworks the checkpoint-17
// single objectiveComplete boolean into a 3-stage flow (Room 1 password ->
// Room 2 terminal -> complete), since a boolean can no longer represent
// "which of two remaining objectives is next" once there are two rooms.
//
// Data Center exit follow-up: a fourth stage, "unlock_data_center", is
// inserted between "power_terminal" and "complete" -- completion moved
// later in the game (campaign_lock_5's fingerprint scan opening
// campaign_door_6), so Room 3's identity lock no longer advances the stage
// at all (see onDoorOneOpened()/markComplete() below and the removed call
// site in main.ts's openPasswordLock callback) -- the status line simply
// keeps showing "power_terminal"'s text from Room 3 onward until
// onNoteRead() advances it, rather than two different events both racing
// to claim "complete".
export class Campaign implements GameMode {
  private stage: CampaignStage = "find_password";
  private vaultPin = "";
  // Campaign's first combat encounter (M1911+alarm follow-up): a flat list
  // of whatever EnemyAI instances the current run's single fixed fight has
  // spawned -- there's no round/wave concept here, so unlike
  // ZombieSurvival's activeEnemies (rebuilt fresh every startRound()) this
  // just accumulates for the life of the run and is cleared wholesale on
  // reset.
  private activeEnemies: EnemyAI[] = [];
  // Pathfinding+Guard follow-up: a second, parallel accumulator, the exact
  // same "grows for the life of the run, wiped wholesale on reset" shape
  // as activeEnemies above -- kept as its own list rather than folded into
  // activeEnemies since EnemyAI/GuardAI are deliberately separate classes
  // with no shared base type to store them under uniformly.
  private activeGuards: GuardAI[] = [];

  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly audioSystem: AudioSystem;
  private readonly gameState: GameState;
  private readonly playerState: PlayerState;
  private readonly raycastRegistry: RaycastRegistry;
  // The base zombie EnemyDef, injected from main.ts the same way
  // ZombieSurvival receives its own enemyDef -- Campaign has exactly one
  // enemy type for its one fixed encounter, so there's no per-selection
  // choice to make, but the dependency still comes from main.ts (the
  // composition root that owns every content/ lookup) rather than this
  // file importing content/enemies.ts directly.
  private readonly enemyDef: EnemyDef;
  // Pathfinding+Guard follow-up: the base GuardDef, injected the identical
  // way -- see content/guards.ts's own single "guard" entry.
  private readonly guardDef: GuardDef;
  // Pathfinding+Guard follow-up: the active map's own wall/floor grid,
  // needed by GuardAI's pathfinding (core/utils/Pathfinding.ts's
  // findPath() operates directly on this same number[][] shape) -- not
  // needed by spawnEnemies()/EnemyAI at all, only carried here for
  // spawnGuards() to hand to each GuardAI instance it constructs.
  private readonly grid: number[][];

  constructor(
    runManager: RunManager,
    scene: THREE.Scene,
    camera: THREE.Camera,
    audioSystem: AudioSystem,
    gameState: GameState,
    playerState: PlayerState,
    raycastRegistry: RaycastRegistry,
    enemyDef: EnemyDef,
    guardDef: GuardDef,
    grid: number[][],
  ) {
    this.scene = scene;
    this.camera = camera;
    this.audioSystem = audioSystem;
    this.gameState = gameState;
    this.playerState = playerState;
    this.raycastRegistry = raycastRegistry;
    this.enemyDef = enemyDef;
    this.guardDef = guardDef;
    this.grid = grid;
    this.resetState();
    runManager.registerResettable(() => this.resetState());
  }

  // Shared by the constructor and the RunManager reset callback, mirroring
  // how ZombieSurvival.startRound() is already called from both start()
  // and resetRun() -- both need to (re)establish the exact same initial
  // state, and duplicating it in two places would risk them drifting out
  // of sync. M1911+alarm follow-up: also destroys every active enemy and
  // clears the list, the same "wipe the board on a new run" behavior
  // ZombieSurvival.resetRun() already has for its own activeEnemies.
  // Pathfinding+Guard follow-up: does the identical destroy-and-clear for
  // activeGuards alongside activeEnemies.
  private resetState(): void {
    this.stage = "find_password";
    this.vaultPin = generateVaultPin();
    for (const enemy of this.activeEnemies) enemy.destroy();
    this.activeEnemies = [];
    for (const guard of this.activeGuards) guard.destroy();
    this.activeGuards = [];
  }

  start(): void {
    // Nothing to begin -- the terminal/password-lock entities are already
    // live from MapEntitySystem's construction.
  }

  update(_deltaTime: number): void {
    // M1911+alarm follow-up: drives whichever enemies the alarm encounter
    // has spawned so far -- a no-op for the entire rest of the game, same
    // as every frame before this follow-up, since activeEnemies stays
    // empty until spawnEnemies() is ever called.
    for (const enemy of this.activeEnemies) enemy.update();
    // Pathfinding+Guard follow-up: identical treatment for activeGuards.
    for (const guard of this.activeGuards) guard.update();
  }

  getStatusLine(): string {
    switch (this.stage) {
      case "find_password":
        return "Objective: find the door password";
      case "power_terminal":
        return "Objective: power the terminal";
      case "unlock_data_center":
        return "Objective: unlock the data center main door";
      case "complete":
        return "Objective: complete";
    }
  }

  getSummaryLines(): string[] {
    switch (this.stage) {
      case "find_password":
        return ["Objective incomplete -- Room 1 not yet opened"];
      case "power_terminal":
        return ["Objective incomplete -- Room 2 terminal not yet powered"];
      case "unlock_data_center":
        return ["Objective incomplete -- data center main door still locked"];
      case "complete":
        return ["Objective complete"];
    }
  }

  // Called by main.ts's Room 1 password-lock success callback -- Campaign
  // itself never reaches into MapEntitySystem/ui/PasswordLock.ts to detect
  // this on its own (same injected-callback pattern as checkpoint 17's
  // markObjectiveComplete()).
  onDoorOneOpened(): void {
    this.stage = "power_terminal";
  }

  // Data Center exit follow-up: called by main.ts's Terminal onFileRead
  // callback, only for workstation_terminal's note.txt (see
  // ui/Terminal.ts's own narrow-scoping comment). Room 3's identity lock
  // (campaign_lock_3) used to call markComplete() directly at this point in
  // the game -- it no longer advances the stage at all now that completion
  // has moved later, so the status line simply keeps showing
  // "power_terminal"'s text from Room 3 onward until this fires.
  onNoteRead(): void {
    this.stage = "unlock_data_center";
  }

  // Called by main.ts's createFingerprintLock success callback when
  // campaign_lock_5's fingerprint scan opens campaign_door_6 -- this is now
  // the one true "complete" trigger. (Previously called from Room 3's
  // identity-lock success instead; that call site was removed once
  // completion moved here, so nothing else can ever claim "complete".)
  markComplete(): void {
    this.stage = "complete";
  }

  // Called by main.ts's alarm_button spawnEnemyWave callback (converted
  // from the entity's own [number,number,number][] positions into
  // THREE.Vector3 there, before reaching here). Campaign's first and only
  // combat encounter -- a single fixed fight, not a wave/round system, so
  // this deliberately does NOT reuse ZombieSurvival's round-scaling
  // machinery (healthForRound(), zombiesForRound(), the round-transition
  // Countdown, spawn-point cycling): there is no round to scale against and
  // no next wave to transition into, just one enemy per given position at
  // the base EnemyDef's own plain, unscaled health. See CLAUDE.md's
  // decisions log for the fuller reasoning.
  spawnEnemies(positions: THREE.Vector3[]): void {
    positions.forEach((position, index) => {
      const enemy = new EnemyAI(
        `campaign-alarm-${index}`,
        this.enemyDef,
        this.enemyDef.health,
        position,
        this.scene,
        this.camera,
        this.audioSystem,
        this.gameState,
        this.playerState,
        this.raycastRegistry,
      );
      this.activeEnemies.push(enemy);
    });
  }

  // Pathfinding+Guard follow-up: the parallel spawnEnemies() for the new
  // enemy type -- called by main.ts's alarm_button spawnEnemyWave callback
  // when the triggering entity's enemyType is "guard" instead of the
  // default "zombie". Same "base def's own plain stats, no round scaling"
  // reasoning as spawnEnemies() above: Campaign has no round/wave concept
  // for either enemy type to scale against.
  spawnGuards(positions: THREE.Vector3[]): void {
    positions.forEach((position, index) => {
      const guard = new GuardAI(
        `campaign-guard-${index}`,
        this.guardDef,
        position,
        this.grid,
        this.scene,
        this.camera,
        this.audioSystem,
        this.gameState,
        this.playerState,
        this.raycastRegistry,
      );
      this.activeGuards.push(guard);
    });
  }

  // An arrow-function class field, not a regular method -- deliberately,
  // because main.ts passes this around as a bare function reference
  // (`campaign.getVaultPin`, not `() => campaign.getVaultPin()`) to both
  // MapEntitySystem's constructor and both ui/Terminal.ts instances. A
  // regular method accessed that way would lose its `this` binding the
  // moment it's actually called from inside those other objects, silently
  // reading `this.vaultPin` as undefined at runtime with no compile error
  // to catch it. Binding it as an arrow field at construction time makes
  // this safe by construction, regardless of how callers pass it around.
  // Read live (never snapshotted) by both consumers, since resetState()
  // regenerates vaultPin on every new run.
  getVaultPin = (): string => {
    return this.vaultPin;
  };
}
