import type { GameMode } from "./GameMode";
import type { RunManager } from "../core/RunManager";
import { generateVaultPin } from "../core/utils/RandomPin";

type CampaignStage = "find_password" | "power_terminal" | "complete";

// Hardcoded per this project's mode-building rule -- the third GameMode
// implementation, built directly against the already-extracted interface
// (ZombieSurvival/ShootingRange proved its shape at checkpoints 7-8) rather
// than generalizing further. Checkpoint 19 reworks the checkpoint-17
// single objectiveComplete boolean into a 3-stage flow (Room 1 password ->
// Room 2 terminal -> complete), since a boolean can no longer represent
// "which of two remaining objectives is next" once there are two rooms.
export class Campaign implements GameMode {
  private stage: CampaignStage = "find_password";
  private vaultPin = "";

  constructor(runManager: RunManager) {
    this.resetState();
    runManager.registerResettable(() => this.resetState());
  }

  // Shared by the constructor and the RunManager reset callback, mirroring
  // how ZombieSurvival.startRound() is already called from both start()
  // and resetRun() -- both need to (re)establish the exact same initial
  // state, and duplicating it in two places would risk them drifting out
  // of sync.
  private resetState(): void {
    this.stage = "find_password";
    this.vaultPin = generateVaultPin();
  }

  start(): void {
    // Nothing to begin -- the terminal/password-lock entities are already
    // live from MapEntitySystem's construction.
  }

  update(_deltaTime: number): void {
    // No per-frame logic -- Campaign has no rounds, timers, or AI to drive.
  }

  getStatusLine(): string {
    switch (this.stage) {
      case "find_password":
        return "Objective: find the door password";
      case "power_terminal":
        return "Objective: power the terminal";
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

  // Called by main.ts's room2_terminal onCommand callback when "whoami"
  // runs successfully.
  markComplete(): void {
    this.stage = "complete";
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
