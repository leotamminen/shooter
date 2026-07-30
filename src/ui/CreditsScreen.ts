import { NavigableMenu } from "./NavigableMenu";
import { TERMINAL_TEXT, TERMINAL_DIM_TEXT } from "./terminalTheme";

function createDiv(styles: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, styles);
  return el;
}

// A simple static screen -- game name, a short placeholder credits line,
// a Back option. Exact wording is a placeholder, easy to edit later; not
// meant to be a real credits roll.
export class CreditsScreen {
  readonly element: HTMLDivElement;
  private readonly navigableMenu: NavigableMenu;

  constructor(onBack: () => void) {
    this.element = createDiv({
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "20px",
      fontFamily: "monospace",
      color: TERMINAL_TEXT,
    });

    const heading = createDiv({ fontSize: "20px", fontWeight: "bold", letterSpacing: "0.08em" });
    heading.textContent = "CREDITS";
    this.element.appendChild(heading);

    const gameName = createDiv({ fontSize: "16px", fontWeight: "bold" });
    gameName.textContent = "NIGHTFALL";
    this.element.appendChild(gameName);

    const line = createDiv({ fontSize: "13px", color: TERMINAL_DIM_TEXT });
    line.textContent = "Made by one person, mostly at night. Thanks for playing.";
    this.element.appendChild(line);

    this.navigableMenu = new NavigableMenu([{ label: "Back", onActivate: onBack }], onBack);
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
}
