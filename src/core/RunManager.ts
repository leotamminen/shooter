import type { GameState } from "../state/GameState";
import type { PlayerState } from "./PlayerState";

// A small registry, not a god-object: it holds no per-type knowledge of
// weapons, enemies, or anything else. Systems that need to return to their
// initial state on a new run call registerResettable() once during their own
// setup, the same generic-hook pattern as userData.onHit and Health.ts's
// onZero callback.
export class RunManager {
  private readonly gameState: GameState;
  private readonly playerState: PlayerState;
  private readonly resettables: (() => void)[] = [];

  constructor(gameState: GameState, playerState: PlayerState) {
    this.gameState = gameState;
    this.playerState = playerState;
  }

  registerResettable(fn: () => void): void {
    this.resettables.push(fn);
  }

  startNewRun(): void {
    for (const reset of this.resettables) reset();
    this.gameState.resetScore();
    this.playerState.respawn();
  }
}
