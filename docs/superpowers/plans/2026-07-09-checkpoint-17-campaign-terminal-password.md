# Checkpoint 17: Campaign Mode — Room 1 Terminal + Password Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third `GameMode`, `Campaign`, alongside `ZombieSurvival`/`ShootingRange`: a single-room puzzle where the player reads a password out of a fake terminal filesystem and enters it into a door's password lock to open it. No zombies, no weapon-firing requirement, no persistence.

**Architecture:** Two new `MapEntity` types (`"terminal"`, `"password_lock"`) spawned by the existing `MapEntitySystem` (same shape as its existing `createWallBuy()`/`createButton()`), two new DOM-overlay UI classes (`ui/Terminal.ts`, `ui/PasswordLock.ts`, same technique as `ui/HUD.ts`/`ui/MainMenu.ts`) wired into `MapEntitySystem` via injected callbacks (matching the existing `onDoorStateChanged`/`onMeleeAttack` pattern), a hardcoded `Campaign` `GameMode` implementation (mode-building rule: hardcoded first, no new interface), and one new content file (`content/terminals.ts`) plus one new map (`campaign_room1`) gated behind a new `MapDef.supportedModes` field that `ui/MainMenu.ts`'s Map group now filters/grays by.

**Tech Stack:** TypeScript, Three.js, Vite — no new dependencies.

## Global Constraints

- `core/` never references `content/` or `modes/` directly — it only consumes typed interfaces. `MapEntitySystem` (a `core/` file) must never import `ui/Terminal.ts`, `ui/PasswordLock.ts`, or `modes/Campaign.ts` — it receives `openTerminal`/`openPasswordLock` as injected callback functions, the same pattern as the existing `onDoorStateChanged` parameter.
- All game content (weapons, enemies, maps, sounds, terminals) lives in `content/*.ts` as typed data, never hardcoded in logic.
- New game modes are built hardcoded first — `Campaign` implements the existing `GameMode` interface directly; do not generalize further.
- Single-responsibility per file — `ui/Terminal.ts` and `ui/PasswordLock.ts` are separate files (different lifecycles/concerns), not folded into `ui/HUD.ts`.
- Every new cross-system dependency is injected via constructor params or callbacks (matching `onDoorStateChanged`/`onMeleeAttack`/`onDeath`), never a direct import across a forbidden boundary.
- The password (`content/terminals.ts`) exists in exactly one place in source (a single `const`), even though a file's `content` string interpolates it via template literal.
- Explicitly out of scope this checkpoint: door does not lock behind the player, no `localStorage` persistence, no zombies/`EnemyAI` usage, no room 2 / hardware-puzzle entity type, no changes to `ZombieSurvival`/`ShootingRange` behavior.

---

### Task 1: Extend `types/index.ts` for terminals and mode-gated maps

**Files:**
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `MapEntity` gains `"terminal"`/`"password_lock"` in its `type` union and a new optional `terminalId?: string` field. New exported interfaces `TerminalFile`, `TerminalDirectory`, `TerminalDef`. `MapDef` gains an optional `supportedModes?: string[]` field. All later tasks import these from `../types` (or `../../types` from `ui/`).

This task is purely additive — nothing in the codebase consumes these new types yet, so the build stays clean.

- [ ] **Step 1: Extend `MapEntity`'s type union and add `terminalId`**

The current `MapEntity` interface:

```typescript
export interface MapEntity {
  id: string;
  type:
    | "door"
    | "button"
    | "pickup"
    | "spawn"
    | "enemy_spawn"
    | "target"
    | "objective"
    | "wall_buy";
  position: [number, number, number];
  linkedTo?: string; // a related entity's id (e.g. button -> door), or for
  // "wall_buy", a Weapon id in content/weapons.ts
  cost?: number; // "button" only (checkpoint 12): pointsBalance price to open
  // the linked door; absent/undefined means free, same as every button
  // before this checkpoint. Unrelated to "wall_buy"'s price, which comes
  // from Weapon.cost, not this field.
}
```

Replace it with:

```typescript
export interface MapEntity {
  id: string;
  type:
    | "door"
    | "button"
    | "pickup"
    | "spawn"
    | "enemy_spawn"
    | "target"
    | "objective"
    | "wall_buy"
    | "terminal"
    | "password_lock";
  position: [number, number, number];
  linkedTo?: string; // a related entity's id (e.g. button -> door), or for
  // "wall_buy", a Weapon id in content/weapons.ts, or for "terminal", a
  // TerminalDef id in content/terminals.ts, or for "password_lock", the
  // linked door's MapEntity id (same pattern "button" already uses)
  cost?: number; // "button" only (checkpoint 12): pointsBalance price to open
  // the linked door; absent/undefined means free, same as every button
  // before this checkpoint. Unrelated to "wall_buy"'s price, which comes
  // from Weapon.cost, not this field.
  terminalId?: string; // "password_lock" only (checkpoint 17): a TerminalDef
  // id in content/terminals.ts, the terminal whose password this lock
  // checks against. Separate from linkedTo because a password lock has two
  // distinct relationships (which door, which terminal) -- unlike
  // button/wall_buy, which only ever have one.
}
```

- [ ] **Step 2: Add `supportedModes` to `MapDef`**

The current `MapDef` interface:

```typescript
export interface MapDef {
  id: string;
  name: string; // player-facing display text, e.g. "Corridors" (id stays the lookup key)
  grid: number[][]; // 0 = floor, 1 = wall
  entities: MapEntity[];
}
```

Replace it with:

```typescript
export interface MapDef {
  id: string;
  name: string; // player-facing display text, e.g. "Corridors" (id stays the lookup key)
  grid: number[][]; // 0 = floor, 1 = wall
  entities: MapEntity[];
  supportedModes?: string[]; // checkpoint 17: if present, ui/MainMenu.ts's
  // Map group only allows selecting this map when the currently-selected
  // mode's id is in this list (mirrors the Enemy group's existing
  // mode-based graying). undefined (test-grid, corridors) means
  // mode-agnostic, selectable under any mode -- unchanged from before this
  // checkpoint.
}
```

- [ ] **Step 3: Add the terminal content interfaces**

Immediately after the `MapDef` interface (before `export interface SoundDef`), add:

```typescript
// A tiny fake filesystem for the checkpoint-17 hacking-terminal minigame
// (ui/Terminal.ts navigates it with ls/cd/cat). Deliberately a plain
// recursive tree, not a flat path-keyed map -- "cd" needs a real directory
// to descend into and a real parent to pop back to.
export interface TerminalFile {
  name: string;
  content: string;
}

export interface TerminalDirectory {
  name: string;
  files: TerminalFile[];
  directories: TerminalDirectory[];
}

export interface TerminalDef {
  id: string;
  password: string; // checked by ui/PasswordLock.ts against the linked
  // "password_lock" MapEntity's input. Also (via template-literal
  // interpolation, not a second hardcoded copy) appears inside root's file
  // tree somewhere, so the player can find it in-fiction via cat.
  root: TerminalDirectory;
}
```

- [ ] **Step 4: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors — purely additive type changes, nothing consumes them yet.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts
git commit -m "Checkpoint 17 task 1: extend types for terminal/password-lock entities and mode-gated maps"
```

---

### Task 2: `content/terminals.ts` — the Room 1 terminal content

**Files:**
- Create: `src/content/terminals.ts`

**Interfaces:**
- Consumes: `TerminalDef` (Task 1).
- Produces: `TERMINALS: TerminalDef[]`, containing one entry, `id: "room1_terminal"`. Consumed by Task 8 (`MapEntitySystem.ts`, via `findById()`) and Task 9 (`main.ts`, imported and passed into `MapEntitySystem`'s constructor).

- [ ] **Step 1: Create the file**

```typescript
import type { TerminalDef } from "../types";

// The password lives in exactly one place in source -- this constant --
// even though it also appears (via template-literal interpolation, not a
// second hardcoded copy) inside the fake filesystem's file content below.
// If this file ever changes, never hardcode the password a second time.
const ROOM1_PASSWORD = "X7K-92Q4";

export const TERMINALS: TerminalDef[] = [
  {
    id: "room1_terminal",
    password: ROOM1_PASSWORD,
    // Root has zero files directly in it and exactly one subdirectory, so
    // "cd" is actually exercised by a player solving this, not dead
    // functionality only "ls"/"cat" ever touch.
    root: {
      name: "/",
      files: [],
      directories: [
        {
          name: "backup",
          files: [
            {
              name: "credentials.txt",
              content: `door override password: ${ROOM1_PASSWORD}`,
            },
          ],
          directories: [],
        },
      ],
    },
  },
];
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors — a new, self-contained content file with no consumers yet.

- [ ] **Step 3: Commit**

```bash
git add src/content/terminals.ts
git commit -m "Checkpoint 17 task 2: add the Room 1 terminal content"
```

---

### Task 3: `content/maps.ts` — the `campaign_room1` map

**Files:**
- Modify: `src/content/maps.ts`

**Interfaces:**
- Consumes: `MapDef.supportedModes` (Task 1). References content ids `"room1_terminal"` (Task 2) and its own entity ids by string — no direct import of `content/terminals.ts` needed (maps reference terminal ids the same loosely-typed way `wall_buy` entities reference weapon ids: as plain strings, resolved later by whatever reads `MapEntity.linkedTo`).
- Produces: a new `MapDef`, `id: "campaign_room1"`, in the exported `MAPS` array. Consumed by Task 7 (`ui/MainMenu.ts`'s Map group, automatically, since it iterates the whole `MAPS` array) and Task 9 (`main.ts`, via `findById(MAPS, selections.mapId)`, unchanged lookup code).

This task only adds an array entry — nothing new reads `MapEntity.type === "terminal" | "password_lock"` until Task 8, so this map's new entity types are inert (silently un-spawned) until then. That's fine and expected; the build stays clean throughout.

- [ ] **Step 1: Add the `campaign_room1` map**

Append a new entry to the `MAPS` array (after the existing `"corridors"` entry, i.e. as the third array element), and add a short comment above the array update explaining the new map's shape. The array currently ends like this:

```typescript
      { id: "corridors_pickup_2", type: "pickup", position: [16, 0.3, 18] },
    ],
  },
];
```

Change it to:

```typescript
      { id: "corridors_pickup_2", type: "pickup", position: [16, 0.3, 18] },
    ],
  },
  // campaign_room1 (checkpoint 17): a single small room split by one
  // partition wall with one gap. The gap is sealed by campaign_door_1,
  // opened by campaign_lock_1 (a password_lock, not a button) once the
  // player finds the password via campaign_terminal_1. No enemy_spawn or
  // target entities -- supportedModes below excludes this map from the
  // modes (Zombie Survival, Shooting Range) that would ever look for them,
  // so they're not needed, unlike every other map in this array.
  {
    id: "campaign_room1",
    name: "Campaign: Room 1",
    supportedModes: ["campaign"],
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 0, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1],
    ],
    entities: [
      { id: "campaign_spawn_1", type: "spawn", position: [2, 0, 8] },
      {
        id: "campaign_terminal_1",
        type: "terminal",
        linkedTo: "room1_terminal",
        position: [10, 0.3, 8],
      },
      { id: "campaign_door_1", type: "door", position: [6, 1.5, 4] },
      {
        id: "campaign_lock_1",
        type: "password_lock",
        linkedTo: "campaign_door_1",
        terminalId: "room1_terminal",
        position: [6, 0.3, 6],
      },
    ],
  },
];
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/content/maps.ts
git commit -m "Checkpoint 17 task 3: add the campaign_room1 map"
```

---

### Task 4: `modes/Campaign.ts` — the hardcoded `GameMode` implementation

**Files:**
- Create: `src/modes/Campaign.ts`

**Interfaces:**
- Consumes: `GameMode` (existing, `src/modes/GameMode.ts`), `RunManager` (existing, `src/core/RunManager.ts`).
- Produces: `class Campaign implements GameMode`, with a public `markObjectiveComplete(): void` method (in addition to the four `GameMode` interface methods). Consumed by Task 9 (`main.ts`, constructed early and used both as the `openPasswordLock` success callback's target and as `gameMode` when `selections.modeId === "campaign"`).

This is a new, self-contained file implementing an existing interface — nothing references it yet, so the build stays clean.

- [ ] **Step 1: Create the file**

```typescript
import type { GameMode } from "./GameMode";
import type { RunManager } from "../core/RunManager";

// Hardcoded per this project's mode-building rule -- the third GameMode
// implementation, built directly against the already-extracted interface
// (ZombieSurvival/ShootingRange proved its shape at checkpoints 7-8) rather
// than generalizing further. Deliberately the simplest possible GameMode:
// no round logic, no enemy references, nothing zombie-related -- this
// checkpoint's whole objective is "find the password, open the door."
export class Campaign implements GameMode {
  private objectiveComplete = false;

  constructor(runManager: RunManager) {
    runManager.registerResettable(() => {
      this.objectiveComplete = false;
    });
  }

  start(): void {
    // Nothing to begin -- the terminal/password-lock entities are already
    // live from MapEntitySystem's construction.
  }

  update(_deltaTime: number): void {
    // No per-frame logic -- Campaign has no rounds, timers, or AI to drive.
  }

  getStatusLine(): string {
    return this.objectiveComplete ? "Objective: complete" : "Objective: find the password";
  }

  getSummaryLines(): string[] {
    return this.objectiveComplete ? ["Objective complete"] : ["Objective incomplete"];
  }

  // Called by main.ts's openPasswordLock callback on a correct password
  // submission (see Task 9) -- Campaign itself never reaches into
  // MapEntitySystem/ui/PasswordLock.ts to detect this on its own.
  markObjectiveComplete(): void {
    this.objectiveComplete = true;
  }
}
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/modes/Campaign.ts
git commit -m "Checkpoint 17 task 4: add the hardcoded Campaign GameMode"
```

---

### Task 5: `ui/Terminal.ts` — the hacking-terminal DOM overlay

**Files:**
- Create: `src/ui/Terminal.ts`

**Interfaces:**
- Consumes: `TerminalDef`/`TerminalDirectory` (Task 1).
- Produces: `class Terminal`, constructor `(onOpen: () => void, onClose: () => void)`, public `open(terminalDef: TerminalDef): void`. Consumed by Task 9 (`main.ts`, constructed with `playerController.controls.unlock`/`.lock` callbacks, and its `open` method referenced inside the `openTerminal` callback passed into `MapEntitySystem`).

This is a new, self-contained file — nothing references it yet, so the build stays clean.

- [ ] **Step 1: Create the file**

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

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/Terminal.ts
git commit -m "Checkpoint 17 task 5: add the Terminal DOM overlay (ls/cd/cat + copy-password)"
```

---

### Task 6: `ui/PasswordLock.ts` — the password-entry DOM overlay

**Files:**
- Create: `src/ui/PasswordLock.ts`

**Interfaces:**
- Consumes: `TerminalDef` (Task 1).
- Produces: `class PasswordLock`, constructor `(onOpen: () => void, onClose: () => void)`, public `open(terminalDef: TerminalDef, onSuccess: () => void): void`. Consumed by Task 9 (`main.ts`, constructed with `playerController.controls.unlock`/`.lock` callbacks, and its `open` method referenced inside the `openPasswordLock` callback passed into `MapEntitySystem`).

This is a new, self-contained file — nothing references it yet, so the build stays clean.

- [ ] **Step 1: Create the file**

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

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/PasswordLock.ts
git commit -m "Checkpoint 17 task 6: add the PasswordLock DOM overlay"
```

---

### Task 7: `ui/MainMenu.ts` — Campaign mode option, Enemy graying, Map filtering by `supportedModes`

**Files:**
- Modify: `src/ui/MainMenu.ts`

**Interfaces:**
- Consumes: `MapDef.supportedModes` (Task 1).
- Produces: `ModeId` widens to `"zombie" | "range" | "campaign"`. Consumed by Task 9 (`main.ts`'s mode-selection `if`/`else if`/`else`, which needs `"campaign"` to be a valid `ModeId` value before it can branch on it).

This task only changes `ui/MainMenu.ts` — `main.ts`'s existing `selections.modeId === "zombie" ? ... : ...` ternary still compiles fine against the widened `ModeId` union (the else-branch just becomes reachable for both `"range"` and `"campaign"` until Task 9 fixes that), so the build stays clean throughout this task.

- [ ] **Step 1: Widen `ModeId` and add the Campaign mode option**

The current top of the file:

```typescript
import type { Weapon, EnemyDef, MapDef } from "../types";

// The menu's own notion of which modes exist — not content, since game
// modes are code (ZombieSurvival/ShootingRange), not typed data, per the
// project's mode-building rule. Mirrors the ModeName union that used to be
// hardcoded directly in main.ts before this checkpoint.
export type ModeId = "zombie" | "range";
```

Change it to:

```typescript
import type { Weapon, EnemyDef, MapDef } from "../types";

// The menu's own notion of which modes exist — not content, since game
// modes are code (ZombieSurvival/ShootingRange/Campaign), not typed data,
// per the project's mode-building rule. Mirrors the ModeName union that
// used to be hardcoded directly in main.ts before this checkpoint.
export type ModeId = "zombie" | "range" | "campaign";
```

The current `MODE_OPTIONS`:

```typescript
const MODE_OPTIONS: { id: ModeId; label: string }[] = [
  { id: "zombie", label: "Zombie Survival" },
  { id: "range", label: "Shooting Range" },
];
```

Change it to:

```typescript
const MODE_OPTIONS: { id: ModeId; label: string }[] = [
  { id: "zombie", label: "Zombie Survival" },
  { id: "range", label: "Shooting Range" },
  { id: "campaign", label: "Campaign" },
];
```

- [ ] **Step 2: Store the `maps` array as an instance field**

The current class field declarations:

```typescript
export class MainMenu {
  private readonly root: HTMLDivElement;
  private readonly enemyGroup: HTMLDivElement;
```

Change it to:

```typescript
export class MainMenu {
  private readonly root: HTMLDivElement;
  private readonly enemyGroup: HTMLDivElement;
  private readonly maps: MapDef[];
```

The current start of the constructor:

```typescript
  constructor(
    weapons: Weapon[],
    enemies: EnemyDef[],
    maps: MapDef[],
    onStart: (selections: GameSelections) => void,
  ) {
    this.selectedMapId = maps[0].id;
    this.selectedWeaponId = weapons[0].id;
    this.selectedEnemyId = enemies[0].id;
```

Change it to:

```typescript
  constructor(
    weapons: Weapon[],
    enemies: EnemyDef[],
    maps: MapDef[],
    onStart: (selections: GameSelections) => void,
  ) {
    this.maps = maps;
    this.selectedMapId = maps[0].id;
    this.selectedWeaponId = weapons[0].id;
    this.selectedEnemyId = enemies[0].id;
```

- [ ] **Step 3: Apply map availability once at construction**

The current map-group construction:

```typescript
    // No mode-based filtering here — maps are mode-agnostic for now (see
    // CLAUDE.md decisions log). Every map works under both Zombie Survival
    // and Shooting Range, since every map is required to carry both
    // enemy_spawn and target entities.
    const mapOptions: SelectableOption[] = maps.map((map) => ({
      id: map.id,
      label: map.name,
    }));
    const mapGroup = this.buildGroup(
      "Map",
      mapOptions,
      this.selectedMapId,
      this.mapButtons,
      (id) => this.selectMap(id),
    );
    this.root.appendChild(mapGroup);
```

Change it to:

```typescript
    // Checkpoint 17: mode-based filtering/graying now exists via
    // MapDef.supportedModes -- see updateMapAvailability() below. Maps
    // without supportedModes (test-grid, corridors) remain mode-agnostic,
    // selectable under any mode, unchanged from before this checkpoint.
    const mapOptions: SelectableOption[] = maps.map((map) => ({
      id: map.id,
      label: map.name,
    }));
    const mapGroup = this.buildGroup(
      "Map",
      mapOptions,
      this.selectedMapId,
      this.mapButtons,
      (id) => this.selectMap(id),
    );
    this.root.appendChild(mapGroup);

    // Checkpoint 17: apply the default mode's map availability immediately
    // at construction, the same way applySelection() above already sets
    // initial button styling -- a no-op today (the default mode, "zombie",
    // and both existing maps are mode-agnostic), but keeps this correct
    // even if the default mode or content ever changes.
    this.updateMapAvailability(this.selectedModeId);
```

- [ ] **Step 4: Gray the Enemy group under Campaign too, and update map availability on mode change**

The current `selectMode()`:

```typescript
  private selectMode(modeId: ModeId): void {
    this.selectedModeId = modeId;
    this.applySelection(this.modeButtons, modeId);

    const isRange = modeId === "range";
    this.enemyGroup.style.opacity = isRange ? "0.4" : "1";
    this.enemyGroup.style.pointerEvents = isRange ? "none" : "auto";
  }
```

Change it to:

```typescript
  private selectMode(modeId: ModeId): void {
    this.selectedModeId = modeId;
    this.applySelection(this.modeButtons, modeId);

    // Checkpoint 17: Campaign has no enemies either, same as Shooting
    // Range -- both gray out the Enemy group.
    const hideEnemyGroup = modeId === "range" || modeId === "campaign";
    this.enemyGroup.style.opacity = hideEnemyGroup ? "0.4" : "1";
    this.enemyGroup.style.pointerEvents = hideEnemyGroup ? "none" : "auto";

    this.updateMapAvailability(modeId);
  }
```

- [ ] **Step 5: Add `isMapSupportedForMode()` and `updateMapAvailability()`**

The current `selectMap()`:

```typescript
  private selectMap(mapId: string): void {
    this.selectedMapId = mapId;
    this.applySelection(this.mapButtons, mapId);
  }
```

Change it to (adding two new private methods immediately after `selectMap()`):

```typescript
  private selectMap(mapId: string): void {
    this.selectedMapId = mapId;
    this.applySelection(this.mapButtons, mapId);
  }

  // A map with no supportedModes is mode-agnostic (test-grid, corridors,
  // unchanged from before checkpoint 17); a map that declares supportedModes
  // (campaign_room1) is only selectable when the current mode is in that
  // list. Mirrors the Enemy group's existing mode-based graying, just keyed
  // off a different field.
  private isMapSupportedForMode(map: MapDef, modeId: ModeId): boolean {
    return map.supportedModes === undefined || map.supportedModes.includes(modeId);
  }

  // Grays out (and disables clicks on) every map button not valid for
  // modeId, then — if the currently selected map just became invalid —
  // falls back to the first map that IS valid, so the Start button can
  // never be pressed with an impossible mode/map pairing.
  private updateMapAvailability(modeId: ModeId): void {
    for (const map of this.maps) {
      const button = this.mapButtons.get(map.id);
      if (!button) continue;
      const supported = this.isMapSupportedForMode(map, modeId);
      button.style.opacity = supported ? "1" : "0.4";
      button.style.pointerEvents = supported ? "auto" : "none";
    }

    const currentMap = this.maps.find((map) => map.id === this.selectedMapId);
    if (currentMap && !this.isMapSupportedForMode(currentMap, modeId)) {
      const fallback = this.maps.find((map) => this.isMapSupportedForMode(map, modeId));
      if (fallback) this.selectMap(fallback.id);
    }
  }
```

- [ ] **Step 6: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/MainMenu.ts
git commit -m "Checkpoint 17 task 7: add Campaign mode option, gray Enemy group under it, filter Map group by supportedModes"
```

---

### Task 8: `MapEntitySystem.ts` — `createTerminal()`/`createPasswordLock()`

**Files:**
- Modify: `src/core/MapEntitySystem.ts`

**Interfaces:**
- Consumes: `TerminalDef` (Task 1), `TERMINALS` is NOT imported here (passed in as a constructor parameter, same as `weapons: Weapon[]` already is).
- Produces: `MapEntitySystem`'s constructor gains three new required parameters, appended at the end: `terminals: TerminalDef[]`, `openTerminal: (terminalDef: TerminalDef) => void`, `openPasswordLock: (terminalDef: TerminalDef, onCorrectPassword: () => void) => void`. Consumed by Task 9 (`main.ts`, the only call site).

This task alone will leave `main.ts` failing to compile (its `new MapEntitySystem(...)` call is missing the three new arguments) — that's expected; Task 9 fixes it immediately next.

- [ ] **Step 1: Add the `TerminalDef` import and new constants**

The current imports:

```typescript
import * as THREE from "three";
import { CELL_SIZE, WALL_HEIGHT } from "./MapLoader";
import { computeCollisionBox } from "./utils/CollisionBox";
import { findById } from "./utils/Lookup";
import type { MapDef, MapEntity, Weapon } from "../types";
import type { WeaponSystem } from "./WeaponSystem";
import type { RunManager } from "./RunManager";
import type { RaycastRegistry } from "./RaycastRegistry";
import type { GameState } from "../state/GameState";
```

Change the types import line to:

```typescript
import type { MapDef, MapEntity, Weapon, TerminalDef } from "../types";
```

The current constants:

```typescript
const DOOR_COLOR = 0x8b5a2b;
const BUTTON_COLOR = 0xcc2222;
const BUTTON_EMISSIVE = 0x330000;
const BUTTON_SIZE = 0.4;
const PICKUP_COLOR = 0x22aacc;
const PICKUP_EMISSIVE = 0x003344;
const PICKUP_SIZE = 0.4;
const PICKUP_AMMO_AMOUNT = 24;
const WALL_BUY_COLOR = 0xffd700;
const WALL_BUY_EMISSIVE = 0x554400;
const WALL_BUY_SIZE = 0.5;
```

Change it to:

```typescript
const DOOR_COLOR = 0x8b5a2b;
const BUTTON_COLOR = 0xcc2222;
const BUTTON_EMISSIVE = 0x330000;
const BUTTON_SIZE = 0.4;
const PICKUP_COLOR = 0x22aacc;
const PICKUP_EMISSIVE = 0x003344;
const PICKUP_SIZE = 0.4;
const PICKUP_AMMO_AMOUNT = 24;
const WALL_BUY_COLOR = 0xffd700;
const WALL_BUY_EMISSIVE = 0x554400;
const WALL_BUY_SIZE = 0.5;
const TERMINAL_COLOR = 0x223344;
const TERMINAL_EMISSIVE = 0x114477;
const TERMINAL_SIZE = 0.6;
const PASSWORD_LOCK_COLOR = 0x444444;
const PASSWORD_LOCK_EMISSIVE = 0x552200;
const PASSWORD_LOCK_SIZE = 0.3;
```

- [ ] **Step 2: Update the class doc comment**

The current comment:

```typescript
// Spawns one mesh per door/button/pickup/wall_buy MapEntity and wires their
// interaction behavior. Kept separate from MapLoader: MapLoader's job is
// grid-to-geometry and spawn lookup, this is entity behavior — a different
// responsibility per the single-responsibility-per-file rule.
export class MapEntitySystem {
```

Change it to:

```typescript
// Spawns one mesh per door/button/pickup/wall_buy/terminal/password_lock
// MapEntity and wires their interaction behavior. Kept separate from
// MapLoader: MapLoader's job is grid-to-geometry and spawn lookup, this is
// entity behavior — a different responsibility per the
// single-responsibility-per-file rule.
export class MapEntitySystem {
```

- [ ] **Step 3: Extend the constructor**

The current constructor:

```typescript
  constructor(
    mapDef: MapDef,
    weaponSystem: WeaponSystem,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
    gameState: GameState,
    weapons: Weapon[],
  ) {
    const doorMeshById = new Map<string, THREE.Mesh>();

    for (const entity of mapDef.entities) {
      if (entity.type === "door") {
        doorMeshById.set(
          entity.id,
          this.createDoor(entity, runManager, raycastRegistry, onDoorStateChanged),
        );
      }
    }

    for (const entity of mapDef.entities) {
      if (entity.type === "button") {
        this.createButton(entity, doorMeshById, raycastRegistry, onDoorStateChanged, gameState);
      } else if (entity.type === "pickup") {
        this.createPickup(entity, weaponSystem, runManager, raycastRegistry);
      } else if (entity.type === "wall_buy") {
        this.createWallBuy(entity, weapons, weaponSystem, gameState, raycastRegistry);
      }
    }
  }
```

Change it to:

```typescript
  constructor(
    mapDef: MapDef,
    weaponSystem: WeaponSystem,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
    gameState: GameState,
    weapons: Weapon[],
    terminals: TerminalDef[],
    openTerminal: (terminalDef: TerminalDef) => void,
    openPasswordLock: (terminalDef: TerminalDef, onCorrectPassword: () => void) => void,
  ) {
    const doorMeshById = new Map<string, THREE.Mesh>();

    for (const entity of mapDef.entities) {
      if (entity.type === "door") {
        doorMeshById.set(
          entity.id,
          this.createDoor(entity, runManager, raycastRegistry, onDoorStateChanged),
        );
      }
    }

    for (const entity of mapDef.entities) {
      if (entity.type === "button") {
        this.createButton(entity, doorMeshById, raycastRegistry, onDoorStateChanged, gameState);
      } else if (entity.type === "pickup") {
        this.createPickup(entity, weaponSystem, runManager, raycastRegistry);
      } else if (entity.type === "wall_buy") {
        this.createWallBuy(entity, weapons, weaponSystem, gameState, raycastRegistry);
      } else if (entity.type === "terminal") {
        this.createTerminal(entity, terminals, raycastRegistry, openTerminal);
      } else if (entity.type === "password_lock") {
        this.createPasswordLock(
          entity,
          doorMeshById,
          terminals,
          raycastRegistry,
          onDoorStateChanged,
          openPasswordLock,
        );
      }
    }
  }
```

- [ ] **Step 4: Add `createTerminal()` and `createPasswordLock()`**

The current end of the file:

```typescript
  private createWallBuy(
    entity: MapEntity,
    weapons: Weapon[],
    weaponSystem: WeaponSystem,
    gameState: GameState,
    raycastRegistry: RaycastRegistry,
  ): void {
    if (!entity.linkedTo) {
      throw new Error(`Wall-buy "${entity.id}" has no linkedTo weapon id`);
    }
    const weapon = findById(weapons, entity.linkedTo);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_BUY_SIZE, WALL_BUY_SIZE, WALL_BUY_SIZE),
      new THREE.MeshStandardMaterial({
        color: WALL_BUY_COLOR,
        emissive: WALL_BUY_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      const purchased = gameState.spendPoints(weapon.cost);
      if (purchased) {
        weaponSystem.pickupWeapon(weapon);
        console.log(
          `Wall-buy: purchased ${weapon.name} for ${weapon.cost} points, balance now ${gameState.pointsBalance}`,
        );
      } else {
        console.log(
          `Wall-buy: rejected (need ${weapon.cost}, have ${gameState.pointsBalance}) — balance unchanged`,
        );
      }
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);
  }
}
```

Change it to (adding two new private methods before the class's closing brace):

```typescript
  private createWallBuy(
    entity: MapEntity,
    weapons: Weapon[],
    weaponSystem: WeaponSystem,
    gameState: GameState,
    raycastRegistry: RaycastRegistry,
  ): void {
    if (!entity.linkedTo) {
      throw new Error(`Wall-buy "${entity.id}" has no linkedTo weapon id`);
    }
    const weapon = findById(weapons, entity.linkedTo);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_BUY_SIZE, WALL_BUY_SIZE, WALL_BUY_SIZE),
      new THREE.MeshStandardMaterial({
        color: WALL_BUY_COLOR,
        emissive: WALL_BUY_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      const purchased = gameState.spendPoints(weapon.cost);
      if (purchased) {
        weaponSystem.pickupWeapon(weapon);
        console.log(
          `Wall-buy: purchased ${weapon.name} for ${weapon.cost} points, balance now ${gameState.pointsBalance}`,
        );
      } else {
        console.log(
          `Wall-buy: rejected (need ${weapon.cost}, have ${gameState.pointsBalance}) — balance unchanged`,
        );
      }
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);
  }

  // Checkpoint 17: linkedTo here is a TerminalDef id (content/terminals.ts),
  // resolved via findById() the same way createWallBuy() resolves a Weapon
  // id -- same pattern, different content array. openTerminal is a generic
  // UI-trigger callback (this class never imports ui/Terminal.ts directly),
  // matching how onDoorStateChanged/onMeleeAttack are already injected
  // elsewhere in this codebase rather than reached into directly.
  private createTerminal(
    entity: MapEntity,
    terminals: TerminalDef[],
    raycastRegistry: RaycastRegistry,
    openTerminal: (terminalDef: TerminalDef) => void,
  ): void {
    if (!entity.linkedTo) {
      throw new Error(`Terminal "${entity.id}" has no linkedTo terminal id`);
    }
    const terminalDef = findById(terminals, entity.linkedTo);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(TERMINAL_SIZE, TERMINAL_SIZE, TERMINAL_SIZE),
      new THREE.MeshStandardMaterial({
        color: TERMINAL_COLOR,
        emissive: TERMINAL_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      openTerminal(terminalDef);
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);
  }

  // Checkpoint 17: mirrors createButton()'s shape closely, reusing the same
  // doorMeshById map rather than rebuilding it -- linkedTo is the door's
  // MapEntity id (like button), terminalId is a separate TerminalDef id
  // (unlike button/wall_buy, a password lock has two distinct relationships:
  // which door, which terminal). The idempotency guard (door already open ->
  // no-op) runs before the password-lock UI is even opened, the same
  // "check before doing anything" ordering createButton() already
  // establishes for its cost-gating.
  private createPasswordLock(
    entity: MapEntity,
    doorMeshById: Map<string, THREE.Mesh>,
    terminals: TerminalDef[],
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
    openPasswordLock: (terminalDef: TerminalDef, onCorrectPassword: () => void) => void,
  ): void {
    const door = entity.linkedTo ? doorMeshById.get(entity.linkedTo) : undefined;
    if (!door) {
      throw new Error(
        `Password lock "${entity.id}" has no matching door for linkedTo "${entity.linkedTo}"`,
      );
    }
    if (!entity.terminalId) {
      throw new Error(`Password lock "${entity.id}" has no terminalId`);
    }
    const terminalDef = findById(terminals, entity.terminalId);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(PASSWORD_LOCK_SIZE, PASSWORD_LOCK_SIZE, PASSWORD_LOCK_SIZE),
      new THREE.MeshStandardMaterial({
        color: PASSWORD_LOCK_COLOR,
        emissive: PASSWORD_LOCK_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      if (!door.visible) return; // idempotent: door already open

      openPasswordLock(terminalDef, () => {
        door.visible = false;
        onDoorStateChanged();
      });
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);
  }
}
```

- [ ] **Step 5: Verify `MapEntitySystem.ts` itself has no new errors, and confirm the one expected downstream error**

Run: `npm run build`
Expected: fails with exactly one error — `main.ts`'s `new MapEntitySystem(...)` call, something like `Expected 10 arguments, but got 7.` (a type/arity mismatch on that one call, since it's still passing only the original 7 arguments). Confirm no OTHER error appears. If you see any error you don't recognize as exactly this one expected downstream break, stop and report BLOCKED rather than guessing a fix.

- [ ] **Step 6: Commit**

```bash
git add src/core/MapEntitySystem.ts
git commit -m "Checkpoint 17 task 8: MapEntitySystem gains createTerminal()/createPasswordLock()"
```

---

### Task 9: `main.ts` wiring — construct `Campaign`/`Terminal`/`PasswordLock`, fix `MapEntitySystem`'s call, branch on three modes

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Campaign` (Task 4), `Terminal` (Task 5), `PasswordLock` (Task 6), `TERMINALS` (Task 2), `MapEntitySystem`'s extended constructor (Task 8), `ModeId` now including `"campaign"` (Task 7).
- Produces: nothing new for later tasks. This is the commit that restores a clean whole-project build after Task 8's expected error, and completes the feature's integration.

- [ ] **Step 1: Add the new imports**

The current import block:

```typescript
import * as THREE from "three";
import { SceneManager } from "./core/Scene";
import { loadMap, getSpawnPosition } from "./core/MapLoader";
import { PlayerController } from "./core/PlayerController";
import { WeaponSystem } from "./core/WeaponSystem";
import { AudioSystem } from "./core/AudioSystem";
import { InteractSystem } from "./core/InteractSystem";
import { PlayerState } from "./core/PlayerState";
import { RunManager } from "./core/RunManager";
import { MapEntitySystem } from "./core/MapEntitySystem";
import { RaycastRegistry } from "./core/RaycastRegistry";
import { WeaponViewmodel } from "./core/WeaponViewmodel";
import type { GameMode } from "./modes/GameMode";
import { ZombieSurvival } from "./modes/ZombieSurvival";
import { ShootingRange } from "./modes/ShootingRange";
import { HUD } from "./ui/HUD";
import { MainMenu } from "./ui/MainMenu";
import type { GameSelections } from "./ui/MainMenu";
import { GameState } from "./state/GameState";
import { findById } from "./core/utils/Lookup";
import { WEAPONS } from "./content/weapons";
import { ENEMIES } from "./content/enemies";
import { SOUNDS } from "./content/sounds";
import { MAPS } from "./content/maps";
```

Change it to:

```typescript
import * as THREE from "three";
import { SceneManager } from "./core/Scene";
import { loadMap, getSpawnPosition } from "./core/MapLoader";
import { PlayerController } from "./core/PlayerController";
import { WeaponSystem } from "./core/WeaponSystem";
import { AudioSystem } from "./core/AudioSystem";
import { InteractSystem } from "./core/InteractSystem";
import { PlayerState } from "./core/PlayerState";
import { RunManager } from "./core/RunManager";
import { MapEntitySystem } from "./core/MapEntitySystem";
import { RaycastRegistry } from "./core/RaycastRegistry";
import { WeaponViewmodel } from "./core/WeaponViewmodel";
import type { GameMode } from "./modes/GameMode";
import { ZombieSurvival } from "./modes/ZombieSurvival";
import { ShootingRange } from "./modes/ShootingRange";
import { Campaign } from "./modes/Campaign";
import { HUD } from "./ui/HUD";
import { MainMenu } from "./ui/MainMenu";
import type { GameSelections } from "./ui/MainMenu";
import { Terminal } from "./ui/Terminal";
import { PasswordLock } from "./ui/PasswordLock";
import { GameState } from "./state/GameState";
import { findById } from "./core/utils/Lookup";
import { WEAPONS } from "./content/weapons";
import { ENEMIES } from "./content/enemies";
import { SOUNDS } from "./content/sounds";
import { MAPS } from "./content/maps";
import { TERMINALS } from "./content/terminals";
```

- [ ] **Step 2: Construct `Campaign`, `Terminal`, and `PasswordLock` early**

The current code right after `const runManager = new RunManager(gameState, playerState);`:

```typescript
  const runManager = new RunManager(gameState, playerState);

  // The single shared "what can be hit/occluded by a ray" registry — every
  // solid or interactable object (walls, doors, buttons, pickups, wall_buys,
  // enemies) registers itself here once, and every raycasting system
  // (WeaponSystem's fire, EnemyAI's line-of-sight, InteractSystem's interact
  // ray, HUD's label occlusion) reads the same list.
  const raycastRegistry = new RaycastRegistry();
```

Change it to:

```typescript
  const runManager = new RunManager(gameState, playerState);

  // Checkpoint 17: constructed unconditionally here, before mapEntitySystem
  // — the same "always construct, branch on usage" pattern already used for
  // weaponSystem/mapEntitySystem (every run gets one regardless of mode).
  // Campaign's constructor only needs runManager, so it's cheap to build
  // this early; doing so lets the password-lock success callback below
  // reference it directly, mirroring how weaponViewmodel was moved earlier
  // in this function at checkpoint 16 so weaponSystem's onMeleeAttack
  // callback could reference it directly (see CLAUDE.md's checkpoint-16
  // decisions log for that precedent).
  const campaign = new Campaign(runManager);

  // Checkpoint 17: constructed before mapEntitySystem so its open() methods
  // can be referenced by the openTerminal/openPasswordLock callbacks passed
  // into MapEntitySystem's constructor below. Both release pointer lock on
  // open and re-lock on close, the same PlayerState.onDeath ->
  // controls.unlock() callback pattern used elsewhere in this function.
  const terminal = new Terminal(
    () => playerController.controls.unlock(),
    () => playerController.controls.lock(),
  );
  const passwordLock = new PasswordLock(
    () => playerController.controls.unlock(),
    () => playerController.controls.lock(),
  );

  // The single shared "what can be hit/occluded by a ray" registry — every
  // solid or interactable object (walls, doors, buttons, pickups, wall_buys,
  // enemies) registers itself here once, and every raycasting system
  // (WeaponSystem's fire, EnemyAI's line-of-sight, InteractSystem's interact
  // ray, HUD's label occlusion) reads the same list.
  const raycastRegistry = new RaycastRegistry();
```

- [ ] **Step 3: Pass the new arguments into `MapEntitySystem`'s constructor**

The current `MapEntitySystem` construction:

```typescript
  const mapEntitySystem = new MapEntitySystem(
    mapDef,
    weaponSystem,
    runManager,
    raycastRegistry,
    () => playerController.rebuildCollisionBoxes(),
    gameState,
    WEAPONS,
  );
```

Change it to:

```typescript
  const mapEntitySystem = new MapEntitySystem(
    mapDef,
    weaponSystem,
    runManager,
    raycastRegistry,
    () => playerController.rebuildCollisionBoxes(),
    gameState,
    WEAPONS,
    TERMINALS,
    (terminalDef) => terminal.open(terminalDef),
    (terminalDef, onCorrectPassword) =>
      passwordLock.open(terminalDef, () => {
        onCorrectPassword();
        // Checkpoint 17: marking the objective complete is harmless even
        // when Campaign isn't the active mode -- nothing ever reads it in
        // that case, since only campaign_room1 has a password_lock entity,
        // and that map is only ever selectable under Campaign mode (see
        // ui/MainMenu.ts's supportedModes filtering).
        campaign.markObjectiveComplete();
      }),
  );
```

- [ ] **Step 4: Branch on three modes instead of two**

The current mode-selection ternary:

```typescript
  gameMode =
    selections.modeId === "zombie"
      ? new ZombieSurvival(
          findById(ENEMIES, selections.enemyId),
          enemySpawnPoints,
          sceneManager.scene,
          sceneManager.camera,
          audioSystem,
          gameState,
          playerState,
          raycastRegistry,
          runManager,
          // Checkpoint 16: lets ZombieSurvival set weaponSystem.damageMultiplier
          // each round -- WeaponSystem itself has no notion of "rounds," it
          // just holds a generic externally-set multiplier (see
          // core/WeaponSystem.ts and CLAUDE.md's checkpoint-16 decisions log).
          weaponSystem,
        )
      : new ShootingRange(
          targetPoints,
          sceneManager.scene,
          weaponSystem,
          gameState,
          runManager,
        );
  gameMode.start();
```

Change it to:

```typescript
  // A proper if/else if/else now that there are three modes, not two -- the
  // checkpoint-9/15-era ternary no longer reads cleanly with a third branch.
  if (selections.modeId === "zombie") {
    gameMode = new ZombieSurvival(
      findById(ENEMIES, selections.enemyId),
      enemySpawnPoints,
      sceneManager.scene,
      sceneManager.camera,
      audioSystem,
      gameState,
      playerState,
      raycastRegistry,
      runManager,
      // Checkpoint 16: lets ZombieSurvival set weaponSystem.damageMultiplier
      // each round -- WeaponSystem itself has no notion of "rounds," it
      // just holds a generic externally-set multiplier (see
      // core/WeaponSystem.ts and CLAUDE.md's checkpoint-16 decisions log).
      weaponSystem,
    );
  } else if (selections.modeId === "range") {
    gameMode = new ShootingRange(
      targetPoints,
      sceneManager.scene,
      weaponSystem,
      gameState,
      runManager,
    );
  } else {
    // Checkpoint 17: Campaign was already constructed above (before
    // mapEntitySystem, so its password-lock success callback could
    // reference it) -- reused here as the active mode rather than
    // constructed a second time.
    gameMode = campaign;
  }
  gameMode.start();
```

- [ ] **Step 5: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors — this restores a clean whole-project build after Task 8's expected single error.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "Checkpoint 17 task 9: wire Campaign/Terminal/PasswordLock into main.ts, branch on three modes"
```

---

### Task 10: Manual verification against acceptance criteria (controller-executed, not a subagent)

**Files:** none (verification only).

This task is executed directly by the session controller together with the human partner — it requires live judgment (does the terminal feel usable, is the door visually convincing) and end-to-end browser interaction a subagent cannot reliably drive.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL in a browser.

- [ ] **Step 2: Verify main-menu mode/map/enemy filtering**

At the main menu, select "Campaign" in the Mode group. Confirm: the Enemy group grays out and stops accepting clicks (same as it already does for Shooting Range); in the Map group, "Campaign: Room 1" is the only fully-clickable option — "Test Grid" and "Corridors" are grayed out and unclickable, and if either was previously selected, the Map group's selection automatically snapped to "Campaign: Room 1". Then switch back to "Zombie Survival" and confirm "Test Grid"/"Corridors" become clickable again and "Campaign: Room 1" grays out; if "Campaign: Room 1" was selected, confirm the Map selection automatically snaps back to a mode-agnostic map.

- [ ] **Step 3: Verify a Campaign run starts cleanly**

With "Campaign" and "Campaign: Room 1" selected, click Start Game. Confirm: no console errors, no crash; the player spawns inside the small room; the HUD's ammo/weapon-name display behaves reasonably (a weapon system exists in the background per this checkpoint's design — confirm it doesn't visibly break the HUD even though this map has no wall-buy/enemy); the HUD's top-left status line reads "Objective: find the password".

- [ ] **Step 4: Verify the terminal**

Walk to the terminal (the dark glowing box) and press E. Confirm: the overlay opens, pointer lock releases (mouse cursor becomes free), and player movement stops responding to WASD while it's open. Type `ls` and press Enter — confirm it lists exactly one entry, `backup/`. Type `cd backup` then `ls` — confirm it now lists exactly one entry, `credentials.txt`. Type `cat credentials.txt` — confirm the output shows content containing the password, with a "Copy" button next to that specific line. Click Copy, then paste (e.g. into the browser's address bar) to confirm the clipboard actually contains the exact password string. Type `cd ..` — confirm a subsequent `ls` shows `backup/` again (back at root). Type a nonsense command like `foo` — confirm it prints a "command not found"-style message and does not crash the overlay. Close the terminal (click the × or press Escape) — confirm pointer lock re-acquires and WASD movement works again.

- [ ] **Step 5: Verify the password lock**

Walk to the password lock (the small panel near the door) and press E. Confirm: the overlay opens, pointer lock releases. Type an incorrect password and submit (click Submit or press Enter) — confirm an "Incorrect password" message appears and the overlay stays open (door remains closed). Type the exact password you copied in Step 4 and submit — confirm the overlay closes automatically, pointer lock re-acquires, and the door is now open (walk through the gap to confirm — no invisible wall, and the hitscan/interact raycast no longer treats that spot as blocked).

- [ ] **Step 6: Verify the HUD status line updates**

After opening the door, check the HUD's top-left status line again — confirm it now reads "Objective: complete" instead of "Objective: find the password".

- [ ] **Step 7: Verify idempotency and respawn reset**

Interact with the password lock again (E on it) after the door is already open — confirm nothing happens (no overlay opens, matching the same idempotency guard `createButton()` already has). Trigger a respawn/new run (if reachable in this mode — e.g. via any death path, or simply re-selecting Start Game from a fresh page load) and confirm the door is closed again and the HUD status line reads "Objective: find the password" again.

- [ ] **Step 8: Full regression check**

Return to the main menu (reload the page) and verify Zombie Survival and Shooting Range on both `test-grid` and `corridors` are completely unaffected: rounds/targets/wall-buys/paid doors all behave exactly as before this checkpoint. Confirm neither map shows a terminal or password lock anywhere (they have none), and confirm nothing about checkpoint 1-16 behavior changed.

---

### Task 11: Update CLAUDE.md and commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the folder structure tree**

Find each line by content (spacing may differ slightly from what's shown here) and apply the noted checkpoint-17 annotation.

`src/types/index.ts` — find the line:
```
  types/
    index.ts                      [1]
```
→
```
  types/
    index.ts                      [1; MapEntity gains "terminal"/"password_lock" types + terminalId at 17; TerminalFile/TerminalDirectory/TerminalDef interfaces added at 17; MapDef.supportedModes added at 17]
```

`src/content/maps.ts` (append to the existing checkpoint-16-era annotation):
```
    maps.ts                       [1, populated at 5; name field + second map ("corridors") added at 9.5; checkpoint-10 test_terminal scaffolding removed and replaced with one wall_buy entity per map at 11; corridors gains a paid door/vault room at 12]
```
→
```
    maps.ts                       [1, populated at 5; name field + second map ("corridors") added at 9.5; checkpoint-10 test_terminal scaffolding removed and replaced with one wall_buy entity per map at 11; corridors gains a paid door/vault room at 12; third map ("campaign_room1") added at 17, the first to set supportedModes]
```

Add a new line to the `content/` section for the new terminals file — find `sounds.ts` in the folder tree and insert immediately after it:
```
    sounds.ts                   [1, populated across 2/4/9]
```
→
```
    sounds.ts                   [1, populated across 2/4/9; melee_hit added at 16 for the knife attack, distinct from pistol_fire]
    terminals.ts                 [17, one TerminalDef (room1_terminal) — a fake filesystem for ui/Terminal.ts to navigate]
```

`src/core/MapEntitySystem.ts` (append to the existing annotation):
```
    MapEntitySystem.ts          [6, spawns door/button/pickup/wall_buy meshes from MapDef.entities; onDoorStateChanged callback added at 8.5; checkpoint-10 test_terminal scaffolding removed and replaced by createWallBuy() at 11; createButton() gains an optional per-button cost at 12]
```
→
```
    MapEntitySystem.ts          [6, spawns door/button/pickup/wall_buy meshes from MapDef.entities; onDoorStateChanged callback added at 8.5; checkpoint-10 test_terminal scaffolding removed and replaced by createWallBuy() at 11; createButton() gains an optional per-button cost at 12; createTerminal()/createPasswordLock() added at 17, taking two new injected UI-trigger callbacks (openTerminal/openPasswordLock) so this core/ file never imports ui/Terminal.ts or ui/PasswordLock.ts directly]
```

Add new lines to the `modes/` section — find `ShootingRange.ts` and insert immediately after it:
```
    ShootingRange.ts             [8, static shootable targets with a hit cooldown, no rounds/enemies/player damage]
```
→
```
    ShootingRange.ts             [8, static shootable targets with a hit cooldown, no rounds/enemies/player damage]
    Campaign.ts                  [17, the third GameMode — a single room with a terminal + password-lock door, no rounds/enemies/player damage, hardcoded per the mode-building rule]
```

Add new lines to the `ui/` section — find the `MainMenu.ts` block and insert two new lines immediately after it:
```
    MainMenu.ts                 [9, one-time mode/weapon/enemy select screen shown before gameplay — kept separate from HUD.ts, see decisions log]
                                 [9.5 adds a fourth Map selection group]
```
→
```
    MainMenu.ts                 [9, one-time mode/weapon/enemy select screen shown before gameplay — kept separate from HUD.ts, see decisions log]
                                 [9.5 adds a fourth Map selection group]
                                 [17 adds a third Mode option (Campaign, which also grays the Enemy group like Shooting Range already did) and MapDef.supportedModes-based Map group filtering/graying, with an automatic fallback-selection if the current map becomes invalid for the newly-selected mode]
    Terminal.ts                  [17, DOM overlay for the hacking-terminal minigame — ls/cd/cat over a TerminalDef's fake filesystem, with a copy-password button on the one output line that contains it]
    PasswordLock.ts              [17, DOM overlay for entering a door's password — submit/cancel, calls a success callback on a correct match]
```

- [ ] **Step 2: Update the Checkpoints list**

Add a new line immediately after checkpoint 16's line:

```
17. Campaign mode — Room 1 terminal + password lock — the third GameMode, `Campaign`, hardcoded per the mode-building rule; a `"terminal"` MapEntity opens a DOM-overlay fake filesystem (`ui/Terminal.ts`, ls/cd/cat + a copy-password button) built from a new `content/terminals.ts`, and a `"password_lock"` MapEntity opens a second overlay (`ui/PasswordLock.ts`) that opens its linked door on a correct submission and marks the mode's objective complete; a new `MapDef.supportedModes` field gates the new `campaign_room1` map to Campaign mode only, with `ui/MainMenu.ts`'s Map group filtering/graying accordingly — the extension point CLAUDE.md's own future-mechanics section had already anticipated at checkpoint 9.5
```

- [ ] **Step 3: Update "Current status"**

Change the opening sentence from `Checkpoint 16 complete.` to `Checkpoint 17 complete.`, and append new paragraphs after the existing checkpoint-16 paragraphs (before `## Decisions log`). Write these paragraphs to describe, in this project's established narrative style (see the surrounding checkpoint-15/16 paragraphs for tone and level of detail):

- `modes/Campaign.ts` as the third `GameMode`, its minimal shape (`objectiveComplete` boolean, no rounds/enemies), and how `markObjectiveComplete()` is called from outside it (via `main.ts`'s `openPasswordLock` callback closure, not by Campaign reaching into `MapEntitySystem`/`ui/PasswordLock.ts` itself).
- The new `"terminal"`/`"password_lock"` `MapEntity` types and `MapEntitySystem.createTerminal()`/`createPasswordLock()`, following the exact shape of `createWallBuy()`/`createButton()`, including the `doorMeshById` reuse and the injected `openTerminal`/`openPasswordLock` callbacks that keep `core/` free of any `ui/`/`modes/` import.
- `content/terminals.ts`'s one `TerminalDef` (`room1_terminal`), its password constant existing in exactly one place in source, and the fake filesystem's shape (root has one subdirectory, `backup/`, holding `credentials.txt`).
- `ui/Terminal.ts`'s command set (`ls`/`cd`/`cat`/unknown-command handling), its pointer-lock unlock/relock behavior, and the copy-password button's exact trigger condition (only the specific output line containing the password).
- `ui/PasswordLock.ts`'s submit/cancel/error-message behavior and its pointer-lock unlock/relock behavior.
- The new `MapDef.supportedModes` field and `campaign_room1`'s map layout (briefly — spawn, terminal, door, password lock, no `enemy_spawn`/`target`), and `ui/MainMenu.ts`'s new `isMapSupportedForMode()`/`updateMapAvailability()` methods, including the automatic map-selection-fallback behavior when switching to/from a mode that excludes the currently-selected map.
- A sentence confirming the deliberate choice to leave `WeaponSystem`'s always-M1911-in-slot-0 behavior (checkpoint 15) untouched in Campaign mode — the checkpoint-17 spec's "player has no weapon yet" is flavor/narrative framing, not a mechanical requirement (the spec's own verification section explicitly says "weapon system may still exist in the background — confirm nothing crashes"), so no Campaign-specific weapon-stripping was built.
- A "Verified in-browser" sentence summarizing what Task 10's manual verification actually confirmed (menu filtering both directions, terminal ls/cd/cat/copy/close-relock, password lock wrong/right/idempotent/respawn-reset, HUD status line before/after, full regression on both existing maps under both existing modes) — write this only after Task 10 has actually been completed and confirmed by the user; do not write it from the plan's expected behavior alone.

- [ ] **Step 4: Add decisions log entries**

Append after the last existing decisions-log line, before `## Future mechanics`:

```
- `Campaign` (checkpoint 17) is the third `GameMode`, built hardcoded per the project's own mode-building rule, directly against the already-extracted `GameMode` interface (proved at checkpoints 7-8) rather than prompting any further generalization of that interface. Its `markObjectiveComplete()` method is called from `main.ts`'s `openPasswordLock` callback closure, not by `Campaign` reaching into `MapEntitySystem`/`ui/PasswordLock.ts` on its own — the same "composition root wires cross-system callbacks, individual systems stay ignorant of each other" pattern established by `PlayerState`'s `onDeath` callback and `WeaponSystem`'s `onMeleeAttack` callback.
- `Campaign` is constructed unconditionally in `main.ts`, before `mapEntitySystem`, regardless of which mode is actually selected (checkpoint 17) — the same "always construct, branch on usage" pattern already used for `weaponSystem`/`mapEntitySystem` themselves. This resolves a real construction-order dependency (the password-lock success callback passed into `MapEntitySystem`'s constructor needs to call `campaign.markObjectiveComplete()`, but `gameMode` itself isn't assigned until after `mapEntitySystem` exists) the same way checkpoint 16 resolved `weaponViewmodel`'s equivalent ordering problem: move the cheap-to-construct dependency earlier rather than introduce a mutable forward reference.
- `MapEntitySystem.createTerminal()`/`createPasswordLock()` (checkpoint 17) take `openTerminal`/`openPasswordLock` as injected callback parameters rather than importing `ui/Terminal.ts`/`ui/PasswordLock.ts` directly — required by this project's "`core/` never references `content/` or `modes/` directly" rule (and, by the same reasoning this codebase has always applied, never `ui/` either): `MapEntitySystem` has no idea a DOM overlay exists, it just calls a generic function when a terminal/password-lock entity is interacted with. `main.ts` (the composition root) is the only place that wires the callback to an actual `ui/Terminal.ts`/`ui/PasswordLock.ts` instance.
- `MapEntity.terminalId` (checkpoint 17) is a separate field from `linkedTo`, not a second overloaded use of `linkedTo`, because a `"password_lock"` entity has two distinct relationships that both need to resolve independently: `linkedTo` -> the door it opens (mirroring `"button"`'s existing use of `linkedTo`), `terminalId` -> the `TerminalDef` whose password it checks. Every other `MapEntity` type with a reference field (`button`, `wall_buy`) only ever has one relationship, so this is the first entity type that needed two.
- The password in `content/terminals.ts` (checkpoint 17, `"X7K-92Q4"`, the example value suggested in the original checkpoint-17 request) exists in exactly one place in source, a single `const ROOM1_PASSWORD`, even though it appears twice in the compiled output: once as `TerminalDef.password` (what `ui/PasswordLock.ts` checks against) and once inside `credentials.txt`'s `content` string via template-literal interpolation (what the player actually reads via `cat`). Never hardcode the password a second time if this file changes.
- `ui/Terminal.ts`'s and `ui/PasswordLock.ts`'s text inputs call `event.stopPropagation()` on every keydown (checkpoint 17) so that typing a command/password never also reaches `PlayerController`/`WeaponSystem`/`InteractSystem`'s own `window`-level keydown listeners (e.g. typing "r" while entering a password should never trigger a reload). This is defense-in-depth, not closing a real gap: `gameState.paused` (set via the existing `pointerlockchange` listener in `main.ts`, already true whenever pointer lock is released) already gates every one of those systems' actual effects, since opening either overlay calls `playerController.controls.unlock()` the same way `PlayerState`'s `onDeath` callback already does. Both facts are true simultaneously and deliberately: the `stopPropagation()` calls are cheap insurance, not the mechanism actually preventing gameplay input leakage.
- `ui/MainMenu.ts`'s Map group (checkpoint 17) grays out (and disables clicks on) individual map buttons based on `MapDef.supportedModes`, rather than the whole-group graying `selectMode()` already used for the Enemy group — a map-level, not group-level, decision was required because *some* maps are valid under a given mode and others aren't (unlike Enemy, which is either fully relevant or fully irrelevant depending on mode). `updateMapAvailability()` also auto-falls-back the current selection to the first valid map whenever the active mode would otherwise leave an invalid map selected, so the Start button can never be pressed with an impossible mode/map pairing — this fallback runs symmetrically in both directions (switching into Campaign away from a mode-agnostic map, and switching back out of Campaign away from `campaign_room1`).
- Checkpoint 17's own request text described the player as having "no weapon yet" in Campaign mode — this was interpreted as narrative/flavor framing, not a mechanical requirement, and confirmed by the same request's own verification section ("weapon system may still exist in the background — confirm nothing crashes"). `WeaponSystem` is constructed exactly as it always has been since checkpoint 15 (M1911 unconditionally in slot 0) with no Campaign-specific branching; `campaign_room1` simply has no `wall_buy`/enemy for the player to use it against, which is sufficient to keep this checkpoint's puzzle framing intact without adding a new "no starting weapon" mechanism this checkpoint didn't otherwise need.
```

- [ ] **Step 5: Add future-mechanics entries**

Append new future-mechanics bullets at the end of the section:

```
- **Room 2 / further Campaign rooms**: not built. `campaign_room1` is the only campaign map; there's no room-to-room transition, no teardown/reconstruction of the current room when progressing, and no second `TerminalDef`/password puzzle yet. `Campaign`'s minimal `objectiveComplete` boolean would need to become something richer (an objective *list*, or per-room state) if a second room is ever added.
- **Door does not lock behind the player**: not built, deliberately out of scope for checkpoint 17. Once `campaign_door_1` opens, it stays open (the same `mesh.visible = false` toggle every other door in this codebase already uses) — nothing currently re-closes it once the player has passed through. A "point of no return" mechanic, if ever wanted, would need new logic (e.g. a trigger volume) this checkpoint didn't build.
- **No persistence**: not built, deliberately. Reopening the terminal or password lock after a page reload (or a respawn/new-run reset) starts completely fresh — the terminal's `pathStack` resets to root on every `open()` call regardless, and there is no `localStorage` (or any other) mechanism remembering a previously-entered-correctly password across sessions.
- **Hardware-puzzle `MapEntity` type**: not built. Checkpoint 17's terminal/password-lock pair is the first non-combat, non-economy interactable pair in this codebase; a future physical/wiring-style puzzle (as opposed to a typed-password one) would likely need its own new `MapEntity` type and `ui/` overlay, following the same injected-callback pattern `createTerminal()`/`createPasswordLock()` established, but nothing about that is designed yet.
- **`Terminal`'s command set is intentionally minimal**: `ls`/`cd`/`cat` only — no `pwd`, no tab-completion, no command history (arrow-key recall), no `cd` with a multi-segment path (`cd backup/nested` in one command). Any of these would be pure additions to `ui/Terminal.ts`'s `runCommand()` dispatch if a future checkpoint's puzzle design needs a richer shell feel.
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Search for staleness this checkpoint may have introduced**

This project's CLAUDE.md has needed a staleness fix in nearly every recent checkpoint. Before committing, read the entire document (not just the sections edited above) and specifically check for:
- Any sentence describing `MapEntitySystem`'s constructor parameter list without the checkpoint-17 `terminals`/`openTerminal`/`openPasswordLock` arguments.
- Any sentence describing `ui/MainMenu.ts` as having exactly two Mode options, or describing the Map group as unconditionally mode-agnostic (search "mode-agnostic", "two modes").
- Any sentence describing `GameMode` as having exactly two implementations (`ZombieSurvival`/`ShootingRange`) — should now say three, including `Campaign`.
- Any other claim this checkpoint's changes would now contradict.

If you find staleness, fix it using the established `**Superseded at checkpoint N** (was: "...")` convention for decisions-log/future-mechanics entries, or an inline parenthetical for "Current status" prose (both conventions are already used elsewhere in this document — match whichever fits the specific sentence). If you find nothing beyond what Steps 1-5 already added, say so explicitly in your commit's task report — don't skip stating the negative result.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Checkpoint 17: Campaign mode -- Room 1 terminal + password lock

Adds Campaign, the third GameMode, hardcoded per this project's own
mode-building rule: a single objectiveComplete boolean, no rounds, no
enemies. markObjectiveComplete() is called from main.ts's
openPasswordLock callback closure rather than Campaign reaching into
MapEntitySystem/ui/PasswordLock.ts itself, matching the existing
onDeath/onMeleeAttack dependency-injection pattern. Campaign is
constructed unconditionally in main.ts before mapEntitySystem (the
same "always construct, branch on usage" pattern already used for
weaponSystem), resolving the same kind of construction-order
dependency checkpoint 16 resolved for weaponViewmodel.

Adds two new MapEntity types, "terminal" and "password_lock", spawned
by MapEntitySystem.createTerminal()/createPasswordLock() following
the exact shape of the existing createWallBuy()/createButton() (the
latter reuses createButton()'s doorMeshById map rather than rebuilding
it). Both call injected openTerminal/openPasswordLock callbacks rather
than importing any ui/ file directly, keeping core/ ignorant of
ui/modes/content per the project's architecture rules.

Adds two new DOM-overlay UI classes: ui/Terminal.ts (a tiny fake
filesystem, content/terminals.ts's new TerminalDef shape, navigable
with ls/cd/cat, with a copy-to-clipboard button on the one output line
containing the password) and ui/PasswordLock.ts (submit/cancel/error
flow, calling a success callback on a correct match). Both release
pointer lock on open and re-lock on close, the same callback pattern
PlayerState's onDeath already uses; both stop keydown propagation on
their inputs as defense-in-depth on top of the existing
gameState.paused gating that already blocks other systems' input
while pointer lock is released.

Adds MapDef.supportedModes (the extension point CLAUDE.md's own
future-mechanics section anticipated at checkpoint 9.5) and the new
campaign_room1 map, gated to Campaign mode only. ui/MainMenu.ts's Map
group now grays out/disables individual map buttons by
supportedModes, with an automatic fallback to the first valid map
whenever the selected mode would otherwise leave an invalid map
selected -- symmetric in both directions. The Enemy group now also
grays out under Campaign, alongside its existing Shooting Range
behavior.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Verify the commit**

Run: `git status` and `git log -1 --stat`
Expected: working tree clean; the commit touches `CLAUDE.md` (plus this plan doc, if not already committed by an earlier task) — `src/types/index.ts`, `src/content/terminals.ts`, `src/content/maps.ts`, `src/modes/Campaign.ts`, `src/ui/Terminal.ts`, `src/ui/PasswordLock.ts`, `src/ui/MainMenu.ts`, `src/core/MapEntitySystem.ts`, and `src/main.ts` should all show no changes from this task, since they were already committed by Tasks 1-9.

---

## Self-Review Notes

- **Spec coverage:** `MapEntity` gains `"terminal"`/`"password_lock"` with `terminalId` as a second, separate reference field (Task 1) ✓; `TerminalFile`/`TerminalDirectory`/`TerminalDef` interfaces (Task 1) ✓; `content/terminals.ts`'s single `TerminalDef` with a password constant referenced exactly once in source (Task 2) ✓; `MapEntitySystem.createTerminal()`/`createPasswordLock()` following `createWallBuy()`/`createButton()`'s exact shape, reusing `doorMeshById` (Task 8) ✓; `ui/Terminal.ts`'s `ls`/`cat`/`cd`/`cd ..`/unknown-command handling, pointer-lock unlock/relock, and copy-button-only-on-the-password-line accessibility feature (Task 5) ✓; `ui/PasswordLock.ts`'s submit/error/success-auto-close and pointer-lock unlock/relock (Task 6) ✓; `modes/Campaign.ts` implementing `GameMode` exactly per the given skeleton, hardcoded, no round/enemy logic (Task 4) ✓; `content/maps.ts`'s `campaign_room1` with `supportedModes: ["campaign"]` and exactly the four specified entities, no `enemy_spawn`/`target` (Task 3) ✓; `main.ts` wiring (`TERMINALS` import, `Terminal`/`PasswordLock` construction with unlock/relock callbacks, `Campaign` constructed early to resolve the construction-order dependency, `if`/`else if`/`else` mode branching) (Task 9) ✓; `ui/MainMenu.ts`'s Campaign mode option, Enemy-group-grays-under-Campaign-too, and Map-group `supportedModes` filtering mirroring the Enemy group's graying mechanism (Task 7) ✓; manual verification checklist covering menu filtering both directions, campaign-run-starts-cleanly, terminal ls/cd/cat/copy/close-relock, password-lock wrong/right/idempotent/respawn-reset, HUD status line before/after, and full regression on both existing maps under both existing modes (Task 10) ✓; CLAUDE.md updates (checkpoints list, folder-structure tree, current-status narrative, decisions log covering the real choices made — exact password string, exact tree depth, the "no weapon yet" flavor-text interpretation, the `stopPropagation()` defense-in-depth note) and future-mechanics entries distinguishing what's still out of scope (Task 11) ✓.
- **Placeholder scan:** no TBD/TODO; every step has complete, exact code; Task 10's verification steps are concrete, sequenced observable behaviors (specific commands, specific expected `ls` output, a specific clipboard-paste check) rather than vague "make sure it works" language.
- **Type consistency check:** `MapEntitySystem`'s constructor gains `terminals: TerminalDef[]`, `openTerminal: (terminalDef: TerminalDef) => void`, `openPasswordLock: (terminalDef: TerminalDef, onCorrectPassword: () => void) => void` as its 8th/9th/10th positional parameters (Task 8); `main.ts` (Task 9) passes `TERMINALS`, `(terminalDef) => terminal.open(terminalDef)`, and `(terminalDef, onCorrectPassword) => passwordLock.open(terminalDef, () => { onCorrectPassword(); campaign.markObjectiveComplete(); })` in that exact order — matches. `Terminal.open(terminalDef: TerminalDef): void` (Task 5) and `PasswordLock.open(terminalDef: TerminalDef, onSuccess: () => void): void` (Task 6) match how Task 9's callbacks invoke them. `Campaign`'s constructor takes `runManager: RunManager` only (Task 4), matching Task 9's `new Campaign(runManager)` call. `createTerminal()`'s and `createPasswordLock()`'s parameter lists (Task 8) match exactly how the constructor's entity-dispatch loop calls them.
- **Compile-safety / task-ordering check:** Tasks 1-7 are all purely additive or internally self-consistent (new types, new content, a new mode file, two new UI files, and `ui/MainMenu.ts`'s changes, which widen `ModeId` but don't break `main.ts`'s still-two-armed ternary until Task 9 changes it) — the build stays clean through all of them. Task 8 (`MapEntitySystem.ts`'s constructor signature change) intentionally breaks `main.ts` (missing three new constructor arguments) — verified via the same expected-single-error discipline this project has used at every prior multi-file task (checkpoint 15's `setWeapon`/`pickupWeapon`, checkpoint 16's `ZombieSurvival`/`main.ts` gun-scaling wiring, etc.). Task 9 depends on both Task 7 (needs `"campaign"` to be a valid `ModeId` before the `if`/`else if`/`else` can branch on it) and Task 8 (needs the extended `MapEntitySystem` constructor) and restores a clean build. No `erasableSyntaxOnly` violations anywhere: no parameter-property constructor shorthand, no enums, in any new file.
- **Architecture-rule cross-check:** `core/MapEntitySystem.ts` gains zero imports of `ui/` or `modes/` — `openTerminal`/`openPasswordLock` are injected callbacks, resolved only in `main.ts` (the composition root), exactly mirroring `onDoorStateChanged`. `modes/Campaign.ts` imports only `./GameMode` and `../core/RunManager` — no `content/` import, consistent with every other `GameMode` implementation. `content/terminals.ts` and `content/maps.ts`'s new map are both pure typed data, no logic. `ui/Terminal.ts` and `ui/PasswordLock.ts` are separate files per the single-responsibility rule (distinct lifecycles/concerns from `ui/HUD.ts`/`ui/MainMenu.ts`, and from each other).
