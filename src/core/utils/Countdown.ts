// Counts down from a duration by deltaTime and fires a callback once it
// reaches zero — the shared shape both ZombieSurvival's round-transition
// timer and ShootingRange's per-target hit cooldown independently
// reimplemented before this was extracted. update() is a no-op while
// inactive, so callers can call it unconditionally every frame without
// checking `active` first.
export class Countdown {
  private remaining = 0;

  get active(): boolean {
    return this.remaining > 0;
  }

  start(duration: number): void {
    this.remaining = duration;
  }

  stop(): void {
    this.remaining = 0;
  }

  update(deltaTime: number, onZero: () => void): void {
    if (this.remaining <= 0) return;

    this.remaining -= deltaTime;
    if (this.remaining <= 0) {
      this.remaining = 0;
      onZero();
    }
  }
}
