import type { GameMode } from "./GameMode";
import type { RunManager } from "../core/RunManager";
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
