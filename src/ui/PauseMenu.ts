import { NavigableMenu } from "./NavigableMenu";
import { ControlsSettingsMenu } from "./ControlsSettingsMenu";
import { TERMINAL_TEXT, TERMINAL_MENU_BACKGROUND } from "./terminalTheme";

function createDiv(styles: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, styles);
  return el;
}

// The previously-deferred "real mid-session Main Menu" piece -- a genuine
// pause overlay, styled to match ui/MainMenu.ts's terminal aesthetic, shown
// whenever main.ts's per-frame setVisible(true) call decides gameplay is
// currently paused (Escape/pointer-lock-loss, window blur, or the mouse
// leaving the canvas) while alive and no other UI overlay (terminal/
// password lock) is already open -- main.ts owns that decision entirely;
// this class only ever shows or hides in response to setVisible(), it has
// no GameState/RaycastRegistry/etc. dependency of its own, matching the
// same injected-callback composition-root pattern ui/Terminal.ts and
// ui/PasswordLock.ts already use.
//
// "Controls & Settings" reuses ui/ControlsSettingsMenu.ts with maps
// omitted entirely (not grayed out) -- there is no Mode/Map picker to
// accidentally click mid-session, only the read-only controls reference.
//
// "Main Menu" is the one item whose callback is expected to call
// window.location.reload() (wired by main.ts, not hardcoded here) -- a
// full reload was chosen over a manual teardown of RaycastRegistry/
// MapEntitySystem/every viewmodel/HUD/etc., since reconstructing all of
// that safely in place is a much larger, riskier undertaking than a brief
// visible reload flash. See CLAUDE.md's decisions log for the full
// reasoning; this class has no opinion about it either way, it just calls
// whatever onMainMenu callback it was given.
export class PauseMenu {
  private readonly root: HTMLDivElement;
  private readonly topLevelView: HTMLDivElement;
  private readonly controlsSettingsMenu: ControlsSettingsMenu;
  private readonly topLevelMenu: NavigableMenu;
  private visible = false;

  constructor(onResume: () => void, onMainMenu: () => void) {
    this.root = createDiv({
      position: "fixed",
      inset: "0",
      display: "none",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "24px",
      background: TERMINAL_MENU_BACKGROUND,
      pointerEvents: "auto",
      zIndex: "25",
      fontFamily: "monospace",
      color: TERMINAL_TEXT,
    });

    this.topLevelView = createDiv({
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "24px",
    });
    this.root.appendChild(this.topLevelView);

    const heading = createDiv({ fontSize: "26px", fontWeight: "bold", letterSpacing: "0.1em" });
    heading.textContent = "PAUSED";
    this.topLevelView.appendChild(heading);

    this.topLevelMenu = new NavigableMenu(
      [
        { label: "Resume", onActivate: onResume },
        { label: "Controls & Settings", onActivate: () => this.showControlsSettings() },
        { label: "Main Menu", onActivate: onMainMenu },
      ],
      onResume, // Escape while paused resumes, the same toggle convention Terminal.ts/PasswordLock.ts's own Escape-to-close already established.
    );
    this.topLevelView.appendChild(this.topLevelMenu.element);

    // maps omitted (null) and no onLaunch -- see this class's own doc
    // comment above for why nothing here can start a new run by accident.
    this.controlsSettingsMenu = new ControlsSettingsMenu(null, () => this.showTopLevel());
    this.controlsSettingsMenu.hide();
    this.root.appendChild(this.controlsSettingsMenu.element);

    document.body.appendChild(this.root);
  }

  // Called every frame from main.ts's animate() with the single already-
  // computed boolean (paused && alive && no other overlay open) -- cheap
  // and idempotent, only touches the DOM when the visibility actually
  // changes. Always resets back to the top-level PAUSED view on the
  // transition into visible, so reopening never leaves the player stranded
  // inside Controls & Settings from a previous pause.
  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    if (visible) {
      this.showTopLevel();
      this.root.style.display = "flex";
    } else {
      this.topLevelMenu.detach();
      this.controlsSettingsMenu.hide();
      this.root.style.display = "none";
    }
  }

  private showTopLevel(): void {
    this.controlsSettingsMenu.hide();
    this.topLevelView.style.display = "flex";
    this.topLevelMenu.attach();
  }

  private showControlsSettings(): void {
    this.topLevelView.style.display = "none";
    this.topLevelMenu.detach();
    this.controlsSettingsMenu.show();
  }
}
