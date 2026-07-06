# Checkpoint 9: Main Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-time main menu (mode/weapon/enemy select + Start Game) shown before gameplay begins, and restructure `main.ts` so nothing runs at module load until the menu confirms a choice.

**Architecture:** A new `ui/MainMenu.ts` DOM overlay (same plain-HTML/inline-style technique as `ui/HUD.ts`, but a separate file since its lifecycle is one-shot, not continuous) collects a `GameSelections` object and hands it to a callback. `main.ts`'s entire current initialization body (Scene, MapLoader, PlayerController, WeaponSystem, InteractSystem, RaycastRegistry wiring, the active GameMode, HUD, render loop) moves into a `startGame(selections: GameSelections)` function, called exactly once when the menu's Start button fires. `ACTIVE_MODE` is removed entirely — the mode is chosen at runtime from the menu.

**Tech Stack:** TypeScript, Three.js, Vite, plain DOM (no framework, no test runner — this project has none; every checkpoint is verified manually in the browser, this one follows that same convention).

## Global Constraints

- `core/` never references `content/` or `modes/` directly — it only consumes typed interfaces. (Unaffected here — no core/ files change.)
- All game content (weapons, enemies, maps, sounds) lives in `content/*.ts` as typed data, never hardcoded in logic. Game *modes* are not content (they're code, per the mode-building rule), so the menu's list of selectable modes is a small hardcoded array, not a `content/modes.ts` file.
- Single-responsibility per file: `ui/MainMenu.ts` is a new file, not folded into `ui/HUD.ts` — the menu's one-time lifecycle is a different responsibility from HUD's continuous per-frame lifecycle.
- Shared/reusable logic goes in `core/utils/`, never duplicated inline. (Note: `MainMenu.ts` duplicates `HUD.ts`'s tiny local `createDiv` DOM helper rather than extracting a shared `ui/` helper module — out of scope for this checkpoint, not requested; flag in a future code review if it recurs a third time.)
- This checkpoint's scope is the one-time load menu only. The death panel's "Main Menu" button stays a `Respawn` alias, unchanged — no mid-session return-to-menu is built now.

---

## Task 1: Create `ui/MainMenu.ts`

**Files:**
- Create: `src/ui/MainMenu.ts`

**Interfaces:**
- Consumes: `Weapon`, `EnemyDef` from `../types` (existing).
- Produces: `export type ModeId = "zombie" | "range";`, `export interface GameSelections { modeId: ModeId; weaponId: string; enemyId: string; }`, `export class MainMenu` with constructor `(weapons: Weapon[], enemies: EnemyDef[], onStart: (selections: GameSelections) => void)` and method `destroy(): void`.

- [ ] **Step 1: Write `src/ui/MainMenu.ts`**

```typescript
import type { Weapon, EnemyDef } from "../types";

// The menu's own notion of which modes exist — not content, since game
// modes are code (ZombieSurvival/ShootingRange), not typed data, per the
// project's mode-building rule. Mirrors the ModeName union that used to be
// hardcoded directly in main.ts before this checkpoint.
export type ModeId = "zombie" | "range";

export interface GameSelections {
  modeId: ModeId;
  weaponId: string;
  enemyId: string;
}

interface SelectableOption {
  id: string;
  label: string;
}

const MODE_OPTIONS: { id: ModeId; label: string }[] = [
  { id: "zombie", label: "Zombie Survival" },
  { id: "range", label: "Shooting Range" },
];

const SELECTED_BORDER = "#4a9eff";
const UNSELECTED_BORDER = "#666";
const SELECTED_BACKGROUND = "#1c3a5c";
const UNSELECTED_BACKGROUND = "#2a2a2a";

function createDiv(styles: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, styles);
  return el;
}

function createOptionButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  Object.assign(button.style, {
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: "14px",
    padding: "10px 20px",
    border: `2px solid ${UNSELECTED_BORDER}`,
    borderRadius: "4px",
    background: UNSELECTED_BACKGROUND,
    color: "#f0f0f0",
  });
  button.addEventListener("click", onClick);
  return button;
}

// A one-time DOM overlay shown before gameplay starts: mode/weapon/enemy
// selection plus a Start Game button. Kept separate from ui/HUD.ts — its
// lifecycle (shown once, then destroyed) is distinct from HUD's (shown
// continuously during gameplay), so folding it into HUD would mix two
// different concerns into one file.
//
// Deliberately one screen with three groups, not three sequential screens:
// with only two modes and one weapon/enemy currently in content/, a
// multi-screen wizard would be pure overhead. Revisit if the option lists
// grow long enough to need it.
export class MainMenu {
  private readonly root: HTMLDivElement;
  private readonly enemyGroup: HTMLDivElement;

  private selectedModeId: ModeId = MODE_OPTIONS[0].id;
  private selectedWeaponId: string;
  private selectedEnemyId: string;

  private readonly modeButtons = new Map<string, HTMLButtonElement>();
  private readonly weaponButtons = new Map<string, HTMLButtonElement>();
  private readonly enemyButtons = new Map<string, HTMLButtonElement>();

  constructor(
    weapons: Weapon[],
    enemies: EnemyDef[],
    onStart: (selections: GameSelections) => void,
  ) {
    this.selectedWeaponId = weapons[0].id;
    this.selectedEnemyId = enemies[0].id;

    this.root = createDiv({
      position: "fixed",
      inset: "0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "32px",
      background: "#151515",
      pointerEvents: "auto",
      zIndex: "20",
      fontFamily: "monospace",
      color: "#f0f0f0",
    });

    const heading = createDiv({ fontSize: "32px", fontWeight: "bold", letterSpacing: "0.1em" });
    heading.textContent = "SHOOTER";
    this.root.appendChild(heading);

    const modeGroup = this.buildGroup(
      "Mode",
      MODE_OPTIONS,
      this.selectedModeId,
      this.modeButtons,
      (id) => this.selectMode(id as ModeId),
    );
    this.root.appendChild(modeGroup);

    const weaponOptions: SelectableOption[] = weapons.map((weapon) => ({
      id: weapon.id,
      label: weapon.name,
    }));
    const weaponGroup = this.buildGroup(
      "Weapon",
      weaponOptions,
      this.selectedWeaponId,
      this.weaponButtons,
      (id) => this.selectWeapon(id),
    );
    this.root.appendChild(weaponGroup);

    // EnemyDef has no player-facing display-name field yet (unlike
    // Weapon.name) — shown as its raw id until one is added. See CLAUDE.md
    // future mechanics.
    const enemyOptions: SelectableOption[] = enemies.map((enemy) => ({
      id: enemy.id,
      label: enemy.id,
    }));
    this.enemyGroup = this.buildGroup(
      "Enemy",
      enemyOptions,
      this.selectedEnemyId,
      this.enemyButtons,
      (id) => this.selectEnemy(id),
    );
    this.root.appendChild(this.enemyGroup);

    const startButton = createOptionButton("Start Game", () => {
      onStart({
        modeId: this.selectedModeId,
        weaponId: this.selectedWeaponId,
        enemyId: this.selectedEnemyId,
      });
    });
    Object.assign(startButton.style, {
      fontSize: "18px",
      fontWeight: "bold",
      padding: "14px 40px",
      border: "none",
      background: "#3a6b3a",
    });
    this.root.appendChild(startButton);

    document.body.appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
  }

  private buildGroup(
    title: string,
    options: SelectableOption[],
    selectedId: string,
    buttonMap: Map<string, HTMLButtonElement>,
    onSelect: (id: string) => void,
  ): HTMLDivElement {
    const group = createDiv({
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "10px",
    });

    const heading = createDiv({ fontSize: "14px", opacity: "0.8", letterSpacing: "0.05em" });
    heading.textContent = title;
    group.appendChild(heading);

    const row = createDiv({ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" });
    for (const option of options) {
      const button = createOptionButton(option.label, () => onSelect(option.id));
      buttonMap.set(option.id, button);
      row.appendChild(button);
    }
    group.appendChild(row);

    this.applySelection(buttonMap, selectedId);
    return group;
  }

  private applySelection(buttonMap: Map<string, HTMLButtonElement>, selectedId: string): void {
    for (const [id, button] of buttonMap) {
      const selected = id === selectedId;
      button.style.borderColor = selected ? SELECTED_BORDER : UNSELECTED_BORDER;
      button.style.background = selected ? SELECTED_BACKGROUND : UNSELECTED_BACKGROUND;
    }
  }

  private selectMode(modeId: ModeId): void {
    this.selectedModeId = modeId;
    this.applySelection(this.modeButtons, modeId);

    const isRange = modeId === "range";
    this.enemyGroup.style.opacity = isRange ? "0.4" : "1";
    this.enemyGroup.style.pointerEvents = isRange ? "none" : "auto";
  }

  private selectWeapon(weaponId: string): void {
    this.selectedWeaponId = weaponId;
    this.applySelection(this.weaponButtons, weaponId);
  }

  private selectEnemy(enemyId: string): void {
    this.selectedEnemyId = enemyId;
    this.applySelection(this.enemyButtons, enemyId);
  }
}
```

- [ ] **Step 2: Verify the new file compiles in isolation**

Run: `npx tsc --noEmit`
Expected: no errors attributable to `src/ui/MainMenu.ts` (errors about `main.ts` not yet using it are expected and resolved in Task 2).

---

## Task 2: Restructure `main.ts` around `startGame()` and the menu

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `MainMenu`, `GameSelections`, `ModeId` from `./ui/MainMenu` (Task 1).
- Produces: `startGame(selections: GameSelections): void` containing the entire former module-level body. Module scope now only imports and constructs `MainMenu`.

- [ ] **Step 1: Replace the full contents of `src/main.ts`**

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

  // The single shared "what can be hit/occluded by a ray" registry — every
  // solid or interactable object (walls, doors, buttons, pickups, the
  // placeholder interactable, enemies) registers itself here once, and every
  // raycasting system (WeaponSystem's fire, EnemyAI's line-of-sight,
  // InteractSystem's interact ray, HUD's label occlusion) reads the same list.
  const raycastRegistry = new RaycastRegistry();

  const mapDef = findById(MAPS, "test-grid");
  const map = loadMap(mapDef.grid, raycastRegistry);
  sceneManager.scene.add(map.group);
  playerController.setWallBoxes(map.wallBoxes);
  const spawnPosition = getSpawnPosition(mapDef);
  playerController.setSpawn(spawnPosition.x, spawnPosition.z);

  const audioSystem = new AudioSystem(sceneManager.camera);
  void audioSystem.load(findById(SOUNDS, "pistol_fire"));
  void audioSystem.load(findById(SOUNDS, "zombie_growl"));
  void audioSystem.load(findById(SOUNDS, "zombie_death"));

  const weaponSystem = new WeaponSystem(
    sceneManager.camera,
    findById(WEAPONS, selections.weaponId),
    audioSystem,
    gameState,
    runManager,
    raycastRegistry,
  );

  const mapEntitySystem = new MapEntitySystem(
    mapDef,
    weaponSystem,
    runManager,
    raycastRegistry,
    () => playerController.rebuildCollisionBoxes(),
  );
  sceneManager.scene.add(mapEntitySystem.group);
  playerController.setDoors(mapEntitySystem.doors);

  // Placeholder interactable: still hardcoded here, not a real MapEntity type —
  // it predates doors/buttons/pickups (checkpoint 3) and has no map-entity
  // shape of its own to migrate into.
  const interactableBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.6),
    new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x552200 }),
  );
  interactableBox.name = "placeholder box";
  interactableBox.userData.interactable = true;
  interactableBox.userData.onInteract = (): void => {
    console.log("Interacted with placeholder box");
  };
  interactableBox.position.set(2, 0.3, 8);
  sceneManager.scene.add(interactableBox);
  raycastRegistry.register(interactableBox);

  const interactSystem = new InteractSystem(sceneManager.camera, gameState, raycastRegistry);

  const enemySpawnPoints = mapDef.entities
    .filter((entity) => entity.type === "enemy_spawn")
    .map((entity) => new THREE.Vector3(...entity.position));

  const targetPoints = mapDef.entities
    .filter((entity) => entity.type === "target")
    .map((entity) => new THREE.Vector3(...entity.position));

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
        )
      : new ShootingRange(
          targetPoints,
          sceneManager.scene,
          weaponSystem,
          gameState,
          runManager,
        );
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
  }

  animate();
}

const mainMenu = new MainMenu(WEAPONS, ENEMIES, (selections) => {
  mainMenu.destroy();
  startGame(selections);
});
```

- [ ] **Step 2: Verify the project compiles**

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

---

## Task 3: Manual verification against acceptance criteria

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL in a browser.

- [ ] **Step 2: Verify load-time behavior**

Confirm: on page load, only the menu is visible (title, Mode/Weapon/Enemy groups, Start Game button) — no canvas gameplay, no zombies, no HUD, nothing rendered underneath. "Zombie Survival" and the pistol/zombie options should appear pre-selected (highlighted) by default.

- [ ] **Step 3: Verify enemy-group disabling**

Click "Shooting Range" in the Mode group. Confirm the Enemy group visually grays out and its buttons stop responding to clicks (clicking an enemy option while "Shooting Range" is selected has no effect). Click back to "Zombie Survival" and confirm the Enemy group re-enables and is clickable again.

- [ ] **Step 4: Verify Zombie Survival start**

With "Zombie Survival" mode, the pistol, and the zombie enemy selected, click "Start Game". Confirm: the menu disappears, gameplay begins exactly as checkpoint 8.5 behaved — round 1 spawns a zombie, WASD/shooting/interact/HUD all work, and clicking the canvas re-locks the pointer as expected.

- [ ] **Step 5: Verify Shooting Range start**

Reload the page, select "Shooting Range" mode (enemy group grayed out, ignored), leave the pistol selected, click "Start Game". Confirm: no zombies spawn, HP never drops, targets award score and go on cooldown when hit — matching checkpoint 8.5's Shooting Range behavior exactly.

- [ ] **Step 6: Verify death-panel "Main Menu" is unchanged**

In a Zombie Survival run, let the player die. Confirm the death panel's "Main Menu" button still behaves exactly like "Respawn" (full stat/position reset, gameplay resumes in the same session) — it does **not** return to the `ui/MainMenu.ts` screen.

---

## Task 4: Update CLAUDE.md and commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the folder structure tree**

Replace the `ui/` block:

```
  ui/
    HUD.ts                      [3.5, gameplay overlay: crosshair/ammo/reload/interact prompts]
                                 [7 adds round display + death-panel rounds-survived text]
                                 [8 both now sourced from the active GameMode, not GameState fields]
                                 [8.5 reads its occlusion target list from RaycastRegistry, excluding the labeled enemy's own mesh]
    MainMenu.ts                 [9, one-time mode/weapon/enemy select screen shown before gameplay — kept separate from HUD.ts, see decisions log]
```

(This removes the stale `[9 adds separate menu screens here: mode select, loadout, enemy select]` sub-line that used to hang off `HUD.ts` — the original folder-structure plan assumed the checkpoint-9 menu would live inside `HUD.ts`; it didn't, per this checkpoint's decision to keep it a separate file.)

- [ ] **Step 2: Update the Checkpoints list**

Replace line 9:

```
9. Menus (mode select, loadout, enemy select) + ambience/music
```

with:

```
9. Main menu at load time (mode select, loadout select, enemy select, single screen) — ambience/music from the original checkpoint-9 scope is deferred, not yet assigned a checkpoint number
```

- [ ] **Step 3: Update "Current status"**

Change the opening sentence from `Checkpoint 8.5 complete.` to `Checkpoint 9 complete.`, and append a new paragraph after the existing checkpoint-8.5 paragraphs (before the `## Decisions log` heading):

```

`ui/MainMenu.ts` is a new, one-time DOM overlay (same plain-HTML/inline-style technique as `ui/HUD.ts`) shown at page load: a single screen with Mode, Weapon, and Enemy selection groups plus a "Start Game" button, not three sequential screens — with only two modes and one weapon/enemy currently in `content/`, a multi-screen wizard would be pure overhead; this is deliberate for the current content volume, not an oversight, and can be split into multiple screens later if the option lists grow long enough to need it. Weapon and Enemy options are generated by iterating `content/weapons.ts`/`content/enemies.ts` (passed into `MainMenu`'s constructor from `main.ts`, the composition root — `ui/MainMenu.ts` itself never imports `content/`, matching `ui/HUD.ts`'s existing pattern), so a second weapon or enemy added later appears in the menu automatically, per the checkpoint-5 data-driven principle. The Enemy group visually grays out and stops accepting clicks whenever "Shooting Range" is the selected mode, since that mode spawns no enemies and the selection would be meaningless there. `main.ts`'s entire former module-level body (Scene, MapLoader, PlayerController, WeaponSystem, InteractSystem, RaycastRegistry wiring, the active GameMode, HUD, render loop) now lives inside a `startGame(selections: GameSelections)` function that only runs once, when the menu's Start button fires — nothing runs at module load anymore, and the old `ACTIVE_MODE` constant is gone entirely, replaced by `selections.modeId` chosen at runtime. `WeaponSystem` is now constructed via `findById(WEAPONS, selections.weaponId)` and `ZombieSurvival` via `findById(ENEMIES, selections.enemyId)`, both driven by the menu's choices instead of hardcoded ids. The death panel's "Main Menu" button is unchanged — still a `startNewRun()`/Respawn alias — this checkpoint only adds the load-time menu; see the decisions log and "Future mechanics" below for why a mid-session return to this menu isn't built yet. Verified in-browser: page load shows only the menu with sensible defaults pre-selected (Zombie Survival, pistol, zombie), selecting Shooting Range grays out and disables the Enemy group, starting a Zombie Survival run behaves identically to checkpoint 8.5, starting a Shooting Range run behaves identically to checkpoint 8.5's Shooting Range, and the death panel's Main Menu button still performs a full respawn rather than returning to this screen.
```

- [ ] **Step 4: Add decisions log entries**

Append after the last existing decisions-log line (the `main.ts` `ACTIVE_MODE` one), before `## Future mechanics`:

```
- `ui/MainMenu.ts` (checkpoint 9) is a separate file from `ui/HUD.ts`, not the "menus live in HUD.ts" shape the original folder-structure plan assumed (see the corrected folder-structure entry above) — the menu's lifecycle (constructed once at page load, destroyed the moment Start is pressed) is fundamentally different from HUD's (constructed once, then updated every frame for the entire session), so combining them would mix two unrelated lifecycles into one file, against the single-responsibility-per-file rule.
- `ui/MainMenu.ts` receives `Weapon[]`/`EnemyDef[]` as constructor arguments from `main.ts` rather than importing `content/weapons.ts`/`content/enemies.ts` directly — `main.ts` is already established as the composition root that owns all `content/*.ts` imports (see the checkpoint-5 decisions above), and `ui/HUD.ts` never imports `content/` either; keeping `ui/MainMenu.ts` symmetrical with that existing pattern keeps every `ui/` file a pure presentation layer over data it's handed, not a second place that reaches into `content/` on its own.
- The menu is a single screen with three selection groups, not three sequential screens, deliberately: with only two modes and one weapon/enemy currently in `content/`, a multi-screen wizard would be pure overhead for the current content volume. Not a permanent design — revisit and split into multiple screens if/when the option lists grow long enough that one screen gets crowded.
- `main.ts`'s entire former module-level initialization body was moved into a `startGame(selections: GameSelections)` function (checkpoint 9), called exactly once from the `MainMenu`'s `onStart` callback. `RaycastRegistry` and every other checkpoint-8.5 singleton that used to be constructed at module scope now constructs inside `startGame()` instead — even though `startGame()` only runs once this checkpoint, scoping construction there now avoids a stale-registry bug later, when a real mid-session "Main Menu" (not built yet) would need to call `startGame()` a second time.
- **Superseded at checkpoint 9** (was: "**Full 'Main Menu' behavior**: the button currently just calls the same respawn logic as 'Respawn' — checkpoint 9 gives it a real mode-select/loadout screen to return to instead."): checkpoint 9 only adds a *load-time* menu, shown once before gameplay starts. The death panel's "Main Menu" button is deliberately left as a `startNewRun()`/Respawn alias, unchanged — building a real mid-session return to `ui/MainMenu.ts` is a bigger problem than adding the load-time screen: it means tearing down and reconstructing the entire active `GameMode`/scene/`RaycastRegistry`/etc. without a page reload, which nothing in `startGame()`'s current one-shot design attempts. That teardown/reconstruction remains the eventual goal, just not this step — see "Future mechanics" below.
```

- [ ] **Step 5: Update "Future mechanics"**

Replace the existing line:

```
- **Full "Main Menu" behavior**: the button currently just calls the same respawn logic as "Respawn" — checkpoint 9 gives it a real mode-select/loadout screen to return to instead.
```

with:

```
- **A real mid-session "Main Menu"**: the death panel's "Main Menu" button is still just a `startNewRun()`/Respawn alias (checkpoint 9's menu is load-time only, see the decisions log). Making it actually return to `ui/MainMenu.ts` mid-session requires tearing down and reconstructing the active `GameMode`, scene contents, and `RaycastRegistry` (and everything else `startGame()` currently constructs once) without a page reload — `startGame()` is deliberately structured as a function that *can* be called again later for this reason, but nothing calls it a second time yet. Remains the eventual goal, not attempted this checkpoint.
```

Append one new line at the end of the section:

```
- **`EnemyDef` has no player-facing display-name field**: unlike `Weapon.name`, `EnemyDef` has no separate display text from its `id` — `ui/MainMenu.ts`'s enemy-select buttons currently show the raw id (e.g. "zombie"). Fine with a single enemy type; worth adding an `EnemyDef.name` field (mirroring `Weapon.name`) once a second enemy type makes raw ids feel unpolished in the menu.
```

- [ ] **Step 6: Verify the project still builds after the doc edit**

Run: `npm run build`
Expected: succeeds (CLAUDE.md changes don't affect compilation, but this confirms nothing else was accidentally left in a broken state).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Checkpoint 9: main menu at load time (mode/weapon/enemy select)

Adds ui/MainMenu.ts, a one-time DOM overlay shown before gameplay: a
single screen with Mode/Weapon/Enemy selection groups (generated from
content/weapons.ts and content/enemies.ts) plus a Start Game button.
main.ts's entire initialization body now lives inside a startGame()
function that only runs once the menu confirms a choice, replacing the
hardcoded ACTIVE_MODE constant. The death panel's "Main Menu" button is
unchanged (still a Respawn alias) — a mid-session return to this menu
is deliberately deferred, logged in CLAUDE.md's future mechanics.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Verify the commit**

Run: `git status` and `git log -1 --stat`
Expected: working tree clean; the commit lists `src/ui/MainMenu.ts` (new), `src/main.ts` (modified), `CLAUDE.md` (modified), plus this plan doc.

---

## Self-Review Notes

- **Spec coverage:** `ui/MainMenu.ts` as a separate file (Task 1) ✓; single-screen design with 3 groups + Start (Task 1) ✓; mode options list, weapon/enemy options iterated from `content/*.ts` with first-entry defaults (Task 1) ✓; enemy group disabled/grayed for "range" mode (Task 1, `selectMode`) ✓; `startGame(selections)` restructuring with nothing at module load (Task 2) ✓; `ACTIVE_MODE` removed entirely (Task 2) ✓; `WeaponSystem`/`ZombieSurvival` constructed from `selections` via `findById` (Task 2) ✓; pointer-lock/click-to-lock unreachable until Start pressed, since `canvas.addEventListener("click", ...)` only exists inside `startGame()`, and the menu's full-viewport `pointerEvents: "auto"` root captures all clicks until then (Task 2) ✓; `RaycastRegistry` constructed inside `startGame()`, not module scope (Task 2, explicit user note) ✓; death-panel "Main Menu" unchanged (Task 2 — `startNewRun` untouched) ✓, verified (Task 3, Step 6) ✓; CLAUDE.md status/checkpoints/decisions/future-mechanics updates + commit named "checkpoint 9" (Task 4) ✓.
- **Type consistency check:** `MainMenu` constructor signature `(weapons: Weapon[], enemies: EnemyDef[], onStart: (selections: GameSelections) => void)` in Task 1 matches the call site `new MainMenu(WEAPONS, ENEMIES, (selections) => {...})` in Task 2 exactly (`WEAPONS: Weapon[]`, `ENEMIES: EnemyDef[]` from existing content files). `GameSelections` field names (`modeId`, `weaponId`, `enemyId`) match every read site in Task 2 (`selections.modeId`, `selections.weaponId`, `selections.enemyId`). `ModeId` values (`"zombie" | "range"`) match the `selections.modeId === "zombie"` ternary in Task 2 exactly, with no cast needed this time (unlike the old `ACTIVE_MODE as ModeName` workaround) since `selections.modeId` is a plain parameter of type `ModeId`, never narrowed to a literal.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code; no "similar to Task N" shorthand.
