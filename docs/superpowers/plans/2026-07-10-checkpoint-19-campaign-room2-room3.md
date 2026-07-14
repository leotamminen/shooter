# Checkpoint 19: Campaign Room 2 (Vault + Part/Terminal Puzzle) → Room 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Campaign mode with Room 2 (a bigger room holding an optional vault side-path and the required power-cable/terminal puzzle) and an empty Room 3, gated behind Room 2's `whoami` terminal — all within the existing `campaign_room1` map, not a new one.

**Architecture:** `Campaign` (a `core/`-adjacent mode file) moves from a single boolean to a 3-stage flow. Two new `MapEntity` types/fields (`"computer_part"`, `terminal.requiresPart`, `password_lock.checksVaultPin`) extend the existing `MapEntitySystem` dispatch pattern exactly like every prior checkpoint's entity additions did. A second `ui/Terminal.ts` instance is constructed in `main.ts` dedicated to `room2_terminal`, wired via a forward-referenced `mapEntitySystem` (mirroring the existing `let gameMode` pattern) so its `onCommand` callback can programmatically open Room 3's door once `whoami` runs.

**Tech Stack:** TypeScript, Three.js, Vite — no new dependencies.

## Global Constraints

- `core/` never references `content/` or `modes/` directly — it only consumes typed interfaces. `MapEntitySystem` never imports `ui/Terminal.ts`/`ui/PasswordLock.ts`/`modes/Campaign.ts`; all cross-system behavior is injected via callback parameters, matching `onDoorStateChanged`/`openTerminal`/`openPasswordLock`'s existing pattern.
- All game content (weapons, enemies, maps, sounds, terminals) lives in `content/*.ts` as typed data, never hardcoded in logic.
- Modes are built hardcoded first — `Campaign`'s 3-stage rework stays a plain `switch`/field, no new generalized state-machine abstraction.
- Single-responsibility per file; shared/reusable logic goes in `core/utils/` (the vault-pin generator).
- Room 1's mechanics (password lock reading `room1_terminal`'s static password) are unchanged in shape — only its *success callback* in `main.ts` gains two additional side effects (score, stage advance).
- The vault remains fully optional: Room 3 must be reachable via the part/terminal puzzle alone, with zero dependency on the vault ever being opened.
- **Because `Campaign.ts`, `ui/Terminal.ts`, and `core/MapEntitySystem.ts` are all existing files with existing call sites in `main.ts` (unlike checkpoint 17's brand-new files), Tasks 3, 4, and 5 below each independently break `main.ts`'s build with their own new/changed compile error. These errors are left to accumulate — each task predicts and confirms its own incremental error count, but does NOT touch `main.ts` to fix it. Task 7 (the final main.ts wiring task) fixes all of them at once and restores a clean build.** This is a deliberate, documented deviation from this project's usual strict "one error, immediately fixed next task" discipline, made necessary by a genuine forward-reference dependency: `main.ts`'s second `Terminal` instance (`room2Terminal`) needs to reference `mapEntitySystem.getDoorMesh(...)` inside a closure, but `mapEntitySystem` itself isn't constructed until after both `Terminal` instances exist — untangling that requires touching the same handful of `main.ts` lines that the other three tasks' fixes would also touch, so consolidating avoids three separate near-conflicting partial edits to the same block.

---

## Design Reference (read before starting any task)

**Room layout.** `campaign_room1`'s grid grows from 6 rows × 8 cols to 14 rows × 15 cols. Reading row index 0 at the top:
- Rows 0–4: Room 3 (empty, cols 4–7 interior) and its connector wall/gap to Room 2 (row 4, gap at col 6 — `campaign_door_2`, no button, opened only programmatically).
- Rows 5–9: Room 2 (interior cols 1–10) — bigger than Room 1's interior (6 cols × 2 rows). Room 2 also has a 1×2 vault alcove at cols 12–13, reachable only via a door gap at row 6, col 11 (`campaign_door_3`).
- Row 10: the wall separating Room 2 from Room 1, with the existing door gap at col 3 — this is `campaign_door_1`, unchanged mechanically, just relocated by the grid's growth.
- Rows 11–13: Room 1 (interior cols 1–6, unchanged shape) and its south outer wall.

Every existing Room 1 entity's position shifts by exactly `z += 16` (8 rows × `CELL_SIZE` 2) with `x` unchanged, since Room 1 itself is unchanged and the grid simply grew above it. All coordinates below were computed from the grid (`position = [col * 2, y, row * 2]`, matching `core/MapLoader.ts`'s existing convention) and cross-checked for floor/wall placement before being written into this plan.

**The forward-reference problem, and its resolution.** `room2Terminal`'s `onCommand` callback needs to call `mapEntitySystem.getDoorMesh("campaign_door_2")` to open Room 3's door — but `mapEntitySystem` isn't constructed until after both `Terminal` instances exist (its constructor takes an `openTerminal` callback that routes to whichever `Terminal` instance matches the interacted entity). `main.ts` already solves an identical problem for `gameMode`: `let gameMode: GameMode;` is declared early and assigned later, referenced only inside `playerState`'s `onDeath` closure, which never runs before assignment completes. Task 7 applies the exact same pattern: `let mapEntitySystem: MapEntitySystem;` declared before the `Terminal` instances, assigned (not re-declared) once `MapEntitySystem` is actually constructed.

---

### Task 1: `core/utils/RandomPin.ts` + `types/index.ts` additive changes

**Files:**
- Create: `src/core/utils/RandomPin.ts`
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `generateVaultPin(): string` (Task 3 imports and uses this). `MapEntity` gains `"computer_part"` in its type union plus `requiresPart?: string`/`checksVaultPin?: boolean` fields (Tasks 5 and 6 read these). `TerminalDef.password`/`TerminalDef.username` become optional, and `TerminalDef` gains `username?: string` (Tasks 2, 3, 4, 5 all touch `TerminalDef`-shaped data).

This task is purely additive — nothing in the codebase consumes these new types/fields yet, so the build stays clean.

- [ ] **Step 1: Create the vault-pin generator**

```typescript
// A zero-padded random 6-digit string, e.g. "042817" -- used by
// modes/Campaign.ts for the checkpoint-19 vault password, regenerated once
// per run. Extracted out of Campaign.ts's own class body since it's a
// pure, reusable function with no dependency on Campaign's own state,
// matching this project's "shared/reusable logic goes in core/utils/" rule.
export function generateVaultPin(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}
```

- [ ] **Step 2: Extend `MapEntity`'s type union and add `requiresPart`/`checksVaultPin`**

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
    | "password_lock"
    | "computer_part";
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
  requiresPart?: string; // "terminal" only (checkpoint 19): a computer_part
  // entity's id. When set, interacting with this terminal before that part
  // has been collected (its mesh is still visible) shows a short flavor
  // message instead of opening the Terminal overlay.
  checksVaultPin?: boolean; // "password_lock" only (checkpoint 19): when
  // true, this lock ignores terminalId/TerminalDef.password entirely and
  // checks against Campaign's live, per-run vault pin instead (via a
  // getVaultPin callback). A hardcoded boolean branch, not a generalized
  // "secret source" abstraction, since there are exactly two cases.
}
```

- [ ] **Step 3: Make `TerminalDef.password` optional and add `TerminalDef.username`**

The current `TerminalDef` interface:

```typescript
export interface TerminalDef {
  id: string;
  password: string; // checked by ui/PasswordLock.ts against the linked
  // "password_lock" MapEntity's input. Also (via template-literal
  // interpolation, not a second hardcoded copy) appears inside root's file
  // tree somewhere, so the player can find it in-fiction via cat.
  root: TerminalDirectory;
}
```

Replace it with:

```typescript
export interface TerminalDef {
  id: string;
  password?: string; // checked by ui/PasswordLock.ts against the linked
  // "password_lock" MapEntity's input. Also (via template-literal
  // interpolation, not a second hardcoded copy) appears inside root's file
  // tree somewhere, so the player can find it in-fiction via cat. Optional
  // as of checkpoint 19 -- room2_terminal has no password to guard (its
  // only purpose is the "whoami" command), and inventing a dummy value
  // would be worse than just not requiring one.
  username?: string; // checkpoint 19: read by ui/Terminal.ts's "whoami"
  // command. Only room2_terminal sets this; room1_terminal leaves it
  // undefined, since nothing in Room 1's puzzle needs it.
  root: TerminalDirectory;
}
```

- [ ] **Step 4: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors — purely additive changes, nothing consumes them yet.

- [ ] **Step 5: Commit**

```bash
git add src/core/utils/RandomPin.ts src/types/index.ts
git commit -m "Checkpoint 19 task 1: add vault-pin generator and extend types for computer_part/requiresPart/checksVaultPin"
```

---

### Task 2: `content/terminals.ts` — `{{VAULT_PIN}}` token + `room2_terminal`

**Files:**
- Modify: `src/content/terminals.ts`

**Interfaces:**
- Consumes: `TerminalDef.username`, `TerminalDef.password?` (Task 1).
- Produces: `TERMINALS` now contains two entries, `"room1_terminal"` and `"room2_terminal"`. Consumed by Task 5 (`MapEntitySystem.createTerminal()`, unchanged lookup) and Task 7 (`main.ts`, unchanged import — the array just has one more element).

This task only changes content data — nothing new reads `{{VAULT_PIN}}` substitution or `TerminalDef.username` until Tasks 4/7, so this task's own build stays clean regardless of what consumes it later.

- [ ] **Step 1: Replace the whole file**

The current file:

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

Replace it with:

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
              // Checkpoint 19: {{VAULT_PIN}} is substituted live by
              // ui/Terminal.ts's runCat() with Campaign's current per-run
              // vault pin (via a getVaultPin callback) -- it is never a
              // literal value in source, unlike ROOM1_PASSWORD above,
              // since the vault pin regenerates every run and this content
              // string is static.
              content: `Top secret do not share this!
// TODO: hide the password better
door override password: ${ROOM1_PASSWORD}

vault pin: {{VAULT_PIN}}`,
            },
          ],
          directories: [],
        },
      ],
    },
  },
  // room2_terminal (checkpoint 19): no password, no files -- its only
  // purpose is the "whoami" command, watched for by main.ts's onCommand
  // callback to open Room 3's door and advance Campaign to "complete".
  {
    id: "room2_terminal",
    username: "svc-maintenance",
    root: {
      name: "/",
      files: [],
      directories: [],
    },
  },
];
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/content/terminals.ts
git commit -m "Checkpoint 19 task 2: add vault-pin token to room1_terminal and add room2_terminal"
```

---

### Task 3: `modes/Campaign.ts` — rework to a 3-stage flow

**Files:**
- Modify: `src/modes/Campaign.ts`

**Interfaces:**
- Consumes: `generateVaultPin()` (Task 1).
- Produces: `Campaign`'s constructor is unchanged (`(runManager: RunManager)`). New public API: `onDoorOneOpened(): void`, `markComplete(): void`, `getVaultPin: () => string` (an arrow-function class field, not a method — see the step below for why this matters). The old `markObjectiveComplete(): void` no longer exists. Consumed by Task 7 (`main.ts`).

**This task will leave `main.ts` failing to build** — its existing call to `campaign.markObjectiveComplete()` references a method that no longer exists. Do not touch `main.ts`; Task 7 fixes this along with two more accumulated breaks from Tasks 4 and 5.

- [ ] **Step 1: Replace the whole file**

The current file:

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

Replace it with:

```typescript
import type { GameMode } from "./GameMode";
import type { RunManager } from "../core/RunManager";
import { generateVaultPin } from "../core/utils/RandomPin";

type CampaignStage = "find_password" | "power_terminal" | "complete";

// Hardcoded per this project's mode-building rule -- the third GameMode
// implementation, built directly against the already-extracted interface
// (ZombieSurvival/ShootingRange proved its shape at checkpoints 7-8) rather
// than generalizing further. Checkpoint 19 reworks the checkpoint-17
// single objectiveComplete boolean into a 3-stage flow (Room 1 password ->
// Room 2 terminal -> complete), since a boolean can no longer represent
// "which of two remaining objectives is next" once there are two rooms.
export class Campaign implements GameMode {
  private stage: CampaignStage = "find_password";
  private vaultPin = "";

  constructor(runManager: RunManager) {
    this.resetState();
    runManager.registerResettable(() => this.resetState());
  }

  // Shared by the constructor and the RunManager reset callback, mirroring
  // how ZombieSurvival.startRound() is already called from both start()
  // and resetRun() -- both need to (re)establish the exact same initial
  // state, and duplicating it in two places would risk them drifting out
  // of sync.
  private resetState(): void {
    this.stage = "find_password";
    this.vaultPin = generateVaultPin();
  }

  start(): void {
    // Nothing to begin -- the terminal/password-lock entities are already
    // live from MapEntitySystem's construction.
  }

  update(_deltaTime: number): void {
    // No per-frame logic -- Campaign has no rounds, timers, or AI to drive.
  }

  getStatusLine(): string {
    switch (this.stage) {
      case "find_password":
        return "Objective: find the door password";
      case "power_terminal":
        return "Objective: power the terminal";
      case "complete":
        return "Objective: complete";
    }
  }

  getSummaryLines(): string[] {
    switch (this.stage) {
      case "find_password":
        return ["Objective incomplete -- Room 1 not yet opened"];
      case "power_terminal":
        return ["Objective incomplete -- Room 2 terminal not yet powered"];
      case "complete":
        return ["Objective complete"];
    }
  }

  // Called by main.ts's Room 1 password-lock success callback -- Campaign
  // itself never reaches into MapEntitySystem/ui/PasswordLock.ts to detect
  // this on its own (same injected-callback pattern as checkpoint 17's
  // markObjectiveComplete()).
  onDoorOneOpened(): void {
    this.stage = "power_terminal";
  }

  // Called by main.ts's room2_terminal onCommand callback when "whoami"
  // runs successfully.
  markComplete(): void {
    this.stage = "complete";
  }

  // An arrow-function class field, not a regular method -- deliberately,
  // because main.ts passes this around as a bare function reference
  // (`campaign.getVaultPin`, not `() => campaign.getVaultPin()`) to both
  // MapEntitySystem's constructor and both ui/Terminal.ts instances. A
  // regular method accessed that way would lose its `this` binding the
  // moment it's actually called from inside those other objects, silently
  // reading `this.vaultPin` as undefined at runtime with no compile error
  // to catch it. Binding it as an arrow field at construction time makes
  // this safe by construction, regardless of how callers pass it around.
  // Read live (never snapshotted) by both consumers, since resetState()
  // regenerates vaultPin on every new run.
  getVaultPin = (): string => {
    return this.vaultPin;
  };
}
```

- [ ] **Step 2: Verify the project builds with exactly the predicted error**

Run: `npm run build`
Expected: fails with exactly one error — `main.ts`'s `campaign.markObjectiveComplete()` call, something like `Property 'markObjectiveComplete' does not exist on type 'Campaign'.` Confirm no other error appears. If you see a different or additional error, stop and report BLOCKED with the exact text rather than guessing a fix — do not touch `main.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/modes/Campaign.ts
git commit -m "Checkpoint 19 task 3: rework Campaign from a single boolean to a 3-stage flow with a per-run vault pin"
```

---

### Task 4: `ui/Terminal.ts` — live vault-pin substitution, `onCommand`, `whoami`

**Files:**
- Modify: `src/ui/Terminal.ts`

**Interfaces:**
- Consumes: nothing new from other tasks (uses `TerminalDef.username`/`password?` from Task 1, structurally, but doesn't need Task 1 to have landed to type-check against — the interface is already in `types/index.ts` regardless of which task lands first in a real repo; here Task 1 lands before this task anyway).
- Produces: `Terminal`'s constructor gains two new parameters after the existing two: `getVaultPin: () => string` (required) and `onCommand?: (command: string) => void` (optional). `open(terminalDef)`'s signature is unchanged. Consumed by Task 7 (`main.ts`, both `Terminal` instances).

**This task adds to `main.ts`'s already-broken build from Task 3** — its existing `new Terminal(onOpen, onClose)` call is now missing a required 3rd argument (`getVaultPin`). Do not touch `main.ts`; Task 7 fixes this along with the Task 3 and Task 5 breaks.

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

Replace it with:

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
//
// Checkpoint 19: main.ts constructs TWO instances of this class -- one for
// room1_terminal, one for room2_terminal -- since only the latter needs an
// onCommand callback (watching for "whoami"). Both take the same
// getVaultPin callback, since room1_terminal's credentials.txt is the only
// consumer of the {{VAULT_PIN}} substitution, but passing it uniformly to
// both keeps their constructor shape identical.
export class Terminal {
  private readonly root: HTMLDivElement;
  private readonly outputEl: HTMLDivElement;
  private readonly inputEl: HTMLInputElement;
  private readonly onOpen: () => void;
  private readonly onClose: () => void;
  private readonly getVaultPin: () => string;
  private readonly onCommand?: (command: string) => void;

  private terminalDef: TerminalDef | null = null;
  private pathStack: TerminalDirectory[] = [];

  constructor(
    onOpen: () => void,
    onClose: () => void,
    getVaultPin: () => string,
    onCommand?: (command: string) => void,
  ) {
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.getVaultPin = getVaultPin;
    this.onCommand = onCommand;

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
      case "whoami":
        this.runWhoami();
        break;
      default:
        this.appendLine(`command not found: ${command}`);
        return; // unrecognized commands never fire onCommand below
    }
    // Checkpoint 19: fired for every successfully-parsed command
    // (ls/cd/cat/whoami), regardless of whether that command's own
    // execution succeeded (e.g. `cd nonexistent` still counts -- the
    // command itself was recognized and ran, it just printed its own
    // error). main.ts only wires this for room2_terminal's instance,
    // watching for "whoami" specifically; room1_terminal's instance is
    // constructed without it, so it never reacts to any command.
    this.onCommand?.(command);
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

  // Checkpoint 19: room1_terminal has no username set (TerminalDef.username
  // is optional), so running whoami there prints a generic "unknown user"
  // line rather than crashing or silently no-op'ing -- deliberately, since
  // room1_terminal's own Terminal instance is never given an onCommand
  // callback anyway, so nothing downstream reacts to it either way.
  private runWhoami(): void {
    const username = this.terminalDef?.username;
    this.appendLine(username !== undefined ? username : "whoami: unknown user");
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

- [ ] **Step 2: Verify the project builds with exactly the predicted error count**

Run: `npm run build`
Expected: fails with exactly TWO errors now — the Task 3 error (`campaign.markObjectiveComplete()` doesn't exist) plus a new one at `main.ts`'s `new Terminal(...)` call site, something like `Expected 3-4 arguments, but got 2.` Confirm you see exactly these two and no others. If anything else appears, stop and report BLOCKED with the exact text — do not touch `main.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/ui/Terminal.ts
git commit -m "Checkpoint 19 task 4: add live vault-pin substitution, onCommand callback, and whoami to Terminal"
```

---

### Task 5: `core/MapEntitySystem.ts` — `computer_part`, gated terminals, vault-pin locks

**Files:**
- Modify: `src/core/MapEntitySystem.ts`

**Interfaces:**
- Consumes: `TerminalDirectory` (already in `types/index.ts`), `MapEntity.requiresPart`/`checksVaultPin` (Task 1).
- Produces: `MapEntitySystem`'s constructor gains one new required parameter at the end, `getVaultPin: () => string`. New public method `getDoorMesh(id: string): THREE.Mesh | undefined`. Consumed by Task 7 (`main.ts`).

**This task adds the third and final accumulated break to `main.ts`'s build** — the existing `new MapEntitySystem(...)` call is now missing a required 11th argument. Do not touch `main.ts`; Task 7 fixes all three breaks (this one, Task 3's, Task 4's) together.

- [ ] **Step 1: Replace the whole file**

The current file:

```typescript
import * as THREE from "three";
import { CELL_SIZE, WALL_HEIGHT } from "./MapLoader";
import { computeCollisionBox } from "./utils/CollisionBox";
import { findById } from "./utils/Lookup";
import type { MapDef, MapEntity, Weapon, TerminalDef } from "../types";
import type { WeaponSystem } from "./WeaponSystem";
import type { RunManager } from "./RunManager";
import type { RaycastRegistry } from "./RaycastRegistry";
import type { GameState } from "../state/GameState";

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

export interface DoorEntry {
  mesh: THREE.Mesh;
  box: THREE.Box3;
}

// Spawns one mesh per door/button/pickup/wall_buy/terminal/password_lock
// MapEntity and wires their interaction behavior. Kept separate from
// MapLoader: MapLoader's job is grid-to-geometry and spawn lookup, this is
// entity behavior — a different responsibility per the
// single-responsibility-per-file rule.
export class MapEntitySystem {
  readonly group = new THREE.Group();
  readonly doors: DoorEntry[] = [];
  readonly interactables: THREE.Mesh[] = [];

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

  get doorMeshes(): THREE.Mesh[] {
    return this.doors.map((door) => door.mesh);
  }

  private createDoor(
    entity: MapEntity,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE),
      new THREE.MeshStandardMaterial({ color: DOOR_COLOR }),
    );
    mesh.position.set(...entity.position);
    this.group.add(mesh);
    raycastRegistry.register(mesh);

    const box = computeCollisionBox(mesh);
    this.doors.push({ mesh, box });

    runManager.registerResettable(() => {
      mesh.visible = true;
      onDoorStateChanged();
    });

    return mesh;
  }

  // A button's cost (checkpoint 12) is optional — most buttons are still
  // free. The idempotency check (`!door.visible`, i.e. door already open)
  // runs BEFORE any spend attempt, not after: this is what guarantees a
  // repeat press of an already-open door's button never charges the player
  // again, the same way it already never re-opened an open door before
  // costs existed.
  private createButton(
    entity: MapEntity,
    doorMeshById: Map<string, THREE.Mesh>,
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
    gameState: GameState,
  ): void {
    const door = entity.linkedTo ? doorMeshById.get(entity.linkedTo) : undefined;
    if (!door) {
      throw new Error(
        `Button "${entity.id}" has no matching door for linkedTo "${entity.linkedTo}"`,
      );
    }

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(BUTTON_SIZE, BUTTON_SIZE, BUTTON_SIZE),
      new THREE.MeshStandardMaterial({
        color: BUTTON_COLOR,
        emissive: BUTTON_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      if (!door.visible) return; // idempotent: door already open — checked
      // before any spend attempt below, so this never charges twice.

      if (entity.cost !== undefined) {
        const paid = gameState.spendPoints(entity.cost);
        if (!paid) {
          console.log(
            `Button "${entity.id}": rejected (need ${entity.cost}, have ${gameState.pointsBalance}) — door stays closed`,
          );
          return;
        }
        console.log(
          `Button "${entity.id}": paid ${entity.cost} points, balance now ${gameState.pointsBalance}`,
        );
      }

      door.visible = false;
      onDoorStateChanged();
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);
  }

  private createPickup(
    entity: MapEntity,
    weaponSystem: WeaponSystem,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
  ): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(PICKUP_SIZE, PICKUP_SIZE, PICKUP_SIZE),
      new THREE.MeshStandardMaterial({
        color: PICKUP_COLOR,
        emissive: PICKUP_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      if (!mesh.visible) return; // idempotent: already collected
      weaponSystem.addReserveAmmo(PICKUP_AMMO_AMOUNT);
      mesh.visible = false;
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);

    runManager.registerResettable(() => {
      mesh.visible = true;
    });
  }

  // The first real GameState.spendPoints() caller (checkpoint 11) — replaces
  // the checkpoint-10 test terminal, which only proved the mechanism worked.
  // linkedTo here is a Weapon id (content/weapons.ts), not another
  // MapEntity's id — findById() throws by name if it doesn't resolve, same
  // as every other content lookup in this codebase. No
  // RunManager.registerResettable() call: like the test terminal before it,
  // this has no visible on/off state of its own to reset — spendPoints()'s
  // effect on pointsBalance already resets via RunManager ->
  // GameState.resetScore(). What a new run does to an already-purchased
  // weapon was originally an open question here — resolved at checkpoint 15,
  // see below.
  // (checkpoint 15: pickupWeapon() replaces the checkpoint-11 setWeapon() —
  // it fills an empty inventory slot if one exists, or replaces the active
  // slot if the inventory is full, rather than always overwriting a single
  // current weapon. WeaponSystem.reset() now rebuilds the whole inventory
  // back to the starting loadout on a new run, so a purchased weapon does
  // NOT survive a run reset. See WeaponSystem.ts and the checkpoint-15
  // decisions log.)
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

Replace it with:

```typescript
import * as THREE from "three";
import { CELL_SIZE, WALL_HEIGHT } from "./MapLoader";
import { computeCollisionBox } from "./utils/CollisionBox";
import { findById } from "./utils/Lookup";
import type { MapDef, MapEntity, Weapon, TerminalDef, TerminalDirectory } from "../types";
import type { WeaponSystem } from "./WeaponSystem";
import type { RunManager } from "./RunManager";
import type { RaycastRegistry } from "./RaycastRegistry";
import type { GameState } from "../state/GameState";

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
const COMPUTER_PART_COLOR = 0x888800;
const COMPUTER_PART_EMISSIVE = 0x333300;
const COMPUTER_PART_SIZE = 0.35;

// Checkpoint 19: a placeholder TerminalDirectory for the vault password
// lock's synthetic TerminalDef (see createPasswordLock()'s checksVaultPin
// branch) -- the vault lock has no real terminal/filesystem behind it, so
// this satisfies TerminalDef's required `root` field with an inert, empty
// tree that's never actually navigated.
const EMPTY_ROOT: TerminalDirectory = { name: "/", files: [], directories: [] };

export interface DoorEntry {
  mesh: THREE.Mesh;
  box: THREE.Box3;
}

// Spawns one mesh per door/button/pickup/wall_buy/terminal/password_lock/
// computer_part MapEntity and wires their interaction behavior. Kept
// separate from MapLoader: MapLoader's job is grid-to-geometry and spawn
// lookup, this is entity behavior — a different responsibility per the
// single-responsibility-per-file rule.
export class MapEntitySystem {
  readonly group = new THREE.Group();
  readonly doors: DoorEntry[] = [];
  readonly interactables: THREE.Mesh[] = [];

  // Checkpoint 19: promoted from a local constructor variable to a field so
  // getDoorMesh() below can expose door lookups after construction --
  // main.ts needs this to programmatically open Room 3's door once
  // room2_terminal's "whoami" command runs, since that door has no
  // button/lock of its own to drive it.
  private readonly doorMeshById = new Map<string, THREE.Mesh>();
  private readonly computerPartMeshById = new Map<string, THREE.Mesh>();

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
    getVaultPin: () => string,
  ) {
    for (const entity of mapDef.entities) {
      if (entity.type === "door") {
        this.doorMeshById.set(
          entity.id,
          this.createDoor(entity, runManager, raycastRegistry, onDoorStateChanged),
        );
      } else if (entity.type === "computer_part") {
        this.computerPartMeshById.set(
          entity.id,
          this.createComputerPart(entity, runManager, raycastRegistry),
        );
      }
    }

    for (const entity of mapDef.entities) {
      if (entity.type === "button") {
        this.createButton(entity, this.doorMeshById, raycastRegistry, onDoorStateChanged, gameState);
      } else if (entity.type === "pickup") {
        this.createPickup(entity, weaponSystem, runManager, raycastRegistry);
      } else if (entity.type === "wall_buy") {
        this.createWallBuy(entity, weapons, weaponSystem, gameState, raycastRegistry);
      } else if (entity.type === "terminal") {
        this.createTerminal(entity, terminals, raycastRegistry, openTerminal, this.computerPartMeshById);
      } else if (entity.type === "password_lock") {
        this.createPasswordLock(
          entity,
          this.doorMeshById,
          terminals,
          raycastRegistry,
          onDoorStateChanged,
          openPasswordLock,
          getVaultPin,
        );
      }
    }
  }

  get doorMeshes(): THREE.Mesh[] {
    return this.doors.map((door) => door.mesh);
  }

  // Checkpoint 19: lets main.ts open a door that has no button/lock of its
  // own (Room 3's door, opened programmatically when "whoami" runs).
  getDoorMesh(id: string): THREE.Mesh | undefined {
    return this.doorMeshById.get(id);
  }

  private createDoor(
    entity: MapEntity,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE),
      new THREE.MeshStandardMaterial({ color: DOOR_COLOR }),
    );
    mesh.position.set(...entity.position);
    this.group.add(mesh);
    raycastRegistry.register(mesh);

    const box = computeCollisionBox(mesh);
    this.doors.push({ mesh, box });

    runManager.registerResettable(() => {
      mesh.visible = true;
      onDoorStateChanged();
    });

    return mesh;
  }

  // A button's cost (checkpoint 12) is optional — most buttons are still
  // free. The idempotency check (`!door.visible`, i.e. door already open)
  // runs BEFORE any spend attempt, not after: this is what guarantees a
  // repeat press of an already-open door's button never charges the player
  // again, the same way it already never re-opened an open door before
  // costs existed.
  private createButton(
    entity: MapEntity,
    doorMeshById: Map<string, THREE.Mesh>,
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
    gameState: GameState,
  ): void {
    const door = entity.linkedTo ? doorMeshById.get(entity.linkedTo) : undefined;
    if (!door) {
      throw new Error(
        `Button "${entity.id}" has no matching door for linkedTo "${entity.linkedTo}"`,
      );
    }

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(BUTTON_SIZE, BUTTON_SIZE, BUTTON_SIZE),
      new THREE.MeshStandardMaterial({
        color: BUTTON_COLOR,
        emissive: BUTTON_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      if (!door.visible) return; // idempotent: door already open — checked
      // before any spend attempt below, so this never charges twice.

      if (entity.cost !== undefined) {
        const paid = gameState.spendPoints(entity.cost);
        if (!paid) {
          console.log(
            `Button "${entity.id}": rejected (need ${entity.cost}, have ${gameState.pointsBalance}) — door stays closed`,
          );
          return;
        }
        console.log(
          `Button "${entity.id}": paid ${entity.cost} points, balance now ${gameState.pointsBalance}`,
        );
      }

      door.visible = false;
      onDoorStateChanged();
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);
  }

  private createPickup(
    entity: MapEntity,
    weaponSystem: WeaponSystem,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
  ): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(PICKUP_SIZE, PICKUP_SIZE, PICKUP_SIZE),
      new THREE.MeshStandardMaterial({
        color: PICKUP_COLOR,
        emissive: PICKUP_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      if (!mesh.visible) return; // idempotent: already collected
      weaponSystem.addReserveAmmo(PICKUP_AMMO_AMOUNT);
      mesh.visible = false;
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);

    runManager.registerResettable(() => {
      mesh.visible = true;
    });
  }

  // Checkpoint 19: structurally identical to createPickup() above (spawn,
  // idempotent hide-on-interact, reset to visible on a new run) -- the
  // only real difference is that collecting it has no direct gameplay
  // effect of its own (unlike ammo pickups' addReserveAmmo() call); its
  // only purpose is to be checked for by createTerminal()'s requiresPart
  // gate below. Registered as resettable (unlike the checkpoint-11
  // wall-buy, which has no visible on/off state to reset) because THIS
  // entity's whole state IS its visible/hidden flag, exactly like a
  // pickup's.
  private createComputerPart(
    entity: MapEntity,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(COMPUTER_PART_SIZE, COMPUTER_PART_SIZE, COMPUTER_PART_SIZE),
      new THREE.MeshStandardMaterial({
        color: COMPUTER_PART_COLOR,
        emissive: COMPUTER_PART_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      if (!mesh.visible) return; // idempotent: already collected
      mesh.visible = false;
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);

    runManager.registerResettable(() => {
      mesh.visible = true;
    });

    return mesh;
  }

  // The first real GameState.spendPoints() caller (checkpoint 11) — replaces
  // the checkpoint-10 test terminal, which only proved the mechanism worked.
  // linkedTo here is a Weapon id (content/weapons.ts), not another
  // MapEntity's id — findById() throws by name if it doesn't resolve, same
  // as every other content lookup in this codebase. No
  // RunManager.registerResettable() call: like the test terminal before it,
  // this has no visible on/off state of its own to reset — spendPoints()'s
  // effect on pointsBalance already resets via RunManager ->
  // GameState.resetScore(). What a new run does to an already-purchased
  // weapon was originally an open question here — resolved at checkpoint 15,
  // see below.
  // (checkpoint 15: pickupWeapon() replaces the checkpoint-11 setWeapon() —
  // it fills an empty inventory slot if one exists, or replaces the active
  // slot if the inventory is full, rather than always overwriting a single
  // current weapon. WeaponSystem.reset() now rebuilds the whole inventory
  // back to the starting loadout on a new run, so a purchased weapon does
  // NOT survive a run reset. See WeaponSystem.ts and the checkpoint-15
  // decisions log.)
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
  //
  // Checkpoint 19: entity.requiresPart gates this the same way createButton()
  // already gates on cost -- checked before openTerminal() is even called.
  // The flavor-message rejection follows this project's own established
  // "rejection feedback is console.log-only" convention (see createButton()/
  // createWallBuy() above), not a new on-screen HUD mechanism.
  private createTerminal(
    entity: MapEntity,
    terminals: TerminalDef[],
    raycastRegistry: RaycastRegistry,
    openTerminal: (terminalDef: TerminalDef) => void,
    computerPartMeshById: Map<string, THREE.Mesh>,
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
      if (entity.requiresPart) {
        const partMesh = computerPartMeshById.get(entity.requiresPart);
        if (partMesh && partMesh.visible) {
          console.log("The screen is dark. It needs power.");
          return;
        }
      }
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
  //
  // Checkpoint 19: entity.checksVaultPin branches this into a second,
  // separate check path -- a hardcoded boolean, not a generalized "secret
  // source" abstraction, since there are exactly two cases. The vault lock
  // has no real TerminalDef of its own (no filesystem, no fixed password),
  // so a placeholder object is constructed inline with a live getVaultPin()
  // read as its `password` and EMPTY_ROOT as its inert `root` -- reusing
  // openPasswordLock()'s existing TerminalDef-shaped signature rather than
  // adding a parallel UI method means ui/PasswordLock.ts needs zero changes
  // for this checkpoint.
  private createPasswordLock(
    entity: MapEntity,
    doorMeshById: Map<string, THREE.Mesh>,
    terminals: TerminalDef[],
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
    openPasswordLock: (terminalDef: TerminalDef, onCorrectPassword: () => void) => void,
    getVaultPin: () => string,
  ): void {
    const door = entity.linkedTo ? doorMeshById.get(entity.linkedTo) : undefined;
    if (!door) {
      throw new Error(
        `Password lock "${entity.id}" has no matching door for linkedTo "${entity.linkedTo}"`,
      );
    }

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

      if (entity.checksVaultPin) {
        openPasswordLock({ id: entity.id, password: getVaultPin(), root: EMPTY_ROOT }, () => {
          door.visible = false;
          onDoorStateChanged();
        });
        return;
      }

      if (!entity.terminalId) {
        throw new Error(`Password lock "${entity.id}" has no terminalId`);
      }
      const terminalDef = findById(terminals, entity.terminalId);
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

- [ ] **Step 2: Verify the project builds with exactly the predicted error count**

Run: `npm run build`
Expected: fails with exactly THREE errors now — the Task 3 error (`markObjectiveComplete`), the Task 4 error (`Terminal` arity), plus a new one at `main.ts`'s `new MapEntitySystem(...)` call site, something like `Expected 11 arguments, but got 10.` Confirm you see exactly these three and no others. If anything else appears, stop and report BLOCKED with the exact text — do not touch `main.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/core/MapEntitySystem.ts
git commit -m "Checkpoint 19 task 5: MapEntitySystem gains createComputerPart(), gated terminals, vault-pin password locks, and getDoorMesh()"
```

---

### Task 6: `content/maps.ts` — extend `campaign_room1` with Room 2 and Room 3

**Files:**
- Modify: `src/content/maps.ts`

**Interfaces:**
- Consumes: `MapEntity.requiresPart`/`checksVaultPin`/`"computer_part"` type (Task 1).
- Produces: `campaign_room1`'s `grid`/`entities` fully replaced (same `id`/`name`/`supportedModes`, unchanged). Consumed by Task 7 (`main.ts`, unchanged `findById(MAPS, selections.mapId)` lookup).

This task introduces no new compile break beyond what Tasks 3–5 already introduced — `campaign_room1`'s new entities are just data satisfying the already-extended `MapEntity` type from Task 1.

- [ ] **Step 1: Replace the `campaign_room1` map entry**

The current entry (the third and last element of the `MAPS` array):

```typescript
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
```

Replace it with:

```typescript
  // campaign_room1 (checkpoint 17, extended at 19): Room 1 is unchanged in
  // shape/mechanics -- its whole grid section (and every one of its
  // entities' positions) simply shifted down by 8 rows (z += 16) to make
  // room for Room 2 above it. Reading the grid top to bottom: Room 3 (rows
  // 0-4, empty, reached via campaign_door_2's gap at row4/col6 -- no
  // button/lock, opened only programmatically by main.ts when
  // room2_terminal's "whoami" succeeds); Room 2 (rows 5-9, cols 1-10
  // interior, bigger than Room 1) holding the required part/terminal
  // puzzle (campaign_part_1 + campaign_terminal_2, requiresPart-gated) and
  // an optional vault side-path (campaign_door_3 + campaign_lock_2, a
  // checksVaultPin lock, gating a 1x2 alcove at cols 12-13 holding
  // campaign_wall_buy_1, a bonus MAC-10); row 10 (the wall separating Room
  // 2 from Room 1, with campaign_door_1's gap at col3 -- exactly the same
  // relative position it held before this checkpoint); Room 1 itself (rows
  // 11-13, unchanged interior). No enemy_spawn or target entities --
  // supportedModes below still excludes this map from the modes that would
  // ever look for them.
  {
    id: "campaign_room1",
    name: "Campaign: Room 1",
    supportedModes: ["campaign"],
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
      [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
    entities: [
      { id: "campaign_spawn_1", type: "spawn", position: [2, 0, 24] },
      {
        id: "campaign_terminal_1",
        type: "terminal",
        linkedTo: "room1_terminal",
        position: [10, 0.3, 24],
      },
      { id: "campaign_door_1", type: "door", position: [6, 1.5, 20] },
      {
        id: "campaign_lock_1",
        type: "password_lock",
        linkedTo: "campaign_door_1",
        terminalId: "room1_terminal",
        position: [6, 0.3, 22],
      },
      // Room 2's required path: the power cable and the terminal it feeds.
      // The terminal sits at the far (north) end of the same column as
      // Room 1's entry gap (row10/col3), so walking straight in from Room
      // 1 leads directly to it, passing the part along the way.
      { id: "campaign_part_1", type: "computer_part", position: [6, 0.3, 14] },
      {
        id: "campaign_terminal_2",
        type: "terminal",
        linkedTo: "room2_terminal",
        requiresPart: "campaign_part_1",
        position: [6, 0.3, 10],
      },
      // Room 2's optional vault side-path: a password_lock checking
      // Campaign's live vault pin (not a terminal's fixed password),
      // sitting just outside the vault's own doorway so it's never trapped
      // behind the door it controls -- same placement discipline as
      // corridors_button_2 (checkpoint 12).
      { id: "campaign_door_3", type: "door", position: [22, 1.5, 12] },
      {
        id: "campaign_lock_2",
        type: "password_lock",
        linkedTo: "campaign_door_3",
        checksVaultPin: true,
        position: [20, 0.3, 12],
      },
      { id: "campaign_wall_buy_1", type: "wall_buy", linkedTo: "mac10", position: [24, 0.3, 12] },
      // Room 3's connector: no button, no lock -- opened only
      // programmatically by main.ts when room2_terminal's "whoami"
      // succeeds. Room 3 itself (rows 0-3, cols 4-7) is deliberately empty
      // this checkpoint.
      { id: "campaign_door_2", type: "door", position: [12, 1.5, 8] },
    ],
  },
```

- [ ] **Step 2: Verify the project builds with the same predicted error count as Task 5**

Run: `npm run build`
Expected: still fails with the same THREE errors from Task 5 — this task adds no new error of its own, since it's pure content satisfying types already extended in Task 1.

- [ ] **Step 3: Commit**

```bash
git add src/content/maps.ts
git commit -m "Checkpoint 19 task 6: extend campaign_room1 with Room 2 (vault + part/terminal puzzle) and Room 3"
```

---

### Task 7: `main.ts` wiring — fix all three accumulated breaks, wire everything together

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Campaign.onDoorOneOpened()`/`markComplete()`/`getVaultPin` (Task 3), `Terminal`'s extended constructor (Task 4), `MapEntitySystem`'s extended constructor + `getDoorMesh()` (Task 5), `TERMINALS` now containing `room2_terminal` (Task 2), `campaign_room1`'s new entities (Task 6).
- Produces: nothing new for later tasks — this is the commit that restores a clean whole-project build.

- [ ] **Step 1: Replace the whole file**

The current file:

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

// Everything that used to run at module load now runs once, here, only
// after the main menu's Start button fires with the player's choices.
// RaycastRegistry (and every other checkpoint-8.5 singleton) is constructed
// inside this function rather than at module scope — even though this
// checkpoint only ever calls startGame() once, keeping construction scoped
// here avoids a stale-registry bug when a future mid-session menu return
// eventually calls startGame() a second time (see CLAUDE.md future
// mechanics: that return path isn't built yet).
function startGame(selections: GameSelections): void {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);

  const sceneManager = new SceneManager(canvas);
  const gameState = new GameState();
  const playerController = new PlayerController(
    sceneManager.camera,
    canvas,
    gameState,
  );
  // gameMode is assigned further down (it needs the map/weapon systems built
  // first) but this callback only ever runs later, once the player has
  // actually died, by which point construction has long finished.
  let gameMode: GameMode;
  // Releasing pointer lock on death is what makes the death-panel buttons
  // clickable — PlayerState owns the alive/dead transition but not the DOM/
  // pointer-lock machinery, so it's handed this as a callback rather than
  // reaching into PlayerController directly. It also snapshots the active
  // mode's summary lines into GameState once, at the exact moment of death,
  // so the death panel can't change under the player if the mode's own state
  // happens to advance in the background before Respawn is clicked.
  const playerState = new PlayerState(gameState, () => {
    playerController.controls.unlock();
    gameState.deathSummaryLines = gameMode.getSummaryLines();
  });
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

  const mapDef = findById(MAPS, selections.mapId);
  const map = loadMap(mapDef.grid, raycastRegistry);
  sceneManager.scene.add(map.group);
  playerController.setWallBoxes(map.wallBoxes);
  const spawnPosition = getSpawnPosition(mapDef);
  playerController.setSpawn(spawnPosition.x, spawnPosition.z);

  const audioSystem = new AudioSystem(sceneManager.camera);
  void audioSystem.load(findById(SOUNDS, "pistol_fire"));
  // Checkpoint 16: the melee attack's own distinct sound -- without this
  // preload, AudioSystem.play("melee_hit") would silently no-op (see
  // AudioSystem.play()'s early return when a sound was never load()ed).
  void audioSystem.load(findById(SOUNDS, "melee_hit"));
  void audioSystem.load(findById(SOUNDS, "zombie_growl"));
  void audioSystem.load(findById(SOUNDS, "zombie_death"));

  // Checkpoint 16: constructed before weaponSystem (moved up from its
  // original checkpoint-13 position further down this function) so
  // weaponSystem's onMeleeAttack callback below can reference it directly,
  // rather than relying on closure-timing semantics to make a forward
  // reference safe.
  const weaponViewmodel = new WeaponViewmodel();

  const weaponSystem = new WeaponSystem(
    sceneManager.camera,
    // Checkpoint 15: every run starts with M1911 in inventory slot 0,
    // unconditionally -- the main menu's Weapon selection (selections.weaponId)
    // no longer determines the starting loadout now that WeaponSystem is a
    // slot-based inventory rather than a single current weapon. Confirmed
    // with the user; the menu's Weapon group is left in place (still
    // visible/selectable) but its choice is presently unused here. See
    // CLAUDE.md's checkpoint-15 decisions log and future mechanics.
    findById(WEAPONS, "pistol"),
    // Checkpoint 16: the knife is always the starting/default melee weapon
    // -- there is no menu selection for melee (only one option exists), and
    // no wall-buy either (the knife is always available, never purchased).
    findById(WEAPONS, "knife"),
    audioSystem,
    gameState,
    runManager,
    raycastRegistry,
    // Checkpoint 16: a small viewmodel "lunge" as placeholder melee-attack
    // feedback, reusing the addImpulse() mechanism built at checkpoint 14
    // (its own future-mechanics notes already named melee-swing as an
    // intended integration point). Values are a first-cut guess, not tuned
    // against manual testing -- adjust here if they don't read well.
    () => weaponViewmodel.addImpulse({ x: 0, y: -0.06, z: 0.12 }, 0.15),
  );

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
  sceneManager.scene.add(mapEntitySystem.group);
  playerController.setDoors(mapEntitySystem.doors);

  const interactSystem = new InteractSystem(sceneManager.camera, gameState, raycastRegistry);

  const enemySpawnPoints = mapDef.entities
    .filter((entity) => entity.type === "enemy_spawn")
    .map((entity) => new THREE.Vector3(...entity.position));

  const targetPoints = mapDef.entities
    .filter((entity) => entity.type === "target")
    .map((entity) => new THREE.Vector3(...entity.position));

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

  function startNewRun(): void {
    runManager.startNewRun();
    playerController.setSpawn(spawnPosition.x, spawnPosition.z);
    playerController.controls.lock();
  }

  // "Main Menu" is still a placeholder alias for startNewRun() — this
  // checkpoint's menu is load-time only; a mid-session return to
  // ui/MainMenu.ts is deliberately not built yet (see CLAUDE.md future
  // mechanics).
  const hud = new HUD(
    gameState,
    gameMode,
    sceneManager.camera,
    startNewRun,
    startNewRun,
    raycastRegistry,
  );

  canvas.addEventListener("click", () => {
    playerController.controls.lock();
  });

  document.addEventListener("pointerlockchange", () => {
    gameState.paused = document.pointerLockElement !== canvas;
  });

  const modeClock = new THREE.Clock();

  function animate(): void {
    requestAnimationFrame(animate);
    playerController.update();
    weaponSystem.update();
    interactSystem.update();
    // Always drain the clock so its internal reference stays fresh — otherwise
    // the frame gameplay resumes after death would report one huge deltaTime
    // spike (elapsed dead-screen time) into whichever mode is active.
    const delta = modeClock.getDelta();
    if (gameState.playerState === "alive") {
      gameMode.update(delta);
    }
    hud.update();
    sceneManager.render();
    if (gameState.playerState === "alive") {
      weaponViewmodel.update(playerController.getSpeed(), delta);
      weaponViewmodel.render(sceneManager.renderer);
    }
  }

  animate();
}

const mainMenu = new MainMenu(WEAPONS, ENEMIES, MAPS, (selections) => {
  mainMenu.destroy();
  startGame(selections);
});
```

Replace it with:

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

// Everything that used to run at module load now runs once, here, only
// after the main menu's Start button fires with the player's choices.
// RaycastRegistry (and every other checkpoint-8.5 singleton) is constructed
// inside this function rather than at module scope — even though this
// checkpoint only ever calls startGame() once, keeping construction scoped
// here avoids a stale-registry bug when a future mid-session menu return
// eventually calls startGame() a second time (see CLAUDE.md future
// mechanics: that return path isn't built yet).
function startGame(selections: GameSelections): void {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);

  const sceneManager = new SceneManager(canvas);
  const gameState = new GameState();
  const playerController = new PlayerController(
    sceneManager.camera,
    canvas,
    gameState,
  );

  // Checkpoint 19: extracted to a named function (previously inlined
  // directly into MapEntitySystem's constructor call) so the
  // room2Terminal onCommand callback below can also call it when Room 3's
  // door opens programmatically, without duplicating this one-line
  // callback twice.
  const onDoorStateChanged = (): void => playerController.rebuildCollisionBoxes();

  // gameMode is assigned further down (it needs the map/weapon systems built
  // first) but this callback only ever runs later, once the player has
  // actually died, by which point construction has long finished.
  let gameMode: GameMode;
  // Releasing pointer lock on death is what makes the death-panel buttons
  // clickable — PlayerState owns the alive/dead transition but not the DOM/
  // pointer-lock machinery, so it's handed this as a callback rather than
  // reaching into PlayerController directly. It also snapshots the active
  // mode's summary lines into GameState once, at the exact moment of death,
  // so the death panel can't change under the player if the mode's own state
  // happens to advance in the background before Respawn is clicked.
  const playerState = new PlayerState(gameState, () => {
    playerController.controls.unlock();
    gameState.deathSummaryLines = gameMode.getSummaryLines();
  });
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

  // Checkpoint 19: declared here (forward reference, same pattern as
  // `let gameMode: GameMode` above) so room2Terminal's onCommand callback
  // below can reference mapEntitySystem.getDoorMesh() even though
  // mapEntitySystem itself isn't constructed until after both Terminal
  // instances -- the callback only actually runs later, once the player
  // types "whoami," by which point construction has long finished.
  let mapEntitySystem: MapEntitySystem;

  // Checkpoint 17: constructed before mapEntitySystem so its open() methods
  // can be referenced by the openTerminal/openPasswordLock callbacks passed
  // into MapEntitySystem's constructor below. Both release pointer lock on
  // open and re-lock on close, the same PlayerState.onDeath ->
  // controls.unlock() callback pattern used elsewhere in this function.
  const terminal = new Terminal(
    () => playerController.controls.unlock(),
    () => playerController.controls.lock(),
    campaign.getVaultPin,
  );
  // Checkpoint 19: a second, separate Terminal instance dedicated to
  // room2_terminal -- its onCommand callback watches for "whoami" and
  // opens Room 3's door + advances Campaign to "complete" when it runs.
  // room1_terminal's instance (above) is never given an onCommand
  // callback, so it never reacts to any command, per this checkpoint's own
  // requirement.
  const room2Terminal = new Terminal(
    () => playerController.controls.unlock(),
    () => playerController.controls.lock(),
    campaign.getVaultPin,
    (command) => {
      if (command !== "whoami") return;
      const door = mapEntitySystem.getDoorMesh("campaign_door_2");
      if (door && door.visible) {
        door.visible = false;
        onDoorStateChanged();
      }
      campaign.markComplete();
    },
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

  const mapDef = findById(MAPS, selections.mapId);
  const map = loadMap(mapDef.grid, raycastRegistry);
  sceneManager.scene.add(map.group);
  playerController.setWallBoxes(map.wallBoxes);
  const spawnPosition = getSpawnPosition(mapDef);
  playerController.setSpawn(spawnPosition.x, spawnPosition.z);

  const audioSystem = new AudioSystem(sceneManager.camera);
  void audioSystem.load(findById(SOUNDS, "pistol_fire"));
  // Checkpoint 16: the melee attack's own distinct sound -- without this
  // preload, AudioSystem.play("melee_hit") would silently no-op (see
  // AudioSystem.play()'s early return when a sound was never load()ed).
  void audioSystem.load(findById(SOUNDS, "melee_hit"));
  void audioSystem.load(findById(SOUNDS, "zombie_growl"));
  void audioSystem.load(findById(SOUNDS, "zombie_death"));

  // Checkpoint 16: constructed before weaponSystem (moved up from its
  // original checkpoint-13 position further down this function) so
  // weaponSystem's onMeleeAttack callback below can reference it directly,
  // rather than relying on closure-timing semantics to make a forward
  // reference safe.
  const weaponViewmodel = new WeaponViewmodel();

  const weaponSystem = new WeaponSystem(
    sceneManager.camera,
    // Checkpoint 15: every run starts with M1911 in inventory slot 0,
    // unconditionally -- the main menu's Weapon selection (selections.weaponId)
    // no longer determines the starting loadout now that WeaponSystem is a
    // slot-based inventory rather than a single current weapon. Confirmed
    // with the user; the menu's Weapon group is left in place (still
    // visible/selectable) but its choice is presently unused here. See
    // CLAUDE.md's checkpoint-15 decisions log and future mechanics.
    findById(WEAPONS, "pistol"),
    // Checkpoint 16: the knife is always the starting/default melee weapon
    // -- there is no menu selection for melee (only one option exists), and
    // no wall-buy either (the knife is always available, never purchased).
    findById(WEAPONS, "knife"),
    audioSystem,
    gameState,
    runManager,
    raycastRegistry,
    // Checkpoint 16: a small viewmodel "lunge" as placeholder melee-attack
    // feedback, reusing the addImpulse() mechanism built at checkpoint 14
    // (its own future-mechanics notes already named melee-swing as an
    // intended integration point). Values are a first-cut guess, not tuned
    // against manual testing -- adjust here if they don't read well.
    () => weaponViewmodel.addImpulse({ x: 0, y: -0.06, z: 0.12 }, 0.15),
  );

  mapEntitySystem = new MapEntitySystem(
    mapDef,
    weaponSystem,
    runManager,
    raycastRegistry,
    onDoorStateChanged,
    gameState,
    WEAPONS,
    TERMINALS,
    // Checkpoint 19: routes to whichever Terminal instance matches the
    // interacted entity's linked TerminalDef -- room2_terminal gets its
    // own instance (wired to react to "whoami"), everything else
    // (currently only room1_terminal) uses the original single instance.
    (terminalDef) => {
      if (terminalDef.id === "room2_terminal") {
        room2Terminal.open(terminalDef);
      } else {
        terminal.open(terminalDef);
      }
    },
    (terminalDef, onCorrectPassword) => {
      passwordLock.open(terminalDef, () => {
        onCorrectPassword();
        // Checkpoint 19: only Room 1's real password-lock success (checked
        // by terminalDef.id, since the vault lock's synthetic TerminalDef
        // has a different id, "campaign_lock_2") awards points and
        // advances Campaign's stage -- replaces checkpoint 17's
        // markObjectiveComplete() call, which no longer exists now that
        // Campaign tracks a 3-stage flow instead of a single boolean. The
        // vault lock's success path stays a plain door-open with no side
        // effects; the MAC-10 it guards is granted separately, by
        // interacting with campaign_wall_buy_1 inside the vault.
        if (terminalDef.id === "room1_terminal") {
          gameState.addScore(findById(WEAPONS, "mac10").cost);
          campaign.onDoorOneOpened();
        }
      });
    },
    campaign.getVaultPin,
  );
  sceneManager.scene.add(mapEntitySystem.group);
  playerController.setDoors(mapEntitySystem.doors);

  const interactSystem = new InteractSystem(sceneManager.camera, gameState, raycastRegistry);

  const enemySpawnPoints = mapDef.entities
    .filter((entity) => entity.type === "enemy_spawn")
    .map((entity) => new THREE.Vector3(...entity.position));

  const targetPoints = mapDef.entities
    .filter((entity) => entity.type === "target")
    .map((entity) => new THREE.Vector3(...entity.position));

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

  function startNewRun(): void {
    runManager.startNewRun();
    playerController.setSpawn(spawnPosition.x, spawnPosition.z);
    playerController.controls.lock();
  }

  // "Main Menu" is still a placeholder alias for startNewRun() — this
  // checkpoint's menu is load-time only; a mid-session return to
  // ui/MainMenu.ts is deliberately not built yet (see CLAUDE.md future
  // mechanics).
  const hud = new HUD(
    gameState,
    gameMode,
    sceneManager.camera,
    startNewRun,
    startNewRun,
    raycastRegistry,
  );

  canvas.addEventListener("click", () => {
    playerController.controls.lock();
  });

  document.addEventListener("pointerlockchange", () => {
    gameState.paused = document.pointerLockElement !== canvas;
  });

  const modeClock = new THREE.Clock();

  function animate(): void {
    requestAnimationFrame(animate);
    playerController.update();
    weaponSystem.update();
    interactSystem.update();
    // Always drain the clock so its internal reference stays fresh — otherwise
    // the frame gameplay resumes after death would report one huge deltaTime
    // spike (elapsed dead-screen time) into whichever mode is active.
    const delta = modeClock.getDelta();
    if (gameState.playerState === "alive") {
      gameMode.update(delta);
    }
    hud.update();
    sceneManager.render();
    if (gameState.playerState === "alive") {
      weaponViewmodel.update(playerController.getSpeed(), delta);
      weaponViewmodel.render(sceneManager.renderer);
    }
  }

  animate();
}

const mainMenu = new MainMenu(WEAPONS, ENEMIES, MAPS, (selections) => {
  mainMenu.destroy();
  startGame(selections);
});
```

- [ ] **Step 2: Verify the project builds cleanly**

Run: `npm run build`
Expected: succeeds, no TypeScript errors — this restores a clean whole-project build after Tasks 3, 4, and 5's three accumulated errors.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "Checkpoint 19 task 7: wire Room 2/Room 3 into main.ts, fixing all three accumulated build errors"
```

---

### Task 8: Manual verification against acceptance criteria (controller-executed, not a subagent)

**Files:** none (verification only).

This task is executed directly by the session controller together with the human partner — it requires live browser interaction and judgment a subagent cannot reliably perform.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL in a browser.

- [ ] **Step 2: Verify Room 1 → Room 2 transition**

Start a Campaign run. Note the current points balance. Solve Room 1 exactly as before (terminal → password lock). Confirm: the door opens, the points balance increases by exactly 1200 (MAC-10's cost), and the HUD status line changes from "Objective: find the door password" to "Objective: power the terminal".

- [ ] **Step 3: Verify the gated Room 2 terminal**

Walk into Room 2. Before touching the power cable (the small yellow-ish box), interact with `campaign_terminal_2` (E). Confirm: no overlay opens, and the browser console shows the flavor message ("The screen is dark. It needs power."). Interact with the power cable — confirm it disappears, and interacting with it again does nothing (idempotent). Now interact with the terminal again — confirm the overlay opens normally this time.

- [ ] **Step 4: Verify `whoami` opens Room 3 and completes the objective**

Inside `room2_terminal`, run `ls` first — confirm Room 3's door does NOT open and the HUD status line does not change. Then run `whoami` — confirm it prints the configured username, the HUD status line changes to "Objective: complete", and (after closing the terminal) Room 3's door is visibly open.

- [ ] **Step 5: Verify Room 3**

Walk through the now-open door into Room 3. Confirm: it's an empty room, no crash, no console errors.

- [ ] **Step 6: Verify the vault side-path, independently of Steps 3-5**

In `room1_terminal`, run `cat credentials.txt` — confirm the output shows a real 6-digit number where `{{VAULT_PIN}}` would be (not the literal token text). Note this number. Go to the vault's password lock (`campaign_lock_2`, in Room 2). Submit a wrong 6-digit number — confirm it's rejected (error shown, door stays closed). Submit the exact number you noted — confirm the door opens. Interact with `campaign_wall_buy_1` inside the vault — confirm it grants a MAC-10 (fills an empty weapon slot or replaces the active one, per the existing checkpoint-15 wall-buy behavior) and deducts its cost.

- [ ] **Step 7: Verify a fresh run regenerates the vault pin**

Trigger a new run (die/respawn, or reload and start a fresh Campaign run). In `room1_terminal`, run `cat credentials.txt` again — confirm the displayed vault pin is DIFFERENT from Step 6's. Confirm the OLD pin no longer works at the vault lock. Confirm Room 1's door password is still the same static value as always (unaffected by the regeneration). Confirm the door/part/terminal states have all reset (Room 1's door closed again, the power cable reappeared, Room 2's terminal gated again, Room 3's door closed again).

- [ ] **Step 8: Full regression check**

Reload the page. Play Zombie Survival and Shooting Range on both `test-grid` and `corridors` — confirm every checkpoint 1-18 behavior is completely unaffected. Confirm neither map shows any Campaign-specific entity.

---

## Mid-Checkpoint Correction (applied before Task 9/CLAUDE.md)

After Tasks 1-8 landed and manual verification was underway, three corrections/additions were requested in one pass, all before finalizing checkpoint 19:

**A. Room 3's door needed a real identity lock, not `whoami`-as-door-trigger.** The original design had `room2_terminal`'s `onCommand` callback open Room 3's door directly whenever `"whoami"` ran. This was wrong — it should work like every other locked door in this codebase: a `password_lock` entity the player interacts with and submits input to, checked against `room2_terminal`'s `username`. Running `whoami` only *reveals* the answer (with a copy button, matching the door-1/vault-pin accessibility pattern) — it no longer opens anything by itself. Net effect: removes the `onCommand`-as-door-trigger mechanism entirely (and everything that existed only to support it — `Terminal`'s `onCommand` callback, `MapEntitySystem.getDoorMesh()`, the `let mapEntitySystem` forward reference, the second `Terminal` instance), reuses the already-proven `password_lock` mechanism instead.

Since the corrected design no longer needs a second `Terminal` instance to distinguish "the one with onCommand" from "the one without" (`onCommand` doesn't exist anymore), `main.ts` consolidates back to a single shared `Terminal` instance for every terminal — the same shape checkpoint 17 originally used, before checkpoint 19 introduced a second instance specifically to support the now-removed mechanism. This wasn't separately requested but is a direct, low-risk consequence of removing `onCommand`: keeping two structurally-identical `Terminal` instances after their only distinguishing feature is gone would just be needless duplication. Documented explicitly below and in CLAUDE.md so it's traceable as a deliberate call, not an unnoticed scope change.

The `MapEntity.checksVaultPin: boolean` field (checkpoint 19's original two-case branch) is replaced by `secretField?: "password" | "vaultPin" | "username"` — a lock now has three possible secret sources instead of two, so a boolean can no longer express the choice. `MapEntity` also gains `promptLabel?: string` so different locks can show different prompts (Room 3's identity lock: `"Identity, who you are:"`; Room 1's and the vault's locks: an unset default).

**B. Shared, inheritable command-permission system.** A new `content/terminalCommands.ts` classifies commands into `BLOCKED_COMMANDS` (recognized, always denied everywhere — a world-building constraint, not something any `TerminalDef` can ever opt into) and `RESTRICTED_COMMANDS` (recognized, denied by default, but a specific `TerminalDef` can opt a command in via a new `TerminalDef.unlockedCommands` field — the mechanism a future checkpoint will use to give real behavior to one command in one room's terminal, without touching `ui/Terminal.ts` or this new file's `BLOCKED_COMMANDS` at all). No restricted command has any real behavior yet even when "unlocked" — this checkpoint only builds the classification and the per-terminal unlock data hook.

Per this project's own established precedent (`ui/MainMenu.ts` receives `Weapon[]`/`EnemyDef[]`/`MapDef[]` as constructor arguments from `main.ts` rather than importing `content/weapons.ts` etc. directly, keeping every `ui/` file a pure presentation layer over data it's handed — see the checkpoint-9 decisions log), `content/terminalCommands.ts`'s exports are threaded into `Terminal`'s constructor as parameters by `main.ts` (the composition root), not imported directly by `ui/Terminal.ts`.

**C. `pwd`/`clear`/`help` were part of the original checkpoint-19 scope but got dropped somewhere between drafts and never actually implemented.** They're added now, alongside the correction above since all of this touches the same file (`ui/Terminal.ts`) and it's more efficient to land it in one pass than three.

This correction spans Tasks 10-14 below, renumbering the original Task 9 (CLAUDE.md) to Task 15.

---

### Task 10: `types/index.ts` + `content/terminalCommands.ts` + `core/MapEntitySystem.ts` + `content/maps.ts` — `secretField` consolidation, Room 3's identity lock, command classification data

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/content/terminalCommands.ts`
- Modify: `src/core/MapEntitySystem.ts`
- Modify: `src/content/maps.ts`

**Interfaces:**
- Consumes: nothing new from outside this task.
- Produces: `MapEntity.secretField?: "password" | "vaultPin" | "username"` (replaces `checksVaultPin`), `MapEntity.promptLabel?: string`, `TerminalDef.unlockedCommands?: string[]`, `BLOCKED_COMMANDS`/`RESTRICTED_COMMANDS`/`CORE_COMMANDS` (consumed by Task 12, `ui/Terminal.ts`, and Task 13, `main.ts`). `MapEntitySystem`'s constructor's `openPasswordLock` parameter type gains a third `promptLabel?: string` argument (consumed by Task 11, `ui/PasswordLock.ts`, and Task 13, `main.ts`).

These four files are one tightly-coupled unit — `checksVaultPin` is a field on a type (`types/index.ts`) that exactly two other files read/write (`MapEntitySystem.ts` reads it, `content/maps.ts` writes it on the vault lock), so renaming it requires touching all three together to avoid an intermediate broken state. `content/terminalCommands.ts` is bundled in since it's a small, independent, purely additive file with no reason to be its own task.

**This task leaves `src/main.ts` and `src/ui/PasswordLock.ts` unaffected structurally (their existing 2-arg `openPasswordLock(...)`/`passwordLock.open(...)` calls still type-check, since the new `promptLabel` parameter is optional) but DOES leave two things for later tasks to pick up: `main.ts` still calls the now-removed `mapEntitySystem.getDoorMesh(...)` inside `room2Terminal`'s `onCommand` closure (both of which are removed by this task's `MapEntitySystem.ts` changes) — this WILL break `main.ts`'s build. Do not touch `main.ts`; Task 13 fixes it together with two more accumulated changes.**

- [ ] **Step 1: `types/index.ts` — replace `checksVaultPin` with `secretField`, add `promptLabel`**

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
    | "wall_buy"
    | "terminal"
    | "password_lock"
    | "computer_part";
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
  requiresPart?: string; // "terminal" only (checkpoint 19): a computer_part
  // entity's id. When set, interacting with this terminal before that part
  // has been collected (its mesh is still visible) shows a short flavor
  // message instead of opening the Terminal overlay.
  checksVaultPin?: boolean; // "password_lock" only (checkpoint 19): when
  // true, this lock ignores terminalId/TerminalDef.password entirely and
  // checks against Campaign's live, per-run vault pin instead (via a
  // getVaultPin callback). A hardcoded boolean branch, not a generalized
  // "secret source" abstraction, since there are exactly two cases.
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
    | "password_lock"
    | "computer_part";
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
  // id in content/terminals.ts, the terminal this lock is checked against
  // (see secretField below for which of that terminal's fields). Separate
  // from linkedTo because a password lock has two distinct relationships
  // (which door, which terminal) -- unlike button/wall_buy, which only
  // ever have one. Not read at all when secretField is "vaultPin".
  requiresPart?: string; // "terminal" only (checkpoint 19): a computer_part
  // entity's id. When set, interacting with this terminal before that part
  // has been collected (its mesh is still visible) shows a short flavor
  // message instead of opening the Terminal overlay.
  secretField?: "password" | "vaultPin" | "username"; // "password_lock"
  // only (checkpoint 19, corrected same checkpoint): which value this lock
  // checks the player's input against. "password" (the default when this
  // field is absent) checks the linked terminal's static
  // TerminalDef.password -- unchanged checkpoint-17 behavior. "vaultPin"
  // checks Campaign's live, per-run vault pin instead of anything on a
  // TerminalDef -- unchanged checkpoint-19 behavior, previously gated by a
  // now-removed checksVaultPin boolean. "username" checks the linked
  // terminal's TerminalDef.username -- new this correction, used by Room
  // 3's identity lock. A literal union, not a generalized "secret source"
  // abstraction, since there are exactly three known cases.
  promptLabel?: string; // "password_lock" only (checkpoint 19, corrected
  // same checkpoint): the overlay's prompt text. Defaults to
  // ui/PasswordLock.ts's own generic label when absent -- Room 1's and the
  // vault's locks don't set this.
}
```

- [ ] **Step 2: `types/index.ts` — add `TerminalDef.unlockedCommands`**

The current `TerminalDef` interface:

```typescript
export interface TerminalDef {
  id: string;
  password?: string; // checked by ui/PasswordLock.ts against the linked
  // "password_lock" MapEntity's input. Also (via template-literal
  // interpolation, not a second hardcoded copy) appears inside root's file
  // tree somewhere, so the player can find it in-fiction via cat. Optional
  // as of checkpoint 19 -- room2_terminal has no password to guard (its
  // only purpose is the "whoami" command), and inventing a dummy value
  // would be worse than just not requiring one.
  username?: string; // checkpoint 19: read by ui/Terminal.ts's "whoami"
  // command. Only room2_terminal sets this; room1_terminal leaves it
  // undefined, since nothing in Room 1's puzzle needs it.
  root: TerminalDirectory;
}
```

Replace it with:

```typescript
export interface TerminalDef {
  id: string;
  password?: string; // checked by ui/PasswordLock.ts against the linked
  // "password_lock" MapEntity's input, when that lock's secretField is
  // "password" (the default -- see MapEntity.secretField). Also (via
  // template-literal interpolation, not a second hardcoded copy) appears
  // inside root's file tree somewhere, so the player can find it
  // in-fiction via cat. Optional as of checkpoint 19 -- room2_terminal has
  // no password to guard (its only purpose is the "whoami" command).
  username?: string; // read by ui/Terminal.ts's "whoami" command, and by a
  // "password_lock" whose secretField is "username" (checkpoint 19,
  // corrected same checkpoint -- see Room 3's identity lock). Only
  // room2_terminal sets this; room1_terminal leaves it undefined.
  unlockedCommands?: string[]; // checkpoint 19 (corrected same checkpoint):
  // names from content/terminalCommands.ts's RESTRICTED_COMMANDS that THIS
  // specific terminal allows -- the mechanism a future checkpoint will use
  // to make e.g. "ping" actually work in one particular room's terminal,
  // without touching ui/Terminal.ts or content/terminalCommands.ts's
  // BLOCKED_COMMANDS at all. No current TerminalDef sets this; no
  // restricted command has real behavior yet even when unlocked.
  root: TerminalDirectory;
}
```

- [ ] **Step 3: Create `content/terminalCommands.ts`**

```typescript
// Recognized but permanently denied in every terminal, in every room -- a
// world-building constraint (the player never gets filesystem write access
// anywhere), not something any future TerminalDef can ever opt into.
export const BLOCKED_COMMANDS = ["touch", "mkdir", "rm", "cp", "mv", "rmdir", "chmod"];

// Recognized, denied by default, but a specific TerminalDef can opt a
// specific command in via TerminalDef.unlockedCommands -- the mechanism a
// future checkpoint will use to make e.g. "ping" actually work in one
// particular room's terminal without touching ui/Terminal.ts or this
// file's BLOCKED_COMMANDS at all. No real behavior is implemented for any
// of these yet even when unlocked -- see CLAUDE.md's future mechanics.
export const RESTRICTED_COMMANDS = ["ping", "ifconfig", "grep", "nmap"];

// The commands ui/Terminal.ts actually implements -- used to drive help's
// output so a future core command addition shows up there automatically,
// without needing to also hand-edit a separate help string.
export const CORE_COMMANDS: { name: string; description: string }[] = [
  { name: "ls", description: "list files and directories" },
  { name: "cd", description: "change directory" },
  { name: "cat", description: "print a file's contents" },
  { name: "pwd", description: "print the current directory path" },
  { name: "clear", description: "clear the terminal screen" },
  { name: "whoami", description: "print the current username" },
  { name: "help", description: "show this list" },
];
```

- [ ] **Step 4: `core/MapEntitySystem.ts` — replace the whole file**

The current file:

```typescript
import * as THREE from "three";
import { CELL_SIZE, WALL_HEIGHT } from "./MapLoader";
import { computeCollisionBox } from "./utils/CollisionBox";
import { findById } from "./utils/Lookup";
import type { MapDef, MapEntity, Weapon, TerminalDef, TerminalDirectory } from "../types";
import type { WeaponSystem } from "./WeaponSystem";
import type { RunManager } from "./RunManager";
import type { RaycastRegistry } from "./RaycastRegistry";
import type { GameState } from "../state/GameState";

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
const COMPUTER_PART_COLOR = 0x888800;
const COMPUTER_PART_EMISSIVE = 0x333300;
const COMPUTER_PART_SIZE = 0.35;

// Checkpoint 19: a placeholder TerminalDirectory for the vault password
// lock's synthetic TerminalDef (see createPasswordLock()'s checksVaultPin
// branch) -- the vault lock has no real terminal/filesystem behind it, so
// this satisfies TerminalDef's required `root` field with an inert, empty
// tree that's never actually navigated.
const EMPTY_ROOT: TerminalDirectory = { name: "/", files: [], directories: [] };

export interface DoorEntry {
  mesh: THREE.Mesh;
  box: THREE.Box3;
}

// Spawns one mesh per door/button/pickup/wall_buy/terminal/password_lock/
// computer_part MapEntity and wires their interaction behavior. Kept
// separate from MapLoader: MapLoader's job is grid-to-geometry and spawn
// lookup, this is entity behavior — a different responsibility per the
// single-responsibility-per-file rule.
export class MapEntitySystem {
  readonly group = new THREE.Group();
  readonly doors: DoorEntry[] = [];
  readonly interactables: THREE.Mesh[] = [];

  // Checkpoint 19: promoted from a local constructor variable to a field so
  // getDoorMesh() below can expose door lookups after construction --
  // main.ts needs this to programmatically open Room 3's door once
  // room2_terminal's "whoami" command runs, since that door has no
  // button/lock of its own to drive it.
  private readonly doorMeshById = new Map<string, THREE.Mesh>();
  private readonly computerPartMeshById = new Map<string, THREE.Mesh>();

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
    getVaultPin: () => string,
  ) {
    for (const entity of mapDef.entities) {
      if (entity.type === "door") {
        this.doorMeshById.set(
          entity.id,
          this.createDoor(entity, runManager, raycastRegistry, onDoorStateChanged),
        );
      } else if (entity.type === "computer_part") {
        this.computerPartMeshById.set(
          entity.id,
          this.createComputerPart(entity, runManager, raycastRegistry),
        );
      }
    }

    for (const entity of mapDef.entities) {
      if (entity.type === "button") {
        this.createButton(entity, this.doorMeshById, raycastRegistry, onDoorStateChanged, gameState);
      } else if (entity.type === "pickup") {
        this.createPickup(entity, weaponSystem, runManager, raycastRegistry);
      } else if (entity.type === "wall_buy") {
        this.createWallBuy(entity, weapons, weaponSystem, gameState, raycastRegistry);
      } else if (entity.type === "terminal") {
        this.createTerminal(entity, terminals, raycastRegistry, openTerminal, this.computerPartMeshById);
      } else if (entity.type === "password_lock") {
        this.createPasswordLock(
          entity,
          this.doorMeshById,
          terminals,
          raycastRegistry,
          onDoorStateChanged,
          openPasswordLock,
          getVaultPin,
        );
      }
    }
  }

  get doorMeshes(): THREE.Mesh[] {
    return this.doors.map((door) => door.mesh);
  }

  // Checkpoint 19: lets main.ts open a door that has no button/lock of its
  // own (Room 3's door, opened programmatically when "whoami" runs).
  getDoorMesh(id: string): THREE.Mesh | undefined {
    return this.doorMeshById.get(id);
  }

  private createDoor(
    entity: MapEntity,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE),
      new THREE.MeshStandardMaterial({ color: DOOR_COLOR }),
    );
    mesh.position.set(...entity.position);
    this.group.add(mesh);
    raycastRegistry.register(mesh);

    const box = computeCollisionBox(mesh);
    this.doors.push({ mesh, box });

    runManager.registerResettable(() => {
      mesh.visible = true;
      onDoorStateChanged();
    });

    return mesh;
  }

  // A button's cost (checkpoint 12) is optional — most buttons are still
  // free. The idempotency check (`!door.visible`, i.e. door already open)
  // runs BEFORE any spend attempt, not after: this is what guarantees a
  // repeat press of an already-open door's button never charges the player
  // again, the same way it already never re-opened an open door before
  // costs existed.
  private createButton(
    entity: MapEntity,
    doorMeshById: Map<string, THREE.Mesh>,
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
    gameState: GameState,
  ): void {
    const door = entity.linkedTo ? doorMeshById.get(entity.linkedTo) : undefined;
    if (!door) {
      throw new Error(
        `Button "${entity.id}" has no matching door for linkedTo "${entity.linkedTo}"`,
      );
    }

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(BUTTON_SIZE, BUTTON_SIZE, BUTTON_SIZE),
      new THREE.MeshStandardMaterial({
        color: BUTTON_COLOR,
        emissive: BUTTON_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      if (!door.visible) return; // idempotent: door already open — checked
      // before any spend attempt below, so this never charges twice.

      if (entity.cost !== undefined) {
        const paid = gameState.spendPoints(entity.cost);
        if (!paid) {
          console.log(
            `Button "${entity.id}": rejected (need ${entity.cost}, have ${gameState.pointsBalance}) — door stays closed`,
          );
          return;
        }
        console.log(
          `Button "${entity.id}": paid ${entity.cost} points, balance now ${gameState.pointsBalance}`,
        );
      }

      door.visible = false;
      onDoorStateChanged();
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);
  }

  private createPickup(
    entity: MapEntity,
    weaponSystem: WeaponSystem,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
  ): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(PICKUP_SIZE, PICKUP_SIZE, PICKUP_SIZE),
      new THREE.MeshStandardMaterial({
        color: PICKUP_COLOR,
        emissive: PICKUP_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      if (!mesh.visible) return; // idempotent: already collected
      weaponSystem.addReserveAmmo(PICKUP_AMMO_AMOUNT);
      mesh.visible = false;
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);

    runManager.registerResettable(() => {
      mesh.visible = true;
    });
  }

  private createComputerPart(
    entity: MapEntity,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(COMPUTER_PART_SIZE, COMPUTER_PART_SIZE, COMPUTER_PART_SIZE),
      new THREE.MeshStandardMaterial({
        color: COMPUTER_PART_COLOR,
        emissive: COMPUTER_PART_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      if (!mesh.visible) return; // idempotent: already collected
      mesh.visible = false;
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);

    runManager.registerResettable(() => {
      mesh.visible = true;
    });

    return mesh;
  }

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

  private createTerminal(
    entity: MapEntity,
    terminals: TerminalDef[],
    raycastRegistry: RaycastRegistry,
    openTerminal: (terminalDef: TerminalDef) => void,
    computerPartMeshById: Map<string, THREE.Mesh>,
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
      if (entity.requiresPart) {
        const partMesh = computerPartMeshById.get(entity.requiresPart);
        if (partMesh && partMesh.visible) {
          console.log("The screen is dark. It needs power.");
          return;
        }
      }
      openTerminal(terminalDef);
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);
  }

  private createPasswordLock(
    entity: MapEntity,
    doorMeshById: Map<string, THREE.Mesh>,
    terminals: TerminalDef[],
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
    openPasswordLock: (terminalDef: TerminalDef, onCorrectPassword: () => void) => void,
    getVaultPin: () => string,
  ): void {
    const door = entity.linkedTo ? doorMeshById.get(entity.linkedTo) : undefined;
    if (!door) {
      throw new Error(
        `Password lock "${entity.id}" has no matching door for linkedTo "${entity.linkedTo}"`,
      );
    }

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

      if (entity.checksVaultPin) {
        openPasswordLock({ id: entity.id, password: getVaultPin(), root: EMPTY_ROOT }, () => {
          door.visible = false;
          onDoorStateChanged();
        });
        return;
      }

      if (!entity.terminalId) {
        throw new Error(`Password lock "${entity.id}" has no terminalId`);
      }
      const terminalDef = findById(terminals, entity.terminalId);
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

Replace it with:

```typescript
import * as THREE from "three";
import { CELL_SIZE, WALL_HEIGHT } from "./MapLoader";
import { computeCollisionBox } from "./utils/CollisionBox";
import { findById } from "./utils/Lookup";
import type { MapDef, MapEntity, Weapon, TerminalDef, TerminalDirectory } from "../types";
import type { WeaponSystem } from "./WeaponSystem";
import type { RunManager } from "./RunManager";
import type { RaycastRegistry } from "./RaycastRegistry";
import type { GameState } from "../state/GameState";

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
const COMPUTER_PART_COLOR = 0x888800;
const COMPUTER_PART_EMISSIVE = 0x333300;
const COMPUTER_PART_SIZE = 0.35;

// Checkpoint 19: a placeholder TerminalDirectory for a password lock's
// synthetic TerminalDef (see createPasswordLock()'s "vaultPin" branch) --
// some locks have no real terminal/filesystem behind them, so this
// satisfies TerminalDef's required `root` field with an inert, empty tree
// that's never actually navigated.
const EMPTY_ROOT: TerminalDirectory = { name: "/", files: [], directories: [] };

export interface DoorEntry {
  mesh: THREE.Mesh;
  box: THREE.Box3;
}

// Spawns one mesh per door/button/pickup/wall_buy/terminal/password_lock/
// computer_part MapEntity and wires their interaction behavior. Kept
// separate from MapLoader: MapLoader's job is grid-to-geometry and spawn
// lookup, this is entity behavior — a different responsibility per the
// single-responsibility-per-file rule.
export class MapEntitySystem {
  readonly group = new THREE.Group();
  readonly doors: DoorEntry[] = [];
  readonly interactables: THREE.Mesh[] = [];

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
    openPasswordLock: (
      terminalDef: TerminalDef,
      onCorrectPassword: () => void,
      promptLabel?: string,
    ) => void,
    getVaultPin: () => string,
  ) {
    // Checkpoint 19 correction: reverted to local constructor variables --
    // Room 3's door is now opened by its own password_lock (the same
    // generic door.visible = false / onDoorStateChanged() mechanism every
    // other locked door already uses), not programmatically from main.ts,
    // so there's no longer any reason for doorMeshById to be a class field
    // (it briefly was, exposed via a getDoorMesh() method, both now
    // removed along with the mechanism that needed them).
    const doorMeshById = new Map<string, THREE.Mesh>();
    const computerPartMeshById = new Map<string, THREE.Mesh>();

    for (const entity of mapDef.entities) {
      if (entity.type === "door") {
        doorMeshById.set(
          entity.id,
          this.createDoor(entity, runManager, raycastRegistry, onDoorStateChanged),
        );
      } else if (entity.type === "computer_part") {
        computerPartMeshById.set(
          entity.id,
          this.createComputerPart(entity, runManager, raycastRegistry),
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
        this.createTerminal(entity, terminals, raycastRegistry, openTerminal, computerPartMeshById);
      } else if (entity.type === "password_lock") {
        this.createPasswordLock(
          entity,
          doorMeshById,
          terminals,
          raycastRegistry,
          onDoorStateChanged,
          openPasswordLock,
          getVaultPin,
        );
      }
    }
  }

  get doorMeshes(): THREE.Mesh[] {
    return this.doors.map((door) => door.mesh);
  }

  private createDoor(
    entity: MapEntity,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE),
      new THREE.MeshStandardMaterial({ color: DOOR_COLOR }),
    );
    mesh.position.set(...entity.position);
    this.group.add(mesh);
    raycastRegistry.register(mesh);

    const box = computeCollisionBox(mesh);
    this.doors.push({ mesh, box });

    runManager.registerResettable(() => {
      mesh.visible = true;
      onDoorStateChanged();
    });

    return mesh;
  }

  // A button's cost (checkpoint 12) is optional — most buttons are still
  // free. The idempotency check (`!door.visible`, i.e. door already open)
  // runs BEFORE any spend attempt, not after: this is what guarantees a
  // repeat press of an already-open door's button never charges the player
  // again, the same way it already never re-opened an open door before
  // costs existed.
  private createButton(
    entity: MapEntity,
    doorMeshById: Map<string, THREE.Mesh>,
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
    gameState: GameState,
  ): void {
    const door = entity.linkedTo ? doorMeshById.get(entity.linkedTo) : undefined;
    if (!door) {
      throw new Error(
        `Button "${entity.id}" has no matching door for linkedTo "${entity.linkedTo}"`,
      );
    }

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(BUTTON_SIZE, BUTTON_SIZE, BUTTON_SIZE),
      new THREE.MeshStandardMaterial({
        color: BUTTON_COLOR,
        emissive: BUTTON_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      if (!door.visible) return; // idempotent: door already open — checked
      // before any spend attempt below, so this never charges twice.

      if (entity.cost !== undefined) {
        const paid = gameState.spendPoints(entity.cost);
        if (!paid) {
          console.log(
            `Button "${entity.id}": rejected (need ${entity.cost}, have ${gameState.pointsBalance}) — door stays closed`,
          );
          return;
        }
        console.log(
          `Button "${entity.id}": paid ${entity.cost} points, balance now ${gameState.pointsBalance}`,
        );
      }

      door.visible = false;
      onDoorStateChanged();
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);
  }

  private createPickup(
    entity: MapEntity,
    weaponSystem: WeaponSystem,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
  ): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(PICKUP_SIZE, PICKUP_SIZE, PICKUP_SIZE),
      new THREE.MeshStandardMaterial({
        color: PICKUP_COLOR,
        emissive: PICKUP_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      if (!mesh.visible) return; // idempotent: already collected
      weaponSystem.addReserveAmmo(PICKUP_AMMO_AMOUNT);
      mesh.visible = false;
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);

    runManager.registerResettable(() => {
      mesh.visible = true;
    });
  }

  private createComputerPart(
    entity: MapEntity,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(COMPUTER_PART_SIZE, COMPUTER_PART_SIZE, COMPUTER_PART_SIZE),
      new THREE.MeshStandardMaterial({
        color: COMPUTER_PART_COLOR,
        emissive: COMPUTER_PART_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      if (!mesh.visible) return; // idempotent: already collected
      mesh.visible = false;
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);

    runManager.registerResettable(() => {
      mesh.visible = true;
    });

    return mesh;
  }

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

  private createTerminal(
    entity: MapEntity,
    terminals: TerminalDef[],
    raycastRegistry: RaycastRegistry,
    openTerminal: (terminalDef: TerminalDef) => void,
    computerPartMeshById: Map<string, THREE.Mesh>,
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
      if (entity.requiresPart) {
        const partMesh = computerPartMeshById.get(entity.requiresPart);
        if (partMesh && partMesh.visible) {
          console.log("The screen is dark. It needs power.");
          return;
        }
      }
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
  //
  // Checkpoint 19 (corrected same checkpoint): entity.secretField picks
  // which value this lock checks the player's input against. "password"
  // (default) reads the linked terminal's TerminalDef.password --
  // unchanged checkpoint-17 behavior. "vaultPin" reads Campaign's live
  // vault pin via getVaultPin() -- unchanged checkpoint-19 behavior,
  // previously gated by a now-removed checksVaultPin boolean. "username"
  // reads the linked terminal's TerminalDef.username -- new this
  // correction, used by Room 3's identity lock. The "vaultPin" and
  // "username" branches both construct a TerminalDef-shaped object so they
  // can reuse openPasswordLock()'s existing signature rather than adding a
  // parallel UI path -- ui/PasswordLock.ts itself needed zero changes for
  // either. entity.promptLabel threads through to all three branches via
  // one shared onCorrectPassword closure, since the door-opening effect is
  // identical regardless of which secretField was checked.
  private createPasswordLock(
    entity: MapEntity,
    doorMeshById: Map<string, THREE.Mesh>,
    terminals: TerminalDef[],
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
    openPasswordLock: (
      terminalDef: TerminalDef,
      onCorrectPassword: () => void,
      promptLabel?: string,
    ) => void,
    getVaultPin: () => string,
  ): void {
    const door = entity.linkedTo ? doorMeshById.get(entity.linkedTo) : undefined;
    if (!door) {
      throw new Error(
        `Password lock "${entity.id}" has no matching door for linkedTo "${entity.linkedTo}"`,
      );
    }

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

      const onCorrectPassword = (): void => {
        door.visible = false;
        onDoorStateChanged();
      };
      const secretField = entity.secretField ?? "password";

      if (secretField === "vaultPin") {
        openPasswordLock(
          { id: entity.id, password: getVaultPin(), root: EMPTY_ROOT },
          onCorrectPassword,
          entity.promptLabel,
        );
        return;
      }

      if (!entity.terminalId) {
        throw new Error(`Password lock "${entity.id}" has no terminalId`);
      }
      const terminalDef = findById(terminals, entity.terminalId);

      if (secretField === "username") {
        openPasswordLock(
          { ...terminalDef, password: terminalDef.username },
          onCorrectPassword,
          entity.promptLabel,
        );
        return;
      }

      openPasswordLock(terminalDef, onCorrectPassword, entity.promptLabel);
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);
  }
}
```

- [ ] **Step 5: `content/maps.ts` — migrate the vault lock, add Room 3's identity lock**

Find the vault's password_lock entity:

```typescript
      {
        id: "campaign_lock_2",
        type: "password_lock",
        linkedTo: "campaign_door_3",
        checksVaultPin: true,
        position: [20, 0.3, 12],
      },
```

Replace it with:

```typescript
      {
        id: "campaign_lock_2",
        type: "password_lock",
        linkedTo: "campaign_door_3",
        secretField: "vaultPin",
        position: [20, 0.3, 12],
      },
```

Find the Room 3 connector door entity (the last entity in `campaign_room1`'s array):

```typescript
      // Room 3's connector: no button, no lock -- opened only
      // programmatically by main.ts when room2_terminal's "whoami"
      // succeeds. Room 3 itself (rows 0-3, cols 4-7) is deliberately empty
      // this checkpoint.
      { id: "campaign_door_2", type: "door", position: [12, 1.5, 8] },
    ],
  },
```

Replace it with:

```typescript
      // Room 3's connector door (checkpoint 19, corrected same checkpoint):
      // originally opened programmatically when room2_terminal's "whoami"
      // ran -- corrected to a real password_lock instead, the same
      // mechanism every other locked door in this codebase uses.
      // campaign_lock_3 checks room2_terminal's username (secretField:
      // "username"), revealed by running whoami in that terminal (which no
      // longer opens anything by itself). Positioned just south of the
      // door's gap, in Room 2, so it's never trapped behind its own door --
      // same placement discipline as every other lock in this file. Room 3
      // itself (rows 0-3, cols 4-7) is deliberately empty this checkpoint.
      { id: "campaign_door_2", type: "door", position: [12, 1.5, 8] },
      {
        id: "campaign_lock_3",
        type: "password_lock",
        linkedTo: "campaign_door_2",
        terminalId: "room2_terminal",
        secretField: "username",
        promptLabel: "Identity, who you are:",
        position: [12, 0.3, 10],
      },
    ],
  },
```

- [ ] **Step 6: Verify the project builds with the predicted single error**

Run: `npm run build`
Expected: fails with exactly ONE error — `main.ts`'s `mapEntitySystem.getDoorMesh("campaign_door_2")` call, something like `Property 'getDoorMesh' does not exist on type 'MapEntitySystem'.` (from removing that method in this task's `MapEntitySystem.ts` rewrite). Confirm no other error appears — in particular, confirm `content/maps.ts` and `MapEntitySystem.ts` themselves show no errors (the `secretField`/`promptLabel` migration is self-consistent within this task). If you see a different or additional error, stop and report BLOCKED with the exact text — do not touch `main.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/content/terminalCommands.ts src/core/MapEntitySystem.ts src/content/maps.ts
git commit -m "Checkpoint 19 correction task 10: consolidate password_lock secret sources into secretField, add Room 3's identity lock, add command classification data"
```

---

### Task 11: `ui/PasswordLock.ts` — configurable prompt label

**Files:**
- Modify: `src/ui/PasswordLock.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PasswordLock.open()` gains an optional 3rd parameter, `promptLabel?: string`. Consumed by Task 13 (`main.ts`, indirectly — `main.ts` doesn't call `open()` with a label itself, `MapEntitySystem`'s `openPasswordLock` callback closure does, already wired by Task 10).

This task is purely additive to `PasswordLock`'s public surface — `open()`'s new 3rd parameter is optional, so `main.ts`'s existing 2-arg calls still type-check. This task introduces no new build error.

- [ ] **Step 1: Store the title element as a field, add the `promptLabel` parameter**

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

Replace it with:

```typescript
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
```

- [ ] **Step 2: Verify the project builds with the same predicted single error as Task 10**

Run: `npm run build`
Expected: still fails with the same ONE error from Task 10 (`main.ts`'s `getDoorMesh` call) — this task adds no new error of its own, since `open()`'s new parameter is optional.

- [ ] **Step 3: Commit**

```bash
git add src/ui/PasswordLock.ts
git commit -m "Checkpoint 19 correction task 11: add a configurable prompt label to PasswordLock"
```

---

### Task 12: `ui/Terminal.ts` — remove `onCommand`, add the command-permission system, add `pwd`/`clear`/`help`, give `whoami` a copy button

**Files:**
- Modify: `src/ui/Terminal.ts`

**Interfaces:**
- Consumes: `BLOCKED_COMMANDS`/`RESTRICTED_COMMANDS`/`CORE_COMMANDS`'s shapes (`string[]` / `{ name: string; description: string }[]`, Task 10 — passed in as constructor parameters, not imported directly, per this project's established `ui/` never imports `content/` precedent).
- Produces: `Terminal`'s constructor drops `onCommand?: (command: string) => void` and gains three new required parameters in its place: `blockedCommands: string[]`, `restrictedCommands: string[]`, `coreCommands: { name: string; description: string }[]`. Consumed by Task 13 (`main.ts`).

**This task changes `Terminal`'s constructor arity again, adding a SECOND accumulated error to `main.ts`'s build (Task 10 already left one, about the removed `getDoorMesh` method).** Do not touch `main.ts`; Task 13 fixes both together.

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
//
// Checkpoint 19: main.ts constructs TWO instances of this class -- one for
// room1_terminal, one for room2_terminal -- since only the latter needs an
// onCommand callback (watching for "whoami"). Both take the same
// getVaultPin callback, since room1_terminal's credentials.txt is the only
// consumer of the {{VAULT_PIN}} substitution, but passing it uniformly to
// both keeps their constructor shape identical.
export class Terminal {
  private readonly root: HTMLDivElement;
  private readonly outputEl: HTMLDivElement;
  private readonly inputEl: HTMLInputElement;
  private readonly onOpen: () => void;
  private readonly onClose: () => void;
  private readonly getVaultPin: () => string;
  private readonly onCommand?: (command: string) => void;

  private terminalDef: TerminalDef | null = null;
  private pathStack: TerminalDirectory[] = [];

  constructor(
    onOpen: () => void,
    onClose: () => void,
    getVaultPin: () => string,
    onCommand?: (command: string) => void,
  ) {
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.getVaultPin = getVaultPin;
    this.onCommand = onCommand;

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
      case "whoami":
        this.runWhoami();
        break;
      default:
        this.appendLine(`command not found: ${command}`);
        return; // unrecognized commands never fire onCommand below
    }
    // Checkpoint 19: fired for every successfully-parsed command
    // (ls/cd/cat/whoami), regardless of whether that command's own
    // execution succeeded (e.g. `cd nonexistent` still counts -- the
    // command itself was recognized and ran, it just printed its own
    // error). main.ts only wires this for room2_terminal's instance,
    // watching for "whoami" specifically; room1_terminal's instance is
    // constructed without it, so it never reacts to any command.
    this.onCommand?.(command);
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

  // Checkpoint 19: room1_terminal has no username set (TerminalDef.username
  // is optional), so running whoami there prints a generic "unknown user"
  // line rather than crashing or silently no-op'ing -- deliberately, since
  // room1_terminal's own Terminal instance is never given an onCommand
  // callback anyway, so nothing downstream reacts to it either way.
  private runWhoami(): void {
    const username = this.terminalDef?.username;
    this.appendLine(username !== undefined ? username : "whoami: unknown user");
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

Replace it with:

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
```

- [ ] **Step 2: Verify the project builds with exactly the predicted error count**

**Correction note (recorded after this task was actually run once): the original prediction below of "exactly two errors" was wrong** — it only accounted for one of `main.ts`'s two existing `new Terminal(...)` call sites erroring. In fact `main.ts` still has BOTH the original `terminal` and `room2Terminal` construction calls at this point (Task 13 hasn't consolidated them yet), so both independently arity-mismatch, plus a cascading `TS7006: Parameter 'command' implicitly has an 'any' type` (the `room2Terminal` construction's inline `onCommand` arrow function loses its contextual parameter type once `Terminal`'s constructor no longer declares an `onCommand` parameter for it to match against). The correct, verified expectation is FOUR errors:

```
src/main.ts(98,20): error TS2554: Expected 6 arguments, but got 3.
src/main.ts(109,25): error TS2554: Expected 6 arguments, but got 4.
src/main.ts(113,6): error TS7006: Parameter 'command' implicitly has an 'any' type.
src/main.ts(115,36): error TS2339: Property 'getDoorMesh' does not exist on type 'MapEntitySystem'.
```

Run: `npm run build`
Expected: fails with exactly these FOUR errors (not two) — all four are fully explained by already-known, already-tracked changes (Task 10's `getDoorMesh` removal, and this task's `Terminal` constructor arity change hitting both of `main.ts`'s existing call sites plus one cascading type-inference loss). If you see anything BEYOND these four, or fewer than these four, stop and report BLOCKED with the exact text — do not touch `main.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/ui/Terminal.ts
git commit -m "Checkpoint 19 correction task 12: remove onCommand, add the shared command-permission system, add pwd/clear/help, give whoami a copy button"
```

---

### Task 13: `main.ts` — consolidate to one `Terminal` instance, wire Room 3's identity lock, fix both accumulated errors

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `MapEntitySystem`'s corrected constructor (no `getDoorMesh`, `openPasswordLock`'s new `promptLabel` param) (Task 10), `PasswordLock.open()`'s new optional 3rd param (Task 11, not directly used by `main.ts` itself), `Terminal`'s corrected constructor (Task 12), `content/terminalCommands.ts`'s exports (Task 10).
- Produces: nothing new for later tasks — this is the commit that restores a clean whole-project build.

- [ ] **Step 1: Replace the whole file**

The current file:

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

// Everything that used to run at module load now runs once, here, only
// after the main menu's Start button fires with the player's choices.
// RaycastRegistry (and every other checkpoint-8.5 singleton) is constructed
// inside this function rather than at module scope — even though this
// checkpoint only ever calls startGame() once, keeping construction scoped
// here avoids a stale-registry bug when a future mid-session menu return
// eventually calls startGame() a second time (see CLAUDE.md future
// mechanics: that return path isn't built yet).
function startGame(selections: GameSelections): void {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);

  const sceneManager = new SceneManager(canvas);
  const gameState = new GameState();
  const playerController = new PlayerController(
    sceneManager.camera,
    canvas,
    gameState,
  );

  // Checkpoint 19: extracted to a named function (previously inlined
  // directly into MapEntitySystem's constructor call) so the
  // room2Terminal onCommand callback below can also call it when Room 3's
  // door opens programmatically, without duplicating this one-line
  // callback twice.
  const onDoorStateChanged = (): void => playerController.rebuildCollisionBoxes();

  // gameMode is assigned further down (it needs the map/weapon systems built
  // first) but this callback only ever runs later, once the player has
  // actually died, by which point construction has long finished.
  let gameMode: GameMode;
  // Releasing pointer lock on death is what makes the death-panel buttons
  // clickable — PlayerState owns the alive/dead transition but not the DOM/
  // pointer-lock machinery, so it's handed this as a callback rather than
  // reaching into PlayerController directly. It also snapshots the active
  // mode's summary lines into GameState once, at the exact moment of death,
  // so the death panel can't change under the player if the mode's own state
  // happens to advance in the background before Respawn is clicked.
  const playerState = new PlayerState(gameState, () => {
    playerController.controls.unlock();
    gameState.deathSummaryLines = gameMode.getSummaryLines();
  });
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

  // Checkpoint 19: declared here (forward reference, same pattern as
  // `let gameMode: GameMode` above) so room2Terminal's onCommand callback
  // below can reference mapEntitySystem.getDoorMesh() even though
  // mapEntitySystem itself isn't constructed until after both Terminal
  // instances -- the callback only actually runs later, once the player
  // types "whoami," by which point construction has long finished.
  let mapEntitySystem: MapEntitySystem;

  // Checkpoint 17: constructed before mapEntitySystem so its open() methods
  // can be referenced by the openTerminal/openPasswordLock callbacks passed
  // into MapEntitySystem's constructor below. Both release pointer lock on
  // open and re-lock on close, the same PlayerState.onDeath ->
  // controls.unlock() callback pattern used elsewhere in this function.
  const terminal = new Terminal(
    () => playerController.controls.unlock(),
    () => playerController.controls.lock(),
    campaign.getVaultPin,
  );
  // Checkpoint 19: a second, separate Terminal instance dedicated to
  // room2_terminal -- its onCommand callback watches for "whoami" and
  // opens Room 3's door + advances Campaign to "complete" when it runs.
  // room1_terminal's instance (above) is never given an onCommand
  // callback, so it never reacts to any command, per this checkpoint's own
  // requirement.
  const room2Terminal = new Terminal(
    () => playerController.controls.unlock(),
    () => playerController.controls.lock(),
    campaign.getVaultPin,
    (command) => {
      if (command !== "whoami") return;
      const door = mapEntitySystem.getDoorMesh("campaign_door_2");
      if (door && door.visible) {
        door.visible = false;
        onDoorStateChanged();
      }
      campaign.markComplete();
    },
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

  const mapDef = findById(MAPS, selections.mapId);
  const map = loadMap(mapDef.grid, raycastRegistry);
  sceneManager.scene.add(map.group);
  playerController.setWallBoxes(map.wallBoxes);
  const spawnPosition = getSpawnPosition(mapDef);
  playerController.setSpawn(spawnPosition.x, spawnPosition.z);

  const audioSystem = new AudioSystem(sceneManager.camera);
  void audioSystem.load(findById(SOUNDS, "pistol_fire"));
  // Checkpoint 16: the melee attack's own distinct sound -- without this
  // preload, AudioSystem.play("melee_hit") would silently no-op (see
  // AudioSystem.play()'s early return when a sound was never load()ed).
  void audioSystem.load(findById(SOUNDS, "melee_hit"));
  void audioSystem.load(findById(SOUNDS, "zombie_growl"));
  void audioSystem.load(findById(SOUNDS, "zombie_death"));

  // Checkpoint 16: constructed before weaponSystem (moved up from its
  // original checkpoint-13 position further down this function) so
  // weaponSystem's onMeleeAttack callback below can reference it directly,
  // rather than relying on closure-timing semantics to make a forward
  // reference safe.
  const weaponViewmodel = new WeaponViewmodel();

  const weaponSystem = new WeaponSystem(
    sceneManager.camera,
    // Checkpoint 15: every run starts with M1911 in inventory slot 0,
    // unconditionally -- the main menu's Weapon selection (selections.weaponId)
    // no longer determines the starting loadout now that WeaponSystem is a
    // slot-based inventory rather than a single current weapon. Confirmed
    // with the user; the menu's Weapon group is left in place (still
    // visible/selectable) but its choice is presently unused here. See
    // CLAUDE.md's checkpoint-15 decisions log and future mechanics.
    findById(WEAPONS, "pistol"),
    // Checkpoint 16: the knife is always the starting/default melee weapon
    // -- there is no menu selection for melee (only one option exists), and
    // no wall-buy either (the knife is always available, never purchased).
    findById(WEAPONS, "knife"),
    audioSystem,
    gameState,
    runManager,
    raycastRegistry,
    // Checkpoint 16: a small viewmodel "lunge" as placeholder melee-attack
    // feedback, reusing the addImpulse() mechanism built at checkpoint 14
    // (its own future-mechanics notes already named melee-swing as an
    // intended integration point). Values are a first-cut guess, not tuned
    // against manual testing -- adjust here if they don't read well.
    () => weaponViewmodel.addImpulse({ x: 0, y: -0.06, z: 0.12 }, 0.15),
  );

  mapEntitySystem = new MapEntitySystem(
    mapDef,
    weaponSystem,
    runManager,
    raycastRegistry,
    onDoorStateChanged,
    gameState,
    WEAPONS,
    TERMINALS,
    // Checkpoint 19: routes to whichever Terminal instance matches the
    // interacted entity's linked TerminalDef -- room2_terminal gets its
    // own instance (wired to react to "whoami"), everything else
    // (currently only room1_terminal) uses the original single instance.
    (terminalDef) => {
      if (terminalDef.id === "room2_terminal") {
        room2Terminal.open(terminalDef);
      } else {
        terminal.open(terminalDef);
      }
    },
    (terminalDef, onCorrectPassword) => {
      passwordLock.open(terminalDef, () => {
        onCorrectPassword();
        // Checkpoint 19: only Room 1's real password-lock success (checked
        // by terminalDef.id, since the vault lock's synthetic TerminalDef
        // has a different id, "campaign_lock_2") awards points and
        // advances Campaign's stage -- replaces checkpoint 17's
        // markObjectiveComplete() call, which no longer exists now that
        // Campaign tracks a 3-stage flow instead of a single boolean. The
        // vault lock's success path stays a plain door-open with no side
        // effects; the MAC-10 it guards is granted separately, by
        // interacting with campaign_wall_buy_1 inside the vault.
        if (terminalDef.id === "room1_terminal") {
          gameState.addScore(findById(WEAPONS, "mac10").cost);
          campaign.onDoorOneOpened();
        }
      });
    },
    campaign.getVaultPin,
  );
  sceneManager.scene.add(mapEntitySystem.group);
  playerController.setDoors(mapEntitySystem.doors);

  const interactSystem = new InteractSystem(sceneManager.camera, gameState, raycastRegistry);

  const enemySpawnPoints = mapDef.entities
    .filter((entity) => entity.type === "enemy_spawn")
    .map((entity) => new THREE.Vector3(...entity.position));

  const targetPoints = mapDef.entities
    .filter((entity) => entity.type === "target")
    .map((entity) => new THREE.Vector3(...entity.position));

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

  function startNewRun(): void {
    runManager.startNewRun();
    playerController.setSpawn(spawnPosition.x, spawnPosition.z);
    playerController.controls.lock();
  }

  // "Main Menu" is still a placeholder alias for startNewRun() — this
  // checkpoint's menu is load-time only; a mid-session return to
  // ui/MainMenu.ts is deliberately not built yet (see CLAUDE.md future
  // mechanics).
  const hud = new HUD(
    gameState,
    gameMode,
    sceneManager.camera,
    startNewRun,
    startNewRun,
    raycastRegistry,
  );

  canvas.addEventListener("click", () => {
    playerController.controls.lock();
  });

  document.addEventListener("pointerlockchange", () => {
    gameState.paused = document.pointerLockElement !== canvas;
  });

  const modeClock = new THREE.Clock();

  function animate(): void {
    requestAnimationFrame(animate);
    playerController.update();
    weaponSystem.update();
    interactSystem.update();
    // Always drain the clock so its internal reference stays fresh — otherwise
    // the frame gameplay resumes after death would report one huge deltaTime
    // spike (elapsed dead-screen time) into whichever mode is active.
    const delta = modeClock.getDelta();
    if (gameState.playerState === "alive") {
      gameMode.update(delta);
    }
    hud.update();
    sceneManager.render();
    if (gameState.playerState === "alive") {
      weaponViewmodel.update(playerController.getSpeed(), delta);
      weaponViewmodel.render(sceneManager.renderer);
    }
  }

  animate();
}

const mainMenu = new MainMenu(WEAPONS, ENEMIES, MAPS, (selections) => {
  mainMenu.destroy();
  startGame(selections);
});
```

Replace it with:

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
import { BLOCKED_COMMANDS, RESTRICTED_COMMANDS, CORE_COMMANDS } from "./content/terminalCommands";

// Everything that used to run at module load now runs once, here, only
// after the main menu's Start button fires with the player's choices.
// RaycastRegistry (and every other checkpoint-8.5 singleton) is constructed
// inside this function rather than at module scope — even though this
// checkpoint only ever calls startGame() once, keeping construction scoped
// here avoids a stale-registry bug when a future mid-session menu return
// eventually calls startGame() a second time (see CLAUDE.md future
// mechanics: that return path isn't built yet).
function startGame(selections: GameSelections): void {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);

  const sceneManager = new SceneManager(canvas);
  const gameState = new GameState();
  const playerController = new PlayerController(
    sceneManager.camera,
    canvas,
    gameState,
  );

  const onDoorStateChanged = (): void => playerController.rebuildCollisionBoxes();

  // gameMode is assigned further down (it needs the map/weapon systems built
  // first) but this callback only ever runs later, once the player has
  // actually died, by which point construction has long finished.
  let gameMode: GameMode;
  // Releasing pointer lock on death is what makes the death-panel buttons
  // clickable — PlayerState owns the alive/dead transition but not the DOM/
  // pointer-lock machinery, so it's handed this as a callback rather than
  // reaching into PlayerController directly. It also snapshots the active
  // mode's summary lines into GameState once, at the exact moment of death,
  // so the death panel can't change under the player if the mode's own state
  // happens to advance in the background before Respawn is clicked.
  const playerState = new PlayerState(gameState, () => {
    playerController.controls.unlock();
    gameState.deathSummaryLines = gameMode.getSummaryLines();
  });
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
  //
  // Checkpoint 19 correction: back to a single shared instance (checkpoint
  // 19 briefly constructed a second one, dedicated to room2_terminal, so it
  // could carry an onCommand callback -- that callback and its sole use
  // case, opening Room 3's door on "whoami", are both gone now that Room
  // 3's door has its own password_lock instead, so there's no longer any
  // reason for a second, otherwise-identical Terminal instance to exist).
  const terminal = new Terminal(
    () => playerController.controls.unlock(),
    () => playerController.controls.lock(),
    campaign.getVaultPin,
    BLOCKED_COMMANDS,
    RESTRICTED_COMMANDS,
    CORE_COMMANDS,
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

  const mapDef = findById(MAPS, selections.mapId);
  const map = loadMap(mapDef.grid, raycastRegistry);
  sceneManager.scene.add(map.group);
  playerController.setWallBoxes(map.wallBoxes);
  const spawnPosition = getSpawnPosition(mapDef);
  playerController.setSpawn(spawnPosition.x, spawnPosition.z);

  const audioSystem = new AudioSystem(sceneManager.camera);
  void audioSystem.load(findById(SOUNDS, "pistol_fire"));
  // Checkpoint 16: the melee attack's own distinct sound -- without this
  // preload, AudioSystem.play("melee_hit") would silently no-op (see
  // AudioSystem.play()'s early return when a sound was never load()ed).
  void audioSystem.load(findById(SOUNDS, "melee_hit"));
  void audioSystem.load(findById(SOUNDS, "zombie_growl"));
  void audioSystem.load(findById(SOUNDS, "zombie_death"));

  // Checkpoint 16: constructed before weaponSystem (moved up from its
  // original checkpoint-13 position further down this function) so
  // weaponSystem's onMeleeAttack callback below can reference it directly,
  // rather than relying on closure-timing semantics to make a forward
  // reference safe.
  const weaponViewmodel = new WeaponViewmodel();

  const weaponSystem = new WeaponSystem(
    sceneManager.camera,
    // Checkpoint 15: every run starts with M1911 in inventory slot 0,
    // unconditionally -- the main menu's Weapon selection (selections.weaponId)
    // no longer determines the starting loadout now that WeaponSystem is a
    // slot-based inventory rather than a single current weapon. Confirmed
    // with the user; the menu's Weapon group is left in place (still
    // visible/selectable) but its choice is presently unused here. See
    // CLAUDE.md's checkpoint-15 decisions log and future mechanics.
    findById(WEAPONS, "pistol"),
    // Checkpoint 16: the knife is always the starting/default melee weapon
    // -- there is no menu selection for melee (only one option exists), and
    // no wall-buy either (the knife is always available, never purchased).
    findById(WEAPONS, "knife"),
    audioSystem,
    gameState,
    runManager,
    raycastRegistry,
    // Checkpoint 16: a small viewmodel "lunge" as placeholder melee-attack
    // feedback, reusing the addImpulse() mechanism built at checkpoint 14
    // (its own future-mechanics notes already named melee-swing as an
    // intended integration point). Values are a first-cut guess, not tuned
    // against manual testing -- adjust here if they don't read well.
    () => weaponViewmodel.addImpulse({ x: 0, y: -0.06, z: 0.12 }, 0.15),
  );

  const mapEntitySystem = new MapEntitySystem(
    mapDef,
    weaponSystem,
    runManager,
    raycastRegistry,
    onDoorStateChanged,
    gameState,
    WEAPONS,
    TERMINALS,
    (terminalDef) => terminal.open(terminalDef),
    (terminalDef, onCorrectPassword, promptLabel) => {
      passwordLock.open(
        terminalDef,
        () => {
          onCorrectPassword();
          // Checkpoint 19 (corrected same checkpoint): three possible
          // successes now share this one callback, distinguished by
          // terminalDef.id. "room1_terminal" (Room 1's real password lock)
          // awards points and advances Campaign past its first stage.
          // "room2_terminal" (Room 3's new identity lock, corrected same
          // checkpoint -- replaces the removed whoami-opens-door
          // mechanism) completes Campaign's objective; the door itself
          // already opened via the generic onCorrectPassword() call above,
          // the same way every other locked door in this codebase opens.
          // Anything else (the vault lock's synthetic TerminalDef, whose
          // id is its own entity id, "campaign_lock_2") triggers neither --
          // its only effect is the door opening, and the MAC-10 it guards
          // is granted separately by interacting with the wall-buy inside.
          if (terminalDef.id === "room1_terminal") {
            gameState.addScore(findById(WEAPONS, "mac10").cost);
            campaign.onDoorOneOpened();
          } else if (terminalDef.id === "room2_terminal") {
            campaign.markComplete();
          }
        },
        promptLabel,
      );
    },
    campaign.getVaultPin,
  );
  sceneManager.scene.add(mapEntitySystem.group);
  playerController.setDoors(mapEntitySystem.doors);

  const interactSystem = new InteractSystem(sceneManager.camera, gameState, raycastRegistry);

  const enemySpawnPoints = mapDef.entities
    .filter((entity) => entity.type === "enemy_spawn")
    .map((entity) => new THREE.Vector3(...entity.position));

  const targetPoints = mapDef.entities
    .filter((entity) => entity.type === "target")
    .map((entity) => new THREE.Vector3(...entity.position));

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

  function startNewRun(): void {
    runManager.startNewRun();
    playerController.setSpawn(spawnPosition.x, spawnPosition.z);
    playerController.controls.lock();
  }

  // "Main Menu" is still a placeholder alias for startNewRun() — this
  // checkpoint's menu is load-time only; a mid-session return to
  // ui/MainMenu.ts is deliberately not built yet (see CLAUDE.md future
  // mechanics).
  const hud = new HUD(
    gameState,
    gameMode,
    sceneManager.camera,
    startNewRun,
    startNewRun,
    raycastRegistry,
  );

  canvas.addEventListener("click", () => {
    playerController.controls.lock();
  });

  document.addEventListener("pointerlockchange", () => {
    gameState.paused = document.pointerLockElement !== canvas;
  });

  const modeClock = new THREE.Clock();

  function animate(): void {
    requestAnimationFrame(animate);
    playerController.update();
    weaponSystem.update();
    interactSystem.update();
    // Always drain the clock so its internal reference stays fresh — otherwise
    // the frame gameplay resumes after death would report one huge deltaTime
    // spike (elapsed dead-screen time) into whichever mode is active.
    const delta = modeClock.getDelta();
    if (gameState.playerState === "alive") {
      gameMode.update(delta);
    }
    hud.update();
    sceneManager.render();
    if (gameState.playerState === "alive") {
      weaponViewmodel.update(playerController.getSpeed(), delta);
      weaponViewmodel.render(sceneManager.renderer);
    }
  }

  animate();
}

const mainMenu = new MainMenu(WEAPONS, ENEMIES, MAPS, (selections) => {
  mainMenu.destroy();
  startGame(selections);
});
```

- [ ] **Step 2: Verify the project builds cleanly**

Run: `npm run build`
Expected: succeeds, no TypeScript errors — this restores a clean whole-project build after Tasks 10 and 12's two accumulated errors.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "Checkpoint 19 correction task 13: consolidate to a single Terminal instance, wire Room 3's identity lock, restore a clean build"
```

---

### Task 14: Manual verification against acceptance criteria (controller-executed, not a subagent)

**Files:** none (verification only).

This task is executed directly by the session controller together with the human partner — it requires live browser interaction and judgment a subagent cannot reliably perform. It supersedes the original Task 8 checklist (which was interrupted mid-flight by this correction) — everything from Task 8 is re-covered here, alongside the correction's own new behavior.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL in a browser.

- [ ] **Step 2: Verify Room 1 → Room 2 transition**

Start a Campaign run. Note the current points balance. Solve Room 1 exactly as before (terminal → password lock). Confirm: the door opens, the points balance increases by exactly 1200 (MAC-10's cost), and the HUD status line changes from "Objective: find the door password" to "Objective: power the terminal".

- [ ] **Step 3: Verify the gated Room 2 terminal**

Walk into Room 2. Before touching the power cable, interact with `campaign_terminal_2` (E). Confirm: no overlay opens, and the browser console shows the flavor message ("The screen is dark. It needs power."). Interact with the power cable — confirm it disappears, and interacting with it again does nothing (idempotent). Interact with the terminal again — confirm it opens normally this time.

- [ ] **Step 4: Verify `whoami` only reveals, doesn't open anything**

Inside `room2_terminal`, run `whoami` — confirm it prints the configured username WITH a Copy button next to it, and confirm Room 3's door does NOT open and the HUD status line does NOT change (this is the corrected behavior — `whoami` alone no longer completes anything).

- [ ] **Step 5: Verify Room 3's new identity lock**

Close the terminal, go to Room 3's password lock (`campaign_lock_3`, near the door). Confirm its prompt reads "Identity, who you are:" (distinct from Room 1's and the vault's generic label). Submit a wrong value — confirm it's rejected, door stays closed. Submit the exact username you saw/copied in Step 4 — confirm the door opens AND the HUD status line changes to "Objective: complete".

- [ ] **Step 6: Verify Room 3 itself**

Walk through the now-open door into Room 3. Confirm: it's an empty room, no crash, no console errors.

- [ ] **Step 7: Verify the vault side-path is unaffected by the correction**

In `room1_terminal`, run `cat credentials.txt` — confirm a real 6-digit number appears where `{{VAULT_PIN}}` was. Note it. Go to the vault's password lock (`campaign_lock_2`) — confirm its prompt is still the original generic label (unaffected by `promptLabel`, since it doesn't set one). Submit a wrong pin — rejected. Submit the correct pin — door opens. Interact with the wall-buy inside — grants MAC-10, deducts cost.

- [ ] **Step 8: Verify the command-permission system**

In either terminal, try each of `touch`, `mkdir`, `rm`, `cp`, `mv`, `rmdir`, `chmod` (with and without arguments) — confirm each prints `<command>: Permission denied` and does nothing else. Try each of `ping`, `ifconfig`, `grep`, `nmap` — confirm each ALSO prints `<command>: Permission denied` (none unlocked anywhere yet). Try a genuinely unknown command (e.g. `foobar`) — confirm it prints `command not found: foobar`, distinctly different from the denial message.

- [ ] **Step 9: Verify `pwd`/`clear`/`help`**

In either terminal: run `pwd` at root — confirm it prints `/`. Run `cd backup` (in `room1_terminal`) then `pwd` — confirm it prints `/backup`. Run `cd ..` then `clear` — confirm the output area empties completely. Run `help` — confirm it lists `ls`/`cd`/`cat`/`pwd`/`clear`/`whoami`/`help` with short descriptions, plus a cosmetic header line, and does NOT mention `touch`/`ping`/etc.

- [ ] **Step 10: Verify a fresh run regenerates correctly**

Trigger a new run (die/respawn, or restart). Confirm: the vault pin shown in `credentials.txt` differs from Step 7's, and the old pin no longer works. Room 1's door password is unchanged. Room 1's door, the power cable, Room 2's terminal gate, and Room 3's door/lock are all reset to their initial states.

- [ ] **Step 11: Full regression check**

Reload the page. Play Zombie Survival and Shooting Range on both `test-grid` and `corridors` — confirm every checkpoint 1-19 behavior outside Campaign mode is completely unaffected.

---

### Task 15: Update CLAUDE.md and commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the folder structure tree**

Find each line by content (spacing may differ slightly) and apply the noted checkpoint-19 annotation. This describes the FINAL, corrected state — the original checkpoint-19 design (two `Terminal` instances, `getDoorMesh`, `checksVaultPin`) never shipped and should not appear anywhere in these annotations.

`src/core/utils/` section — find the last entry (likely `CollisionBox.ts`) and add a new line immediately after:
```
      CollisionBox.ts            [8.5, shared THREE.Box3.setFromObject(mesh) helper]
```
→
```
      CollisionBox.ts            [8.5, shared THREE.Box3.setFromObject(mesh) helper]
      RandomPin.ts               [19, zero-padded random 6-digit string generator for Campaign's vault pin]
```

`src/types/index.ts` — find the checkpoint-17 annotation and append:
```
    index.ts                      [1; MapEntity gains "terminal"/"password_lock" types + terminalId at 17; TerminalFile/TerminalDirectory/TerminalDef interfaces added at 17; MapDef.supportedModes added at 17]
```
→
```
    index.ts                      [1; MapEntity gains "terminal"/"password_lock" types + terminalId at 17; TerminalFile/TerminalDirectory/TerminalDef interfaces added at 17; MapDef.supportedModes added at 17; 19 adds "computer_part", MapEntity.requiresPart, MapEntity.secretField ("password"/"vaultPin"/"username", a corrected-same-checkpoint replacement for an original checksVaultPin boolean) + MapEntity.promptLabel, TerminalDef.password becomes optional, and TerminalDef gains username + unlockedCommands]
```

`src/content/terminals.ts`:
```
    terminals.ts                 [17, one TerminalDef (room1_terminal) — a fake filesystem for ui/Terminal.ts to navigate]
```
→
```
    terminals.ts                 [17, one TerminalDef (room1_terminal) — a fake filesystem for ui/Terminal.ts to navigate; 19 adds a {{VAULT_PIN}} substitution token to room1_terminal's credentials.txt and a second TerminalDef (room2_terminal, no password, just a username revealed by "whoami")]
```

Add a new line to the `content/` section for the new command-classification file — find `terminals.ts` in the folder tree and insert immediately after it:
```
    terminals.ts                 [17, ...]
```
→ (append immediately below the line just updated above)
```
    terminalCommands.ts          [19 (corrected same checkpoint), BLOCKED_COMMANDS/RESTRICTED_COMMANDS/CORE_COMMANDS — a shared, inheritable command-permission classification every terminal reads via constructor injection, not direct import]
```

`src/content/maps.ts`:
```
    maps.ts                       [1, populated at 5; name field + second map ("corridors") added at 9.5; checkpoint-10 test_terminal scaffolding removed and replaced with one wall_buy entity per map at 11; corridors gains a paid door/vault room at 12; third map ("campaign_room1") added at 17, the first to set supportedModes]
```
→
```
    maps.ts                       [1, populated at 5; name field + second map ("corridors") added at 9.5; checkpoint-10 test_terminal scaffolding removed and replaced with one wall_buy entity per map at 11; corridors gains a paid door/vault room at 12; third map ("campaign_room1") added at 17, the first to set supportedModes; 19 extends campaign_room1 (not a new map) with Room 2 (vault side-path + part/terminal puzzle) and an empty Room 3, whose door is gated by a real password_lock (corrected same checkpoint) rather than opening from a terminal command]
```

`src/core/MapEntitySystem.ts`:
```
    MapEntitySystem.ts          [6, spawns door/button/pickup/wall_buy meshes from MapDef.entities; onDoorStateChanged callback added at 8.5; checkpoint-10 test_terminal scaffolding removed and replaced by createWallBuy() at 11; createButton() gains an optional per-button cost at 12; createTerminal()/createPasswordLock() added at 17, taking two new injected UI-trigger callbacks (openTerminal/openPasswordLock) so this core/ file never imports ui/Terminal.ts or ui/PasswordLock.ts directly]
```
→
```
    MapEntitySystem.ts          [6, spawns door/button/pickup/wall_buy meshes from MapDef.entities; onDoorStateChanged callback added at 8.5; checkpoint-10 test_terminal scaffolding removed and replaced by createWallBuy() at 11; createButton() gains an optional per-button cost at 12; createTerminal()/createPasswordLock() added at 17, taking two new injected UI-trigger callbacks (openTerminal/openPasswordLock) so this core/ file never imports ui/Terminal.ts or ui/PasswordLock.ts directly; 19 adds createComputerPart(), a requiresPart gate on createTerminal(), and a secretField branch on createPasswordLock() (password/vaultPin/username, plus a getVaultPin constructor param and a promptLabel argument threaded through openPasswordLock) — a brief same-checkpoint intermediate design (a checksVaultPin boolean, plus a getDoorMesh(id) method for opening a button/lock-less door) was corrected before shipping, see the decisions log]
```

`src/modes/Campaign.ts`:
```
    Campaign.ts                  [17, the third GameMode — a single room with a terminal + password-lock door, no rounds/enemies/player damage, hardcoded per the mode-building rule]
```
→
```
    Campaign.ts                  [17, the third GameMode — a single room with a terminal + password-lock door, no rounds/enemies/player damage, hardcoded per the mode-building rule; 19 reworks the single objectiveComplete boolean into a 3-stage flow (find_password/power_terminal/complete) and adds a per-run-regenerated vault pin exposed via a live getVaultPin accessor]
```

`src/ui/Terminal.ts`:
```
    Terminal.ts                  [17, DOM overlay for the hacking-terminal minigame — ls/cd/cat over a TerminalDef's fake filesystem, with a copy-password button on the one output line that contains it; 18 fixes deferred focus()/onClose() timing and a full-screen backdrop to stop clicks outside the small panel from re-locking pointer prematurely]
```
→
```
    Terminal.ts                  [17, DOM overlay for the hacking-terminal minigame — ls/cd/cat over a TerminalDef's fake filesystem, with a copy-password button on the one output line that contains it; 18 fixes deferred focus()/onClose() timing and a full-screen backdrop to stop clicks outside the small panel from re-locking pointer prematurely; 19 adds a getVaultPin constructor param (live {{VAULT_PIN}} substitution in cat), pwd/clear/help commands, a shared command-permission system (BLOCKED_COMMANDS/RESTRICTED_COMMANDS, injected not imported), and gives whoami a copy button — main.ts constructs a single shared instance, same as checkpoint 17 (a same-checkpoint intermediate design briefly used two instances plus an onCommand callback to open Room 3's door; corrected before shipping, see the decisions log)]
```

`src/ui/PasswordLock.ts` — find the checkpoint-17 line and append:
```
    PasswordLock.ts              [17, DOM overlay for entering a door's password — submit/cancel, calls a success callback on a correct match; 18 gets the identical checkpoint-18 fixes as Terminal.ts]
```
→
```
    PasswordLock.ts              [17, DOM overlay for entering a door's password — submit/cancel, calls a success callback on a correct match; 18 gets the identical checkpoint-18 fixes as Terminal.ts; 19 (corrected same checkpoint) gains a configurable promptLabel, defaulting to the original generic label when absent]
```

- [ ] **Step 2: Update the Checkpoints list**

Add a new line immediately after checkpoint 18's line:

```
19. Campaign Room 2 (vault + part/terminal puzzle) → Room 3 — extends `campaign_room1` (not a new map) with a bigger Room 2 reachable through Room 1's existing door: an optional vault side-path (a password lock checking `Campaign`'s live, per-run-regenerated 6-digit pin instead of a fixed terminal password, gating a bonus MAC-10 wall-buy) and the required path forward (a `computer_part` power cable that gates a second terminal, whose `whoami` command reveals — but no longer opens — the answer to a real identity lock gating Room 3's door); `Campaign` moves from a single boolean to a 3-stage flow (`find_password`/`power_terminal`/`complete`); solving Room 1 now also awards points equal to MAC-10's cost; every terminal also gains `pwd`/`clear`/`help` and a shared, inheritable command-permission system (`BLOCKED_COMMANDS`/`RESTRICTED_COMMANDS`)
```

- [ ] **Step 3: Update "Current status"**

Change the opening sentence from `Checkpoint 18 complete.` to `Checkpoint 19 complete.`, and append new paragraphs after the existing checkpoint-18 paragraph (before `## Decisions log`). Write these paragraphs in this project's established narrative style (see the surrounding checkpoint-17/18 paragraphs for tone and level of detail), covering:

- `Campaign`'s rework from a single `objectiveComplete` boolean to a `CampaignStage` union (`find_password`/`power_terminal`/`complete`), the new `onDoorOneOpened()`/`markComplete()` methods replacing `markObjectiveComplete()`, and the per-run vault pin (`resetState()`, mirroring `ZombieSurvival.startRound()`'s "called from both `start()` and `resetRun()`" precedent) exposed via `getVaultPin`, an arrow-function class field rather than a regular method — explain why (bare function-reference passing requires correct `this` binding, which a regular method would silently lose).
- The new `campaign_room1` layout (briefly — Room 2's two independent paths, Room 3 being deliberately empty), and that Room 1 itself is mechanically unchanged, just relocated in the (taller) grid.
- `MapEntitySystem.createComputerPart()` (mirrors `createPickup()`, but is registered as resettable, unlike the checkpoint-11 wall-buy), `createTerminal()`'s `requiresPart` gate (a `console.log` flavor message, following the project's existing "rejection feedback is console.log-only" convention).
- `MapEntity.secretField` (`"password" | "vaultPin" | "username"`) and `createPasswordLock()`'s three-way branch on it — a literal union, not a generalized "secret source" abstraction, reusing `openPasswordLock()`'s existing `TerminalDef`-shaped signature via placeholder objects for the `vaultPin`/`username` cases rather than adding a parallel UI path. Mention `promptLabel` threading through to `ui/PasswordLock.ts` as the same mechanism's companion (different locks show different prompts).
- **A dedicated paragraph on the mid-checkpoint correction**: the original design had `room2_terminal`'s `whoami` command open Room 3's door directly via an `onCommand` callback (which required a second `Terminal` instance, a `let mapEntitySystem` forward reference, and a `MapEntitySystem.getDoorMesh()` method). Before this checkpoint was finalized, this was corrected to work like every other locked door: a real `password_lock` (`secretField: "username"`) the player interacts with and submits input to, checked against `room2_terminal`'s `username`. `whoami` now only reveals the answer (with a copy button, matching the door-1/vault-pin accessibility pattern) — it no longer opens anything by itself. State plainly that this removed the `onCommand` mechanism, the second `Terminal` instance, `getDoorMesh()`, and the `let mapEntitySystem` forward reference entirely — `main.ts` is back to a single shared `Terminal` instance, the same shape checkpoint 17 originally used.
- The new shared command-permission system: `content/terminalCommands.ts`'s `BLOCKED_COMMANDS` (always denied, every terminal, no opt-in ever) and `RESTRICTED_COMMANDS` (denied by default, opt-in-able per-`TerminalDef` via `unlockedCommands` — no real per-command behavior exists yet even when unlocked). Note this is injected into `Terminal`'s constructor by `main.ts`, not imported directly by `ui/Terminal.ts`, matching the established `ui/MainMenu.ts` "never import `content/` directly" precedent.
- `pwd`/`clear`/`help` — briefly note these were part of the original checkpoint-19 scope, dropped between drafts, and completed in this same correction pass (built from the existing `pathStack`, no second path-tracking mechanism).
- A "Verified in-browser" sentence summarizing what Task 14's manual verification actually confirmed (Room 1 → Room 2 transition with the exact point award, the gated terminal's flavor message and post-collection unlock, `whoami` revealing-not-opening, Room 3's identity lock with its distinct prompt label opening the door and completing the objective, Room 3 itself, the vault side-path unaffected by the correction, the command-permission system's three-way behavior — blocked/restricted-denied/genuinely-unknown all read distinctly, `pwd`/`clear`/`help`, a fresh run regenerating the vault pin correctly, and full regression) — write this only after Task 14 has actually been completed and confirmed by the user; do not write it from the plan's expected behavior alone.

- [ ] **Step 4: Add decisions log entries**

Append after the last existing decisions-log line, before `## Future mechanics`:

```
- `Campaign` (checkpoint 19) moved from a single `objectiveComplete` boolean (checkpoint 17) to a `CampaignStage` union (`"find_password" | "power_terminal" | "complete"`) — a boolean can only ever represent "done or not," and once a second real objective (Room 2's terminal) exists between "start" and "done," a boolean can no longer distinguish which of the two remaining objectives is next. `resetState()` (called from both the constructor and the `RunManager.registerResettable()` callback) resets both `stage` and regenerates `vaultPin` together, mirroring `ZombieSurvival.startRound()`'s existing "called from both `start()` and `resetRun()`" precedent for the same reason: two call sites need to establish identical initial state, and factoring it into one private method is what keeps them from drifting out of sync.
- `Campaign.getVaultPin` (checkpoint 19) is deliberately an arrow-function class field (`getVaultPin = (): string => { return this.vaultPin; };`), not a regular method — because `main.ts` passes it around as a bare function reference (`campaign.getVaultPin`, to `MapEntitySystem`'s constructor and to `Terminal`), not wrapped in a closure at each call site (`() => campaign.getVaultPin()`). A regular method accessed this way would lose its `this` binding the moment it's actually invoked from inside those other objects, silently reading `this.vaultPin` as `undefined` at runtime — a bug TypeScript's type checker would not catch, since the method's call signature looks identical either way. Binding it as an arrow field at construction time makes this safe by construction, regardless of how far the reference travels before it's finally called.
- **Room 3's door mechanism was corrected mid-checkpoint, before shipping** — recorded here in the same style as the checkpoint-16 melee correction, since it was a real design error, not a tuning issue. **What it was:** `room2_terminal`'s `onCommand` callback (fired after every successfully-parsed command) checked for `"whoami"` and, if matched, called a new `MapEntitySystem.getDoorMesh("campaign_door_2")` method directly to open Room 3's door and called `campaign.markComplete()`. This required `main.ts` to construct a second, otherwise-identical `Terminal` instance (so only `room2_terminal`'s instance carried the callback), a `let mapEntitySystem: MapEntitySystem` forward reference (so the callback's closure could reach `mapEntitySystem` before it was constructed), and `doorMeshById`'s promotion from a local constructor variable to an exposed class field. **Why it was wrong:** every other locked door in this codebase (Room 1's, the vault's) is opened by the player interacting with a `password_lock` and submitting input — `whoami` auto-opening a door the instant it's run breaks that consistency and skips the "prove you know the answer" step the mechanic is supposed to require. **What replaced it:** a real `password_lock` entity (`campaign_lock_3`, `secretField: "username"`) gating Room 3's door exactly like every other lock, checked against `room2_terminal`'s `TerminalDef.username`. `whoami` was demoted to a pure reveal (prints the username with a copy button, the same accessibility treatment `cat` already gives Room 1's password and the vault pin) with no side effects of its own. **Net simplification, not just a swap:** this removed the `onCommand` callback mechanism from `Terminal` entirely (no `TerminalDef`/entity has any other use for it), which in turn removed the only reason for a second `Terminal` instance to exist (both instances would otherwise be structurally identical) — `main.ts` reverted to a single shared instance, the `let mapEntitySystem` forward reference, and `getDoorMesh()` — all three now dead code with the mechanism they existed to support. The instance-consolidation and the `getDoorMesh()`/forward-reference removal were not separately requested but are direct, low-risk, and necessary consequences of removing `onCommand` — recorded explicitly here so they're traceable as deliberate calls, not an unnoticed scope change.
- `MapEntity.secretField` (`"password" | "vaultPin" | "username"`, checkpoint 19) replaces an original `checksVaultPin: boolean` that shipped only briefly within the same checkpoint (see the Room 3 correction entry above) — a lock now has three possible secret sources, not two, so a boolean can no longer express the choice. It remains a literal union, not a generalized "secret source" abstraction (e.g. a pluggable secret-provider interface), because there are exactly three known cases, both known and fixed at design time — this project's established precedent (checkpoint 16's `assertRangedWeapon()`/`assertMeleeWeapon()` decision; checkpoint 17's `Weapon.meleeRange` discriminator decision) is to prefer the minimal concrete mechanism over a speculative generalization until a case genuinely doesn't fit. The `"vaultPin"` and `"username"` branches both construct a placeholder `TerminalDef`-shaped object (`{ id: entity.id, password: getVaultPin(), root: EMPTY_ROOT }` / `{ ...terminalDef, password: terminalDef.username }`) purely to reuse `openPasswordLock()`'s existing signature — `ui/PasswordLock.ts` itself needed zero changes for either case beyond the separate `promptLabel` addition, since from its perspective it's always just checking input against `TerminalDef.password`.
- `MapEntity.promptLabel` (checkpoint 19) threads from `content/maps.ts` through `MapEntitySystem.createPasswordLock()`'s `openPasswordLock` callback into `ui/PasswordLock.ts`'s `open()` as an optional 3rd argument, defaulting to `PasswordLock`'s own hardcoded generic label when absent — Room 1's and the vault's locks don't set it, Room 3's identity lock sets it to `"Identity, who you are:"`. A plain optional string, not a richer per-lock theming system, since exactly one lock needs a non-default prompt today.
- `main.ts` constructs a single shared `ui/Terminal.ts` instance again (checkpoint 19, corrected same checkpoint) — see the Room 3 correction entry above for why the second instance (briefly introduced, never shipped standalone) stopped being needed the moment its sole reason for existing, `onCommand`, was removed.
- The new `content/terminalCommands.ts` (checkpoint 19, corrected same checkpoint) classifies commands into `BLOCKED_COMMANDS` (recognized, permanently denied everywhere — a world-building constraint, no `TerminalDef` can ever opt in) and `RESTRICTED_COMMANDS` (recognized, denied by default, opt-in-able per-`TerminalDef` via a new `TerminalDef.unlockedCommands` field — the mechanism a future checkpoint will use to give one command real behavior in one room, without touching `ui/Terminal.ts` or this file's `BLOCKED_COMMANDS` at all; no restricted command has any real behavior yet even when "unlocked"). Both denial paths print the identical `<command>: Permission denied` message, deliberately indistinguishable to the player from either list — only a genuinely unrecognized command prints the different `command not found: <command>` message. `content/terminalCommands.ts`'s exports are injected into `Terminal`'s constructor by `main.ts` rather than imported directly by `ui/Terminal.ts`, matching the established `ui/MainMenu.ts` precedent (receives `Weapon[]`/`EnemyDef[]`/`MapDef[]` as constructor arguments rather than importing `content/weapons.ts` etc. directly) of keeping every `ui/` file a pure presentation layer over data `main.ts` (the composition root) hands it.
- `pwd`/`clear`/`help` (checkpoint 19, corrected same checkpoint) were part of the originally-scoped checkpoint-19 terminal work but were dropped somewhere between drafts and never actually implemented until this correction. `pwd` is built entirely from the existing `pathStack` (no second path-tracking mechanism); `help` iterates `content/terminalCommands.ts`'s `CORE_COMMANDS` rather than a separately hand-maintained string, so a future core command addition shows up there automatically, and deliberately does not list `BLOCKED_COMMANDS`/`RESTRICTED_COMMANDS` — discovering those by trying them is part of the intended experience, not something `help` should spoil.
```

- [ ] **Step 5: Add future-mechanics entries**

Append new future-mechanics bullets at the end of the section:

```
- **Room 4 and beyond**: not built. Room 3 is empty this checkpoint; a future room would need its own `TerminalDef`(s)/entities added to `campaign_room1`'s single `MapEntity` array (following this checkpoint's own precedent of extending the existing map rather than creating a new one) and a further `CampaignStage` value.
- **Room 3 content**: not built, deliberately out of scope. The room exists and is reachable, but nothing is in it — a future checkpoint would need to decide what (if anything) belongs there before `Campaign`'s stage flow could meaningfully extend past `"complete"`.
- **`RESTRICTED_COMMANDS` have no real behavior yet**: `content/terminalCommands.ts`'s `ping`/`ifconfig`/`grep`/`nmap` are recognized and the per-`TerminalDef` `unlockedCommands` opt-in mechanism is fully wired and read, but every one of them still just prints `Permission denied` regardless of unlock state — no actual command implementation exists for any of them. A future checkpoint giving one of these real behavior in one specific room's terminal is exactly the scenario this plumbing was built for.
- **Computer-part flavor messaging**: `createTerminal()`'s `requiresPart` rejection is `console.log`-only, following this project's existing wall-buy/button rejection convention — there is still no on-screen "insufficient funds"/"needs power" prompt anywhere in this codebase (see the checkpoint-11 future-mechanics entry, "HUD purchase feedback," which this checkpoint's flavor message is a further instance of, not a resolution of).
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Search for staleness this checkpoint may have introduced**

Read the entire CLAUDE.md document (not just the sections edited above) and specifically check for:
- Any sentence describing `Campaign` as having a single `objectiveComplete` boolean, or describing `markObjectiveComplete()` as still existing.
- Any sentence describing `MapEntitySystem`'s constructor parameter list without the checkpoint-19 `getVaultPin` argument, or mentioning a `getDoorMesh` method, or describing `doorMeshById` as an exposed field rather than a local constructor variable.
- Any sentence describing `checksVaultPin` (as opposed to `secretField`) as the current mechanism, or describing `whoami` as opening a door.
- Any sentence describing `ui/Terminal.ts`'s constructor as taking an `onCommand` parameter, or `main.ts` as constructing two `Terminal` instances, or mentioning a `room2Terminal` variable, or a `let mapEntitySystem` forward reference.
- Any sentence describing `campaign_room1` as a single small room with no Room 2/Room 3.
- Any other claim this checkpoint's changes would now contradict.

If you find staleness, fix it using the established `**Superseded at checkpoint N** (was: "...")` convention for decisions-log/future-mechanics entries, or an inline parenthetical for "Current status" prose. If you find nothing beyond what Steps 1-5 already added, say so explicitly in your commit's task report.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Checkpoint 19: Campaign Room 2 (vault + part/terminal puzzle) -> Room 3

Extends campaign_room1 (not a new map) with a bigger Room 2 reachable
through Room 1's existing door, plus an empty Room 3 gated behind
Room 2's real objective. Room 1 itself is mechanically unchanged --
its entities simply shift z += 16 to make room for Room 2 above it.

Campaign moves from a single objectiveComplete boolean to a 3-stage
flow (find_password/power_terminal/complete). onDoorOneOpened()/
markComplete() replace markObjectiveComplete(). A per-run vault pin
(resetState(), mirroring ZombieSurvival.startRound()'s "called from
both start() and resetRun()" precedent) is exposed via getVaultPin,
an arrow-function class field rather than a regular method so it
stays correctly bound when passed around as a bare reference.

Room 2 has two independent things to do: an optional vault side-path
(a password lock checking the live vault pin instead of a fixed
terminal password) gating a bonus MAC-10 wall-buy; and the required
path forward, a new computer_part entity type
(MapEntitySystem.createComputerPart(), mirrors createPickup() but is
registered as resettable) that gates a second terminal via a new
requiresPart field.

Room 3's door was originally opened directly from that terminal's
"whoami" command via an onCommand callback -- corrected before
shipping, once manual testing found it broke the "prove you know the
answer" consistency every other locked door in this codebase has.
Room 3 now has a real password_lock (secretField: "username", a new
three-way replacement for an original two-way checksVaultPin boolean)
checked against the terminal's username; whoami only reveals the
answer now, with a copy button, the same accessibility treatment
cat already gives other secrets. Removing the onCommand mechanism
also removed its only dependents: a second Terminal instance, a
getDoorMesh() method, and a `let mapEntitySystem` forward reference
are all gone -- main.ts is back to a single shared Terminal instance.

Also added in this pass: a shared, inheritable command-permission
system (content/terminalCommands.ts's BLOCKED_COMMANDS/
RESTRICTED_COMMANDS, injected into Terminal's constructor rather than
imported directly, matching the established ui/MainMenu.ts
never-import-content/-directly precedent) and pwd/clear/help, both
part of the original checkpoint-19 scope that got dropped between
drafts and is completed now.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Verify the commit**

Run: `git status` and `git log -1 --stat`
Expected: working tree clean; the commit touches `CLAUDE.md` (plus this plan doc, if not already committed) — `src/core/utils/RandomPin.ts`, `src/types/index.ts`, `src/content/terminalCommands.ts`, `src/content/terminals.ts`, `src/modes/Campaign.ts`, `src/ui/Terminal.ts`, `src/ui/PasswordLock.ts`, `src/core/MapEntitySystem.ts`, `src/content/maps.ts`, and `src/main.ts` should all show no changes from this task, since they were already committed by Tasks 1-13.

---

## Self-Review Notes

- **Spec coverage:** `Campaign`'s 3-stage rework (`getStatusLine()`/`getSummaryLines()` per stage, `onDoorOneOpened()`/`markComplete()`, per-run `vaultPin` via `resetState()` called from constructor + reset, `getVaultPin` accessor) (Task 3) ✓; `RandomPin.ts`'s zero-padded 6-digit generator (Task 1) ✓; `types/index.ts`'s `"computer_part"`/`requiresPart`/`checksVaultPin`/`TerminalDef.password?`/`TerminalDef.username?` (Task 1) ✓; `content/terminals.ts`'s `{{VAULT_PIN}}` token + `room2_terminal` (Task 2) ✓; `ui/Terminal.ts`'s `getVaultPin` param + live substitution in `runCat()`, optional `onCommand`, `whoami` command (Task 4) ✓; `MapEntitySystem.createComputerPart()` (registered as resettable, per the spec's explicit correction of the ammo-pickup-style "no registration" precedent), `createTerminal()`'s `requiresPart` gate with a `console.log` flavor message, `createPasswordLock()`'s `checksVaultPin` branch with the placeholder-`TerminalDef` construction, `doorMeshById` promotion + `getDoorMesh()` (Task 5) ✓; `content/maps.ts`'s extended `campaign_room1` grid/entities — Room 2's vault side-path (door+lock+wall_buy) and required part/terminal puzzle, Room 3 (empty, door-only) (Task 6) ✓; `main.ts`'s `onDoorStateChanged` extraction, `let mapEntitySystem` forward reference, two `Terminal` instances, `openTerminal` routing by `terminalDef.id`, Room 1 lock's extended success callback (score + stage advance, scoped to `"room1_terminal"`) (Task 7) ✓; manual verification checklist covering all of the above plus fresh-run vault-pin regeneration and full regression (Task 8) ✓; CLAUDE.md documenting the stage rework, the `getVaultPin` arrow-field `this`-binding rationale, the `checksVaultPin` hardcoded-branch rationale, and the deliberate three-errors-accumulated-then-fixed-together deviation (Task 9) ✓.
- **Placeholder scan:** no TBD/TODO; every step has complete, exact code (Tasks 3, 4, 5, 7 all give full before/after file contents, not fragments, since each file's changes are substantial); Task 8's verification steps are concrete, sequenced observable behaviors (exact point amounts, exact command sequences, an explicit "note this number... confirm it's different" pin-regeneration check) rather than vague "make sure it works" language.
- **Type consistency check:** `Campaign`'s constructor stays `(runManager: RunManager)` throughout (Task 3) — `main.ts`'s `new Campaign(runManager)` call (unchanged, still present in Task 7) matches. `Terminal`'s constructor becomes `(onOpen: () => void, onClose: () => void, getVaultPin: () => string, onCommand?: (command: string) => void)` (Task 4); `main.ts` (Task 7) calls it twice, both times passing `campaign.getVaultPin` as the 3rd argument, with `room2Terminal` additionally passing a 4th argument — matches. `MapEntitySystem`'s constructor gains `getVaultPin: () => string` as its 11th/last parameter (Task 5); `main.ts` (Task 7) passes `campaign.getVaultPin` in that exact final position — matches. `createTerminal()`'s new `computerPartMeshById: Map<string, THREE.Mesh>` parameter (Task 5) is populated by the constructor's first loop and passed at the constructor's second-loop call site — matches. `getDoorMesh(id: string): THREE.Mesh | undefined` (Task 5) is called in `main.ts` (Task 7) as `mapEntitySystem.getDoorMesh("campaign_door_2")`, and `"campaign_door_2"` is exactly the id given to Room 3's door entity in `content/maps.ts` (Task 6) — matches.
- **Compile-safety / task-ordering check:** Tasks 1, 2, 6 are purely additive/content and introduce no new errors. Tasks 3, 4, 5 each independently break `main.ts` with one new, named, predicted error apiece (verified via an explicit "confirm exactly N errors" step in each task, cumulative: 1, then 2, then 3) — this is a deliberate, explained deviation from the project's usual single-error-immediately-fixed pattern, documented in both the plan's Global Constraints and the Design Reference section above, and again in Task 9's CLAUDE.md decisions log. Task 7 depends on all of Tasks 2-6 and restores a fully clean build. No `erasableSyntaxOnly` violations anywhere: no parameter-property constructor shorthand, no enums; `CampaignStage` is a plain string-literal union type alias, matching `PlayerLifeState`'s existing precedent in `state/GameState.ts`.
- **Architecture-rule cross-check:** `core/MapEntitySystem.ts` gains zero imports of `ui/`/`modes/` — `getVaultPin`, `openTerminal`, `openPasswordLock` are all injected callbacks, resolved only in `main.ts`. `modes/Campaign.ts` imports only `./GameMode`, `../core/RunManager`, and the new `../core/utils/RandomPin` (a `core/utils/` file, not `content/` or another `modes/` file) — consistent with every other `GameMode` implementation's import discipline. `content/terminals.ts` and `content/maps.ts`'s extended entries are both pure typed data, no logic. `core/utils/RandomPin.ts` is a single, stateless, reusable function with no dependency on `Campaign` or any other caller's state — correctly placed in `core/utils/`, not inlined into `Campaign.ts`'s own class body, per this project's "shared/reusable logic goes in core/utils/" rule.

**Correction addendum (Tasks 10-15):** Tasks 1-9 above (and this note block itself, unedited) describe the original checkpoint-19 design as it was first drafted — `checksVaultPin: boolean`, `getDoorMesh()`, two `Terminal` instances, an `onCommand` callback, and a `let mapEntitySystem` forward reference. None of that design ships; it was corrected before Task 9 (CLAUDE.md) ever ran, once further review found Room 3's door mechanism broke the "prove you know the answer" consistency every other locked door has. Tasks 10-13 replace it: `MapEntity.secretField` (`"password" | "vaultPin" | "username"`) replaces `checksVaultPin`, gaining a third case a boolean couldn't express; `MapEntity.promptLabel` threads a configurable prompt through `openPasswordLock()` into `ui/PasswordLock.ts`; Room 3 gets a real `password_lock` (`campaign_lock_3`, checked against `room2_terminal`'s `username`) instead of an `onCommand`-triggered auto-open; `whoami` is demoted to a pure reveal (with a copy button); and `main.ts` reverts to a single shared `Terminal` instance, since the second instance's only reason to exist (`onCommand`) is gone. `getDoorMesh()` and the `let mapEntitySystem` forward reference are removed as dead code, and `doorMeshById` reverts to a local constructor variable, since nothing outside `MapEntitySystem` needs to look up a door mesh anymore. Tasks 10-12 accumulate their own errors in `main.ts` the same way Tasks 3-5 originally did (Task 10 removes `getDoorMesh` — 1 error; Task 12 changes `Terminal`'s arity — 2 errors total), consolidated and fixed by Task 13, mirroring this plan's own established compile-order-sequencing pattern rather than inventing a new one. Task 11 (`PasswordLock.ts`'s `promptLabel`) is purely additive and introduces no error, since the new parameter is optional. Separately, Task 10 also lands `content/terminalCommands.ts` (`BLOCKED_COMMANDS`/`RESTRICTED_COMMANDS`/`CORE_COMMANDS`) and Task 12 wires `pwd`/`clear`/`help` plus the shared command-permission check into `ui/Terminal.ts`, both requested in the same correction pass since they touch the same file. Task 14 (manual verification) supersedes the original Task 8, re-covering everything it checked plus the correction's own new behavior — Task 8 was interrupted mid-flight by this correction and its checklist was never confirmed by the user in its original form. Task 15 (CLAUDE.md, renumbered from the original Task 9) documents the corrected design only, per the checkpoint-16-style correction convention: what the wrong design was, why it was wrong, what replaced it, called out explicitly rather than silently overwritten.
