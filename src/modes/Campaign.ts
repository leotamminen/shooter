import type { GameMode } from "./GameMode";
import type { RunManager } from "../core/RunManager";

// Hardcoded per this project's mode-building rule -- the third GameMode
// implementation, built directly against the already-extracted interface
// (ZombieSurvival/ShootingRange proved its shape at checkpoints 7-8) rather
// than generalizing further. Deliberately the simplest possible GameMode:
// no round logic, no enemy references, nothing zombie-related -- this
// checkpoint's whole objective is "find the password, open the door."
export class Campaign implements GameMode {
  private objectiveComplete = false;

  constructor(runManager: RunManager) {
    runManager.registerResettable(() => {
      this.objectiveComplete = false;
    });
  }

  start(): void {
    // Nothing to begin -- the terminal/password-lock entities are already
    // live from MapEntitySystem's construction.
  }

  update(_deltaTime: number): void {
    // No per-frame logic -- Campaign has no rounds, timers, or AI to drive.
  }

  getStatusLine(): string {
    return this.objectiveComplete ? "Objective: complete" : "Objective: find the password";
  }

  getSummaryLines(): string[] {
    return this.objectiveComplete ? ["Objective complete"] : ["Objective incomplete"];
  }

  // Called by main.ts's openPasswordLock callback on a correct password
  // submission (see Task 9) -- Campaign itself never reaches into
  // MapEntitySystem/ui/PasswordLock.ts to detect this on its own.
  markObjectiveComplete(): void {
    this.objectiveComplete = true;
  }
}
