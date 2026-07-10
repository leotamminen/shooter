// A zero-padded random 6-digit string, e.g. "042817" -- used by
// modes/Campaign.ts for the checkpoint-19 vault password, regenerated once
// per run. Extracted out of Campaign.ts's own class body since it's a
// pure, reusable function with no dependency on Campaign's own state,
// matching this project's "shared/reusable logic goes in core/utils/" rule.
export function generateVaultPin(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}
