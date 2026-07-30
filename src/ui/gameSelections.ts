// Shared between ui/MainMenu.ts and ui/ControlsSettingsMenu.ts (the
// relocated Mode/Map picker now lives in the latter) -- pulled out to its
// own file rather than left in MainMenu.ts so neither file needs to import
// from the other just to share this one type/list.

// The menu's own notion of which modes exist — not content, since game
// modes are code (ZombieSurvival/ShootingRange/Campaign), not typed data,
// per the project's mode-building rule.
export type ModeId = "zombie" | "range" | "campaign";

export interface GameSelections {
  modeId: ModeId;
  mapId: string;
}

// Terminal-style menu redesign: Weapon/Enemy selection removed entirely
// (Weapon has done nothing since checkpoint 15's slot-inventory rewrite;
// Enemy has exactly one real option, content/enemies.ts's "zombie" --
// main.ts now resolves that directly via findById(ENEMIES, "zombie") the
// same way modes/Campaign.ts's own enemyDef already does, instead of
// threading a selection through here for a choice that doesn't exist).
export const MODE_OPTIONS: { id: ModeId; label: string }[] = [
  { id: "zombie", label: "Zombie Survival" },
  { id: "range", label: "Shooting Range" },
  { id: "campaign", label: "Campaign" },
];
