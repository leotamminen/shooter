import type { MapDef } from "../types";
import { NavigableMenu } from "./NavigableMenu";
import { ControlsSettingsMenu } from "./ControlsSettingsMenu";
import { CreditsScreen } from "./CreditsScreen";
import type { GameSelections } from "./gameSelections";
import { TERMINAL_TEXT, TERMINAL_DIM_TEXT, TERMINAL_MENU_BACKGROUND } from "./terminalTheme";

export type { GameSelections, ModeId } from "./gameSelections";

// Bumped by hand for real milestones -- the auto-incrementing "-f{N}" build
// suffix (total git commit count, see vite.config.ts/src/vite-env.d.ts) is
// the only automatic part of the version string below.
const GAME_VERSION = "1.0";

function createDiv(styles: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, styles);
  return el;
}

// Terminal-style redesign: a one-time DOM overlay shown before gameplay
// starts, restyled to match ui/Terminal.ts's own green-on-black look
// (see ui/terminalTheme.ts) instead of the original blue/gray scheme.
// Top level is now three fixed items -- Start Game / Controls & Settings /
// Credits -- not the old single-screen Mode/Map/Weapon/Enemy picker: with
// no mode-unlock/progression system yet, Campaign is the primary
// experience, so "Start Game" launches it directly with zero intermediate
// selection. Zombie Survival/Shooting Range (and manual map choice) remain
// reachable, just relocated into Controls & Settings' de-emphasized
// "Advanced" section (see ui/ControlsSettingsMenu.ts) rather than being
// part of the primary flow. Weapon/Enemy selection is gone entirely, not
// relocated -- see CLAUDE.md's decisions log for why removing it is a real
// simplification, not a loss of functionality.
//
// Kept separate from ui/HUD.ts — its lifecycle (shown once, then
// destroyed) is distinct from HUD's (shown continuously during gameplay).
export class MainMenu {
  private readonly root: HTMLDivElement;
  private readonly topLevelView: HTMLDivElement;
  private readonly controlsSettingsMenu: ControlsSettingsMenu;
  private readonly creditsScreen: CreditsScreen;
  private readonly topLevelMenu: NavigableMenu;

  constructor(maps: MapDef[], onStart: (selections: GameSelections) => void) {
    this.root = createDiv({
      position: "fixed",
      inset: "0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "28px",
      background: TERMINAL_MENU_BACKGROUND,
      pointerEvents: "auto",
      zIndex: "20",
      fontFamily: "monospace",
      color: TERMINAL_TEXT,
    });

    const heading = createDiv({ fontSize: "32px", fontWeight: "bold", letterSpacing: "0.1em" });
    heading.textContent = `NIGHTFALL v${GAME_VERSION}-f${__BUILD_NUMBER__}`;
    this.root.appendChild(heading);

    // A small fake-prompt flourish -- tasteful, not a full fake shell, per
    // this task's own explicit caution. Purely decorative, no real input.
    const prompt = createDiv({ fontSize: "13px", color: TERMINAL_DIM_TEXT });
    prompt.textContent = "guest@nightfall:~$ ./launch";
    this.root.appendChild(prompt);

    this.topLevelView = createDiv({
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "28px",
    });
    this.root.appendChild(this.topLevelView);

    // "Start Game" resolves the one map that opts into Campaign (see
    // content/maps.ts's supportedModes) rather than hardcoding its id --
    // the same "don't hardcode a second copy of a lookup that already
    // exists" reasoning modes/Campaign.ts's own construction already
    // follows for findById(ENEMIES, "zombie").
    const campaignMap = maps.find((map) => map.supportedModes?.includes("campaign"));
    if (!campaignMap) {
      throw new Error('MainMenu: no map declares supportedModes including "campaign"');
    }

    this.topLevelMenu = new NavigableMenu([
      { label: "Start Game", onActivate: () => onStart({ modeId: "campaign", mapId: campaignMap.id }) },
      { label: "Controls & Settings", onActivate: () => this.showControlsSettings() },
      { label: "Credits", onActivate: () => this.showCredits() },
    ]);
    this.topLevelView.appendChild(this.topLevelMenu.element);

    this.controlsSettingsMenu = new ControlsSettingsMenu(
      maps,
      () => this.showTopLevel(),
      onStart,
    );
    this.controlsSettingsMenu.hide();
    this.root.appendChild(this.controlsSettingsMenu.element);

    this.creditsScreen = new CreditsScreen(() => this.showTopLevel());
    this.creditsScreen.hide();
    this.root.appendChild(this.creditsScreen.element);

    this.topLevelMenu.attach();

    document.body.appendChild(this.root);
  }

  private showTopLevel(): void {
    this.controlsSettingsMenu.hide();
    this.creditsScreen.hide();
    this.topLevelView.style.display = "flex";
    this.topLevelMenu.attach();
  }

  private showControlsSettings(): void {
    this.topLevelView.style.display = "none";
    this.topLevelMenu.detach();
    this.controlsSettingsMenu.show();
  }

  private showCredits(): void {
    this.topLevelView.style.display = "none";
    this.topLevelMenu.detach();
    this.creditsScreen.show();
  }

  destroy(): void {
    this.root.remove();
  }
}
