import { TERMINAL_TEXT } from "./terminalTheme";

function createDiv(styles: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, styles);
  return el;
}

// Menu-fixes follow-up (not yet assigned a checkpoint number): the very
// first "gameState.paused starts true" moment, before the player has ever
// locked pointer this session, needs to read as "click to start playing",
// not as a genuine mid-run pause -- ui/PauseMenu.ts's full Resume/Controls &
// Settings/Main Menu overlay is the wrong thing to show for a run the
// player hasn't actually begun yet. This is deliberately much smaller than
// that: no background covering the 3D scene underneath (pointerEvents:
// "none" so the click that's supposed to start play falls straight through
// to the canvas's own existing click -> controls.lock() handler), just a
// short centered hint. main.ts decides which of the two overlays (this one
// or PauseMenu) is appropriate each frame via a single hasEverLocked flag
// -- this class has no opinion about that, it only ever shows or hides in
// response to setVisible().
export class ClickToPlayPrompt {
  private readonly root: HTMLDivElement;

  constructor() {
    this.root = createDiv({
      position: "fixed",
      inset: "0",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
      zIndex: "24",
      fontFamily: "monospace",
    });

    const pill = createDiv({
      background: "rgba(0, 0, 0, 0.55)",
      border: "1px solid #2a5c2a",
      borderRadius: "4px",
      padding: "10px 20px",
      color: TERMINAL_TEXT,
      fontSize: "16px",
      letterSpacing: "0.05em",
    });
    pill.textContent = "Click to play";
    this.root.appendChild(pill);

    document.body.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "flex" : "none";
  }
}
