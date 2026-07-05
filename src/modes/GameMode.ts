// The contract every game mode implements — extracted once ZombieSurvival
// (checkpoint 7) and ShootingRange (checkpoint 8) proved the shared shape,
// per the project's mode-building rule (hardcoded first, interface second).
//
// Implementers are expected to register their own resettable with
// RunManager during construction (the same registerResettable() mechanism
// used since checkpoint 4.8). That's not a method here since registration is
// a one-time constructor-time action, not something callers invoke.
export interface GameMode {
  // Begins (or resumes) the mode. Called once at boot in main.ts; modes
  // don't switch at runtime yet (checkpoint 9's menu will call this again
  // once real mode-switching exists).
  start(): void;

  // Per-frame logic, driven by main.ts's single shared clock.
  update(deltaTime: number): void;

  // Short line for the always-visible HUD corner (e.g. "Round: 3").
  getStatusLine(): string;

  // Lines to show on the death/end panel alongside score. Empty if the mode
  // has nothing to add.
  getSummaryLines(): string[];
}
