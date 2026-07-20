import type { TerminalDef, TerminalDirectory } from "../types";

function createDiv(styles: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, styles);
  return el;
}

// A DOM overlay for the checkpoint-17 hacking-terminal minigame: a tiny
// fake filesystem (TerminalDef.root) navigable with ls/cd/cat, the same
// plain-HTML/inline-style technique as ui/HUD.ts/ui/MainMenu.ts. Kept
// separate from both: its lifecycle (opened/closed repeatedly during
// gameplay, holding transient per-open state) matches neither HUD's
// "constructed once, updated every frame" shape nor MainMenu's "constructed
// once, destroyed on Start" shape.
//
// Opening it releases pointer lock (the same PlayerState.onDeath ->
// controls.unlock() callback pattern used elsewhere in this codebase) so
// the browser cursor is usable to type and click; closing it re-locks.
//
// Checkpoint 19 correction: main.ts now constructs a single shared
// instance of this class again (checkpoint 19 briefly constructed two, to
// give room2_terminal an onCommand callback -- that callback and its sole
// use case are both gone, so the second instance's only reason to exist
// went with it).
export class Terminal {
  private readonly root: HTMLDivElement;
  private readonly outputEl: HTMLDivElement;
  private readonly inputEl: HTMLInputElement;
  private readonly onOpen: () => void;
  private readonly onClose: () => void;
  private readonly getVaultPin: () => string;
  // Checkpoint 19 correction: command-permission data injected as
  // constructor parameters (content/terminalCommands.ts's exports),
  // rather than imported directly here -- matching this project's
  // established ui/MainMenu.ts precedent of never importing content/
  // directly, keeping every ui/ file a pure presentation layer over data
  // it's handed by main.ts (the composition root).
  private readonly blockedCommands: string[];
  private readonly restrictedCommands: string[];
  private readonly coreCommands: { name: string; description: string }[];

  private terminalDef: TerminalDef | null = null;
  private pathStack: TerminalDirectory[] = [];

  constructor(
    onOpen: () => void,
    onClose: () => void,
    getVaultPin: () => string,
    blockedCommands: string[],
    restrictedCommands: string[],
    coreCommands: { name: string; description: string }[],
  ) {
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.getVaultPin = getVaultPin;
    this.blockedCommands = blockedCommands;
    this.restrictedCommands = restrictedCommands;
    this.coreCommands = coreCommands;

    // Checkpoint 18 bugfix: root is now a full-screen backdrop (mirrors
    // ui/MainMenu.ts's own root), not just the small visible panel --
    // without this, clicking anywhere outside the small centered panel
    // landed directly on the canvas underneath, and main.ts's canvas click
    // handler (playerController.controls.lock()) would re-lock pointer and
    // resume gameplay while this overlay was still visibly open. The
    // backdrop captures every click while open (pointerEvents toggled the
    // same way the old root's was), so the canvas never sees it.
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
      width: "520px",
      height: "360px",
      display: "flex",
      flexDirection: "column",
      background: "rgba(10, 14, 10, 0.95)",
      border: "2px solid #2a5c2a",
      borderRadius: "4px",
      padding: "16px",
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#7CFC7C",
    });
    this.root.appendChild(panel);

    const titleBar = createDiv({
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "8px",
    });
    const title = createDiv({ fontWeight: "bold" });
    title.textContent = "TERMINAL";
    const closeButton = document.createElement("button");
    closeButton.textContent = "×";
    Object.assign(closeButton.style, {
      cursor: "pointer",
      background: "transparent",
      border: "none",
      color: "#7CFC7C",
      fontSize: "18px",
    });
    closeButton.addEventListener("click", () => this.close());
    titleBar.appendChild(title);
    titleBar.appendChild(closeButton);
    panel.appendChild(titleBar);

    this.outputEl = createDiv({
      flex: "1",
      overflowY: "auto",
      marginBottom: "8px",
    });
    panel.appendChild(this.outputEl);

    this.inputEl = document.createElement("input");
    Object.assign(this.inputEl.style, {
      fontFamily: "monospace",
      fontSize: "13px",
      background: "#0a140a",
      color: "#7CFC7C",
      border: "1px solid #2a5c2a",
      padding: "6px 8px",
      outline: "none",
    });
    // Stop every keystroke made while typing here from also reaching
    // PlayerController/WeaponSystem/InteractSystem's own window-level
    // keydown listeners (e.g. typing "r" in a command should never trigger
    // a reload). Belt-and-suspenders: gameState.paused already gates all of
    // those systems' actual effects while pointer lock is released (see
    // this.onOpen() below), so this isn't filling a real gap, just avoiding
    // needless event processing elsewhere while the input has focus.
    this.inputEl.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        this.runCommand(this.inputEl.value);
        this.inputEl.value = "";
      } else if (event.key === "Escape") {
        this.close();
      }
    });
    panel.appendChild(this.inputEl);

    document.body.appendChild(this.root);

    // Covers Escape presses while the input doesn't have focus (e.g. right
    // after clicking a Copy button) -- the input's own handler above covers
    // the common case where it does.
    window.addEventListener("keydown", (event) => {
      if (event.code === "Escape" && this.isOpen()) this.close();
    });
  }

  open(terminalDef: TerminalDef): void {
    this.terminalDef = terminalDef;
    this.pathStack = [terminalDef.root];
    this.outputEl.textContent = "";
    this.appendLine(terminalDef.connectMessage ?? "Connected. Type 'ls' to begin.");
    this.root.style.display = "flex";
    this.root.style.pointerEvents = "auto";
    this.inputEl.value = "";
    // Checkpoint 18 bugfix: deferred to the next frame, not called
    // synchronously here. This overlay is opened from inside the same "E"
    // keydown event InteractSystem processes to trigger onInteract() --
    // focusing the input synchronously within that same event let the
    // browser's default "insert this character" action for that same
    // physical keypress land on the newly-focused input (focus changed
    // mid-event-processing for the same key), so the literal "e" was
    // appearing in the input the instant it opened. Deferring past the
    // current event's processing avoids that. Guarded by isOpen() in case
    // the overlay was closed again before this frame's callback fires
    // (e.g. a very fast E-then-Escape).
    requestAnimationFrame(() => {
      if (this.isOpen()) this.inputEl.focus();
    });
    this.onOpen();
  }

  private close(): void {
    this.inputEl.blur();
    this.root.style.display = "none";
    this.root.style.pointerEvents = "none";
    this.terminalDef = null;
    // Checkpoint 18 bugfix: deferred to the next frame. Closing via the x
    // button already worked correctly (a mouse click blurs the input and
    // shifts focus to the button natively, before our own click handler
    // even runs, so by the time this method's own blur()/onClose() run,
    // that focus transition has long settled) -- but closing via Escape did
    // not: this.inputEl.blur() above and the onClose() ->
    // playerController.controls.lock() -> requestPointerLock() chain were
    // both happening back-to-back in the very same synchronous turn as the
    // Escape keydown itself, with no time for the blur's focus transition
    // to settle before the relock attempt. Deferring onClose() by one frame
    // gives that transition time to complete first, regardless of which
    // path triggered the close. Guarded by !isOpen() in case the overlay
    // was reopened again before this frame's callback fires.
    requestAnimationFrame(() => {
      if (!this.isOpen()) this.onClose();
    });
  }

  private isOpen(): boolean {
    return this.root.style.display !== "none";
  }

  private get currentDir(): TerminalDirectory {
    return this.pathStack[this.pathStack.length - 1];
  }

  private runCommand(rawInput: string): void {
    const input = rawInput.trim();
    if (input.length === 0) return;
    this.appendLine(`> ${input}`);

    // Room-3 puzzle follow-up: command dispatch is case-insensitive ("LS",
    // "Ls", "CAT .bash_history" all work) -- only the command token itself
    // is normalized, never filenames/arguments, matching real Unix (a
    // case-sensitive filesystem) and this global change applies to every
    // terminal in the game, not just room3_terminal.
    const [rawCommand, ...rest] = input.split(/\s+/);
    const command = rawCommand.toLowerCase();

    // Privilege escalation: "sudo" is a prefix, not a command of its own --
    // it elevates exactly the one command attached to it, for this single
    // invocation only. No persistent "you are now root" session state
    // (matching real sudo without -s/su): the next runCommand() call, even
    // with no new "sudo", starts unelevated again. A bare "sudo" (nothing
    // following) or an unrecognized command after it both fall through to
    // dispatch()'s own existing unknown-command handling -- reusing that
    // message-formatting rather than duplicating it, and correctly naming
    // whichever token is actually unrecognized (the inner command, not
    // "sudo" itself, once there is one).
    if (command === "sudo") {
      const [innerRaw, ...innerArgs] = rest;
      if (!innerRaw) {
        this.dispatch("sudo", [], false);
        return;
      }
      this.dispatch(innerRaw.toLowerCase(), innerArgs, true);
      return;
    }

    this.dispatch(command, rest, false);
  }

  private dispatch(command: string, args: string[], elevated: boolean): void {
    switch (command) {
      case "ls":
        this.runLs(args);
        break;
      case "cd":
        this.runCd(args[0]);
        break;
      case "cat":
        this.runCat(args[0], elevated);
        break;
      case "whoami":
        this.runWhoami();
        break;
      case "pwd":
        this.runPwd();
        break;
      case "clear":
        this.runClear();
        break;
      case "help":
        this.runHelp();
        break;
      default:
        if (this.blockedCommands.includes(command)) {
          this.appendLine(`${command}: Permission denied`);
          break;
        }
        if (this.restrictedCommands.includes(command)) {
          const unlocked = this.terminalDef?.unlockedCommands?.includes(command) ?? false;
          if (!unlocked) {
            this.appendLine(`${command}: Permission denied`);
            break;
          }
          // No functional handler exists for any restricted command yet --
          // unlocked or not, this checkpoint always denies. The unlock
          // check above is wired and read now so a future checkpoint only
          // needs to add a real handler branch here, not touch the unlock
          // plumbing.
          this.appendLine(`${command}: Permission denied`);
          break;
        }
        this.appendLine(`command not found: ${command}`);
    }
  }

  // Room-3 puzzle follow-up: hidden files/directories, Unix-convention
  // style -- no schema field for this, any TerminalFile/TerminalDirectory
  // whose name starts with "." is hidden by convention, purely a runLs()
  // filtering concern. `args.some(arg => arg.toLowerCase().includes("a"))`
  // covers every flag spelling that should reveal them ("-a", "-la",
  // "-al", "-l -a", "-A", etc.) -- cat/cd need no equivalent change, since
  // they already match by exact name regardless of a leading dot. Grouping
  // (directories before files) and the trailing "/" on directories are
  // unchanged from before this checkpoint -- global formatting every other
  // terminal already relies on, not something this one puzzle should
  // silently redefine.
  private runLs(args: string[]): void {
    const dir = this.currentDir;
    const showHidden = args.some((arg) => arg.toLowerCase().includes("a"));
    const directories = showHidden
      ? dir.directories
      : dir.directories.filter((d) => !d.name.startsWith("."));
    const files = showHidden ? dir.files : dir.files.filter((f) => !f.name.startsWith("."));
    const entries = [
      ...directories.map((d) => `${d.name}/`),
      ...files.map((f) => f.name),
    ];
    this.appendLine(entries.length > 0 ? entries.join("  ") : "(empty)");
  }

  private runCd(name: string | undefined): void {
    if (!name) {
      this.appendLine("cd: missing directory name");
      return;
    }
    if (name === "..") {
      if (this.pathStack.length > 1) this.pathStack.pop();
      else this.appendLine("cd: already at root");
      return;
    }
    const target = this.currentDir.directories.find((d) => d.name === name);
    if (!target) {
      this.appendLine(`cd: no such directory: ${name}`);
      return;
    }
    this.pathStack.push(target);
  }

  private runCat(name: string | undefined, elevated: boolean): void {
    if (!name) {
      this.appendLine("cat: missing file name");
      return;
    }
    const file = this.currentDir.files.find((f) => f.name === name);
    if (!file) {
      this.appendLine(`cat: no such file: ${name}`);
      return;
    }
    // Privilege escalation: a requiresRoot file denies a plain "cat"
    // exactly like a blocked/restricted command denies -- the bash-style
    // "Permission denied" phrasing, just prefixed with the filename (as
    // real cat does) instead of a command name.
    if (file.requiresRoot && !elevated) {
      this.appendLine(`cat: ${name}: Permission denied`);
      return;
    }
    // Checkpoint 19: substituted against the LIVE current pin, never a
    // snapshot -- this Terminal instance persists across a run reset,
    // which regenerates Campaign's vault pin, so reading getVaultPin()
    // fresh on every cat is what keeps this correct after a respawn.
    const content = file.content.replaceAll("{{VAULT_PIN}}", this.getVaultPin());
    const password = this.terminalDef?.password;
    const copyValue =
      password !== undefined && content.includes(password) ? password : undefined;
    this.appendLine(content, copyValue);
  }

  // Checkpoint 19 correction: whoami no longer opens anything by itself
  // (see the vault/Room-1-style password_lock now gating Room 3's door
  // instead) -- it only reveals the answer, with a copy button, the same
  // accessibility treatment runCat() already gives the door-1/vault-pin
  // secrets. room1_terminal has no username set (TerminalDef.username is
  // optional), so running whoami there prints a generic "unknown user"
  // line with no copy button.
  private runWhoami(): void {
    const username = this.terminalDef?.username;
    if (username === undefined) {
      this.appendLine("whoami: unknown user");
      return;
    }
    this.appendLine(username, username);
  }

  // Checkpoint 19 correction (part of the originally-scoped-but-dropped
  // pwd/clear/help trio, completed now): built from the existing
  // pathStack rather than a second path-tracking mechanism -- pathStack[0]
  // is always root, so everything after it joined with "/" and prefixed
  // with a leading "/" is the current path.
  private runPwd(): void {
    const path =
      this.pathStack.length > 1
        ? "/" + this.pathStack.slice(1).map((dir) => dir.name).join("/")
        : "/";
    this.appendLine(path);
  }

  private runClear(): void {
    this.outputEl.textContent = "";
  }

  // Iterates coreCommands (content/terminalCommands.ts's CORE_COMMANDS,
  // injected via the constructor) rather than a separate hardcoded help
  // string, so a future core command addition shows up here automatically.
  // Deliberately does NOT list blockedCommands/restrictedCommands --
  // discovering those by trying them is part of the intended experience,
  // not something help should spoil.
  private runHelp(): void {
    this.appendLine("bash 5.2.37 (simulated)");
    for (const command of this.coreCommands) {
      this.appendLine(`${command.name} - ${command.description}`);
    }
  }

  // Copy button (checkpoint 17's one deliberate accessibility feature):
  // shown only on the specific output line whose content contains the
  // password, never elsewhere -- so reading/retyping the password by hand
  // isn't required to progress, but nothing else in the terminal gets this
  // treatment.
  private appendLine(text: string, copyValue?: string): void {
    const line = createDiv({ display: "flex", alignItems: "center", gap: "8px" });
    const textEl = createDiv({ whiteSpace: "pre-wrap" });
    textEl.textContent = text;
    line.appendChild(textEl);

    if (copyValue !== undefined) {
      const copyButton = document.createElement("button");
      copyButton.textContent = "Copy";
      Object.assign(copyButton.style, {
        cursor: "pointer",
        fontFamily: "monospace",
        fontSize: "11px",
        padding: "2px 8px",
        border: "1px solid #2a5c2a",
        background: "#0a140a",
        color: "#7CFC7C",
      });
      copyButton.addEventListener("click", () => {
        // Checkpoint 18: .catch() added -- clipboard access can be denied
        // (insecure context, permission policy, unfocused document), and an
        // unhandled rejection previously surfaced only as a stray console
        // error with no feedback to the player that the copy failed.
        navigator.clipboard.writeText(copyValue).catch(() => {
          textEl.textContent = `${text} (copy failed)`;
        });
      });
      line.appendChild(copyButton);
    }

    this.outputEl.appendChild(line);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }
}
