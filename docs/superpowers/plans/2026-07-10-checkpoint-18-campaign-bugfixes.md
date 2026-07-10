# Checkpoint 18: Campaign Mode Bugfixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four small, pointer-lock/input-focus-area bugs found in checkpoint 17's Campaign mode (terminal + password lock), with no new features.

**Architecture:** All four fixes are localized to `src/ui/Terminal.ts`, `src/ui/PasswordLock.ts`, and `src/ui/MainMenu.ts` — no changes to `Campaign.ts`, `MapEntitySystem.ts`, content, or types. Bugs 1/2/4 are all instances of the same underlying class of problem (a browser API call — `focus()`, `requestPointerLock()`, or a same-tick click-through — misbehaving when it happens synchronously within the same event-handling turn as the keydown/click that triggered it) and are fixed with the same general technique: defer the call past the current event's synchronous processing, or capture the click before it reaches the canvas underneath. Bug 3 is a genuine logic gap in `isMapSupportedForMode()`.

**Tech Stack:** TypeScript, Three.js, Vite — no new dependencies.

## Global Constraints

- No new features, no new commands, no new rooms, no changes to `Campaign.ts`'s objective logic, no changes to `MapEntitySystem.ts`. Only `src/ui/Terminal.ts`, `src/ui/PasswordLock.ts`, and `src/ui/MainMenu.ts` change.
- Two of the four bugs fixed here have root causes that differ from what was originally hypothesized when this checkpoint was scoped — this must be documented plainly in both this plan and CLAUDE.md's decisions log (see Task 5), not glossed over.

---

## Investigation Summary (read before touching any task)

Before writing this plan, the actual current source of `src/ui/Terminal.ts`, `src/ui/PasswordLock.ts`, `src/ui/MainMenu.ts`, and `node_modules/three/examples/jsm/controls/PointerLockControls.js` was read in full, plus a whole-branch review of all of checkpoint 17 was run. This surfaced one additional bug beyond the three originally reported, and found that two of the three originally-reported bugs' *root causes* don't match their original hypotheses (the *symptoms* are real; the *stated reasons* were not what the code actually does). Both tasks below carry this investigation's findings, not the original hypotheses, as the thing to implement.

**Bug 1 — "E" leaks into the newly-opened input.** Original hypothesis and actual root cause match: `open()` calls `this.inputEl.focus()` synchronously, inside the same keydown event `InteractSystem` is still processing for that same "E" press. The browser's default "insert this character" action for that physical keypress lands on the input because focus changed mid-event-processing for the same key. **Fix:** defer `focus()` to the next frame via `requestAnimationFrame`.

**Bug 2 — Escape doesn't re-lock the pointer; × does.** Original hypothesis ("× and Escape call two different close code paths") does **not** match the code: both the × button's `onClick` and both Escape listeners (the input's own keydown handler, and the window-level fallback) already call the exact same private `close()` method, which already includes the `onClose()` pointer-relock callback — confirmed by reading the file directly, twice. The actual root cause is a focus-transition race: `close()` calls `this.inputEl.blur()` then synchronously calls `onClose()` (→ `playerController.controls.lock()` → `requestPointerLock()`) in the same synchronous turn. On the × path this race never manifests, because a mouse click natively blurs the focused input and shifts focus to the clicked button *before* our own click handler even runs — the focus transition has already settled by the time `close()`'s own `blur()`/`onClose()` execute. On the Escape path, *our own* `blur()` call is what triggers the transition, in the very same synchronous call stack as the following relock attempt, with no settling time. This asymmetry is why × works and Escape doesn't. **Fix:** defer the `onClose()` call (not `blur()` — that stays synchronous) to the next frame via `requestAnimationFrame`, applied uniformly to both trigger paths.

**Bug 3 — Campaign mode's Map group doesn't fully exclude Test Grid/Corridors.** Original hypothesis ("visual graying works but the click handler isn't actually disabled") does **not** match the code: `updateMapAvailability()` already sets `pointerEvents = "none"` on every unsupported map's button, which genuinely blocks clicks, not just styling. The actual root cause is a logic gap in `isMapSupportedForMode()`: a map with `supportedModes === undefined` (Test Grid, Corridors) unconditionally returns `true` (supported) regardless of which mode is being checked, including `"campaign"` — so under Campaign mode, Test Grid/Corridors are never grayed out *at all* (not "grayed but clickable" — genuinely never grayed). This technically satisfies checkpoint 17's literal spec text ("mode-agnostic maps are selectable under any mode") but contradicts checkpoint 17's own verification-section expectation that only `campaign_room1` be selectable under Campaign. **Fix:** a mode-agnostic map is only "supported" under a given mode if *no* map in the full `maps` array has explicitly opted into that mode via its own `supportedModes` — i.e., a mode becomes exclusive the moment any map declares support for it. This makes `campaign_room1` (which declares `supportedModes: ["campaign"]`) exclude Test Grid/Corridors under Campaign, while leaving Zombie Survival/Shooting Range (which no map explicitly opts into) completely unaffected. No hardcoded `"campaign"` string anywhere in the method — this generalizes to any future mode-exclusive map.

**Bug 4 — clicking outside the small overlay panel re-locks the pointer and resumes gameplay while the overlay is still open.** Not in the original report — found during checkpoint 17's final whole-branch review. Neither `Terminal`'s nor `PasswordLock`'s `root` element covers the full screen; both are small, centered, fixed-size boxes. `main.ts` has `canvas.addEventListener("click", () => playerController.controls.lock())`. Since the overlay only occupies a small centered box, most of the screen (the canvas) remains clickable underneath and around it — clicking there re-locks the pointer immediately (`gameState.paused` flips back to `false` via the `pointerlockchange` listener) while the overlay is still visibly open and blocking the center of the screen, its `onClose()` never having run. `ui/MainMenu.ts` never has this problem because its own root is already `inset: "0"` (full screen), capturing every click. **Fix:** restructure both overlays so `root` becomes a full-screen backdrop (mirroring `MainMenu`'s own root) and the existing small styled box becomes an inner `panel` child, centered via flex. This captures every click while the overlay is open, so the canvas's click-to-lock handler never fires.

**Bundled in the same tasks (Minor, found during the same final review):** `Terminal.ts`'s copy-to-clipboard button had no `.catch()` on the `navigator.clipboard.writeText()` promise — a denied clipboard permission surfaced only as an unhandled-rejection console error with no player-visible feedback. Fixed alongside Bug 4 in the same file/task, since it's a one-line addition to code already being touched there.

**Explicitly not fixed here (documented as known, deferred debt in Task 5 — do not attempt in this checkpoint):** neither overlay has a `destroy()`/teardown method (latent today since `startGame()` only ever runs once, matters only if a future mid-session menu return re-calls it); `Campaign.getSummaryLines()` returns non-empty strings that can never actually be shown (Campaign has no death path); `MapDef.supportedModes` is typed as plain `string[]` with no runtime validation against `ModeId`; `main.ts`'s `openPasswordLock` callback calls `campaign.markObjectiveComplete()` unconditionally regardless of the active mode (harmless today, coupled to a content invariant).

---

### Task 1: Fix `ui/Terminal.ts` (Bugs 1, 2, 4 + clipboard rejection)

**Files:**
- Modify: `src/ui/Terminal.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for later tasks — `Terminal`'s public shape (`constructor(onOpen, onClose)`, `open(terminalDef): void`) is unchanged; only internals change.

This is a full-file rewrite (the constructor's DOM structure changes shape for Bug 4, plus `open()`/`close()`/the copy button get smaller changes) — the current full file is shown below, followed by its complete replacement.

- [ ] **Step 1: Replace the whole file**

The current file:

```typescript
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
export class Terminal {
  private readonly root: HTMLDivElement;
  private readonly outputEl: HTMLDivElement;
  private readonly inputEl: HTMLInputElement;
  private readonly onOpen: () => void;
  private readonly onClose: () => void;

  private terminalDef: TerminalDef | null = null;
  private pathStack: TerminalDirectory[] = [];

  constructor(onOpen: () => void, onClose: () => void) {
    this.onOpen = onOpen;
    this.onClose = onClose;

    this.root = createDiv({
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "520px",
      height: "360px",
      display: "none",
      flexDirection: "column",
      background: "rgba(10, 14, 10, 0.95)",
      border: "2px solid #2a5c2a",
      borderRadius: "4px",
      padding: "16px",
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#7CFC7C",
      zIndex: "30",
      pointerEvents: "none",
    });

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
    this.root.appendChild(titleBar);

    this.outputEl = createDiv({
      flex: "1",
      overflowY: "auto",
      marginBottom: "8px",
    });
    this.root.appendChild(this.outputEl);

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
    this.root.appendChild(this.inputEl);

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
    this.appendLine("Connected. Type 'ls' to begin.");
    this.root.style.display = "flex";
    this.root.style.pointerEvents = "auto";
    this.inputEl.value = "";
    this.inputEl.focus();
    this.onOpen();
  }

  private close(): void {
    this.inputEl.blur();
    this.root.style.display = "none";
    this.root.style.pointerEvents = "none";
    this.terminalDef = null;
    this.onClose();
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

    const [command, ...args] = input.split(/\s+/);
    switch (command) {
      case "ls":
        this.runLs();
        break;
      case "cd":
        this.runCd(args[0]);
        break;
      case "cat":
        this.runCat(args[0]);
        break;
      default:
        this.appendLine(`command not found: ${command}`);
    }
  }

  private runLs(): void {
    const dir = this.currentDir;
    const entries = [
      ...dir.directories.map((d) => `${d.name}/`),
      ...dir.files.map((f) => f.name),
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

  private runCat(name: string | undefined): void {
    if (!name) {
      this.appendLine("cat: missing file name");
      return;
    }
    const file = this.currentDir.files.find((f) => f.name === name);
    if (!file) {
      this.appendLine(`cat: no such file: ${name}`);
      return;
    }
    const password = this.terminalDef?.password;
    const copyValue =
      password !== undefined && file.content.includes(password) ? password : undefined;
    this.appendLine(file.content, copyValue);
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
        void navigator.clipboard.writeText(copyValue);
      });
      line.appendChild(copyButton);
    }

    this.outputEl.appendChild(line);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }
}
```

Replace the entire file with:

```typescript
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
export class Terminal {
  private readonly root: HTMLDivElement;
  private readonly outputEl: HTMLDivElement;
  private readonly inputEl: HTMLInputElement;
  private readonly onOpen: () => void;
  private readonly onClose: () => void;

  private terminalDef: TerminalDef | null = null;
  private pathStack: TerminalDirectory[] = [];

  constructor(onOpen: () => void, onClose: () => void) {
    this.onOpen = onOpen;
    this.onClose = onClose;

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
    this.appendLine("Connected. Type 'ls' to begin.");
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

    const [command, ...args] = input.split(/\s+/);
    switch (command) {
      case "ls":
        this.runLs();
        break;
      case "cd":
        this.runCd(args[0]);
        break;
      case "cat":
        this.runCat(args[0]);
        break;
      default:
        this.appendLine(`command not found: ${command}`);
    }
  }

  private runLs(): void {
    const dir = this.currentDir;
    const entries = [
      ...dir.directories.map((d) => `${d.name}/`),
      ...dir.files.map((f) => f.name),
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

  private runCat(name: string | undefined): void {
    if (!name) {
      this.appendLine("cat: missing file name");
      return;
    }
    const file = this.currentDir.files.find((f) => f.name === name);
    if (!file) {
      this.appendLine(`cat: no such file: ${name}`);
      return;
    }
    const password = this.terminalDef?.password;
    const copyValue =
      password !== undefined && file.content.includes(password) ? password : undefined;
    this.appendLine(file.content, copyValue);
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
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/Terminal.ts
git commit -m "Checkpoint 18: fix Terminal input-focus leak, Escape not re-locking pointer, and click-outside-overlay re-locking prematurely"
```

---

### Task 2: Fix `ui/PasswordLock.ts` (Bugs 1, 2, 4)

**Files:**
- Modify: `src/ui/PasswordLock.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for later tasks — `PasswordLock`'s public shape (`constructor(onOpen, onClose)`, `open(terminalDef, onSuccess): void`) is unchanged; only internals change.

Mirrors Task 1's fixes exactly, applied to this file's own structure.

- [ ] **Step 1: Replace the whole file**

The current file:

```typescript
import type { TerminalDef } from "../types";

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
  private readonly inputEl: HTMLInputElement;
  private readonly errorEl: HTMLDivElement;
  private readonly onOpen: () => void;
  private readonly onClose: () => void;

  private terminalDef: TerminalDef | null = null;
  private onSuccess: (() => void) | null = null;

  constructor(onOpen: () => void, onClose: () => void) {
    this.onOpen = onOpen;
    this.onClose = onClose;

    this.root = createDiv({
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      display: "none",
      flexDirection: "column",
      gap: "10px",
      background: "rgba(20, 14, 10, 0.95)",
      border: "2px solid #5c3a2a",
      borderRadius: "4px",
      padding: "20px 24px",
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#f0f0f0",
      zIndex: "30",
      pointerEvents: "none",
    });

    const title = createDiv({ fontWeight: "bold" });
    title.textContent = "PASSWORD LOCK";
    this.root.appendChild(title);

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
    this.root.appendChild(this.inputEl);

    this.errorEl = createDiv({ fontSize: "12px", color: "#d94040", minHeight: "16px" });
    this.root.appendChild(this.errorEl);

    const buttonRow = createDiv({ display: "flex", gap: "10px" });
    buttonRow.appendChild(
      createButton("Submit", { background: "#3a6b3a" }, () => this.submit()),
    );
    buttonRow.appendChild(
      createButton("Cancel", { background: "#444" }, () => this.close()),
    );
    this.root.appendChild(buttonRow);

    document.body.appendChild(this.root);

    window.addEventListener("keydown", (event) => {
      if (event.code === "Escape" && this.isOpen()) this.close();
    });
  }

  open(terminalDef: TerminalDef, onSuccess: () => void): void {
    this.terminalDef = terminalDef;
    this.onSuccess = onSuccess;
    this.errorEl.textContent = "";
    this.inputEl.value = "";
    this.root.style.display = "flex";
    this.root.style.pointerEvents = "auto";
    this.inputEl.focus();
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
    this.onClose();
  }

  private isOpen(): boolean {
    return this.root.style.display !== "none";
  }
}
```

Replace the entire file with:

```typescript
import type { TerminalDef } from "../types";

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

    const title = createDiv({ fontWeight: "bold" });
    title.textContent = "PASSWORD LOCK";
    panel.appendChild(title);

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

  open(terminalDef: TerminalDef, onSuccess: () => void): void {
    this.terminalDef = terminalDef;
    this.onSuccess = onSuccess;
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
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/PasswordLock.ts
git commit -m "Checkpoint 18: fix PasswordLock input-focus leak, Escape not re-locking pointer, and click-outside-overlay re-locking prematurely"
```

---

### Task 3: Fix `ui/MainMenu.ts` (Bug 3)

**Files:**
- Modify: `src/ui/MainMenu.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for later tasks — `isMapSupportedForMode()`'s signature is unchanged (`(map: MapDef, modeId: ModeId): boolean`), only its internal logic changes.

- [ ] **Step 1: Fix `isMapSupportedForMode()`'s logic gap**

The current method:

```typescript
  // A map with no supportedModes is mode-agnostic (test-grid, corridors,
  // unchanged from before checkpoint 17); a map that declares supportedModes
  // (campaign_room1) is only selectable when the current mode is in that
  // list. Mirrors the Enemy group's existing mode-based graying, just keyed
  // off a different field.
  private isMapSupportedForMode(map: MapDef, modeId: ModeId): boolean {
    return map.supportedModes === undefined || map.supportedModes.includes(modeId);
  }
```

Replace it with:

```typescript
  // Checkpoint 18 bugfix: a map with no supportedModes is mode-agnostic,
  // but "mode-agnostic" now means "supported under any mode that has no
  // map explicitly dedicated to it" -- not unconditionally "supported
  // everywhere". Checkpoint 17's original version returned true whenever
  // supportedModes was undefined, full stop, which meant Test Grid/
  // Corridors stayed selectable under Campaign too, even though
  // campaign_room1 is the only map actually built for it (it's the only
  // map with terminal/password_lock entities). The check below asks
  // instead: has ANY map already explicitly opted into modeId via its own
  // supportedModes? If so, that mode is treated as requiring an
  // explicitly-dedicated map, and mode-agnostic maps no longer default
  // into it. Zombie Survival/Shooting Range have no map that explicitly
  // opts into them, so mode-agnostic maps remain available under both,
  // completely unchanged from before this fix. This generalizes correctly
  // for any future mode-exclusive map, without hardcoding "campaign" by
  // name anywhere in this method.
  private isMapSupportedForMode(map: MapDef, modeId: ModeId): boolean {
    if (map.supportedModes !== undefined) {
      return map.supportedModes.includes(modeId);
    }
    const modeHasDedicatedMap = this.maps.some(
      (m) => m.supportedModes !== undefined && m.supportedModes.includes(modeId),
    );
    return !modeHasDedicatedMap;
  }
```

`updateMapAvailability()` needs no changes — it already correctly applies whatever `isMapSupportedForMode()` returns, both for graying/disabling buttons and for the fallback re-selection logic.

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/MainMenu.ts
git commit -m "Checkpoint 18: fix isMapSupportedForMode() so mode-agnostic maps don't leak into a mode with its own dedicated map"
```

---

### Task 4: Manual verification against acceptance criteria (controller-executed, not a subagent)

**Files:** none (verification only).

This task is executed directly by the session controller together with the human partner — it requires live browser interaction and judgment a subagent cannot reliably perform.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL in a browser.

- [ ] **Step 2: Verify Bug 1 is fixed (both overlays)**

Start a Campaign run. Press `E` on the terminal — confirm the input box is empty immediately after the overlay opens (not containing a typed "e"). Close it, press `E` again — confirm it's still empty (repeat 2-3 times). Do the same for the password lock (press `E` on it) — confirm its input is also empty on open, repeated 2-3 times.

- [ ] **Step 3: Verify Bug 2 is fixed (both overlays)**

Open the terminal, press Escape to close it — confirm the pointer re-locks immediately (cursor disappears, mouse-look works immediately) with no click required and no shot fired as a side effect. Repeat, this time closing via the × button — confirm it still works identically. Repeat both checks for the password lock (close via Escape, then via the Cancel button).

- [ ] **Step 4: Verify Bug 3 is fixed**

At the main menu, select Campaign mode. In the Map group, attempt to click "Test Grid" or "Corridors" — confirm the click has no effect (they stay grayed out, "Campaign: Room 1" remains selected). Switch to Zombie Survival — confirm Test Grid/Corridors become clickable again and "Campaign: Room 1" grays out. Switch to Shooting Range — confirm the same.

- [ ] **Step 5: Verify Bug 4 is fixed (both overlays)**

Open the terminal. Move the mouse cursor outside the small overlay panel (into the visible game area around it) and click. Confirm: the pointer does NOT re-lock, the overlay stays open, gameplay does not resume. Close the terminal normally afterward (Escape or ×) and confirm it re-locks correctly. Repeat for the password lock.

- [ ] **Step 6: Regression check — rapid toggling**

Open the terminal, immediately press Escape, immediately press `E` again (as fast as possible) — confirm no stuck/broken state (input still empty on the second open, pointer lock behaves sensibly, no console errors). Repeat for the password lock.

- [ ] **Step 7: Full regression check**

Reload the page. Play Zombie Survival and Shooting Range on both Test Grid and Corridors — confirm every checkpoint 1-17 behavior (rounds, wall-buys, paid doors, melee, gun damage scaling, HUD, etc.) is completely unaffected. Confirm terminal/password-lock UI never appears on either of those maps.

---

### Task 5: Update CLAUDE.md and commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the folder structure tree**

Find the `ui/Terminal.ts`/`ui/PasswordLock.ts` lines (added at checkpoint 17) and the `MainMenu.ts` line, and append checkpoint-18 annotations:

```
    Terminal.ts                  [17, DOM overlay for the hacking-terminal minigame — ls/cd/cat over a TerminalDef's fake filesystem, with a copy-password button on the one output line that contains it]
    PasswordLock.ts              [17, DOM overlay for entering a door's password — submit/cancel, calls a success callback on a correct match]
```
→
```
    Terminal.ts                  [17, DOM overlay for the hacking-terminal minigame — ls/cd/cat over a TerminalDef's fake filesystem, with a copy-password button on the one output line that contains it; 18 fixes deferred focus()/onClose() timing and a full-screen backdrop to stop clicks outside the small panel from re-locking pointer prematurely]
    PasswordLock.ts              [17, DOM overlay for entering a door's password — submit/cancel, calls a success callback on a correct match; 18 gets the identical checkpoint-18 fixes as Terminal.ts]
```

And find the `MainMenu.ts` block's checkpoint-17 annotation, appending:

```
                                 [17 adds a third Mode option (Campaign, which also grays the Enemy group like Shooting Range already did) and MapDef.supportedModes-based Map group filtering/graying, with an automatic fallback-selection if the current map becomes invalid for the newly-selected mode]
```
→
```
                                 [17 adds a third Mode option (Campaign, which also grays the Enemy group like Shooting Range already did) and MapDef.supportedModes-based Map group filtering/graying, with an automatic fallback-selection if the current map becomes invalid for the newly-selected mode]
                                 [18 fixes isMapSupportedForMode() so a mode-agnostic map is only treated as supported under a mode that has no map explicitly dedicated to it, closing a gap where Test Grid/Corridors stayed selectable under Campaign]
```

- [ ] **Step 2: Update the Checkpoints list**

Add a new, short line immediately after checkpoint 17's line (this is a bugfix checkpoint, so keep it brief, matching checkpoint 8.5's precedent):

```
18. Campaign mode bugfixes — four small pointer-lock/input-focus bugs found during checkpoint 17 manual verification and a follow-up whole-branch review, fixed in `ui/Terminal.ts`/`ui/PasswordLock.ts`/`ui/MainMenu.ts` only: an "E" keypress leaking into the newly-opened overlay's input, Escape not re-locking the pointer (× worked, Escape didn't), Campaign mode's Map filtering not fully excluding Test Grid/Corridors, and clicking outside the small overlay panel re-locking the pointer while the overlay was still open
```

- [ ] **Step 3: Update "Current status"**

Change the opening sentence from `Checkpoint 17 complete.` to `Checkpoint 18 complete.`, and append one new paragraph after the existing checkpoint-17 paragraphs (before `## Decisions log`):

```

Checkpoint 18 is a pure bugfix pass over checkpoint 17's terminal/password-lock overlays and Campaign map filtering — no new content, no new commands, no changes to `Campaign.ts` or `MapEntitySystem.ts`. Four bugs were fixed, three originally reported after checkpoint 17's manual verification plus one found during checkpoint 17's own whole-branch review. Investigating the three originally-reported bugs before writing a fix found that two of their *stated* root causes didn't match what the code actually did (both bugs were real, the hypothesized mechanisms were not — see the decisions log for what was actually found). `ui/Terminal.ts`'s and `ui/PasswordLock.ts`'s `open()` methods now defer `inputEl.focus()` to the next frame via `requestAnimationFrame` rather than calling it synchronously within the same "E" keydown event `InteractSystem` is still processing, which is what was causing a literal "e" character to appear in the freshly-opened input. Their `close()` methods now similarly defer the `onClose()` pointer-relock callback to the next frame, which fixes Escape not re-locking the pointer (the × button was never affected, since a mouse click's native focus-blur already happens before any of this code runs, giving the browser's pointer-lock/focus machinery time to settle that Escape's own explicit `inputEl.blur()` call didn't get). Both overlays' `root` elements are now full-screen backdrops (mirroring `ui/MainMenu.ts`'s own root), with the previously-`root`-level box styling moved onto a new inner `panel` child — this closes a gap where clicking anywhere outside the small centered panel landed on the canvas underneath and re-locked the pointer (resuming gameplay) while the overlay was still visibly open. `ui/MainMenu.ts`'s `isMapSupportedForMode()` now treats a mode as "requiring an explicitly-dedicated map" the moment any map declares `supportedModes` including it, rather than always returning `true` for mode-agnostic maps regardless of which mode is being checked — this is what makes `campaign_room1` (the only map that opts into `"campaign"`) correctly exclude Test Grid/Corridors under Campaign mode, while leaving Zombie Survival/Shooting Range (which no map opts into) completely unaffected. `Terminal.ts`'s copy-to-clipboard button also gained a `.catch()` on the clipboard write promise, fixing an unhandled-rejection console error with no player feedback when clipboard access is denied — found in the same whole-branch review as the click-outside-overlay bug and fixed alongside it since it touched the same file. Verified in-browser: [fill in only after Task 4 has actually been completed and confirmed by the user — do not write this from the plan's expected behavior alone].
```

- [ ] **Step 4: Add decisions log entries**

Append after the last existing decisions-log line, before `## Future mechanics`:

```
- **Two of checkpoint 18's three originally-reported bugs had root causes that did not match their original hypotheses** — this is recorded here explicitly because it was asked for directly, and because it's a useful cautionary example for this project going forward: a bug report's *symptom* description is reliable, but its *stated mechanism* should still be verified against the actual code before writing a fix, not assumed. "Escape doesn't re-lock the pointer, × does" was hypothesized as "× and Escape call two different close code paths" — reading `ui/Terminal.ts`/`ui/PasswordLock.ts` directly showed both paths already called the exact same `close()` method, including the same `onClose()` pointer-relock callback; the real cause was a focus-transition race (`inputEl.blur()` racing the following `requestPointerLock()` call, with no settling time on the Escape path specifically, because a mouse click's native blur-before-click-handler timing accidentally gave the × path that settling time for free). "Campaign's Map group doesn't fully exclude Test Grid/Corridors" was hypothesized as "the click handler for grayed-out options isn't actually disabled, only styled to look disabled" — reading `ui/MainMenu.ts`'s `updateMapAvailability()` directly showed it already sets `pointerEvents: "none"` on unsupported buttons, which does genuinely block clicks; the real cause was a boolean-logic gap in `isMapSupportedForMode()` itself (mode-agnostic maps returned `true` — supported — for every mode unconditionally, so Test Grid/Corridors were never even greyed out under Campaign, let alone "greyed but clickable"). Only the third bug ("E" leaking into the input) matched its original hypothesis exactly.
- A fourth bug — clicking outside the small overlay panel re-locks the pointer and resumes gameplay while the overlay is still open — was not in the original checkpoint-18 report at all. It was found during checkpoint 17's own final whole-branch review (an `opus`-level pass over the entire checkpoint-17 diff, run as part of this project's established subagent-driven-development process), which specifically looks for issues per-task review and manual testing didn't catch. It was folded into checkpoint 18 rather than triggering a separate fix-and-rereview cycle, since it touches exactly the same two files (`ui/Terminal.ts`, `ui/PasswordLock.ts`) checkpoint 18 was already scoped to.
- `ui/Terminal.ts`'s and `ui/PasswordLock.ts`'s `root` elements (checkpoint 18) are now full-screen backdrops with an inner `panel` child holding the actual visible box styling, mirroring `ui/MainMenu.ts`'s own root/content structure — not because these overlays needed to look like the main menu, but because "capture every click while open" requires covering the full click-target area, and a small fixed-size centered box can never do that on its own regardless of `pointerEvents` settings on itself, since clicks landing *outside* its bounds never reach it at all (they fall straight through to whatever is positioned underneath — the canvas).
- The `requestAnimationFrame`-deferral fix for both the input-focus leak (checkpoint 18) and the Escape-relock race (checkpoint 18) is guarded by an `isOpen()`/`!isOpen()` check inside the deferred callback in both files — without this guard, a very fast open-close-open (or close-open-close) sequence within a single frame could let a stale deferred callback act on the wrong state (e.g. focusing an input that was already closed again, or re-locking the pointer for an overlay that was already reopened). This mirrors the same defensive pattern already used elsewhere in this codebase for idempotency guards (e.g. `MapEntitySystem.createButton()`'s `if (!door.visible) return;`).
- Checkpoint 18 deliberately left several other whole-branch-review findings unfixed, tracked as known debt rather than silently ignored: neither overlay has a `destroy()`/teardown method (latent today since `startGame()` only ever runs once; would matter if a future mid-session menu return re-calls it — see the existing future-mechanics entry on that topic); `Campaign.getSummaryLines()` returns non-empty strings that can never actually be displayed, since Campaign has no death path (unlike `ShootingRange.getSummaryLines()`, which deliberately returns `[]` for the identical reason); `MapDef.supportedModes` is typed as a plain `string[]` with no compile- or run-time validation against `ModeId`, so a typo'd mode id would compile cleanly and silently make a map unselectable under every mode; and `main.ts`'s `openPasswordLock` callback calls `campaign.markObjectiveComplete()` unconditionally regardless of whether Campaign is actually the active mode (harmless today only because `campaign_room1` is the sole map with a `password_lock` entity and it's Campaign-exclusive). None of these were in scope for this bugfix-only checkpoint.
```

- [ ] **Step 5: Verify the project still builds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Search for staleness this checkpoint may have introduced**

Read the entire CLAUDE.md document (not just the sections edited above) and specifically check for:
- Any sentence still describing `Terminal.ts`/`PasswordLock.ts`'s `open()` as calling `inputEl.focus()` synchronously, or `close()` as calling `onClose()` synchronously.
- Any sentence still describing either overlay's `root` element as a small centered box rather than a full-screen backdrop.
- Any sentence still describing `isMapSupportedForMode()`'s old unconditional-true-for-undefined behavior as current.
- Any other claim this checkpoint's changes would now contradict.

If you find staleness, fix it using the established `**Superseded at checkpoint N** (was: "...")` convention or an inline parenthetical, matching whichever fits the specific sentence. If you find nothing beyond what Steps 1-4 already added, say so explicitly in your commit's task report.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Checkpoint 18: Campaign mode bugfixes

Four small pointer-lock/input-focus bugs, no new features, fixed only
in ui/Terminal.ts, ui/PasswordLock.ts, and ui/MainMenu.ts.

Investigating the three originally-reported bugs before writing fixes
found that two of their stated root causes didn't match what the code
actually did:

- "E leaks into the newly-opened input" -- hypothesis matched reality:
  open() called inputEl.focus() synchronously within the same keydown
  event InteractSystem was still processing for that same E press.
  Fixed by deferring focus() to the next frame via
  requestAnimationFrame, guarded by isOpen() in case the overlay
  closed again before the callback fires.

- "Escape doesn't re-lock the pointer, x does" -- the hypothesis
  ("two different close code paths") was wrong; both paths already
  called the same close() method including the same onClose()
  pointer-relock callback. The real cause was a focus-transition
  race: close()'s own inputEl.blur() and the following
  requestPointerLock() call were happening back-to-back in the same
  synchronous turn on the Escape path, with no settling time -- the x
  path never raced because a mouse click's native blur-before-handler
  timing gave it that settling time for free. Fixed by deferring
  onClose() to the next frame too, guarded by !isOpen().

- "Campaign's Map group doesn't fully exclude Test Grid/Corridors" --
  the hypothesis ("click handler not actually disabled") was wrong;
  updateMapAvailability() already sets pointerEvents: none on
  unsupported buttons, genuinely blocking clicks. The real cause was
  a boolean-logic gap in isMapSupportedForMode(): a mode-agnostic map
  returned true unconditionally for every mode, so Test Grid/
  Corridors were never even greyed out under Campaign. Fixed so a
  mode-agnostic map is only "supported" under a mode that has no
  other map explicitly dedicated to it.

A fourth bug, not in the original report, was found during
checkpoint 17's own whole-branch review: clicking outside the small
overlay panel landed on the canvas underneath and re-locked the
pointer (resuming gameplay) while the overlay was still open, since
neither overlay had a full-screen click-capturing backdrop the way
ui/MainMenu.ts does. Fixed by restructuring both overlays' root into
a full-screen backdrop with the visible box moved to an inner panel
child, folded into this checkpoint since it touches the same files.

Terminal.ts's copy-to-clipboard button also gained a .catch() on the
clipboard write promise, found in the same whole-branch review.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Verify the commit**

Run: `git status` and `git log -1 --stat`
Expected: working tree clean; the commit touches `CLAUDE.md` (plus this plan doc, if not already committed) — `src/ui/Terminal.ts`, `src/ui/PasswordLock.ts`, and `src/ui/MainMenu.ts` should all show no changes from this task, since they were already committed by Tasks 1-3.

---

## Self-Review Notes

- **Spec coverage:** Bug 1 fix (deferred `focus()`, both files) ✓; Bug 2 fix (deferred `onClose()`, both files, applied uniformly to both trigger paths) ✓; Bug 3 fix (`isMapSupportedForMode()` rewritten, no `updateMapAvailability()` change needed) ✓; Bug 4 fix (full-screen backdrop + inner panel, both files) — added during planning after the checkpoint-17 whole-branch review surfaced it, explicitly called out as not in the original request ✓; clipboard `.catch()` — bundled Minor fix, same file as Bug 4 ✓; manual verification checklist covering all four bugs' symptoms plus rapid-toggle and full regression checks ✓; CLAUDE.md documenting the actual root causes vs. original hypotheses for all bugs, plus the deliberately-deferred debt items, per the explicit request ✓.
- **Placeholder scan:** no TBD/TODO; every step has complete, exact code (both Task 1 and Task 2 give the full before/after file contents, not fragments, since the constructor's DOM structure changes shape); the one intentional placeholder (`[fill in only after Task 4...]` in Task 5 Step 3) is explicitly marked as conditional on manual verification actually happening first, matching this project's own established convention for "Verified in-browser" sentences (see every prior checkpoint's CLAUDE.md task).
- **Type consistency check:** `Terminal`'s and `PasswordLock`'s public constructors and `open()` signatures are unchanged from checkpoint 17 (`constructor(onOpen: () => void, onClose: () => void)`, `open(terminalDef: TerminalDef): void` / `open(terminalDef: TerminalDef, onSuccess: () => void): void`) — no caller in `main.ts` needs any change, and this plan doesn't touch `main.ts` at all. `isMapSupportedForMode(map: MapDef, modeId: ModeId): boolean`'s signature is unchanged; only its body changes, and it still only reads `this.maps`/`map.supportedModes`, both already in scope.
- **Compile-safety check:** all three tasks are independent, non-breaking, single-file changes — no task introduces a signature change that could break another file, so there's no expected-single-downstream-error sequencing needed anywhere in this checkpoint (unlike checkpoints 15-17's constructor-extension tasks). Each task's own `npm run build` check is sufficient; no cross-task compile-order risk exists.
- **Architecture-rule cross-check:** all three touched files are `ui/` files with no new imports added — `Terminal.ts`/`PasswordLock.ts` still only import from `../types`; `MainMenu.ts`'s fix reads only its own already-imported `MapDef`/`ModeId`/`this.maps`. No `core/`/`content/`/`modes/` boundary is touched by this checkpoint at all.
