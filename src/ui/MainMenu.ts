import type { Weapon, EnemyDef } from "../types";

// The menu's own notion of which modes exist — not content, since game
// modes are code (ZombieSurvival/ShootingRange), not typed data, per the
// project's mode-building rule. Mirrors the ModeName union that used to be
// hardcoded directly in main.ts before this checkpoint.
export type ModeId = "zombie" | "range";

export interface GameSelections {
  modeId: ModeId;
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

// A one-time DOM overlay shown before gameplay starts: mode/weapon/enemy
// selection plus a Start Game button. Kept separate from ui/HUD.ts — its
// lifecycle (shown once, then destroyed) is distinct from HUD's (shown
// continuously during gameplay), so folding it into HUD would mix two
// different concerns into one file.
//
// Deliberately one screen with three groups, not three sequential screens:
// with only two modes and one weapon/enemy currently in content/, a
// multi-screen wizard would be pure overhead. Revisit if the option lists
// grow long enough to need it.
export class MainMenu {
  private readonly root: HTMLDivElement;
  private readonly enemyGroup: HTMLDivElement;

  private selectedModeId: ModeId = MODE_OPTIONS[0].id;
  private selectedWeaponId: string;
  private selectedEnemyId: string;

  private readonly modeButtons = new Map<string, HTMLButtonElement>();
  private readonly weaponButtons = new Map<string, HTMLButtonElement>();
  private readonly enemyButtons = new Map<string, HTMLButtonElement>();

  constructor(
    weapons: Weapon[],
    enemies: EnemyDef[],
    onStart: (selections: GameSelections) => void,
  ) {
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

    const weaponOptions: SelectableOption[] = weapons.map((weapon) => ({
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

    const isRange = modeId === "range";
    this.enemyGroup.style.opacity = isRange ? "0.4" : "1";
    this.enemyGroup.style.pointerEvents = isRange ? "none" : "auto";
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
