# Checkpoint 20: Contextual Interact Prompts, On-Screen Feedback, Room 2 Visual Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every interactable in this game (door button, pickup, wall-buy, terminal, password lock, power cable) shows its own specific hover prompt instead of a generic string; blocked/rejected interactions show an on-screen, auto-clearing message instead of only logging to the console; and Room 2 of `campaign_room1` gains a real computer mesh (procedurally built, swaps from "off" to "on" the first time the player uses it after powering it) plus a few purely-visual clutter props.

**Architecture:** Two new `GameState` fields (`interactPromptText`, `feedbackMessage`) mediate both new UI systems, matching this project's existing "HUD reads only GameState" rule — `InteractSystem` writes `interactPromptText` every frame from whatever entity's `userData.interactPrompt` the player is currently looking at; `MapEntitySystem`'s rejection call sites write `feedbackMessage` via a new `gameState.showFeedback()` guarded mutator; `HUD.ts` reads both and owns clearing the feedback message after a fixed duration via the existing `Countdown` utility. A new `core/utils/ComputerMesh.ts` factory (body + screen + keyboard boxes, screen textured via a generated `CanvasTexture`) replaces `MapEntitySystem.createTerminal()`'s placeholder box, with a same-position mesh swap on the first post-gate interact. A new `"decoration"` `MapEntity` type adds visual-only clutter to Room 2 with deliberately no collision/interaction.

**Tech Stack:** Three.js/Vite/TS (existing stack, no new dependencies).

## Global Constraints

- No changes to `WeaponSystem`/`WeaponViewmodel`/animations — that's checkpoint 21.
- No new rooms; no changes to `campaign_room1`'s grid, only its `entities` array gains new `"decoration"` entries.
- No changes to the command-permission system, the identity lock, or the vault-pin mechanism from checkpoint 19.
- Decorations get no collision (deliberate simplification, must be flagged as such in CLAUDE.md, not left looking like an oversight).
- No wall-mounted terminal/lock repositioning (future idea only, not this checkpoint).
- `core/` must not import `content/` or `modes/` directly (existing project-wide rule) — nothing in this checkpoint's `core/` changes needs to, since `showFeedback()`/`interactPromptText` are plain `GameState` fields and `createComputerMesh()` lives in `core/utils/`.
- Every `MapEntitySystem.create*()` method that sets `userData.interactable`/`userData.onInteract` must also set `userData.interactPrompt: string`, built once at construction time (no live/dynamic text).
- Existing `console.log` rejection calls must be kept, not replaced — `gameState.showFeedback(...)` is an *addition* alongside them.

---

## Design Reference (read before starting any task)

These are decisions made while planning this checkpoint that aren't spelled out verbatim in every task below — read once, apply throughout.

**Why the computer mesh's raycast target is its "body" child, not the returned `THREE.Group`.** `core/utils/Raycast.ts`'s `cast()` calls `this.raycaster.intersectObjects(targets, false)` — the `false` is non-recursive. A `THREE.Group` has no geometry of its own (`Object3D.raycast()` is a no-op), so a `Group` sitting directly in `RaycastRegistry`'s target list can *never* be hit, regardless of what children it has. `createComputerMesh()` therefore names its solid "body" box `COMPUTER_BODY_NAME` (a named export, not a magic string), and `MapEntitySystem.createTerminal()` retrieves that one child via `group.getObjectByName(COMPUTER_BODY_NAME)` and registers *that mesh* (not the group) with `RaycastRegistry`, setting `userData.interactable`/`userData.onInteract`/`userData.interactPrompt` on it — exactly the same "one Mesh carries the interaction data" shape every other entity type in this codebase already uses. The screen and keyboard child meshes are purely decorative and are never registered or touched by `userData`.

**Why the power-on swap needs a `RunManager`-registered resettable.** `MapEntitySystem.createComputerPart()` already registers a resettable (checkpoint 19) that restores the power cable's mesh visibility on a new run. If the gated terminal's *visual* on/off state weren't also reset, a new run would restore the cable (so the gate check would fail again, correctly showing "the screen is dark") while the terminal mesh kept showing its "on" screen from the previous run — a visible contradiction. `createTerminal()` therefore also registers a resettable (only for terminals with `requiresPart` set) that swaps the mesh back to `createComputerMesh(false)` at the same position, mirroring the cable's own reset.

**Why `HUD.update()` needs a new `deltaTime` parameter.** The feedback message's auto-clear reuses the existing `Countdown` utility (the same "HUD owns presentation timing, not gameplay logic" pattern the reload-prompt delay already established), and `Countdown.update()` needs a `deltaTime`. `main.ts`'s `animate()` loop already computes `const delta = modeClock.getDelta();` once per frame before calling `hud.update()` — this is a one-line change at that single call site (`hud.update();` → `hud.update(delta);`), not a new clock or timing mechanism.

**Decoration positions in `campaign_room1`.** Room 2 occupies grid rows 5–9 (interior floor), cols 1–10, with `CELL_SIZE = 2` meaning grid `[col, row]` maps to world `[col * 2, row * 2]` for x/z. The required path runs up column 3 (x=6, from the row-10 door-1 gap north to the terminal at row 5); the vault side-path runs east along row 6 (z=12, cols 7–13); the Room-3 connector sits around column 6 (x=12, rows 4–5). Three decoration positions were chosen specifically clear of all three: `[18, 0.3, 10]` (row 5 / col 9, NE floor area), `[16, 0.3, 18]` (row 9 / col 8, SE floor area), `[8, 0.3, 18]` (row 9 / col 4, S-central floor area) — each at least one full cell away from every required-path column/row above.

**`campaign_part_1`'s position is being kept, not moved.** Its current position (`[6, 0.3, 14]`, col 3 / row 7) is load-bearing for an existing, already-verified checkpoint-19 design: it sits on the *same column* as the entry gap (row 10 / col 3) and the terminal (row 5 / col 3), so walking straight in from Room 1 passes the cable on the way to the terminal (documented in `content/maps.ts`'s existing comment). Moving it to a literal room corner would contradict that tested layout for a purely cosmetic gain. Task 6 below confirms this placement already satisfies "a corner of Room 2" loosely (it's against the room's west portion, not its center) and documents why, rather than moving it.

---

### Task 1: `GameState.ts` and `types/index.ts` — additive foundations

**Files:**
- Modify: `src/state/GameState.ts`
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: `GameState.interactPromptText: string | null` (written every frame by `InteractSystem`, Task 4; read by `HUD`, Task 5).
- Produces: `GameState.feedbackMessage: string | null` and `GameState.showFeedback(text: string): void` (called by `MapEntitySystem`, Task 3; read/cleared by `HUD`, Task 5).
- Produces: `MapEntity.type` gains `"decoration"`; `MapEntity` gains `variant?: "crate" | "debris"` (consumed by `MapEntitySystem.createDecoration()`, Task 3, and `content/maps.ts`, Task 6).

Both changes are purely additive — no existing field, method, or type member is removed or renamed. The build stays green throughout this task with zero new call sites yet.

- [ ] **Step 1: Add the two new `GameState` fields and the `showFeedback()` mutator**

Open `src/state/GameState.ts`. It currently ends like this:

```typescript
  // Snapshot of the active GameMode's getSummaryLines(), taken once at the
  // moment playerState transitions to "dead" (see main.ts's onDeath wiring),
  // not read live every frame — this is what keeps the death panel's numbers
  // from shifting under the player while it's displayed. Deliberately a
  // plain string array, not a mode-specific field, so HUD stays ignorant of
  // which GameMode is active.
  deathSummaryLines: string[] = [];
}
```

Replace it with:

```typescript
  // Snapshot of the active GameMode's getSummaryLines(), taken once at the
  // moment playerState transitions to "dead" (see main.ts's onDeath wiring),
  // not read live every frame — this is what keeps the death panel's numbers
  // from shifting under the player while it's displayed. Deliberately a
  // plain string array, not a mode-specific field, so HUD stays ignorant of
  // which GameMode is active.
  deathSummaryLines: string[] = [];

  // Checkpoint 20: per-entity hover text, written every frame by
  // InteractSystem from whatever interactable the player is currently
  // looking at (or null when not looking at one). ui/HUD.ts reads this
  // instead of a hardcoded generic string, matching this project's
  // established "HUD reads only GameState" rule (see decisions log) —
  // InteractSystem, not MapEntitySystem, is the one direct writer, since
  // it's the system that already knows what the player is looking at each
  // frame.
  interactPromptText: string | null = null;

  // Checkpoint 20: a transient, HUD-owned on-screen message for
  // blocked/failed interactions (insufficient points, a gated terminal,
  // etc.). Gameplay code calls showFeedback() to set it; ui/HUD.ts owns
  // clearing it back to null after a fixed display duration (see
  // ui/HUD.ts's updateFeedbackMessage()), the same "HUD owns presentation
  // timing, not gameplay logic" pattern already used for the reload-prompt
  // delay.
  feedbackMessage: string | null = null;

  showFeedback(text: string): void {
    this.feedbackMessage = text;
  }
}
```

- [ ] **Step 2: Add the `"decoration"` `MapEntity` type and `variant` field**

Open `src/types/index.ts`. Find the `MapEntity` interface's `type` union:

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
```

Replace with:

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
    | "computer_part"
    | "decoration";
```

Then find the end of the `MapEntity` interface (the `promptLabel` field is currently last):

```typescript
  promptLabel?: string; // "password_lock" only (checkpoint 19, corrected
  // same checkpoint): the overlay's prompt text. Defaults to
  // ui/PasswordLock.ts's own generic label when absent -- Room 1's and the
  // vault's locks don't set this.
}
```

Replace with:

```typescript
  promptLabel?: string; // "password_lock" only (checkpoint 19, corrected
  // same checkpoint): the overlay's prompt text. Defaults to
  // ui/PasswordLock.ts's own generic label when absent -- Room 1's and the
  // vault's locks don't set this.
  variant?: "crate" | "debris"; // "decoration" only (checkpoint 20): a
  // purely cosmetic size/color hint -- no gameplay meaning. Absent defaults
  // to "crate". Kept deliberately minimal (two variants, one field) rather
  // than a richer theming system, since decorations are inert clutter.
}
```

- [ ] **Step 3: Verify the build is still clean**

Run: `npx tsc --noEmit`
Expected: zero errors (both changes are purely additive).

- [ ] **Step 4: Commit**

```bash
git add src/state/GameState.ts src/types/index.ts
git commit -m "$(cat <<'EOF'
Checkpoint 20 task 1: add GameState prompt/feedback fields + decoration type

GameState.interactPromptText/feedbackMessage (plus a showFeedback()
guarded mutator) are the mediating state both new checkpoint-20 UI
systems read/write through, matching the project's "HUD reads only
GameState" rule. MapEntity gains a "decoration" type + optional
variant field for Room 2's upcoming visual-only clutter props.
Purely additive -- no consumers yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `core/utils/ComputerMesh.ts` — shared procedural computer mesh factory

**Files:**
- Create: `src/core/utils/ComputerMesh.ts`

**Interfaces:**
- Consumes: nothing project-specific (only `three`).
- Produces: `createComputerMesh(poweredOn: boolean): THREE.Group` and `COMPUTER_BODY_NAME: string` (both consumed by `MapEntitySystem.createTerminal()`, Task 3). Also exports `createScreenTexture(poweredOn: boolean): THREE.CanvasTexture` (used internally, exported for potential reuse/testing).

This file has no dependency on any other checkpoint-20 change and can be built and verified in isolation.

- [ ] **Step 1: Create the file**

```typescript
import * as THREE from "three";

// Checkpoint 20: the name every caller uses to retrieve the solid "body"
// mesh out of the returned Group via getObjectByName() -- this is the
// mesh callers register as the actual raycast/interact target (see
// core/MapEntitySystem.ts's createTerminal()). The screen and keyboard
// children are purely decorative and are never registered anywhere.
export const COMPUTER_BODY_NAME = "computerBody";

const BODY_COLOR = 0x2a2a2a;
const BODY_WIDTH = 0.5;
const BODY_HEIGHT = 0.5;
const BODY_DEPTH = 0.4;

const SCREEN_WIDTH = 0.36;
const SCREEN_HEIGHT = 0.3;
const SCREEN_DEPTH = 0.02;
const SCREEN_Y_OFFSET = 0.02; // lifts the screen slightly above the body's vertical center, roughly where a monitor sits on a body-box "case"

const KEYBOARD_COLOR = 0x1a1a1a;
const KEYBOARD_WIDTH = 0.4;
const KEYBOARD_HEIGHT = 0.04;
const KEYBOARD_DEPTH = 0.2;

const TEXTURE_SIZE = 128;
const SCREEN_OFF_COLOR = "#0a0a0a";
const SCREEN_ON_BACKGROUND = "#0a1a0a";
const SCREEN_ON_TEXT_COLOR = "#33ff55";
const SCREEN_ON_LINES = ["> boot ok", "> user: ???", "> _"];

// Checkpoint 20: the one shared factory every current and future
// terminal/computer entity uses -- no individual room hand-builds its own
// computer mesh, which is exactly the "recode it every time" problem this
// checkpoint is meant to avoid. A body box, a screen box mounted flush on
// the body's front face (its material a generated CanvasTexture -- see
// createScreenTexture below), and a flat keyboard box in front of the
// body, all grouped into one THREE.Group -- the same simple procedural-box
// aesthetic as every other mesh in this game, no external models/textures.
//
// Pure factory: no interactivity, no userData set on anything here. The
// caller still owns setting userData.interactable/onInteract/
// interactPrompt on whichever mesh it registers as the actual raycast
// target (see COMPUTER_BODY_NAME above for why that must be the body
// mesh specifically, not this returned Group).
export function createComputerMesh(poweredOn: boolean): THREE.Group {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH),
    new THREE.MeshStandardMaterial({ color: BODY_COLOR }),
  );
  body.name = COMPUTER_BODY_NAME;
  body.position.set(0, BODY_HEIGHT / 2, 0);
  group.add(body);

  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(SCREEN_WIDTH, SCREEN_HEIGHT, SCREEN_DEPTH),
    new THREE.MeshStandardMaterial({ map: createScreenTexture(poweredOn) }),
  );
  screen.position.set(
    0,
    BODY_HEIGHT / 2 + SCREEN_Y_OFFSET,
    BODY_DEPTH / 2 + SCREEN_DEPTH / 2,
  );
  group.add(screen);

  const keyboard = new THREE.Mesh(
    new THREE.BoxGeometry(KEYBOARD_WIDTH, KEYBOARD_HEIGHT, KEYBOARD_DEPTH),
    new THREE.MeshStandardMaterial({ color: KEYBOARD_COLOR }),
  );
  keyboard.position.set(0, KEYBOARD_HEIGHT / 2, BODY_DEPTH / 2 + KEYBOARD_DEPTH / 2);
  group.add(keyboard);

  return group;
}

// Drawn once onto an offscreen <canvas> (not redrawn per frame -- no
// animation loop, kept cheap) -- dark and mostly blank when off, a dark
// green-tinted background with a few lines of monospace-ish "code" marks
// when on. This is a generated placeholder, matching this project's
// existing approach to every other procedural visual (no asset-loading
// pipeline exists or should be added for this).
export function createScreenTexture(poweredOn: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("createScreenTexture: 2D canvas context unavailable");
  }

  ctx.fillStyle = poweredOn ? SCREEN_ON_BACKGROUND : SCREEN_OFF_COLOR;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  if (poweredOn) {
    ctx.fillStyle = SCREEN_ON_TEXT_COLOR;
    ctx.font = "10px monospace";
    SCREEN_ON_LINES.forEach((line, index) => {
      ctx.fillText(line, 8, 20 + index * 16);
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
```

- [ ] **Step 2: Verify the build is clean**

Run: `npx tsc --noEmit`
Expected: zero errors — this file has no consumers yet, so it can't break anything, but must compile cleanly on its own (no unused-import or type errors within the file itself).

- [ ] **Step 3: Commit**

```bash
git add src/core/utils/ComputerMesh.ts
git commit -m "$(cat <<'EOF'
Checkpoint 20 task 2: add core/utils/ComputerMesh.ts factory

createComputerMesh(poweredOn) is the one shared factory every
terminal/computer entity will use going forward -- a body box, a
CanvasTexture-mapped screen box, and a keyboard box, grouped into one
THREE.Group. Pure factory, no interactivity/userData; not yet wired
into MapEntitySystem (Task 3).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `core/MapEntitySystem.ts` — contextual prompts, feedback, computer mesh retrofit, decorations

**Files:**
- Modify: `src/core/MapEntitySystem.ts`

**Interfaces:**
- Consumes: `GameState.showFeedback()` (Task 1), `createComputerMesh`/`COMPUTER_BODY_NAME` (Task 2), `MapEntity.variant`/`"decoration"` type (Task 1).
- Produces: every `create*()` method now sets `mesh.userData.interactPrompt`; `createTerminal()`'s signature gains two new trailing parameters (`gameState: GameState`, `runManager: RunManager`) — both are already in scope at the constructor's call site, since `gameState` and `runManager` are existing constructor parameters. No other public interface of this class changes (constructor signature is unchanged; `main.ts`'s existing `new MapEntitySystem(...)` call site needs no edits).

This is a full-file replacement. The constructor's own parameter list is unchanged, so `main.ts` requires no edits for this task — the only internal call-site change is `createTerminal()` gaining two more arguments at its one dispatch call site inside this same file's constructor.

- [ ] **Step 1: Replace the entire file**

Replace all of `src/core/MapEntitySystem.ts` with:

```typescript
import * as THREE from "three";
import { CELL_SIZE, WALL_HEIGHT } from "./MapLoader";
import { computeCollisionBox } from "./utils/CollisionBox";
import { findById } from "./utils/Lookup";
import { createComputerMesh, COMPUTER_BODY_NAME } from "./utils/ComputerMesh";
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
const PASSWORD_LOCK_COLOR = 0x444444;
const PASSWORD_LOCK_EMISSIVE = 0x552200;
const PASSWORD_LOCK_SIZE = 0.3;
const COMPUTER_PART_COLOR = 0x888800;
const COMPUTER_PART_EMISSIVE = 0x333300;
const COMPUTER_PART_SIZE = 0.35;
const DECORATION_CRATE_COLOR = 0x6b4a2a;
const DECORATION_CRATE_SIZE = 0.6;
const DECORATION_DEBRIS_COLOR = 0x555555;
const DECORATION_DEBRIS_SIZE = 0.35;
const TERMINAL_INTERACT_PROMPT = "Press E to use terminal";
const TERMINAL_GATED_MESSAGE = "The screen is dark. It needs power.";

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

// Spawns one mesh (or, for terminals, one THREE.Group) per door/button/
// pickup/wall_buy/terminal/password_lock/computer_part/decoration
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
        this.createTerminal(
          entity,
          terminals,
          raycastRegistry,
          openTerminal,
          computerPartMeshById,
          gameState,
          runManager,
        );
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
      } else if (entity.type === "decoration") {
        this.createDecoration(entity);
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
    // Checkpoint 20: built once here, from data already known at
    // construction time -- no need for live/dynamic text.
    mesh.userData.interactPrompt =
      entity.cost !== undefined
        ? `For ${entity.cost} points, Press E to open door`
        : "Press E to open door";
    mesh.userData.onInteract = (): void => {
      if (!door.visible) return; // idempotent: door already open — checked
      // before any spend attempt below, so this never charges twice.

      if (entity.cost !== undefined) {
        const paid = gameState.spendPoints(entity.cost);
        if (!paid) {
          console.log(
            `Button "${entity.id}": rejected (need ${entity.cost}, have ${gameState.pointsBalance}) — door stays closed`,
          );
          gameState.showFeedback(
            `Not enough points (need ${entity.cost}, have ${gameState.pointsBalance})`,
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
    mesh.userData.interactPrompt = "Press E to pick up ammo";
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
    mesh.userData.interactPrompt = "Press E to pick up power cable";
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
    mesh.userData.interactPrompt = `For ${weapon.cost} points, Press E to buy ${weapon.name}`;
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
        gameState.showFeedback(
          `Not enough points (need ${weapon.cost}, have ${gameState.pointsBalance})`,
        );
      }
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);
  }

  // Checkpoint 20: retrofitted to use the shared createComputerMesh()
  // factory (core/utils/ComputerMesh.ts) instead of a plain box. A gated
  // terminal (entity.requiresPart set) starts visually "off"
  // (createComputerMesh(false)) and only swaps to the "on" mesh
  // (createComputerMesh(true), rebuilt at the same position) the first
  // time the player interacts with it AFTER the gate has already passed --
  // collecting the power cable alone only satisfies the gate check below,
  // it does not change appearance by itself (see CLAUDE.md's checkpoint-20
  // decisions log for why this is interact-time, not pickup-time). The
  // swap is tracked entirely by this method's own local closure state
  // (computerGroup/bodyMesh/poweredOn, all reassigned in place via the
  // handleInteract/attachBody closures below) -- no cross-entity lookup
  // map is needed, since this method already holds the part's mesh
  // reference for the gate check. A resettable is registered only for
  // gated terminals, so a new run reverts a powered-on terminal back to
  // its "off" mesh in step with the power cable's own reset (otherwise the
  // mesh would stay lit while the freshly-reset gate check, seeing the
  // cable visible again, would contradict what the player sees).
  private createTerminal(
    entity: MapEntity,
    terminals: TerminalDef[],
    raycastRegistry: RaycastRegistry,
    openTerminal: (terminalDef: TerminalDef) => void,
    computerPartMeshById: Map<string, THREE.Mesh>,
    gameState: GameState,
    runManager: RunManager,
  ): void {
    if (!entity.linkedTo) {
      throw new Error(`Terminal "${entity.id}" has no linkedTo terminal id`);
    }
    const terminalDef = findById(terminals, entity.linkedTo);

    let poweredOn = entity.requiresPart === undefined;
    let computerGroup: THREE.Group;
    let bodyMesh: THREE.Mesh;

    const attachBody = (group: THREE.Group): THREE.Mesh => {
      const body = group.getObjectByName(COMPUTER_BODY_NAME) as THREE.Mesh | undefined;
      if (!body) {
        throw new Error(
          `Terminal "${entity.id}": createComputerMesh() had no named body child`,
        );
      }
      body.userData.interactable = true;
      body.userData.interactPrompt = TERMINAL_INTERACT_PROMPT;
      body.userData.onInteract = handleInteract;
      raycastRegistry.register(body);
      this.interactables.push(body);
      return body;
    };

    const handleInteract = (): void => {
      if (entity.requiresPart !== undefined && !poweredOn) {
        const partMesh = computerPartMeshById.get(entity.requiresPart);
        if (partMesh && partMesh.visible) {
          console.log(TERMINAL_GATED_MESSAGE);
          gameState.showFeedback(TERMINAL_GATED_MESSAGE);
          return;
        }

        // Gate just passed for the first time -- swap the mesh in place,
        // once, at the same position. poweredOn guards this so later
        // interacts with the same terminal never repeat the swap.
        this.group.remove(computerGroup);
        raycastRegistry.unregister(bodyMesh);

        computerGroup = createComputerMesh(true);
        computerGroup.position.set(...entity.position);
        this.group.add(computerGroup);
        bodyMesh = attachBody(computerGroup);

        poweredOn = true;
      }
      openTerminal(terminalDef);
    };

    computerGroup = createComputerMesh(poweredOn);
    computerGroup.position.set(...entity.position);
    this.group.add(computerGroup);
    bodyMesh = attachBody(computerGroup);

    if (entity.requiresPart !== undefined) {
      runManager.registerResettable(() => {
        if (!poweredOn) return; // already off, nothing to revert

        this.group.remove(computerGroup);
        raycastRegistry.unregister(bodyMesh);

        computerGroup = createComputerMesh(false);
        computerGroup.position.set(...entity.position);
        this.group.add(computerGroup);
        bodyMesh = attachBody(computerGroup);

        poweredOn = false;
      });
    }
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
    mesh.userData.interactPrompt = "Press E to unlock";
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

  // Checkpoint 20: purely visual clutter -- deliberately no
  // userData.interactable, no raycastRegistry.register(), no collision box
  // (never added to this.doors or given to PlayerController). The player
  // walks straight through these for free, since nothing checks collision
  // against them; an intentional simplification for this checkpoint, not
  // an oversight (see CLAUDE.md's checkpoint-20 decisions log).
  private createDecoration(entity: MapEntity): void {
    const isDebris = entity.variant === "debris";
    const size = isDebris ? DECORATION_DEBRIS_SIZE : DECORATION_CRATE_SIZE;
    const color = isDebris ? DECORATION_DEBRIS_COLOR : DECORATION_CRATE_COLOR;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshStandardMaterial({ color }),
    );
    mesh.position.set(...entity.position);
    this.group.add(mesh);
  }
}
```

- [ ] **Step 2: Verify the build is clean**

Run: `npx tsc --noEmit`
Expected: zero errors. `main.ts`'s existing `new MapEntitySystem(...)` call passes exactly the same arguments as before (this file's constructor signature is unchanged) — only the internal `createTerminal()` dispatch inside this file's own constructor gained two more arguments, and that call site was updated in the same replacement above.

- [ ] **Step 3: Commit**

```bash
git add src/core/MapEntitySystem.ts
git commit -m "$(cat <<'EOF'
Checkpoint 20 task 3: contextual prompts, feedback, computer mesh retrofit

Every create*() method that sets userData.interactable now also sets
userData.interactPrompt with entity-specific text (door cost, weapon
name/cost, etc.), built once at construction time. Wall-buy/paid-door
rejections and the gated-terminal message now also call
gameState.showFeedback() alongside their existing console.log calls.
createTerminal() is retrofitted onto the new createComputerMesh()
factory: a gated terminal starts visually "off" and swaps to "on" (at
the same position, once, via a runManager-registered resettable so a
new run reverts it) on the first interact after its part has been
collected. A new createDecoration() spawns purely visual clutter for
the new "decoration" MapEntity type -- no collision, no interaction.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `core/InteractSystem.ts` — write `interactPromptText` every frame

**Files:**
- Modify: `src/core/InteractSystem.ts`

**Interfaces:**
- Consumes: `GameState.interactPromptText`/`canInteract` (Task 1), reads `userData.interactPrompt` (populated by Task 3).
- Produces: no change to this class's public shape (`update()`/`isLookingAtInteractable()` — the latter is removed as it's folded into `update()` and was not called from anywhere else in the codebase).

This file has no dependency on Task 3 having run first (it reads `userData.interactPrompt` defensively via `?? "Press E to interact"`, so it works correctly even before Task 3 lands, and continues to work correctly after).

- [ ] **Step 1: Replace the entire file**

Replace all of `src/core/InteractSystem.ts` with:

```typescript
import * as THREE from "three";
import { Raycast } from "./utils/Raycast";
import type { GameState } from "../state/GameState";
import type { RaycastRegistry } from "./RaycastRegistry";

const INTERACT_DISTANCE = 4;

export class InteractSystem {
  private readonly raycast = new Raycast();
  private readonly raycastRegistry: RaycastRegistry;

  private readonly camera: THREE.Camera;
  private readonly gameState: GameState;

  constructor(camera: THREE.Camera, gameState: GameState, raycastRegistry: RaycastRegistry) {
    this.camera = camera;
    this.gameState = gameState;
    this.raycastRegistry = raycastRegistry;

    window.addEventListener("keydown", this.handleKeyDown);
  }

  // Checkpoint 20: also writes the looked-at interactable's own
  // userData.interactPrompt into gameState.interactPromptText each frame
  // (null when not looking at one) -- ui/HUD.ts reads this instead of a
  // hardcoded generic string, matching this project's "HUD reads only
  // GameState" rule. Falls back to a generic "Press E to interact" string
  // if userData.interactable is true but userData.interactPrompt was
  // somehow left unset -- defensive, shouldn't normally trigger now that
  // every MapEntitySystem.create*() method sets one.
  update(): void {
    if (this.gameState.paused) {
      this.gameState.canInteract = false;
      this.gameState.interactPromptText = null;
      return;
    }

    const hit = this.raycast.fromCamera(
      this.camera,
      this.raycastRegistry.getAll(),
      INTERACT_DISTANCE,
    );

    if (hit === null || hit.object.userData.interactable !== true) {
      this.gameState.canInteract = false;
      this.gameState.interactPromptText = null;
      return;
    }

    this.gameState.canInteract = true;
    const prompt = hit.object.userData.interactPrompt as string | undefined;
    this.gameState.interactPromptText = prompt ?? "Press E to interact";
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "KeyE" || event.repeat) return;
    if (this.gameState.paused) return;
    this.tryInteract();
  };

  private tryInteract(): void {
    const hit = this.raycast.fromCamera(
      this.camera,
      this.raycastRegistry.getAll(),
      INTERACT_DISTANCE,
    );
    if (!hit || hit.object.userData.interactable !== true) return;

    const onInteract = hit.object.userData.onInteract as (() => void) | undefined;
    onInteract?.();
  }
}
```

- [ ] **Step 2: Verify the build is clean**

Run: `npx tsc --noEmit`
Expected: zero errors. `isLookingAtInteractable()` was removed; confirm via `grep -rn "isLookingAtInteractable" src/` that nothing else in the codebase called it (it should print nothing).

- [ ] **Step 3: Commit**

```bash
git add src/core/InteractSystem.ts
git commit -m "$(cat <<'EOF'
Checkpoint 20 task 4: InteractSystem writes interactPromptText per-frame

update() now writes gameState.interactPromptText from the looked-at
object's userData.interactPrompt each frame (null when not looking at
an interactable), falling back to a generic string if unset. Folds
the former isLookingAtInteractable() helper directly into update()
since it had no other callers.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `ui/HUD.ts` and `main.ts` — feedback display, contextual prompt read, `deltaTime` wiring

**Files:**
- Modify: `src/ui/HUD.ts`
- Modify: `src/main.ts:292` (the single `hud.update();` call site)

**Interfaces:**
- Consumes: `GameState.interactPromptText`/`feedbackMessage` (Task 1), `Countdown` (existing `core/utils/Countdown.ts`, unchanged).
- Produces: `HUD.update()` signature changes from `update(): void` to `update(deltaTime: number): void` — this task updates its one call site in the same commit, per this project's usual "fix all call sites of a changed signature in the same task" discipline (there is no circular-dependency reason to defer it here, unlike checkpoint 19's Terminal-instance situation).

- [ ] **Step 1: Replace the entire `HUD.ts` file**

Replace all of `src/ui/HUD.ts` with:

```typescript
import * as THREE from "three";
import { Raycast } from "../core/utils/Raycast";
import { Countdown } from "../core/utils/Countdown";
import type { GameState } from "../state/GameState";
import type { GameMode } from "../modes/GameMode";
import type { RaycastRegistry } from "../core/RaycastRegistry";

const RELOAD_PROMPT_DELAY_MS = 1000;
// Checkpoint 20: how long a feedback message stays on screen before
// ui/HUD.ts clears it, via the same Countdown utility ZombieSurvival's
// round timer and ShootingRange's target cooldown already use. Seconds,
// matching every other Countdown consumer's deltaTime unit.
const FEEDBACK_DISPLAY_DURATION = 2.5;

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
    pointerEvents: "auto",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: "16px",
    padding: "10px 24px",
    border: "none",
    borderRadius: "4px",
    color: "#f0f0f0",
    ...styles,
  });
  button.addEventListener("click", onClick);
  return button;
}

export class HUD {
  private readonly gameState: GameState;
  private readonly gameMode: GameMode;
  private readonly camera: THREE.Camera;
  private readonly raycastRegistry: RaycastRegistry;
  private readonly root: HTMLDivElement;

  private readonly crosshairEl: HTMLDivElement;
  private readonly weaponNameEl: HTMLDivElement;
  private readonly ammoCountEl: HTMLDivElement;
  private readonly statusEl: HTMLDivElement;
  private readonly interactEl: HTMLDivElement;
  private readonly feedbackEl: HTMLDivElement;
  private readonly healthEl: HTMLDivElement;
  private readonly pointsEl: HTMLDivElement;
  private readonly modeStatusEl: HTMLDivElement;
  private readonly deathPanelEl: HTMLDivElement;
  private readonly deathScoreEl: HTMLDivElement;
  private readonly deathSummaryEl: HTMLDivElement;

  private readonly enemyLabels = new Map<string, HTMLDivElement>();
  private readonly raycast = new Raycast();
  private readonly feedbackCountdown = new Countdown();

  private emptySince: number | null = null;
  private lastFeedbackMessage: string | null = null;

  constructor(
    gameState: GameState,
    gameMode: GameMode,
    camera: THREE.Camera,
    onRespawn: () => void,
    onMainMenu: () => void,
    raycastRegistry: RaycastRegistry,
  ) {
    this.gameState = gameState;
    this.gameMode = gameMode;
    this.camera = camera;
    this.raycastRegistry = raycastRegistry;

    const root = createDiv({
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "10",
      fontFamily: "monospace",
      color: "#f0f0f0",
      textShadow: "0 1px 2px rgba(0, 0, 0, 0.8)",
      userSelect: "none",
    });
    this.root = root;

    this.crosshairEl = this.buildCrosshair();
    root.appendChild(this.crosshairEl);

    const promptStack = createDiv({
      position: "absolute",
      top: "56%",
      left: "50%",
      transform: "translateX(-50%)",
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "4px",
    });
    this.statusEl = createDiv({ fontSize: "14px" });
    this.interactEl = createDiv({ fontSize: "14px" });
    promptStack.appendChild(this.statusEl);
    promptStack.appendChild(this.interactEl);
    root.appendChild(promptStack);

    // Checkpoint 20: a separate, distinctly colored element for transient
    // rejection/flavor feedback -- positioned below promptStack so it
    // never visually overlaps the interact prompt when both are showing
    // at once (e.g. looking at a wall-buy the instant its purchase is
    // rejected).
    this.feedbackEl = createDiv({
      position: "absolute",
      top: "64%",
      left: "50%",
      transform: "translateX(-50%)",
      fontSize: "14px",
      color: "#ffaa33",
      textAlign: "center",
      maxWidth: "480px",
    });
    root.appendChild(this.feedbackEl);

    const ammoBox = createDiv({
      position: "absolute",
      right: "24px",
      bottom: "24px",
      textAlign: "right",
    });
    this.weaponNameEl = createDiv({
      fontSize: "13px",
      opacity: "0.8",
      letterSpacing: "0.05em",
    });
    this.ammoCountEl = createDiv({ fontSize: "22px", fontWeight: "bold" });
    ammoBox.appendChild(this.weaponNameEl);
    ammoBox.appendChild(this.ammoCountEl);
    root.appendChild(ammoBox);

    this.healthEl = createDiv({
      position: "absolute",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      fontSize: "18px",
      fontWeight: "bold",
    });
    root.appendChild(this.healthEl);

    this.pointsEl = createDiv({
      position: "absolute",
      top: "24px",
      right: "24px",
      fontSize: "16px",
      fontWeight: "bold",
    });
    root.appendChild(this.pointsEl);

    this.modeStatusEl = createDiv({
      position: "absolute",
      top: "24px",
      left: "24px",
      fontSize: "16px",
      fontWeight: "bold",
    });
    root.appendChild(this.modeStatusEl);

    this.deathPanelEl = createDiv({
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      display: "none",
      flexDirection: "column",
      alignItems: "center",
      gap: "16px",
      padding: "32px 48px",
      background: "rgba(0, 0, 0, 0.75)",
      borderRadius: "8px",
      textAlign: "center",
      pointerEvents: "auto",
    });

    const heading = createDiv({
      fontSize: "40px",
      fontWeight: "bold",
      color: "#d94040",
      letterSpacing: "0.1em",
    });
    heading.textContent = "YOU DIED";

    this.deathScoreEl = createDiv({ fontSize: "18px" });
    this.deathSummaryEl = createDiv({ fontSize: "18px", whiteSpace: "pre-line" });

    const buttonRow = createDiv({ display: "flex", gap: "16px" });
    const respawnButton = createButton(
      "Respawn",
      { background: "#3a6b3a" },
      onRespawn,
    );
    // Placeholder: identical to Respawn until checkpoint 9 gives the main
    // menu (mode select / loadout screens) real behavior to return to.
    const mainMenuButton = createButton(
      "Main Menu",
      { background: "#444" },
      onMainMenu,
    );
    buttonRow.appendChild(respawnButton);
    buttonRow.appendChild(mainMenuButton);

    this.deathPanelEl.appendChild(heading);
    this.deathPanelEl.appendChild(this.deathScoreEl);
    this.deathPanelEl.appendChild(this.deathSummaryEl);
    this.deathPanelEl.appendChild(buttonRow);
    root.appendChild(this.deathPanelEl);

    document.body.appendChild(root);
  }

  private buildCrosshair(): HTMLDivElement {
    const crosshair = createDiv({
      position: "absolute",
      top: "50%",
      left: "50%",
      width: "0",
      height: "0",
    });

    const segment = (styles: Partial<CSSStyleDeclaration>): HTMLDivElement =>
      createDiv({
        position: "absolute",
        background: "rgba(255, 255, 255, 0.85)",
        ...styles,
      });

    crosshair.appendChild(
      segment({ width: "2px", height: "6px", left: "-1px", top: "-10px" }),
    );
    crosshair.appendChild(
      segment({ width: "2px", height: "6px", left: "-1px", top: "4px" }),
    );
    crosshair.appendChild(
      segment({ width: "6px", height: "2px", left: "-10px", top: "-1px" }),
    );
    crosshair.appendChild(
      segment({ width: "6px", height: "2px", left: "4px", top: "-1px" }),
    );

    return crosshair;
  }

  update(deltaTime: number): void {
    const alive = this.gameState.playerState === "alive";
    this.crosshairEl.style.display = alive ? "block" : "none";

    if (alive) {
      this.updateAmmo();
      this.updateStatusPrompt();
      this.updateInteractPrompt();
      this.updateHealth();
      this.updateFeedbackMessage(deltaTime);
    } else {
      this.clearAliveOnlyText();
    }

    this.updatePointsBalance();
    this.updateModeStatus();
    this.updateEnemyLabels();
    this.updateDeathPanel();
  }

  private clearAliveOnlyText(): void {
    this.weaponNameEl.textContent = "";
    this.ammoCountEl.textContent = "";
    this.statusEl.textContent = "";
    this.interactEl.textContent = "";
    this.healthEl.textContent = "";
    this.feedbackEl.textContent = "";
  }

  private updateAmmo(): void {
    this.weaponNameEl.textContent = this.gameState.weaponName;
    this.ammoCountEl.textContent = `${this.gameState.currentAmmo} / ${this.gameState.reserveAmmo}`;
  }

  private updateStatusPrompt(): void {
    const { currentAmmo, reserveAmmo, isReloading } = this.gameState;

    if (isReloading) {
      this.emptySince = null;
      this.statusEl.textContent = "";
      return;
    }

    if (currentAmmo === 0 && reserveAmmo === 0) {
      this.emptySince = null;
      this.statusEl.textContent = "No ammo";
      return;
    }

    if (currentAmmo === 0 && reserveAmmo > 0) {
      if (this.emptySince === null) this.emptySince = performance.now();
      const elapsed = performance.now() - this.emptySince;
      this.statusEl.textContent =
        elapsed >= RELOAD_PROMPT_DELAY_MS ? "Press R to reload" : "";
      return;
    }

    this.emptySince = null;
    this.statusEl.textContent = "";
  }

  // Checkpoint 20: reads the per-entity text InteractSystem wrote this
  // frame instead of a hardcoded generic string -- "Press E to interact"
  // is now InteractSystem's own defensive fallback, not a decision made
  // here. Visibility is unchanged: an empty string renders as nothing.
  private updateInteractPrompt(): void {
    this.interactEl.textContent = this.gameState.interactPromptText ?? "";
  }

  // Checkpoint 20: HUD owns clearing gameState.feedbackMessage after a
  // fixed display duration, the same "HUD owns presentation timing, not
  // gameplay logic" pattern the reload-prompt delay above already
  // established. A new message is detected by comparing against the
  // previously-rendered value each frame, which (re)starts the countdown
  // -- an identical message shown twice in a row does not restart it, a
  // deliberate consequence of this comparison, not a bug.
  private updateFeedbackMessage(deltaTime: number): void {
    const message = this.gameState.feedbackMessage;
    if (message !== null && message !== this.lastFeedbackMessage) {
      this.feedbackCountdown.start(FEEDBACK_DISPLAY_DURATION);
    }
    this.lastFeedbackMessage = message;

    this.feedbackCountdown.update(deltaTime, () => {
      this.gameState.feedbackMessage = null;
    });

    this.feedbackEl.textContent = this.gameState.feedbackMessage ?? "";
  }

  private updateHealth(): void {
    this.healthEl.textContent = `HP: ${this.gameState.playerHealth}`;
  }

  private updatePointsBalance(): void {
    this.pointsEl.textContent = `Points: ${this.gameState.pointsBalance}`;
  }

  private updateModeStatus(): void {
    this.modeStatusEl.textContent = this.gameMode.getStatusLine();
  }

  private updateDeathPanel(): void {
    const dead = this.gameState.playerState === "dead";
    this.deathPanelEl.style.display = dead ? "flex" : "none";
    if (dead) {
      this.deathScoreEl.textContent = `Score: ${this.gameState.score}`;
      this.deathSummaryEl.textContent = this.gameState.deathSummaryLines.join("\n");
    }
  }

  // Debug/test aid: floating current/max labels above each enemy, projected
  // from world space every frame. Not meant to ship as-is — replace with a
  // real health bar (or hide entirely) once the game is closer to
  // presentable.
  private updateEnemyLabels(): void {
    const seen = new Set<string>();

    for (const [id, entry] of Object.entries(this.gameState.enemyHealth)) {
      seen.add(id);

      let label = this.enemyLabels.get(id);
      if (!label) {
        label = createDiv({
          position: "absolute",
          transform: "translate(-50%, -100%)",
          fontSize: "12px",
          whiteSpace: "nowrap",
        });
        this.enemyLabels.set(id, label);
        this.root.appendChild(label);
      }

      const worldPos = new THREE.Vector3(
        entry.position.x,
        entry.position.y,
        entry.position.z,
      );
      const screen = this.projectToScreen(worldPos);

      if (screen === null || this.isOccluded(worldPos, id)) {
        label.style.display = "none";
        continue;
      }

      label.style.display = "block";
      label.style.left = `${screen.x}px`;
      label.style.top = `${screen.y}px`;
      label.textContent = `${entry.current}/${entry.max}`;
    }

    for (const [id, label] of this.enemyLabels) {
      if (!seen.has(id)) {
        label.remove();
        this.enemyLabels.delete(id);
      }
    }
  }

  private projectToScreen(worldPos: THREE.Vector3): { x: number; y: number } | null {
    const toTarget = worldPos.clone().sub(this.camera.position);
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    if (toTarget.dot(forward) <= 0) return null;

    const ndc = worldPos.clone().project(this.camera);
    return {
      x: (ndc.x * 0.5 + 0.5) * window.innerWidth,
      y: (-ndc.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  // excludeEnemyId leaves the labeled enemy's own mesh out of its occlusion
  // check: the label sits only slightly above the enemy's own model, so
  // without this a close/steep viewing angle could clip the enemy's own head
  // and falsely report itself as occluding its own label. This is a string
  // comparison against each enemy's own unique id (tagged onto its mesh as
  // userData.enemyId in EnemyAI's constructor), not a shared type/tag — ids
  // are guaranteed unique per live enemy (the same invariant
  // gameState.enemyHealth's dictionary keys already rely on), so this can
  // never exclude a different enemy's mesh.
  private isOccluded(worldPos: THREE.Vector3, excludeEnemyId: string): boolean {
    const origin = this.camera.position;
    const toTarget = worldPos.clone().sub(origin);
    const distance = toTarget.length();
    if (distance < 1e-6) return false;

    const direction = toTarget.normalize();
    const targets = this.raycastRegistry
      .getAll()
      .filter((object) => object.userData.enemyId !== excludeEnemyId);
    const hit = this.raycast.fromOrigin(origin, direction, targets, distance);
    return hit !== null;
  }
}
```

- [ ] **Step 2: Update `main.ts`'s call site**

Open `src/main.ts`. Find (inside `animate()`):

```typescript
    hud.update();
```

Replace with:

```typescript
    hud.update(delta);
```

`delta` is already in scope at this point in `animate()` (computed earlier in the same function via `const delta = modeClock.getDelta();`).

- [ ] **Step 3: Verify the build is clean**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/HUD.ts src/main.ts
git commit -m "$(cat <<'EOF'
Checkpoint 20 task 5: HUD feedback display + contextual prompt read

HUD.updateInteractPrompt() now reads gameState.interactPromptText
instead of a hardcoded string. A new feedbackEl + updateFeedbackMessage()
displays gameState.feedbackMessage and clears it back to null after
2.5s via the existing Countdown utility, restarting on a genuinely new
message. update() gains a deltaTime parameter for this; main.ts's one
call site is updated to pass the already-computed per-frame delta.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `content/maps.ts` — Room 2 decorations + power-cable placement note

**Files:**
- Modify: `src/content/maps.ts`

**Interfaces:**
- Consumes: `MapEntity.type: "decoration"` and `MapEntity.variant` (Task 1), dispatched by `MapEntitySystem.createDecoration()` (Task 3).
- Produces: nothing new consumed by later tasks — this is the last content-only task before manual verification.

- [ ] **Step 1: Add three decoration entities to `campaign_room1`**

Open `src/content/maps.ts`. Find `campaign_terminal_2`'s entity block inside `campaign_room1`'s `entities` array:

```typescript
      { id: "campaign_part_1", type: "computer_part", position: [6, 0.3, 14] },
      {
        id: "campaign_terminal_2",
        type: "terminal",
        linkedTo: "room2_terminal",
        requiresPart: "campaign_part_1",
        position: [6, 0.3, 10],
      },
```

Replace with (adds the three decoration entities immediately after, plus a comment confirming the power cable's existing placement):

```typescript
      // campaign_part_1's position (col 3 / row 7) is deliberately kept as
      // the same column as both the entry gap (row 10) and the terminal
      // (row 5) -- checkpoint 20 confirmed this already satisfies "a
      // corner of Room 2" loosely (west portion of the room, not center)
      // without breaking the straight-path design documented above.
      { id: "campaign_part_1", type: "computer_part", position: [6, 0.3, 14] },
      {
        id: "campaign_terminal_2",
        type: "terminal",
        linkedTo: "room2_terminal",
        requiresPart: "campaign_part_1",
        position: [6, 0.3, 10],
      },
      // Checkpoint 20: purely visual clutter, positioned clearly off every
      // required path -- the column-3 entry/part/terminal path, the
      // column-6 Room-3 connector, and the row-6 vault corridor. No
      // collision (see MapEntitySystem.createDecoration()).
      { id: "campaign_decoration_1", type: "decoration", variant: "crate", position: [18, 0.3, 10] },
      { id: "campaign_decoration_2", type: "decoration", variant: "debris", position: [16, 0.3, 18] },
      { id: "campaign_decoration_3", type: "decoration", variant: "crate", position: [8, 0.3, 18] },
```

- [ ] **Step 2: Verify the build is clean**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/content/maps.ts
git commit -m "$(cat <<'EOF'
Checkpoint 20 task 6: Room 2 decoration clutter

Adds three "decoration" entities to campaign_room1's Room 2 (two
crates, one debris pile), positioned clear of the required path,
Room-3 connector, and vault corridor. Confirms (via a new comment,
no position change) that campaign_part_1's existing placement already
satisfies "a corner of Room 2" without breaking its documented
straight-path design.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Manual verification (controller-executed, not a subagent)

**Files:** none (verification only).

This task requires live browser interaction and judgment a subagent cannot reliably perform — executed by the session controller together with the human partner.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL in a browser.

- [ ] **Step 2: Verify contextual interact prompts**

Look at each interactable type and confirm each shows its own specific text (not a generic "Press E to interact"):
- A free door button (`test-grid` or `corridors`): "Press E to open door".
- A paid door button (`corridors_button_2`): "For 300 points, Press E to open door".
- An ammo pickup: "Press E to pick up ammo".
- A wall-buy: "For 500 points, Press E to buy M1911" (or the linked weapon's actual name/cost).
- A terminal (either `campaign_terminal_1` or `campaign_terminal_2`): "Press E to use terminal".
- A password lock: "Press E to unlock".
- The power cable (`campaign_part_1`): "Press E to pick up power cable".

- [ ] **Step 3: Verify on-screen feedback — gated terminal**

In a Campaign run, before collecting the power cable, interact with `campaign_terminal_2`. Confirm: the on-screen message "The screen is dark. It needs power." appears (not just in the console), and auto-hides after roughly 2.5 seconds without getting stuck.

- [ ] **Step 4: Verify on-screen feedback — insufficient points**

With points below a wall-buy's cost (or a paid button's cost), attempt the purchase/open. Confirm: an on-screen message with the correct numbers appears (e.g. "Not enough points (need 1200, have 340)"), auto-hides after ~2.5s, and the console still also logs the rejection.

- [ ] **Step 5: Verify Room 1's terminal renders via the new computer mesh**

Look at `campaign_terminal_1` from the start of a Campaign run. Confirm: it's a body/screen/keyboard shape (not a plain box), and the screen shows the "on" (green text) texture immediately, since Room 1's terminal is never gated.

- [ ] **Step 6: Verify Room 2's terminal power-on swap**

At the start of a run, confirm `campaign_terminal_2` renders "off" (dark screen). Pick up the power cable — confirm the terminal's appearance does NOT change yet. Interact with the terminal — confirm the mesh swaps to the "on" texture at the same position, and the Terminal overlay opens. Close the overlay and interact again — confirm the mesh does not swap/flicker a second time (still on) and the overlay opens normally.

- [ ] **Step 7: Verify Room 2 decorations**

Confirm 2–3 decoration objects (crates/debris) are visible in Room 2, and walk into each one — confirm no collision (the player passes straight through), and confirm they don't visually block the required path between the door, the power cable, the terminal, or the vault entrance.

- [ ] **Step 8: Verify a fresh run resets the terminal's visual state**

After powering on `campaign_terminal_2` in one run, die/respawn (or start a new run). Confirm: the power cable reappears, and `campaign_terminal_2` visually reverts to "off" (not still showing the "on" texture from the previous run).

- [ ] **Step 9: Full regression check**

Reload the page. Play Zombie Survival and Shooting Range on both `test-grid` and `corridors` — confirm every prior checkpoint's behavior (wall-buys, buttons, pickups, rounds, HUD) is unaffected, and confirm their interact prompts now also show contextual text without looking broken (e.g. no literal "undefined" or missing text anywhere).

---

### Task 8: Update CLAUDE.md and commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the folder structure tree**

`src/core/utils/` section — find the `RandomPin.ts` line (added at checkpoint 19) and add a new line immediately after:

```
      RandomPin.ts               [19, zero-padded random 6-digit string generator for Campaign's vault pin]
```
→
```
      RandomPin.ts               [19, zero-padded random 6-digit string generator for Campaign's vault pin]
      ComputerMesh.ts             [20, createComputerMesh()/createScreenTexture() -- the shared procedural body+screen+keyboard factory every terminal/computer entity uses]
```

`src/state/GameState.ts` — find its checkpoint-10 annotation:

```
    GameState.ts                [1, spendPoints() added at 10 — the first real pointsBalance spender-gate]
```
→
```
    GameState.ts                [1, spendPoints() added at 10 — the first real pointsBalance spender-gate; 20 adds interactPromptText + feedbackMessage/showFeedback()]
```

`src/core/InteractSystem.ts` — find its checkpoint-8.5 annotation:

```
    InteractSystem.ts           [3, restored the userData.interactable gate at 8.5 — see decisions log]
```
→
```
    InteractSystem.ts           [3, restored the userData.interactable gate at 8.5 — see decisions log; 20 writes gameState.interactPromptText from the looked-at object's userData.interactPrompt every frame]
```

`src/core/MapEntitySystem.ts` — find its checkpoint-19 annotation and append:

```
    MapEntitySystem.ts          [6, spawns door/button/pickup/wall_buy meshes from MapDef.entities; onDoorStateChanged callback added at 8.5; checkpoint-10 test_terminal scaffolding removed and replaced by createWallBuy() at 11; createButton() gains an optional per-button cost at 12; createTerminal()/createPasswordLock() added at 17, taking two new injected UI-trigger callbacks (openTerminal/openPasswordLock) so this core/ file never imports ui/Terminal.ts or ui/PasswordLock.ts directly; 19 adds createComputerPart(), a requiresPart gate on createTerminal(), and a secretField branch on createPasswordLock() (password/vaultPin/username, plus a getVaultPin constructor param and a promptLabel argument threaded through openPasswordLock) — a brief same-checkpoint intermediate design (a checksVaultPin boolean, plus a getDoorMesh(id) method for opening a button/lock-less door) was corrected before shipping, see the decisions log]
```
→
```
    MapEntitySystem.ts          [6, spawns door/button/pickup/wall_buy meshes from MapDef.entities; onDoorStateChanged callback added at 8.5; checkpoint-10 test_terminal scaffolding removed and replaced by createWallBuy() at 11; createButton() gains an optional per-button cost at 12; createTerminal()/createPasswordLock() added at 17, taking two new injected UI-trigger callbacks (openTerminal/openPasswordLock) so this core/ file never imports ui/Terminal.ts or ui/PasswordLock.ts directly; 19 adds createComputerPart(), a requiresPart gate on createTerminal(), and a secretField branch on createPasswordLock() (password/vaultPin/username, plus a getVaultPin constructor param and a promptLabel argument threaded through openPasswordLock) — a brief same-checkpoint intermediate design (a checksVaultPin boolean, plus a getDoorMesh(id) method for opening a button/lock-less door) was corrected before shipping, see the decisions log; 20 adds userData.interactPrompt to every create*() method, gameState.showFeedback() calls at every rejection site, createDecoration() for the new "decoration" entity type, and retrofits createTerminal() onto createComputerMesh() with an interact-time (not pickup-time) power-on swap]
```

`src/ui/HUD.ts` — find its checkpoint-10 annotation (the last bracketed note in its multi-line entry) and append a new bracket:

```
                                 [10 live top-right display switches from score to pointsBalance ("Points: N"); death panel still shows score]
```
→
```
                                 [10 live top-right display switches from score to pointsBalance ("Points: N"); death panel still shows score]
                                 [20 reads gameState.interactPromptText instead of a hardcoded string; adds a feedbackEl + updateFeedbackMessage() that displays and auto-clears gameState.feedbackMessage via Countdown; update() gains a deltaTime parameter for this]
```

`src/content/maps.ts` — find its checkpoint-17 annotation and append:

```
    maps.ts                       [1, populated at 5; name field + second map ("corridors") added at 9.5; checkpoint-10 test_terminal scaffolding removed and replaced with one wall_buy entity per map at 11; corridors gains a paid door/vault room at 12; third map ("campaign_room1") added at 17, the first to set supportedModes; 19 extends campaign_room1 (not a new map) with Room 2 (vault side-path + part/terminal puzzle) and an empty Room 3, whose door is gated by a real password_lock (corrected same checkpoint) rather than opening from a terminal command]
```
→
```
    maps.ts                       [1, populated at 5; name field + second map ("corridors") added at 9.5; checkpoint-10 test_terminal scaffolding removed and replaced with one wall_buy entity per map at 11; corridors gains a paid door/vault room at 12; third map ("campaign_room1") added at 17, the first to set supportedModes; 19 extends campaign_room1 (not a new map) with Room 2 (vault side-path + part/terminal puzzle) and an empty Room 3, whose door is gated by a real password_lock (corrected same checkpoint) rather than opening from a terminal command; 20 adds three "decoration" clutter entities to Room 2, no grid/mechanics changes]
```

`src/types/index.ts` — find the checkpoint-19 annotation and append:

```
    index.ts                      [1; MapEntity gains "terminal"/"password_lock" types + terminalId at 17; TerminalFile/TerminalDirectory/TerminalDef interfaces added at 17; MapDef.supportedModes added at 17; 19 adds "computer_part", MapEntity.requiresPart, MapEntity.secretField ("password"/"vaultPin"/"username", a corrected-same-checkpoint replacement for an original checksVaultPin boolean) + MapEntity.promptLabel, TerminalDef.password becomes optional, and TerminalDef gains username + unlockedCommands]
```
→
```
    index.ts                      [1; MapEntity gains "terminal"/"password_lock" types + terminalId at 17; TerminalFile/TerminalDirectory/TerminalDef interfaces added at 17; MapDef.supportedModes added at 17; 19 adds "computer_part", MapEntity.requiresPart, MapEntity.secretField ("password"/"vaultPin"/"username", a corrected-same-checkpoint replacement for an original checksVaultPin boolean) + MapEntity.promptLabel, TerminalDef.password becomes optional, and TerminalDef gains username + unlockedCommands; 20 adds "decoration" + MapEntity.variant, and GameState gains interactPromptText/feedbackMessage/showFeedback()]
```

- [ ] **Step 2: Update the Checkpoints list**

Add a new line immediately after checkpoint 19's line:

```
20. Contextual interact prompts, on-screen feedback, Room 2 visual pass — GameState.interactPromptText (written every frame by InteractSystem from the looked-at entity's own userData.interactPrompt) replaces HUD's hardcoded "Press E to interact"; GameState.feedbackMessage/showFeedback() surfaces wall-buy/paid-door/gated-terminal rejections on screen (auto-cleared by HUD via the existing Countdown utility) instead of console.log-only; a new core/utils/ComputerMesh.ts factory (procedural body+screen+keyboard, screen textured via a generated CanvasTexture) replaces Room 2's terminal placeholder box, swapping from "off" to "on" the first time the player interacts with it after the power cable has been collected (not at pickup time); Room 2 gains a few purely-visual, non-collidable "decoration" clutter entities
```

- [ ] **Step 3: Update "Current status"**

Change the opening sentence from `Checkpoint 19 complete.` to `Checkpoint 20 complete.`, and append new paragraphs after the existing checkpoint-19 paragraphs (before `## Decisions log`), written in this project's established narrative style, covering:

- `GameState.interactPromptText`/`feedbackMessage` as the mediating state for both new systems, and why `InteractSystem` (not `MapEntitySystem`) is the direct writer of `interactPromptText` — it's the system that already computes "what is the player looking at" every frame, while `MapEntitySystem` only sets the static per-entity `userData.interactPrompt` value once at construction.
- Which `create*()` methods now set `interactPrompt` and with what text (briefly list door-button free/paid, pickup, wall-buy, terminal, password-lock, power-cable), and that the defensive "Press E to interact" fallback in `InteractSystem` is confirmed to never actually trigger, since every entity type sets one.
- `gameState.showFeedback()` and the three call sites that now use it (wall-buy rejection, paid-button rejection, gated-terminal attempt) alongside their pre-existing `console.log` calls, and `HUD.updateFeedbackMessage()`'s Countdown-based auto-clear (2.5s), including the "compare against the previously-rendered message to detect a new one" mechanism and that an identical repeated message does not restart the timer.
- `core/utils/ComputerMesh.ts`'s `createComputerMesh()`/`createScreenTexture()`, the `COMPUTER_BODY_NAME`-named-child pattern and why it exists (non-recursive raycasting can't hit a `THREE.Group` directly), and `createTerminal()`'s retrofit — Room 1's terminal always powered, Room 2's terminal starting "off" and swapping to "on" (same position, once) on the first interact after the gate passes, plus the `RunManager`-registered resettable that reverts a powered-on terminal on a new run.
- Room 2's three new `"decoration"` entities and the deliberate no-collision/no-interaction simplification.
- A "Verified in-browser" sentence summarizing what Task 7's manual verification actually confirmed — write this only after Task 7 has been completed and confirmed by the user, not from the plan's expected behavior alone.

- [ ] **Step 4: Add decisions log entries**

Append after the last existing decisions-log line, before `## Future mechanics`:

```
- `GameState.interactPromptText`/`feedbackMessage` (checkpoint 20) are both plain, HUD-readable fields rather than direct callbacks from `MapEntitySystem`/`InteractSystem` into `HUD` — this follows the same rule the checkpoint-3.5 decisions log already established for every other HUD field (`weaponName`, `currentAmmo`, `canInteract`, etc.): gameplay systems write to `GameState`, `HUD` only ever reads from it, never the other way around. `interactPromptText` is written by `InteractSystem` specifically (not `MapEntitySystem`), since `InteractSystem` is the system that already recomputes "what is the player looking at" every single frame — `MapEntitySystem` only ever sets the static `userData.interactPrompt` string once, at construction time, the same way it already sets `userData.interactable`/`userData.onInteract`.
- `MapEntitySystem`'s rejection call sites (checkpoint 20) call `gameState.showFeedback(...)` in addition to their existing `console.log` calls, not instead of them — the `console.log` lines predate this checkpoint and remain useful for headless/automated verification (the same reasoning that kept every earlier checkpoint's `console.log` rejection pattern in place through checkpoints 10-19). `showFeedback()` is a named guarded mutator (mirroring `addScore()`/`spendPoints()`'s existing style) rather than a raw `gameState.feedbackMessage = text` assignment from callers, keeping the "every field touch goes through a named method" convention consistent even though this particular field doesn't need `score`/`pointsBalance`-level strictness.
- `core/utils/ComputerMesh.ts`'s `createComputerMesh()` (checkpoint 20) returns a `THREE.Group`, but `MapEntitySystem.createTerminal()` registers only its named `COMPUTER_BODY_NAME` child mesh with `RaycastRegistry`, not the Group itself — `core/utils/Raycast.ts`'s `cast()` calls `intersectObjects(targets, false)` (non-recursive), and a `THREE.Group` has no geometry of its own, so it can never be hit directly regardless of what children it has. Every other entity type in this codebase already follows the "one Mesh carries `userData.interactable`/`onInteract`/`interactPrompt` and is the thing registered" shape; the named-child lookup (`group.getObjectByName(COMPUTER_BODY_NAME)`) is what lets a multi-mesh visual (body + screen + keyboard) keep following that same shape without changing `Raycast.ts`'s recursion setting globally, which would have touched every other raycasting system in the game (`WeaponSystem`'s fire, `EnemyAI`'s line-of-sight, `HUD`'s occlusion check) for a change only this one entity type needed.
- The Room 2 terminal's power-on swap happens on the first *interact* after the gate passes, not at the moment the power cable is *picked up* (checkpoint 20) — deliberately, per the original request: collecting the cable only satisfies the existing (checkpoint-19) gate check inside `createTerminal()`'s `onInteract`, it does not itself trigger any visual change. This means a player can collect the cable and walk away without the terminal ever visually changing, and only sees it swap to "on" the moment they actually interact with it again. The swap itself is tracked by three `let`-bound closure variables local to `createTerminal()` (`computerGroup`, `bodyMesh`, `poweredOn`) rather than a class field or a cross-entity lookup map — `createTerminal()` already holds the part's mesh reference for the gate check, so no new lookup mechanism was needed. A `RunManager`-registered resettable (only for terminals with `requiresPart` set) reverts a powered-on terminal's mesh back to `createComputerMesh(false)` on a new run, mirroring `createComputerPart()`'s own existing resettable for the cable itself — without this, a new run would restore the cable (making the gate check fail again) while the terminal kept visually showing "on" from the previous run, a visible contradiction between what the gate check says and what the player sees.
- Room 2's `"decoration"` entities (checkpoint 20) are deliberately given no collision box, no `RaycastRegistry` registration, and no `userData.interactable` — the player walks straight through them for free, since nothing in `PlayerController`'s manual AABB collision or any raycasting system ever receives them. This is an intentional simplification for this checkpoint's scope (visual clutter, not physical obstacles), not an oversight — flagged here explicitly so it isn't mistaken for one later. A future checkpoint wanting solid decorations would need to opt specific `"decoration"` entities into `computeCollisionBox()` + `PlayerController.setWallBoxes()`/`setDoors()`-style registration, which nothing here currently does.
```

- [ ] **Step 5: Add future-mechanics entries**

Append new future-mechanics bullets at the end of the section:

```
- **Collidable decorations**: not built. Every `"decoration"` entity is walk-through, deliberately (see decisions log). A future checkpoint wanting solid clutter (crates you can't walk through) would need to opt specific decorations into collision-box registration, the same mechanism doors already use — not a new mechanism, just a currently-unexercised extension point.
- **Wall-mounted terminal/lock repositioning**: raised during checkpoint 20's own request as a future idea, not built — every terminal/password-lock in this codebase currently sits on the floor like every other entity; mounting one against a wall at eye height is purely a positioning/rotation question, not a new mechanism, but hasn't been designed.
- **Richer decoration variety**: `MapEntity.variant` currently only distinguishes `"crate"`/`"debris"` (a color/size swap on the same box geometry). A future pass wanting genuinely different shapes (barrels, shelving, etc.) would need `createDecoration()` to branch on geometry, not just material/size, and possibly a richer `variant` union.
- **On-screen feedback message queueing**: `gameState.feedbackMessage` holds exactly one message at a time — a second rejection while one is already displayed simply overwrites it (restarting the display countdown, per the "detect a new message" comparison in `HUD.updateFeedbackMessage()`). There is no queue, so two rapid-fire distinct rejections can never both be read by the player; not designed, since no current interaction produces rejections in rapid succession.
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Search for staleness this checkpoint may have introduced**

Read the entire CLAUDE.md document (not just the sections edited above) and specifically check for:
- Any sentence describing `HUD`'s interact prompt as a hardcoded "Press E to interact" string.
- Any sentence describing wall-buy/paid-door/gated-terminal rejections as "`console.log`-only" (the checkpoint-11 future-mechanics entry "HUD purchase feedback" specifically predicted this being built — it should now be marked superseded, not left claiming the gap is still open).
- Any sentence describing `MapEntitySystem.createTerminal()` as building a plain box mesh.
- Any sentence describing `HUD.update()` as taking no parameters.
- Any other claim this checkpoint's changes would now contradict.

If you find staleness, fix it using the established `**Superseded at checkpoint N** (was: "...")` convention for decisions-log/future-mechanics entries, or an inline parenthetical for "Current status" prose. Pay particular attention to the checkpoint-11 future-mechanics entry "HUD purchase feedback" (`— worth adding once the HUD has a natural place for transient messages; not designed yet.`), since this checkpoint is exactly that follow-through and the entry should be marked superseded, not left as an open gap. If you find nothing beyond what Steps 1-5 already added, say so explicitly in your commit's task report.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Checkpoint 20: contextual interact prompts, on-screen feedback, Room 2 visuals

Every interactable now shows its own hover prompt (door cost, weapon
name/cost, etc.) via GameState.interactPromptText, written each frame
by InteractSystem from the looked-at entity's userData.interactPrompt
-- replacing HUD's old hardcoded "Press E to interact" string.

Wall-buy/paid-door/gated-terminal rejections now also show an
on-screen message (GameState.feedbackMessage/showFeedback()),
auto-cleared by HUD after 2.5s via the existing Countdown utility,
alongside their existing console.log calls -- closing the gap the
checkpoint-11 future-mechanics notes had already flagged.

A new core/utils/ComputerMesh.ts factory (procedural body/screen/
keyboard boxes, screen textured via a generated CanvasTexture)
replaces Room 2's terminal placeholder box. A gated terminal starts
visually "off" and only swaps to "on" (same position, once) the first
time the player interacts with it after the power cable has already
been collected -- collecting the cable alone doesn't change its
appearance. A RunManager-registered resettable reverts a powered-on
terminal on a new run, mirroring the cable's own existing reset.

Room 2 also gains a few purely-visual "decoration" clutter entities
(new MapEntity type) -- no collision, no interaction, deliberately.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Verify the commit**

Run: `git status` and `git log -1 --stat`
Expected: working tree clean; the commit touches `CLAUDE.md` (plus this plan doc, if not already committed) — `src/state/GameState.ts`, `src/types/index.ts`, `src/core/utils/ComputerMesh.ts`, `src/core/MapEntitySystem.ts`, `src/core/InteractSystem.ts`, `src/ui/HUD.ts`, `src/main.ts`, and `src/content/maps.ts` should all show no changes from this task, since they were already committed by Tasks 1-6.

---

## Self-Review Notes

- **Spec coverage:** Part A (contextual prompts: `GameState.interactPromptText`, per-entity `interactPrompt` text on all six entity types, `InteractSystem` writing it each frame with a defensive fallback, `HUD` reading it) — Tasks 1, 3, 4, 5 ✓. Part B (on-screen feedback: `GameState.feedbackMessage`/`showFeedback()`, the three rejection call sites, `HUD`'s Countdown-based auto-clear with new-message detection) — Tasks 1, 3, 5 ✓. Part C (`core/utils/ComputerMesh.ts`'s `createComputerMesh()`/`createScreenTexture()`, the pure-factory/no-userData constraint, the `createTerminal()` retrofit with interact-time power-on swap and same-position rebuild) — Tasks 2, 3 ✓. Part D (`content/maps.ts` Room 2 dressing: computer_part placement confirmation, 2-3 decoration entities; `"decoration"` `MapEntity` type with no collision/interaction) — Tasks 1, 3, 6 ✓. Verification's 7 items — Task 7 ✓ (renumbered/reworded slightly to match implementation specifics, e.g. exact prompt text and exact swap-timing wording, but covers every item in the original spec). CLAUDE.md update — Task 8 ✓, including the specific decisions-log entries the spec requested (GameState-mediated design rationale, interact-time-not-pickup-time swap, no-collision-for-decorations).
- **Placeholder scan:** no TBD/TODO; every step has complete, exact code (Tasks 1, 2, 3, 4, 5, 6 all give full file replacements or complete before/after blocks, not fragments); Task 7's verification steps are concrete, observable behaviors (exact prompt strings, exact message text, "confirm no collision," "confirm no second swap") rather than vague "make sure it works" language.
- **Type consistency check:** `GameState.showFeedback(text: string): void` (Task 1) is called identically at all three sites in `MapEntitySystem.ts` (Task 3) — matches. `createComputerMesh(poweredOn: boolean): THREE.Group` and `COMPUTER_BODY_NAME: string` (Task 2) are imported and used identically in `MapEntitySystem.createTerminal()` (Task 3) — matches, including the `group.getObjectByName(COMPUTER_BODY_NAME) as THREE.Mesh | undefined` cast pattern. `MapEntity.variant?: "crate" | "debris"` (Task 1) is read identically by `createDecoration()` (Task 3) and set identically by `content/maps.ts` (Task 6) — matches. `HUD.update(deltaTime: number): void` (Task 5) matches its one call site in `main.ts` (also Task 5, same commit) passing the already-computed `delta`. `createTerminal()`'s signature gains `gameState: GameState, runManager: RunManager` as trailing parameters (Task 3) and its one dispatch call site (inside the same file's constructor) passes both — matches, both already in scope as existing constructor parameters.
- **Compile-safety / task-ordering check:** Task 1 is purely additive (new fields/type members, zero consumers yet) — build stays green. Task 2 is a new, self-contained file with zero project-internal consumers yet — build stays green. Task 3 is the first task with real consumers of Tasks 1-2's additions (`GameState.showFeedback`, `MapEntity.variant`/`"decoration"`, `createComputerMesh`/`COMPUTER_BODY_NAME`) and is a full-file replacement that keeps `MapEntitySystem`'s own public constructor signature unchanged, so `main.ts` needs no edits for this task — build stays green. Task 4 only reads `GameState.interactPromptText` (already exists after Task 1) and `userData.interactPrompt` (defensively, via `??`, so it's correct whether or not Task 3 has landed yet) — build stays green regardless of Task 3/4 ordering, though the plan sequences them 3-then-4 for logical flow. Task 5 changes `HUD.update()`'s signature and fixes its one call site in the same task/commit (no circular-dependency reason to defer this checkpoint, unlike checkpoint 19's Terminal-instance situation) — build stays green. Task 6 is additive map content, dispatched by Task 3's already-landed `createDecoration()` branch — build stays green. No `erasableSyntaxOnly` violations anywhere: no parameter-property constructor shorthand, no enums, no new class fields beyond plain typed properties matching this codebase's existing style.
- **Architecture-rule cross-check:** `core/utils/ComputerMesh.ts` imports only `three` — no `content/`, no `modes/`, no `ui/`, consistent with every other `core/utils/` file. `core/MapEntitySystem.ts` imports `createComputerMesh`/`COMPUTER_BODY_NAME` from `./utils/ComputerMesh` (a `core/` file importing another `core/` file — allowed) and gains no new `content/`/`modes/`/`ui/` imports. `core/InteractSystem.ts` and `ui/HUD.ts` both continue to depend only on `GameState` (a plain data class) for the new prompt/feedback fields, not on each other or on `MapEntitySystem` directly — the "HUD reads only GameState" rule (and its `InteractSystem`-writes-the-field counterpart) is preserved exactly as it already worked for every pre-existing `GameState` field. `content/maps.ts`'s new entities are pure typed data, no logic.
