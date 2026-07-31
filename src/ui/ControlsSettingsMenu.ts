import type { MapDef } from "../types";
import { NavigableMenu, type NavigableMenuItem } from "./NavigableMenu";
import { MODE_OPTIONS, type ModeId, type GameSelections } from "./gameSelections";
import { TERMINAL_TEXT, TERMINAL_DIM_TEXT, TERMINAL_BORDER } from "./terminalTheme";

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

function createControlLine(key: string, action: string): HTMLDivElement {
  const line = createDiv({ display: "flex", gap: "16px" });
  const keyEl = createDiv({ minWidth: "140px", fontWeight: "bold" });
  keyEl.textContent = key;
  const actionEl = createDiv({});
  actionEl.textContent = action;
  line.appendChild(keyEl);
  line.appendChild(actionEl);
  return line;
}

// Menu-fixes follow-up: pulled directly from what core/PlayerController.ts,
// core/WeaponSystem.ts, and core/InteractSystem.ts actually bind (KeyW/A/S/D,
// mousedown button 0, KeyR, KeyV, KeyE, Digit1-9 + wheel), re-confirmed via
// the same grep this file's original controls reference was checked
// against, not just reformatted blind. Escape has no dedicated listener of
// its own anywhere in this codebase -- it's the browser's native
// Pointer-Lock-exit behavior (which the pause-menu follow-up's
// pointerlockchange listener reacts to) while playing, and each modal
// overlay's (Terminal/PasswordLock/NavigableMenu-hosted screens) own
// explicit close/back handling while one is open -- "Pause game / close
// menu" describes both correctly without overclaiming a single handler.
const GENERAL_CONTROLS: [string, string][] = [
  ["ESC", "Pause game / close menu"],
  ["WASD", "move"],
  ["Mouse", "look"],
  ["E", "interact"],
];

const COMBAT_CONTROLS: [string, string][] = [
  ["Left Click", "fire"],
  ["R", "reload"],
  ["V", "melee"],
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

  // Menu-fixes follow-up: collapsed by default, and reset to collapsed
  // every time show() runs -- this screen deliberately never remembers
  // being expanded from a previous visit (see show() below).
  private expanded = false;
  private modeSummaryEl: HTMLDivElement | null = null;
  private mapSummaryEl: HTMLDivElement | null = null;
  private modeGroupEl: HTMLDivElement | null = null;
  private mapGroupEl: HTMLDivElement | null = null;
  private toggleItemIndex = -1;

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
    for (const [key, action] of GENERAL_CONTROLS) {
      referenceBlock.appendChild(createControlLine(key, action));
    }
    // Menu-fixes follow-up: "Combat:" reads as a sub-heading the same way
    // "ADVANCED" already does relative to the main "CONTROLS & SETTINGS"
    // heading -- smaller/dimmer than the surrounding text, with a small gap
    // above it separating it from the general controls group.
    const combatHeading = createDiv({
      fontSize: "12px",
      color: TERMINAL_DIM_TEXT,
      letterSpacing: "0.08em",
      marginTop: "6px",
    });
    combatHeading.textContent = "Combat:";
    referenceBlock.appendChild(combatHeading);
    for (const [key, action] of COMBAT_CONTROLS) {
      referenceBlock.appendChild(createControlLine(key, action));
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

      // Menu-fixes follow-up: collapsed-state summary lines, shown instead
      // of the full button rows by default -- see updateExpandedVisibility()
      // for how the two are swapped.
      this.modeSummaryEl = createDiv({ textAlign: "center" });
      advanced.appendChild(this.modeSummaryEl);

      this.modeGroupEl = this.buildGroup(
        "Mode",
        MODE_OPTIONS,
        this.selectedModeId,
        this.modeButtons,
        (id) => this.selectMode(id as ModeId),
      );
      advanced.appendChild(this.modeGroupEl);

      this.mapSummaryEl = createDiv({ textAlign: "center" });
      advanced.appendChild(this.mapSummaryEl);

      const mapOptions: SelectableOption[] = maps.map((map) => ({ id: map.id, label: map.name }));
      this.mapGroupEl = this.buildGroup(
        "Map",
        mapOptions,
        this.selectedMapId,
        this.mapButtons,
        (id) => this.selectMap(id),
      );
      advanced.appendChild(this.mapGroupEl);

      this.updateMapAvailability(this.selectedModeId);
      this.updateSummaries();
      this.element.appendChild(advanced);

      // The collapse toggle is just another navigable item, per this
      // task's own instruction -- arrow keys/mouse both reach it exactly
      // like Launch/Back, no separate interaction model.
      this.toggleItemIndex = navigableItems.length;
      navigableItems.push({ label: "▸ more options", onActivate: () => this.toggleExpanded() });

      navigableItems.push({
        label: "Launch",
        onActivate: () => onLaunch({ modeId: this.selectedModeId, mapId: this.selectedMapId }),
      });
    }

    navigableItems.push({ label: "Back", onActivate: onBack });
    this.navigableMenu = new NavigableMenu(navigableItems, onBack);
    this.element.appendChild(this.navigableMenu.element);

    if (this.toggleItemIndex >= 0) this.updateExpandedVisibility();
  }

  show(): void {
    // Menu-fixes follow-up: always resets back to collapsed, never
    // remembers a previous visit's expanded state.
    if (this.toggleItemIndex >= 0 && this.expanded) {
      this.expanded = false;
      this.updateExpandedVisibility();
    }
    this.element.style.display = "flex";
    this.navigableMenu.attach();
  }

  hide(): void {
    this.element.style.display = "none";
    this.navigableMenu.detach();
  }

  private toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.updateExpandedVisibility();
  }

  private updateExpandedVisibility(): void {
    if (this.modeSummaryEl) this.modeSummaryEl.style.display = this.expanded ? "none" : "block";
    if (this.mapSummaryEl) this.mapSummaryEl.style.display = this.expanded ? "none" : "block";
    if (this.modeGroupEl) this.modeGroupEl.style.display = this.expanded ? "flex" : "none";
    if (this.mapGroupEl) this.mapGroupEl.style.display = this.expanded ? "flex" : "none";
    if (this.toggleItemIndex >= 0) {
      this.navigableMenu.setItemLabel(
        this.toggleItemIndex,
        this.expanded ? "▾ fewer options" : "▸ more options",
      );
    }
  }

  private updateSummaries(): void {
    if (this.modeSummaryEl) {
      const mode = MODE_OPTIONS.find((option) => option.id === this.selectedModeId);
      this.modeSummaryEl.textContent = `Mode: ${mode?.label ?? this.selectedModeId}`;
    }
    if (this.mapSummaryEl) {
      const map = (this.maps ?? []).find((m) => m.id === this.selectedMapId);
      this.mapSummaryEl.textContent = `Map: ${map?.name ?? this.selectedMapId}`;
    }
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
    this.updateSummaries();
  }

  private selectMap(mapId: string): void {
    this.selectedMapId = mapId;
    this.applySelection(this.mapButtons, mapId);
    this.updateSummaries();
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
