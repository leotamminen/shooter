/**
 * Applies damage to a health value, clamping at 0. Calls `onZero` exactly
 * once, the frame health crosses from above zero to zero — not on every
 * subsequent hit once it's already at zero.
 */
export function applyDamage(
  current: number,
  amount: number,
  onZero?: () => void,
): number {
  const wasAlive = current > 0;
  const next = Math.max(0, current - amount);
  if (wasAlive && next === 0) onZero?.();
  return next;
}
