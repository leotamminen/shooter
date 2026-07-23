import type { TerminalDef, TerminalDirectory } from "../types";

function createDiv(styles: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, styles);
  return el;
}

// Data Center polish: logMode's fake access-log line generator. Flavor
// only, not a real log-format parser -- a small pool of plausible paths and
// mostly-200 status codes is enough to read as a real server's noise.
const LOG_MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const LOG_PATHS = [
  "/net/status",
  "/auth/session",
  "/cache/purge",
  "/logs/system",
  "/api/heartbeat",
  "/metrics/export",
  "/db/replica-sync",
  "/queue/drain",
];
const LOG_METHODS = ["GET", "GET", "GET", "POST"];
// Weighted toward 200 -- mostly-healthy noise with occasional errors, not a
// uniform distribution.
const LOG_STATUS_CODES = [200, 200, 200, 200, 200, 200, 404, 502];
const LOG_USER_AGENTS = ["monitor-agent/1.2", "healthcheck/0.9", "internal-cron/3.1"];
const LOG_INTERVAL_MIN_MS = 400;
const LOG_INTERVAL_MAX_MS = 900;

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

// Access-log style timestamp, e.g. "20/Jul/2026:14:32:07 +0000" -- uses the
// real current time, not a fixed/fake one, so it reads as a live-updating
// log rather than a static prop.
function formatAccessLogTimestamp(date: Date): string {
  const day = pad2(date.getDate());
  const month = LOG_MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  return `${day}/${month}/${year}:${time} +0000`;
}

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// records_terminal puzzle follow-up: objective hash-length facts (not
// per-puzzle content, so this stays a module constant here rather than
// injected data), keyed by the format name WITHOUT a raw- prefix -- runJohn()
// strips that prefix before looking a type up here.
const HASH_FORMAT_LENGTHS: Record<string, number> = {
  md5: 32,
  sha1: 40,
  sha256: 64,
  sha512: 128,
};

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
  // Data Center exit follow-up: reintroduced -- see the constructor's own
  // comment for how this differs from the removed onFileRead/openNoteDoor
  // mechanism it superficially resembles.
  private readonly onFileRead?: (filename: string) => void;
  // Checkpoint 19 correction: command-permission data injected as
  // constructor parameters (content/terminalCommands.ts's exports),
  // rather than imported directly here -- matching this project's
  // established ui/MainMenu.ts precedent of never importing content/
  // directly, keeping every ui/ file a pure presentation layer over data
  // it's handed by main.ts (the composition root).
  private readonly blockedCommands: string[];
  private readonly restrictedCommands: string[];
  private readonly coreCommands: { name: string; description: string }[];
  // records_terminal puzzle follow-up: same injected-data shape as
  // blockedCommands/restrictedCommands/coreCommands above -- content/
  // terminalCommands.ts's RESTRICTED_COMMAND_USAGE, read by runHelp().
  private readonly restrictedCommandUsage: Record<string, string>;
  // records_terminal puzzle follow-up: this specific room's fixed
  // hash/plaintext pair, injected the same way campaign.getVaultPin is --
  // ui/Terminal.ts never imports content/terminals.ts directly, matching
  // this file's established "pure presentation layer over injected data"
  // rule.
  private readonly johnTargetHash: string;
  private readonly johnTargetPlaintext: string;

  private terminalDef: TerminalDef | null = null;
  private pathStack: TerminalDirectory[] = [];
  // Data Center polish: unlike every other timer in this file (the
  // requestAnimationFrame deferrals above, which are one-shot and need no
  // cleanup), this is a genuinely repeating interval -- it must be cleared
  // on close(), or it would keep firing (and appending lines to a
  // detached/reused terminal) after the overlay is no longer open.
  private logIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    onOpen: () => void,
    onClose: () => void,
    getVaultPin: () => string,
    blockedCommands: string[],
    restrictedCommands: string[],
    coreCommands: { name: string; description: string }[],
    restrictedCommandUsage: Record<string, string>,
    johnTargetHash: string,
    johnTargetPlaintext: string,
    // Data Center exit follow-up: reintroduced after the Data Center
    // entrance follow-up removed the original onFileRead/openNoteDoor pair
    // (which opened campaign_door_5 as a narrative consequence of reading
    // note.txt -- moot once that door became permanently passable). This is
    // narrower than that removed mechanism ever needed to be: it only ever
    // fires from a successful, permission-granted runCat() of a
    // file.requiresRoot file (see runCat() below), and today exactly one
    // such file exists in the whole game (workstation_terminal's note.txt)
    // -- so despite being wired on the single shared Terminal instance used
    // by every TerminalDef, it is narrow by construction of the content
    // data, not a general command watcher reintroducing the removed
    // onCommand pattern's problem (see CLAUDE.md's decisions log for why
    // that one was wrong).
    onFileRead?: (filename: string) => void,
  ) {
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.getVaultPin = getVaultPin;
    this.blockedCommands = blockedCommands;
    this.restrictedCommands = restrictedCommands;
    this.coreCommands = coreCommands;
    this.restrictedCommandUsage = restrictedCommandUsage;
    this.johnTargetHash = johnTargetHash;
    this.johnTargetPlaintext = johnTargetPlaintext;
    this.onFileRead = onFileRead;

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

    // Data Center polish: logMode replaces the normal filesystem browser
    // with a continuous stream of fake access-log lines -- randomized
    // interval chosen once per open() (the same "randomized per instance,
    // not re-randomized every tick" approach the server rack lights use),
    // not re-derived on every tick.
    if (terminalDef.logMode) {
      const intervalMs =
        LOG_INTERVAL_MIN_MS + Math.random() * (LOG_INTERVAL_MAX_MS - LOG_INTERVAL_MIN_MS);
      this.logIntervalId = setInterval(() => this.appendRandomLogLine(), intervalMs);
    }
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
    // Data Center polish: the one interval in this file that genuinely
    // needs clearing -- see logIntervalId's own comment above.
    if (this.logIntervalId !== null) {
      clearInterval(this.logIntervalId);
      this.logIntervalId = null;
    }
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
    // Data Center polish: logMode never parses input at all -- typing
    // anything (including nothing) while it's active always just prints
    // this, regardless of content. Checked before the empty-input guard
    // below since even Enter-on-empty should show it in this mode.
    if (this.terminalDef?.logMode) {
      this.appendLine("Access denied.");
      return;
    }

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
          // records_terminal puzzle follow-up: grep/john are the first two
          // restricted commands to get real behavior once unlocked --
          // ping/ifconfig/nmap still fall through to the same
          // always-denied line below, since nothing unlocks them yet.
          if (command === "grep") {
            this.runGrep(args);
            break;
          }
          if (command === "john") {
            this.runJohn(args);
            break;
          }
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
    // records_terminal puzzle follow-up: a small set of decoy files
    // simulate real binary files cat can't meaningfully display -- mirrors
    // real cat's own behavior on a non-text file, a realistic dead end with
    // no actual content to leak either way.
    if (file.isBinary) {
      this.appendLine(`cat: ${name}: cannot display binary file`);
      return;
    }
    // Checkpoint 19: substituted against the LIVE current pin, never a
    // snapshot -- this Terminal instance persists across a run reset,
    // which regenerates Campaign's vault pin, so reading getVaultPin()
    // fresh on every cat is what keeps this correct after a respawn.
    const content = file.content.replaceAll("{{VAULT_PIN}}", this.getVaultPin());
    this.appendLine(content, this.findCopyValue(content));

    // Narrowly-scoped hook: fires only for a successful, permission-granted
    // read of a requiresRoot file -- see the constructor's own comment for
    // why this stays narrow despite living on the single shared Terminal
    // instance.
    if (file.requiresRoot) {
      this.onFileRead?.(name);
    }
  }

  // records_terminal puzzle follow-up: generalizes runCat()'s original
  // "does this content contain the current terminalDef's password"
  // detection into a small list of candidate secrets, since a terminal's
  // reveal target isn't always a door-lock password (records_terminal's is
  // a crackable hash, not something typed into a password_lock).
  // terminalDef.password's own narrower role (checked by ui/PasswordLock.ts)
  // is completely unchanged -- this only widens what runCat()/runGrep() look
  // for when deciding whether to attach a copy button, and only ever
  // returns the specific matched substring (never the whole line/content)
  // as the copy value, the same as the original password-only check always
  // did.
  private findCopyValue(content: string): string | undefined {
    const candidates = [
      ...(this.terminalDef?.password !== undefined ? [this.terminalDef.password] : []),
      ...(this.terminalDef?.copyableSecrets ?? []),
    ];
    return candidates.find((candidate) => content.includes(candidate));
  }

  // records_terminal puzzle follow-up: grep's first real activation since
  // checkpoint 19 (previously recognized-but-always-denied, like every
  // other RESTRICTED_COMMANDS entry). Real grep semantics, scoped to what
  // this puzzle needs: case-sensitive substring match per line, printing
  // only matching lines -- no output at all on zero matches, matching real
  // grep's own silent-exit-1 behavior rather than inventing a "no matches"
  // message no other command here has an equivalent of. Each matching
  // line gets the same findCopyValue() treatment runCat() uses, so a
  // matched row containing a copyable secret gets a copy button exactly
  // like cat-ing the whole file would, but scoped to just that one line.
  private runGrep(args: string[]): void {
    const [pattern, name] = args;
    if (!pattern || !name) {
      this.appendLine("grep: usage: grep <pattern> <file>");
      return;
    }
    const file = this.currentDir.files.find((f) => f.name === name);
    if (!file) {
      this.appendLine(`grep: ${name}: No such file or directory`);
      return;
    }
    if (file.isBinary) {
      // Real grep can still match inside a binary file (printing a
      // "binary file matches" notice, never the content) -- this project's
      // binary decoys have no matchable content anyway, so this is
      // realistic without needing any real search against them.
      this.appendLine(`grep: ${name}: binary file matches`);
      return;
    }
    const content = file.content.replaceAll("{{VAULT_PIN}}", this.getVaultPin());
    const matches = content.split("\n").filter((line) => line.includes(pattern));
    for (const line of matches) {
      this.appendLine(line, this.findCopyValue(line));
    }
  }

  // records_terminal puzzle follow-up: john's hash-crack simulation --
  // fixed content for this one room's door code, not a generic
  // crackable-hash system (no wordlist, no timing simulation). Format
  // parsing is deliberately permissive: the raw- prefix taught by the
  // room's own hash-length sign is accepted but not required, and the type
  // itself is matched case-insensitively, mirroring this project's existing
  // "teach the real form, accept reasonable variants" precedent (the
  // command-dispatch case-insensitivity from the Room 3 puzzle).
  private runJohn(args: string[]): void {
    const formatArg = args.find((arg) => arg.startsWith("--format="));
    const hash = args.find((arg) => !arg.startsWith("--format="));
    if (!formatArg || !hash) {
      this.appendLine("john: usage: john --format=<type> <hash>");
      return;
    }

    const rawType = formatArg.slice("--format=".length).toLowerCase();
    const normalizedType = rawType.startsWith("raw-") ? rawType.slice(4) : rawType;
    const expectedLength = HASH_FORMAT_LENGTHS[normalizedType];
    if (expectedLength === undefined) {
      this.appendLine(`john: unknown hash format: ${rawType}`);
      return;
    }

    if (hash.length !== expectedLength) {
      this.appendLine(
        `Error: hash length mismatch for format raw-${normalizedType} (expected ${expectedLength}, got ${hash.length})`,
      );
      return;
    }

    if (hash.toLowerCase() === this.johnTargetHash.toLowerCase()) {
      this.appendLine(`${hash}:${this.johnTargetPlaintext}`, this.johnTargetPlaintext);
      this.appendLine("1 password hash cracked, 0 left");
      return;
    }

    this.appendLine("0 password hashes cracked, 1 left");
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
    // records_terminal puzzle follow-up: a narrow, deliberate exception --
    // a restricted command CAN show its own usage line here, but only when
    // (a) this specific terminal's own unlockedCommands actually includes
    // it, and (b) content/terminalCommands.ts's RESTRICTED_COMMAND_USAGE
    // has an entry for it (today, only "john" does -- grep, despite being
    // unlocked on this same terminal, has no entry and so prints nothing
    // here, same as every other restricted command). Without this, john's
    // exact syntax would have no in-game source at all, making the puzzle
    // unsolvable rather than merely undiscovered -- unlike grep, a real,
    // widely-known command that needs no in-fiction teaching.
    const unlockedCommands = this.terminalDef?.unlockedCommands ?? [];
    for (const command of unlockedCommands) {
      const usage = this.restrictedCommandUsage[command];
      if (usage) this.appendLine(usage);
    }
  }

  // Data Center polish: one simulated access-log line, using the real
  // current time (not a fixed/fake one) so it reads as continuously live.
  // Flavor only -- reuses appendLine()'s existing auto-scroll behavior for
  // free, no copy button (nothing here is ever a secret to reveal).
  private appendRandomLogLine(): void {
    const timestamp = formatAccessLogTimestamp(new Date());
    const method = randomFrom(LOG_METHODS);
    const path = randomFrom(LOG_PATHS);
    const status = randomFrom(LOG_STATUS_CODES);
    const bytes = 100 + Math.floor(Math.random() * 4000);
    const userAgent = randomFrom(LOG_USER_AGENTS);
    this.appendLine(
      `[${timestamp}] "${method} ${path} HTTP/1.1" ${status} ${bytes} "-" "${userAgent}"`,
    );
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
