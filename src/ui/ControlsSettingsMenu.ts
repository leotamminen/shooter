import type { MapDef } from "../types";
import { NavigableMenu, type NavigableMenuItem } from "./NavigableMenu";
import { MODE_OPTIONS, type ModeId, type GameSelections } from "./gameSelections";
import { TERMINAL_TEXT, TERMINAL_BORDER } from "./terminalTheme";

interface SelectableOption {
  id: string;
  label: string;
}

// Restyled green-on-black version of ui/MainMenu.ts's original blue button
// styling -- the selection *logic* below (buildGroup/applySelection/
// selectMode/selectMap/isMapSupportedForMode/updateMapAvailability) is
// ported verbatim from the pre-redesign MainMenu.ts, unchanged, per this
// task's own "reusing the exact existing selection logic/data ... just
// moved here and restyled to match" instruction. Deliberately still plain
// clickable buttons, not part of NavigableMenu's arrow-key list -- this is
// a pick-one-of-several-and-keep-it-selected control, not a
// navigate-and-activate one, and restyling isn't the same task as
// redesigning its interaction model.
const SELECTED_BORDER = "#7CFC7C";
const UNSELECTED_BORDER = "#2a5c2a";
const SELECTED_BACKGROUND = "#1c3a1c";
const UNSELECTED_BACKGROUND = "#0a140a";

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
    fontSize: "13px",
    padding: "6px 14px",
    border: `2px solid ${UNSELECTED_BORDER}`,
    borderRadius: "4px",
    background: UNSELECTED_BACKGROUND,
    color: TERMINAL_TEXT,
  });
  button.addEventListener("click", onClick);
  return button;
}

// Pulled directly from what core/PlayerController.ts, core/WeaponSystem.ts,
// and core/InteractSystem.ts actually bind (KeyW/A/S/D, mousedown button 0,
// KeyR, KeyV, KeyE, Digit1-9 + wheel) rather than guessed -- see CLAUDE.md's
// decisions log for the exact grep this was checked against.
const CONTROLS_REFERENCE: [string, string][] = [
  ["WASD", "move"],
  ["Mouse", "look"],
  ["Left Click", "fire"],
  ["R", "reload"],
  ["V", "melee"],
  ["E", "interact"],
  ["1-9 / Scroll", "switch weapon"],
];

// Shared by both ui/MainMenu.ts (maps provided, onLaunch present -- picking
// Zombie Survival/Shooting Range and launching them directly) and
// ui/PauseMenu.ts (maps omitted entirely -- a read-only controls reference
// only, mid-session, so it can never "silently start a new run by
// accident").
export class ControlsSettingsMenu {
  readonly element: HTMLDivElement;
  private readonly maps: MapDef[] | null;
  private readonly navigableMenu: NavigableMenu;
  private readonly modeButtons = new Map<string, HTMLButtonElement>();
  private readonly mapButtons = new Map<string, HTMLButtonElement>();
  private selectedModeId: ModeId = MODE_OPTIONS[0].id;
  private selectedMapId: string;

  constructor(
    maps: MapDef[] | null,
    onBack: () => void,
    onLaunch?: (selections: GameSelections) => void,
  ) {
    this.maps = maps;
    this.selectedMapId = maps && maps.length > 0 ? maps[0].id : "";

    this.element = createDiv({
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "18px",
      fontFamily: "monospace",
      color: TERMINAL_TEXT,
    });

    const heading = createDiv({ fontSize: "20px", fontWeight: "bold", letterSpacing: "0.08em" });
    heading.textContent = "CONTROLS & SETTINGS";
    this.element.appendChild(heading);

    const referenceBlock = createDiv({
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      fontSize: "14px",
    });
    for (const [key, action] of CONTROLS_REFERENCE) {
      const line = createDiv({ display: "flex", gap: "16px" });
      const keyEl = createDiv({ minWidth: "140px", fontWeight: "bold" });
      keyEl.textContent = key;
      const actionEl = createDiv({});
      actionEl.textContent = action;
      line.appendChild(keyEl);
      line.appendChild(actionEl);
      referenceBlock.appendChild(line);
    }
    this.element.appendChild(referenceBlock);

    const navigableItems: NavigableMenuItem[] = [];

    // Only rendered in the main-menu context (maps + onLaunch both present)
    // -- omitted entirely in the pause-menu context, per this task's own
    // "don't let it silently start a new run by accident" instruction:
    // there's nothing here to accidentally click mid-session because
    // nothing here exists mid-session.
    if (maps && maps.length > 0 && onLaunch) {
      const advanced = createDiv({
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "10px",
        opacity: "0.75",
        fontSize: "12px",
        borderTop: `1px solid ${TERMINAL_BORDER}`,
        paddingTop: "14px",
        marginTop: "2px",
        width: "100%",
      });
      const advancedHeading = createDiv({ letterSpacing: "0.1em", textAlign: "center" });
      advancedHeading.textContent = "ADVANCED";
      advanced.appendChild(advancedHeading);

      const modeGroup = this.buildGroup(
        "Mode",
        MODE_OPTIONS,
        this.selectedModeId,
        this.modeButtons,
        (id) => this.selectMode(id as ModeId),
      );
      advanced.appendChild(modeGroup);

      const mapOptions: SelectableOption[] = maps.map((map) => ({ id: map.id, label: map.name }));
      const mapGroup = this.buildGroup(
        "Map",
        mapOptions,
        this.selectedMapId,
        this.mapButtons,
        (id) => this.selectMap(id),
      );
      advanced.appendChild(mapGroup);

      this.updateMapAvailability(this.selectedModeId);
      this.element.appendChild(advanced);

      navigableItems.push({
        label: "Launch",
        onActivate: () => onLaunch({ modeId: this.selectedModeId, mapId: this.selectedMapId }),
      });
    }

    navigableItems.push({ label: "Back", onActivate: onBack });
    this.navigableMenu = new NavigableMenu(navigableItems, onBack);
    this.element.appendChild(this.navigableMenu.element);
  }

  show(): void {
    this.element.style.display = "flex";
    this.navigableMenu.attach();
  }

  hide(): void {
    this.element.style.display = "none";
    this.navigableMenu.detach();
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
      gap: "6px",
    });

    const heading = createDiv({ opacity: "0.8", letterSpacing: "0.05em" });
    heading.textContent = title;
    group.appendChild(heading);

    const row = createDiv({ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" });
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
    this.updateMapAvailability(modeId);
  }

  private selectMap(mapId: string): void {
    this.selectedMapId = mapId;
    this.applySelection(this.mapButtons, mapId);
  }

  // Ported unchanged from the pre-redesign ui/MainMenu.ts (checkpoint-18
  // fix) -- a map with no supportedModes is treated as mode-agnostic only
  // when no OTHER map has already explicitly opted into that mode via its
  // own supportedModes.
  private isMapSupportedForMode(map: MapDef, modeId: ModeId): boolean {
    if (map.supportedModes !== undefined) {
      return map.supportedModes.includes(modeId);
    }
    const modeHasDedicatedMap = (this.maps ?? []).some(
      (m) => m.supportedModes !== undefined && m.supportedModes.includes(modeId),
    );
    return !modeHasDedicatedMap;
  }

  private updateMapAvailability(modeId: ModeId): void {
    for (const map of this.maps ?? []) {
      const button = this.mapButtons.get(map.id);
      if (!button) continue;
      const supported = this.isMapSupportedForMode(map, modeId);
      button.style.opacity = supported ? "1" : "0.4";
      button.style.pointerEvents = supported ? "auto" : "none";
    }

    const currentMap = (this.maps ?? []).find((map) => map.id === this.selectedMapId);
    if (currentMap && !this.isMapSupportedForMode(currentMap, modeId)) {
      const fallback = (this.maps ?? []).find((map) => this.isMapSupportedForMode(map, modeId));
      if (fallback) this.selectMap(fallback.id);
    }
  }
}
