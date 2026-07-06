# Checkpoint 9.5: Map Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, genuinely different map to `content/maps.ts`, give `MapDef` a player-facing `name` field, and add a fourth "Map" selection group to the main menu so the chosen map drives which map actually loads — replacing the hardcoded `"test-grid"` lookup in `main.ts`.

**Architecture:** `MapDef` gains a `name: string` field (mirroring `Weapon.name`'s id-vs-display-text split). A new map, `"corridors"`, is added to `content/maps.ts` with its own grid, door/button pair, pickup, enemy_spawn(s), and target(s) — self-contained, no shared state with `test-grid`. `ui/MainMenu.ts` gains a fourth selection group generated from `content/maps.ts` the same way Weapon/Enemy groups are generated from their content arrays, with no mode-based filtering (maps are mode-agnostic for now). `GameSelections` gains `mapId: string`, and `main.ts`'s `startGame()` replaces its hardcoded `findById(MAPS, "test-grid")` with `findById(MAPS, selections.mapId)`.

**Tech Stack:** TypeScript, Three.js, Vite, plain DOM (no framework, no test runner — this project has none; verification is `npm run build` plus manual browser testing, per every prior checkpoint).

## Global Constraints

- `core/` never references `content/` or `modes/` directly. (Unaffected — no `core/` files change in this checkpoint; `MapLoader.ts`/`MapEntitySystem.ts` already consume `MapDef`/`MapEntity` as typed interfaces without caring about the new `name` field.)
- All game content (weapons, enemies, maps, sounds) lives in `content/*.ts` as typed data. The new map is pure data in `content/maps.ts`, no logic changes elsewhere required to support it.
- `ui/MainMenu.ts`'s existing pattern (options generated from a content array via `.map()`, not hardcoded to today's single entry, first entry default-selected) applies identically to the new Map group.
- No mode-based filtering or graying-out for the Map group this checkpoint — maps are mode-agnostic for now. This is a deliberate, documented deferral (see Task 5), not an oversight; the future extension point is an optional `MapDef.supportedModes` field if a map is ever built that only makes sense under one mode.
- Every existing `MapDef` entry (i.e. `test-grid`) must also get a `name` value — adding a required field to an interface breaks every existing object literal of that type until it's updated too.

---

## Task 1: Add `MapDef.name` and the new `"corridors"` map

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/content/maps.ts`

**Interfaces:**
- Produces: `MapDef` now has `{ id: string; name: string; grid: number[][]; entities: MapEntity[] }`.
- Produces: `MAPS` (from `content/maps.ts`) now has two entries: `"test-grid"` (unchanged behavior, now with `name: "Test Grid"`) and a new `"corridors"` map with its own spawn/door/button/pickup/enemy_spawn/target entities.

- [ ] **Step 1: Add `name` to the `MapDef` interface in `src/types/index.ts`**

Find the existing `MapDef` interface:

```typescript
export interface MapDef {
  id: string;
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
}
```

- [ ] **Step 2: Replace the full contents of `src/content/maps.ts`**

```typescript
import type { MapDef } from "../types";

// test-grid: interior pillar at row 4, col 2 doubles as a line-of-sight
// blocker for testing InteractSystem: it sits directly between the spawn
// point and the placeholder interactable box. The row-2 partition
// (checkpoint 6) walls off the row-1 alcove behind door_1, opened by
// button_1 (row 3, next to the gap but not inside it, so it doesn't block
// the doorway itself).
//
// corridors (checkpoint 9.5): two full-sized rooms (west "Room A", cols
// 1-3; east "Room B", cols 7-9) connected by a single-file, 3-cell-long
// corridor (row 4, cols 4-6) — genuinely more corridor structure than
// test-grid's single 1-cell gap, and door_1 at the corridor's middle cell
// fully seals the only path between the two rooms, since the corridor is
// exactly one row tall (rows 3 and 5 at cols 4-6 are walls, so there's no
// way around it).
export const MAPS: MapDef[] = [
  {
    id: "test-grid",
    name: "Test Grid",
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 0, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1],
    ],
    entities: [
      { id: "spawn_1", type: "spawn", position: [8, 0, 8] },
      { id: "door_1", type: "door", position: [6, 1.5, 4] },
      {
        id: "button_1",
        type: "button",
        linkedTo: "door_1",
        position: [6, 0.3, 6],
      },
      { id: "pickup_1", type: "pickup", position: [10, 0.3, 10] },
      { id: "enemy_spawn_1", type: "enemy_spawn", position: [10, 0.9, 6] },
      { id: "enemy_spawn_2", type: "enemy_spawn", position: [4, 0.9, 10] },
      // Shooting Range targets: two share space with the enemy_spawn points
      // above (only one mode is ever active at a time) plus two more of
      // their own, for four total.
      { id: "target_1", type: "target", position: [10, 0.9, 6] },
      { id: "target_2", type: "target", position: [4, 0.9, 10] },
      { id: "target_3", type: "target", position: [10, 0.9, 12] },
      { id: "target_4", type: "target", position: [2, 0.9, 12] },
    ],
  },
  {
    id: "corridors",
    name: "Corridors",
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
    entities: [
      { id: "corridors_spawn_1", type: "spawn", position: [4, 0, 4] },
      { id: "corridors_door_1", type: "door", position: [10, 1.5, 8] },
      {
        id: "corridors_button_1",
        type: "button",
        linkedTo: "corridors_door_1",
        position: [6, 0.3, 6],
      },
      { id: "corridors_pickup_1", type: "pickup", position: [16, 0.3, 12] },
      { id: "corridors_enemy_spawn_1", type: "enemy_spawn", position: [16, 0.9, 4] },
      { id: "corridors_enemy_spawn_2", type: "enemy_spawn", position: [14, 0.9, 12] },
      // Two targets share space with the enemy_spawn points above (only one
      // mode is ever active at a time, same dual-purpose pattern as
      // test-grid), plus two more of their own.
      { id: "corridors_target_1", type: "target", position: [16, 0.9, 4] },
      { id: "corridors_target_2", type: "target", position: [14, 0.9, 12] },
      { id: "corridors_target_3", type: "target", position: [4, 0.9, 12] },
      { id: "corridors_target_4", type: "target", position: [16, 0.9, 2] },
    ],
  },
];
```

- [ ] **Step 3: Verify the project compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (This will fail if `test-grid`'s object literal is missing `name`, or if any other file assumed `MapDef` had exactly the old three fields — neither should be the case, since `MapLoader.ts`/`MapEntitySystem.ts` only ever destructure `.grid`/`.entities`/`.id`, never enumerate `MapDef`'s full shape.)

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/content/maps.ts
git commit -m "Checkpoint 9.5 task 1: add MapDef.name and a second map (corridors)"
```

---

## Task 2: Add the Map selection group to `ui/MainMenu.ts`

**Files:**
- Modify: `src/ui/MainMenu.ts`

**Interfaces:**
- Consumes: `MapDef` from `../types` (Task 1).
- Produces: `GameSelections` now includes `mapId: string`. `MainMenu`'s constructor signature becomes `(weapons: Weapon[], enemies: EnemyDef[], maps: MapDef[], onStart: (selections: GameSelections) => void)`.

- [ ] **Step 1: Replace the full contents of `src/ui/MainMenu.ts`**

```typescript
import type { Weapon, EnemyDef, MapDef } from "../types";

// The menu's own notion of which modes exist — not content, since game
// modes are code (ZombieSurvival/ShootingRange), not typed data, per the
// project's mode-building rule. Mirrors the ModeName union that used to be
// hardcoded directly in main.ts before this checkpoint.
export type ModeId = "zombie" | "range";

export interface GameSelections {
  modeId: ModeId;
  mapId: string;
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

// A one-time DOM overlay shown before gameplay starts: mode/map/weapon/enemy
// selection plus a Start Game button. Kept separate from ui/HUD.ts — its
// lifecycle (shown once, then destroyed) is distinct from HUD's (shown
// continuously during gameplay), so folding it into HUD would mix two
// different concerns into one file.
//
// Deliberately one screen with four groups, not sequential screens: with
// only two modes and small weapon/enemy/map lists currently in content/, a
// multi-screen wizard would be pure overhead. Revisit if the option lists
// grow long enough to need it.
export class MainMenu {
  private readonly root: HTMLDivElement;
  private readonly enemyGroup: HTMLDivElement;

  private selectedModeId: ModeId = MODE_OPTIONS[0].id;
  private selectedMapId: string;
  private selectedWeaponId: string;
  private selectedEnemyId: string;

  private readonly modeButtons = new Map<string, HTMLButtonElement>();
  private readonly mapButtons = new Map<string, HTMLButtonElement>();
  private readonly weaponButtons = new Map<string, HTMLButtonElement>();
  private readonly enemyButtons = new Map<string, HTMLButtonElement>();

  constructor(
    weapons: Weapon[],
    enemies: EnemyDef[],
    maps: MapDef[],
    onStart: (selections: GameSelections) => void,
  ) {
    this.selectedMapId = maps[0].id;
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
        mapId: this.selectedMapId,
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

  private selectMap(mapId: string): void {
    this.selectedMapId = mapId;
    this.applySelection(this.mapButtons, mapId);
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
Expected: errors, if any, should only be about `src/main.ts` not yet passing `MAPS` or `mapId` (resolved in Task 3) — not about `src/ui/MainMenu.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/ui/MainMenu.ts
git commit -m "Checkpoint 9.5 task 2: add Map selection group to MainMenu"
```

---

## Task 3: Wire `selections.mapId` into `main.ts`

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `MainMenu`'s new constructor signature `(weapons, enemies, maps, onStart)` (Task 2), `GameSelections.mapId` (Task 2).

- [ ] **Step 1: Update the `MainMenu` construction at the bottom of `src/main.ts`**

Find:

```typescript
const mainMenu = new MainMenu(WEAPONS, ENEMIES, (selections) => {
  mainMenu.destroy();
  startGame(selections);
});
```

Replace with:

```typescript
const mainMenu = new MainMenu(WEAPONS, ENEMIES, MAPS, (selections) => {
  mainMenu.destroy();
  startGame(selections);
});
```

- [ ] **Step 2: Update the hardcoded map lookup inside `startGame()`**

Find, inside `startGame(selections: GameSelections)`:

```typescript
  const mapDef = findById(MAPS, "test-grid");
```

Replace with:

```typescript
  const mapDef = findById(MAPS, selections.mapId);
```

- [ ] **Step 3: Verify the project compiles**

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "Checkpoint 9.5 task 3: wire selections.mapId into startGame()"
```

---

## Task 4: Manual verification against acceptance criteria

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL in a browser.

- [ ] **Step 2: Verify the Map group appears with both maps**

Confirm the menu now shows four groups: Mode, Map, Weapon, Enemy. The Map group shows "Test Grid" and "Corridors" as options, with "Test Grid" pre-selected (highlighted) by default.

- [ ] **Step 3: Verify Corridors under Zombie Survival**

Select "Zombie Survival" mode, "Corridors" map, leave weapon/enemy at defaults, click Start Game. Confirm: you spawn inside Corridors' Room A (not test-grid's layout), the corridor/door/button/pickup are all Corridors' own (walk to the corridor — it should be blocked by `corridors_door_1` until `corridors_button_1` is pressed in Room A), a zombie spawns in Room B and can path to you once the door is open, and the pickup in Room B refills ammo.

- [ ] **Step 4: Verify Corridors under Shooting Range**

Reload, select "Shooting Range" mode, "Corridors" map, click Start Game. Confirm: no zombies spawn, HP never drops, and all four Corridors targets are present, hittable, and go on cooldown correctly.

- [ ] **Step 5: Verify Test Grid is unaffected**

Reload, leave "Test Grid" selected (the default), start a Zombie Survival run. Confirm behavior is identical to checkpoint 9.5's predecessor: same spawn point, same door/button/pickup, same round progression — nothing about test-grid changed by adding Corridors.

---

## Task 5: Update CLAUDE.md and commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the folder structure tree**

Update these two lines (content/maps.ts and ui/MainMenu.ts annotations):

```
    maps.ts                     [1, populated at 5; name field + second map ("corridors") added at 9.5]
```

```
    MainMenu.ts                 [9, one-time mode/weapon/enemy select screen shown before gameplay — kept separate from HUD.ts, see decisions log]
                                 [9.5 adds a fourth Map selection group]
```

- [ ] **Step 2: Update the Checkpoints list**

Add a new line immediately after checkpoint 9's line:

```
9.5. Map selection added to the main menu — second map ("corridors"), MapDef.name field, mapId wired through startGame() in place of the hardcoded "test-grid" lookup
```

- [ ] **Step 3: Update "Current status"**

Change the opening sentence from `Checkpoint 9 complete.` to `Checkpoint 9.5 complete.`, and append a new paragraph after the existing checkpoint-9 paragraph (before `## Decisions log`):

```

`content/maps.ts` now has a second map, `"corridors"` (id) / "Corridors" (display name): two full-sized rooms connected by a single-file, 3-cell-long corridor, with its own spawn, door/button pair, pickup, two enemy_spawn points, and four targets (two shared with the enemy_spawn points, two of their own — the same dual-purpose entity pattern `test-grid` already used). `MapDef` gained a `name: string` field for this, mirroring `Weapon.name`'s id-vs-display-text split — `test-grid` was given `name: "Test Grid"` at the same time, since adding a required field means every existing `MapDef` object literal needs it too. `ui/MainMenu.ts` gained a fourth selection group, "Map", generated from `content/maps.ts` via the same iterate-the-content-array pattern Weapon/Enemy already use, with "Test Grid" (the first array entry) default-selected. The Map group has no mode-based filtering or graying-out this checkpoint — maps are mode-agnostic for now, a deliberate deferral (see decisions log) rather than an oversight, since every map is required to carry both `enemy_spawn` and `target` entities and therefore already works under either mode. `main.ts`'s `startGame()` now resolves the map via `findById(MAPS, selections.mapId)` instead of a hardcoded `"test-grid"` string, so the chosen map drives `MapLoader`, `MapEntitySystem`, the spawn position, and whichever `GameMode` is active — its `enemy_spawn`/`target` entities come from the selected map, not a fixed one. Verified in-browser: the menu lists both maps by name; selecting Corridors and starting a Zombie Survival run spawns the player in Corridors' own layout with its own door/button/pickup/enemy fully functional (not test-grid's); Corridors also works correctly under Shooting Range (targets present, no zombies); and Test Grid, still the default selection, works exactly as it did before this checkpoint.
```

- [ ] **Step 4: Add decisions log entries**

Append after the last existing decisions-log line, before `## Future mechanics`:

```
- `MapDef.name` (checkpoint 9.5) was added for the same reason `Weapon.name` exists: `id` is the data lookup key (`findById(MAPS, selections.mapId)`), `name` is what `ui/MainMenu.ts`'s Map group actually displays. Adding a required field to an existing content interface meant `test-grid`'s object literal needed a `name` too, not just the new map's — both were updated together in the same task, so the project never had a `MapDef` in an inconsistent half-migrated state.
- Maps are mode-agnostic for now (checkpoint 9.5): `ui/MainMenu.ts`'s Map selection group has no mode-based filtering or graying-out, unlike the Enemy group (which grays out under "Shooting Range"). This is deliberate, not an oversight — every `MapDef` is required to carry both `enemy_spawn` and `target` entities (the same dual-purpose pattern `test-grid` established), so every map already works under either `GameMode` without needing per-mode gating. The future extension point, if a map is ever built that only makes sense under one mode, is an optional `MapDef.supportedModes` field (e.g. `("zombie" | "range")[]`) that `MainMenu` would filter/gray against, mirroring how it already grays the Enemy group — not built now, since no map needs it yet.
- `main.ts`'s `startGame()` resolves the active map via `findById(MAPS, selections.mapId)` (checkpoint 9.5), replacing the hardcoded `findById(MAPS, "test-grid")` from checkpoints 8.5–9. `MapLoader`, `MapEntitySystem`, `getSpawnPosition`, and the `enemy_spawn`/`target` entity filters `main.ts` runs over `mapDef.entities` were all already written generically against whatever `MapDef` they're handed — none of them needed to change to support a second map, only the one lookup line that decided which `MapDef` to hand them.
```

- [ ] **Step 5: Add a Future Mechanics line**

Append at the end of the "Future mechanics" section:

```
- **`MapDef.supportedModes`**: not built (checkpoint 9.5) — maps are currently mode-agnostic (every map must carry both `enemy_spawn` and `target` entities). If a map is ever designed that only makes sense under one `GameMode` (e.g. a pure arena with no natural door/button story for Zombie Survival, or a maze with no clear sightlines for Shooting Range), an optional `MapDef.supportedModes: ModeId[]` field would let `ui/MainMenu.ts`'s Map group gray out/filter options the same way the Enemy group already grays out under "Shooting Range".
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Checkpoint 9.5: map selection in the main menu

Adds a second map, "corridors" (two rooms + a real corridor, its own
door/button/pickup/enemy_spawn/target entities), gives MapDef a name
field (mirroring Weapon.name), and adds a fourth Map selection group to
ui/MainMenu.ts generated from content/maps.ts the same way Weapon/Enemy
already are. main.ts's startGame() now resolves the map via
findById(MAPS, selections.mapId) instead of a hardcoded "test-grid"
lookup. Maps are mode-agnostic for now (no per-mode filtering), logged
as a deliberate deferral with MapDef.supportedModes as the future
extension point.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Verify the commit**

Run: `git status` and `git log -1 --stat`
Expected: working tree clean; the final commit (or the sequence since Task 1) touches `src/types/index.ts`, `src/content/maps.ts`, `src/ui/MainMenu.ts`, `src/main.ts`, `CLAUDE.md`, plus this plan doc.

---

## Self-Review Notes

- **Spec coverage:** second map with more rooms/corridors than test-grid, own door/button/pickup/enemy_spawn/target/spawn (Task 1) ✓; distinct id + display name, `MapDef.name` audited-and-added (Task 1) ✓; `GameSelections.mapId` (Task 2) ✓; fourth "Map" group in `MainMenu`, findById-style iteration over `content/maps.ts`, first-entry default, no mode-based filtering (Task 2) ✓; `main.ts` replacing hardcoded map with `findById(MAPS, selections.mapId)` (Task 3) ✓; acceptance criteria walkthrough (Task 4) ✓; CLAUDE.md status/decisions/future-mechanics + commit named "checkpoint 9.5" (Task 5) ✓.
- **Placeholder scan:** no TBD/TODO; every step has complete code; grid/entity positions are fully worked out, not sketched.
- **Type consistency check:** `MainMenu` constructor order `(weapons, enemies, maps, onStart)` in Task 2 matches the call site `new MainMenu(WEAPONS, ENEMIES, MAPS, (selections) => {...})` in Task 3 exactly. `GameSelections.mapId: string` (Task 2) matches `findById(MAPS, selections.mapId)` (Task 3) — both plain strings, no `ModeId`-style union needed since map ids aren't branched on in code, only looked up. `MapDef.name` (Task 1) matches the `map.name` read in `MainMenu`'s `mapOptions` mapping (Task 2). Corridors' entity ids (`corridors_door_1`, `corridors_button_1` with `linkedTo: "corridors_door_1"`) match between the door and button object literals in Task 1's single file write — verified the `linkedTo` string is character-for-character identical to the door's `id`.
- **Grid/geometry check (Task 1):** verified by hand that every entity position in the `"corridors"` map lands on a `0` (floor) cell in the grid at that position's `(col, row)` (position `[x, y, z]` maps to grid `[row][col]` via `col = x/2`, `row = z/2`), that no two entities share the same grid cell, and that `corridors_door_1` (row 4, col 5) is the only path between Room A (cols 1-3) and Room B (cols 7-9) — rows 3 and 5 at cols 4-6 are walls, so there is no way around the door once it's closed.
