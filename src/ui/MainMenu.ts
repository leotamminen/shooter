import type { Weapon, EnemyDef, MapDef } from "../types";

// The menu's own notion of which modes exist — not content, since game
// modes are code (ZombieSurvival/ShootingRange/Campaign), not typed data,
// per the project's mode-building rule. Mirrors the ModeName union that
// used to be hardcoded directly in main.ts before this checkpoint.
export type ModeId = "zombie" | "range" | "campaign";

export interface GameSelections {
  modeId: ModeId;
  mapId: string;
  weaponId: string;
  enemyId: string;
}

interface SelectableOption {
  id: string;
  label: string;
}

const MODE_OPTIONS: { id: ModeId; label: string }[] = [
  { id: "zombie", label: "Zombie Survival" },
  { id: "range", label: "Shooting Range" },
  { id: "campaign", label: "Campaign" },
];

const SELECTED_BORDER = "#4a9eff";
const UNSELECTED_BORDER = "#666";
const SELECTED_BACKGROUND = "#1c3a5c";
const UNSELECTED_BACKGROUND = "#2a2a2a";

function createDiv(styles: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, styles);
  return el;
}

function createOptionButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  Object.assign(button.style, {
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: "14px",
    padding: "10px 20px",
    border: `2px solid ${UNSELECTED_BORDER}`,
    borderRadius: "4px",
    background: UNSELECTED_BACKGROUND,
    color: "#f0f0f0",
  });
  button.addEventListener("click", onClick);
  return button;
}

// A one-time DOM overlay shown before gameplay starts: mode/map/weapon/enemy
// selection plus a Start Game button. Kept separate from ui/HUD.ts — its
// lifecycle (shown once, then destroyed) is distinct from HUD's (shown
// continuously during gameplay), so folding it into HUD would mix two
// different concerns into one file.
//
// Deliberately one screen with four groups, not sequential screens: with
// only two modes and small weapon/enemy/map lists currently in content/, a
// multi-screen wizard would be pure overhead. Revisit if the option lists
// grow long enough to need it.
export class MainMenu {
  private readonly root: HTMLDivElement;
  private readonly enemyGroup: HTMLDivElement;
  private readonly maps: MapDef[];

  private selectedModeId: ModeId = MODE_OPTIONS[0].id;
  private selectedMapId: string;
  private selectedWeaponId: string;
  private selectedEnemyId: string;

  private readonly modeButtons = new Map<string, HTMLButtonElement>();
  private readonly mapButtons = new Map<string, HTMLButtonElement>();
  private readonly weaponButtons = new Map<string, HTMLButtonElement>();
  private readonly enemyButtons = new Map<string, HTMLButtonElement>();

  constructor(
    weapons: Weapon[],
    enemies: EnemyDef[],
    maps: MapDef[],
    onStart: (selections: GameSelections) => void,
  ) {
    this.maps = maps;
    this.selectedMapId = maps[0].id;
    this.selectedWeaponId = weapons[0].id;
    this.selectedEnemyId = enemies[0].id;

    this.root = createDiv({
      position: "fixed",
      inset: "0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "32px",
      background: "#151515",
      pointerEvents: "auto",
      zIndex: "20",
      fontFamily: "monospace",
      color: "#f0f0f0",
    });

    const heading = createDiv({ fontSize: "32px", fontWeight: "bold", letterSpacing: "0.1em" });
    heading.textContent = "SHOOTER";
    this.root.appendChild(heading);

    const modeGroup = this.buildGroup(
      "Mode",
      MODE_OPTIONS,
      this.selectedModeId,
      this.modeButtons,
      (id) => this.selectMode(id as ModeId),
    );
    this.root.appendChild(modeGroup);

    // Checkpoint 17: mode-based filtering/graying now exists via
    // MapDef.supportedModes -- see updateMapAvailability() below. Maps
    // without supportedModes (test-grid, corridors) remain mode-agnostic,
    // selectable under any mode, unchanged from before this checkpoint.
    const mapOptions: SelectableOption[] = maps.map((map) => ({
      id: map.id,
      label: map.name,
    }));
    const mapGroup = this.buildGroup(
      "Map",
      mapOptions,
      this.selectedMapId,
      this.mapButtons,
      (id) => this.selectMap(id),
    );
    this.root.appendChild(mapGroup);

    // Checkpoint 17: apply the default mode's map availability immediately
    // at construction, the same way applySelection() above already sets
    // initial button styling -- a no-op today (the default mode, "zombie",
    // and both existing maps are mode-agnostic), but keeps this correct
    // even if the default mode or content ever changes.
    this.updateMapAvailability(this.selectedModeId);

    // Melee weapons (e.g. the checkpoint-16 knife) are excluded from this
    // list -- meleeRange presence is the same ranged-vs-melee discriminator
    // WeaponSystem's assertRangedWeapon()/assertMeleeWeapon() use. This
    // selection is currently inert (every run always starts with M1911
    // regardless of what's picked here -- see CLAUDE.md's checkpoint-15
    // decisions log), but a melee weapon showing up as a selectable
    // "starting weapon" would be a visible UI wart today and a crash trap
    // if this group is ever repurposed to actually choose slot 0's starting
    // weapon (WeaponSystem would throw on construction).
    const weaponOptions: SelectableOption[] = weapons
      .filter((weapon) => weapon.meleeRange === undefined)
      .map((weapon) => ({
        id: weapon.id,
        label: weapon.name,
      }));
    const weaponGroup = this.buildGroup(
      "Weapon",
      weaponOptions,
      this.selectedWeaponId,
      this.weaponButtons,
      (id) => this.selectWeapon(id),
    );
    this.root.appendChild(weaponGroup);

    // EnemyDef has no player-facing display-name field yet (unlike
    // Weapon.name) — shown as its raw id until one is added. See CLAUDE.md
    // future mechanics.
    const enemyOptions: SelectableOption[] = enemies.map((enemy) => ({
      id: enemy.id,
      label: enemy.id,
    }));
    this.enemyGroup = this.buildGroup(
      "Enemy",
      enemyOptions,
      this.selectedEnemyId,
      this.enemyButtons,
      (id) => this.selectEnemy(id),
    );
    this.root.appendChild(this.enemyGroup);

    const startButton = createOptionButton("Start Game", () => {
      onStart({
        modeId: this.selectedModeId,
        mapId: this.selectedMapId,
        weaponId: this.selectedWeaponId,
        enemyId: this.selectedEnemyId,
      });
    });
    Object.assign(startButton.style, {
      fontSize: "18px",
      fontWeight: "bold",
      padding: "14px 40px",
      border: "none",
      background: "#3a6b3a",
    });
    this.root.appendChild(startButton);

    document.body.appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
  }

  private buildGroup(
    title: string,
    options: SelectableOption[],
    selectedId: string,
    buttonMap: Map<string, HTMLButtonElement>,
    onSelect: (id: string) => void,
  ): HTMLDivElement {
    const group = createDiv({
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "10px",
    });

    const heading = createDiv({ fontSize: "14px", opacity: "0.8", letterSpacing: "0.05em" });
    heading.textContent = title;
    group.appendChild(heading);

    const row = createDiv({ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" });
    for (const option of options) {
      const button = createOptionButton(option.label, () => onSelect(option.id));
      buttonMap.set(option.id, button);
      row.appendChild(button);
    }
    group.appendChild(row);

    this.applySelection(buttonMap, selectedId);
    return group;
  }

  private applySelection(buttonMap: Map<string, HTMLButtonElement>, selectedId: string): void {
    for (const [id, button] of buttonMap) {
      const selected = id === selectedId;
      button.style.borderColor = selected ? SELECTED_BORDER : UNSELECTED_BORDER;
      button.style.background = selected ? SELECTED_BACKGROUND : UNSELECTED_BACKGROUND;
    }
  }

  private selectMode(modeId: ModeId): void {
    this.selectedModeId = modeId;
    this.applySelection(this.modeButtons, modeId);

    // Checkpoint 17: Campaign has no enemies either, same as Shooting
    // Range -- both gray out the Enemy group.
    const hideEnemyGroup = modeId === "range" || modeId === "campaign";
    this.enemyGroup.style.opacity = hideEnemyGroup ? "0.4" : "1";
    this.enemyGroup.style.pointerEvents = hideEnemyGroup ? "none" : "auto";

    this.updateMapAvailability(modeId);
  }

  private selectMap(mapId: string): void {
    this.selectedMapId = mapId;
    this.applySelection(this.mapButtons, mapId);
  }

  // Checkpoint 18 bugfix: a map with no supportedModes is mode-agnostic,
  // but "mode-agnostic" now means "supported under any mode that has no
  // map explicitly dedicated to it" -- not unconditionally "supported
  // everywhere". Checkpoint 17's original version returned true whenever
  // supportedModes was undefined, full stop, which meant Test Grid/
  // Corridors stayed selectable under Campaign too, even though
  // campaign_room1 is the only map actually built for it (it's the only
  // map with terminal/password_lock entities). The check below asks
  // instead: has ANY map already explicitly opted into modeId via its own
  // supportedModes? If so, that mode is treated as requiring an
  // explicitly-dedicated map, and mode-agnostic maps no longer default
  // into it. Zombie Survival/Shooting Range have no map that explicitly
  // opts into them, so mode-agnostic maps remain available under both,
  // completely unchanged from before this fix. This generalizes correctly
  // for any future mode-exclusive map, without hardcoding "campaign" by
  // name anywhere in this method.
  private isMapSupportedForMode(map: MapDef, modeId: ModeId): boolean {
    if (map.supportedModes !== undefined) {
      return map.supportedModes.includes(modeId);
    }
    const modeHasDedicatedMap = this.maps.some(
      (m) => m.supportedModes !== undefined && m.supportedModes.includes(modeId),
    );
    return !modeHasDedicatedMap;
  }

  // Grays out (and disables clicks on) every map button not valid for
  // modeId, then — if the currently selected map just became invalid —
  // falls back to the first map that IS valid, so the Start button can
  // never be pressed with an impossible mode/map pairing.
  private updateMapAvailability(modeId: ModeId): void {
    for (const map of this.maps) {
      const button = this.mapButtons.get(map.id);
      if (!button) continue;
      const supported = this.isMapSupportedForMode(map, modeId);
      button.style.opacity = supported ? "1" : "0.4";
      button.style.pointerEvents = supported ? "auto" : "none";
    }

    const currentMap = this.maps.find((map) => map.id === this.selectedMapId);
    if (currentMap && !this.isMapSupportedForMode(currentMap, modeId)) {
      const fallback = this.maps.find((map) => this.isMapSupportedForMode(map, modeId));
      if (fallback) this.selectMap(fallback.id);
    }
  }

  private selectWeapon(weaponId: string): void {
    this.selectedWeaponId = weaponId;
    this.applySelection(this.weaponButtons, weaponId);
  }

  private selectEnemy(enemyId: string): void {
    this.selectedEnemyId = enemyId;
    this.applySelection(this.enemyButtons, enemyId);
  }
}
