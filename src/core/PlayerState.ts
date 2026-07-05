import { applyDamage } from "./utils/Health";
import { PLAYER_MAX_HEALTH } from "../state/GameState";
import type { GameState } from "../state/GameState";

// Owns the player's health/lifecycle transition. PlayerController is
// movement-only and WeaponSystem is firing-only per the single-responsibility
// rule, so neither is the right home for "what happens when health hits
// zero" — this file is. Both of them just read gameState.playerState to
// decide whether to no-op; only damage sources call applyDamage() here.
export class PlayerState {
  private readonly gameState: GameState;
  private readonly onDeath?: () => void;

  constructor(gameState: GameState, onDeath?: () => void) {
    this.gameState = gameState;
    this.onDeath = onDeath;
  }

  applyDamage(amount: number): void {
    if (this.gameState.playerState !== "alive") return;

    this.gameState.playerHealth = applyDamage(
      this.gameState.playerHealth,
      amount,
      () => {
        this.gameState.playerState = "dead";
        this.onDeath?.();
      },
    );
  }

  respawn(): void {
    this.gameState.playerHealth = PLAYER_MAX_HEALTH;
    this.gameState.playerState = "alive";
  }
}
