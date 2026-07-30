import { TERMINAL_TEXT } from "./terminalTheme";

export interface NavigableMenuItem {
  label: string;
  onActivate: () => void;
}

// A vertical list of activatable items, styled `> Label <` when highlighted
// and plain text otherwise -- the one interaction pattern every screen in
// the terminal-style menu redesign (MainMenu/ControlsSettingsMenu/
// CreditsScreen/PauseMenu) is built around, extracted here once rather than
// reimplemented in each of those four files. ArrowUp/ArrowDown cycle the
// highlighted item, Enter activates it; mouse hover highlights the item
// under the cursor via the same setHighlighted() call arrow keys use, and
// click activates it -- both input methods stay interchangeable by
// construction, not by keeping two separate pieces of state in sync.
//
// Deliberately NOT used for the relocated Mode/Map picker inside
// ControlsSettingsMenu -- that's a pick-one-of-several-and-keep-it-selected
// control (the same clickable button-group MainMenu.ts already had),
// not a navigate-and-activate list, and the task's own instruction was to
// move it "restyled to match", not to redesign its interaction model.
export class NavigableMenu {
  readonly element: HTMLDivElement;
  private readonly itemEls: HTMLDivElement[] = [];
  private readonly items: NavigableMenuItem[];
  private readonly onEscape?: () => void;
  private highlightedIndex = 0;
  private attached = false;

  constructor(items: NavigableMenuItem[], onEscape?: () => void) {
    this.items = items;
    this.onEscape = onEscape;

    this.element = document.createElement("div");
    Object.assign(this.element.style, {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "4px",
      fontFamily: "monospace",
      color: TERMINAL_TEXT,
    });

    items.forEach((item, index) => {
      const el = document.createElement("div");
      Object.assign(el.style, {
        cursor: "pointer",
        padding: "4px 8px",
        whiteSpace: "pre",
        fontSize: "15px",
      });
      el.addEventListener("mouseenter", () => this.setHighlighted(index));
      el.addEventListener("click", () => item.onActivate());
      this.element.appendChild(el);
      this.itemEls.push(el);
    });

    this.render();
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.setHighlighted((this.highlightedIndex + 1) % this.items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.setHighlighted((this.highlightedIndex - 1 + this.items.length) % this.items.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      this.items[this.highlightedIndex].onActivate();
    } else if (event.key === "Escape" && this.onEscape) {
      event.preventDefault();
      this.onEscape();
    }
  };

  private render(): void {
    this.items.forEach((item, index) => {
      const el = this.itemEls[index];
      const highlighted = index === this.highlightedIndex;
      el.textContent = highlighted ? `> ${item.label} <` : `  ${item.label}  `;
      el.style.opacity = highlighted ? "1" : "0.7";
    });
  }

  private setHighlighted(index: number): void {
    this.highlightedIndex = index;
    this.render();
  }

  // Re-attaches its own window-level keydown listener and resets the
  // highlight back to the first item -- called every time a screen becomes
  // visible, so reopening (e.g. Controls & Settings a second time) always
  // starts highlighted on the same first item rather than wherever it was
  // left. Idempotent: attaching twice in a row without an intervening
  // detach() is a no-op, the same guard MeleeSequencer.trigger() already
  // uses for its own re-entrancy concern.
  attach(): void {
    this.highlightedIndex = 0;
    this.render();
    if (this.attached) return;
    this.attached = true;
    window.addEventListener("keydown", this.handleKeyDown);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener("keydown", this.handleKeyDown);
  }
}
