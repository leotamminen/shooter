import type { TerminalDef } from "../types";

const DEFAULT_PROMPT_LABEL = "PASSWORD LOCK";

function createDiv(styles: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, styles);
  return el;
}

function createButton(
  label: string,
  styles: Partial<CSSStyleDeclaration>,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  Object.assign(button.style, {
    cursor: "pointer",
    fontFamily: "monospace",
    padding: "6px 16px",
    border: "none",
    color: "#f0f0f0",
    ...styles,
  });
  button.addEventListener("click", onClick);
  return button;
}

// A small DOM overlay for entering a door's password (checkpoint 17) --
// same pointer-lock unlock/relock pattern as ui/Terminal.ts, deliberately
// smaller and simpler: one input, a submit button, an error line, and (for
// symmetry with Terminal's close x) a cancel button.
export class PasswordLock {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly inputEl: HTMLInputElement;
  private readonly errorEl: HTMLDivElement;
  private readonly onOpen: () => void;
  private readonly onClose: () => void;

  private terminalDef: TerminalDef | null = null;
  private onSuccess: (() => void) | null = null;

  constructor(onOpen: () => void, onClose: () => void) {
    this.onOpen = onOpen;
    this.onClose = onClose;

    // Checkpoint 18 bugfix: root is now a full-screen backdrop (mirrors
    // ui/MainMenu.ts's own root and ui/Terminal.ts's identical checkpoint-18
    // fix) -- without this, clicking anywhere outside the small centered
    // panel landed directly on the canvas underneath, and main.ts's canvas
    // click handler (playerController.controls.lock()) would re-lock
    // pointer and resume gameplay while this overlay was still visibly
    // open.
    this.root = createDiv({
      position: "fixed",
      inset: "0",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0, 0, 0, 0.5)",
      zIndex: "30",
      pointerEvents: "none",
    });

    const panel = createDiv({
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      background: "rgba(20, 14, 10, 0.95)",
      border: "2px solid #5c3a2a",
      borderRadius: "4px",
      padding: "20px 24px",
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#f0f0f0",
    });
    this.root.appendChild(panel);

    // Checkpoint 19 correction: stored as a field (was a local const) so
    // open() below can set its text per-open, since different locks
    // (Room 3's identity lock vs. Room 1's/the vault's) now show different
    // prompts.
    this.titleEl = createDiv({ fontWeight: "bold" });
    this.titleEl.textContent = DEFAULT_PROMPT_LABEL;
    panel.appendChild(this.titleEl);

    this.inputEl = document.createElement("input");
    this.inputEl.type = "password";
    Object.assign(this.inputEl.style, {
      fontFamily: "monospace",
      fontSize: "14px",
      background: "#1a140f",
      color: "#f0f0f0",
      border: "1px solid #5c3a2a",
      padding: "6px 8px",
      outline: "none",
    });
    // See ui/Terminal.ts's identical input keydown handler for why this
    // stops propagation -- belt-and-suspenders, not filling a real gap
    // (gameState.paused already blocks every other system's effects while
    // this overlay is open).
    this.inputEl.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") this.submit();
      else if (event.key === "Escape") this.close();
    });
    panel.appendChild(this.inputEl);

    this.errorEl = createDiv({ fontSize: "12px", color: "#d94040", minHeight: "16px" });
    panel.appendChild(this.errorEl);

    const buttonRow = createDiv({ display: "flex", gap: "10px" });
    buttonRow.appendChild(
      createButton("Submit", { background: "#3a6b3a" }, () => this.submit()),
    );
    buttonRow.appendChild(
      createButton("Cancel", { background: "#444" }, () => this.close()),
    );
    panel.appendChild(buttonRow);

    document.body.appendChild(this.root);

    window.addEventListener("keydown", (event) => {
      if (event.code === "Escape" && this.isOpen()) this.close();
    });
  }

  open(terminalDef: TerminalDef, onSuccess: () => void, promptLabel?: string): void {
    this.terminalDef = terminalDef;
    this.onSuccess = onSuccess;
    this.titleEl.textContent = promptLabel ?? DEFAULT_PROMPT_LABEL;
    this.errorEl.textContent = "";
    this.inputEl.value = "";
    this.root.style.display = "flex";
    this.root.style.pointerEvents = "auto";
    // Checkpoint 18 bugfix: see ui/Terminal.ts's identical open() fix for
    // the full explanation -- deferred to the next frame so the "E"
    // keypress that opened this overlay (via InteractSystem) doesn't also
    // land inside the just-focused input as a typed character. Guarded by
    // isOpen() in case the overlay was closed again before this frame's
    // callback fires.
    requestAnimationFrame(() => {
      if (this.isOpen()) this.inputEl.focus();
    });
    this.onOpen();
  }

  private submit(): void {
    if (!this.terminalDef) return;
    if (this.inputEl.value === this.terminalDef.password) {
      this.onSuccess?.();
      this.close();
    } else {
      this.errorEl.textContent = "Incorrect password";
    }
  }

  private close(): void {
    // Blur before hiding: without this, the (now-hidden) input keeps DOM
    // focus, and its keydown handler's unconditional stopPropagation() would
    // keep swallowing every subsequent WASD/R/E/1/2/etc. keystroke before it
    // ever reaches PlayerController/WeaponSystem/InteractSystem's own
    // window-level listeners -- found as a real bug in ui/Terminal.ts's
    // identical structure during that task's review, fixed there, and
    // applied here from the start rather than repeating the same review
    // cycle.
    this.inputEl.blur();
    this.root.style.display = "none";
    this.root.style.pointerEvents = "none";
    this.terminalDef = null;
    this.onSuccess = null;
    // Checkpoint 18 bugfix: see ui/Terminal.ts's identical close() fix --
    // deferred so blur()'s focus transition settles before the
    // pointer-relock attempt below (playerController.controls.lock() ->
    // requestPointerLock()), which otherwise raced when Escape (not a
    // click) triggered this same close() method. Guarded by !isOpen() in
    // case the overlay was reopened again before this frame's callback
    // fires.
    requestAnimationFrame(() => {
      if (!this.isOpen()) this.onClose();
    });
  }

  private isOpen(): boolean {
    return this.root.style.display !== "none";
  }
}
