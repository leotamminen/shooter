# shooter

Lightweight browser FPS, box-based levels, data-driven content. Three.js/Vite/TS.

## Architecture rules (non-negotiable)

- `core/` never references `content/` or `modes/` directly — it only consumes typed interfaces.
- All game content (weapons, enemies, maps, sounds) lives in `content/*.ts` as typed data, never hardcoded in logic.
- New game modes are built hardcoded first; a `GameMode` interface is only extracted once a second mode proves the shape is right.
- No physics engine — manual collision only; player is represented as a radius/circle (not a box), since later systems (pickup range, melee range) will want a "distance from player" concept anyway.
- Single-responsibility per file: one class/system per file, file name matches it; split by responsibility, not by line count — a file mixing unrelated concerns must be split regardless of length; if a file's job needs "and" to describe, it's two files.
- Shared/reusable logic (math helpers, raycasting, state machines) goes in `core/utils/`, never duplicated inline.

## Workflow rule

`git init` at project start if not already a repo. Commit at the end of every checkpoint with a message naming which checkpoint was completed. This applies to every future session, not just this one.

## Folder structure

Full intended tree for the whole project, annotated with which checkpoint introduces each file. This is documentation only — files are created when the checkpoint that needs them is reached, not before. This tree is the single source of truth for where future files go.

```
src/
  main.ts                       [1]
  content/
    weapons.ts                  [1, populated at 5]
    enemies.ts                  [1, populated at 5]
    maps.ts                     [1, populated at 5]
    sounds.ts                   [1, populated across 2/4/9]
  core/
    Scene.ts                    [1]
    PlayerController.ts         [1]
    MapLoader.ts                [1]
    WeaponSystem.ts             [2]
    InteractSystem.ts           [3]
    EnemyAI.ts                  [4]
    AudioSystem.ts              [2]
    PlayerState.ts              [4.5, player health/lifecycle — see decisions log]
    utils/
      Raycast.ts                [1]
      StateMachine.ts           [4]
      Health.ts                 [4.5]
  modes/
    GameMode.ts                 [8]
    ZombieSurvival.ts           [7]
    ShootingRange.ts            [8]
  state/
    GameState.ts                [1]
  ui/
    HUD.ts                      [3.5, gameplay overlay: crosshair/ammo/reload/interact prompts]
                                 [9 adds separate menu screens here: mode select, loadout, enemy select]
  types/
    index.ts                    [1]
```

## Checkpoints

1. Vite+TS+Three.js scaffold, box room, PointerLockControls, WASD + manual radius-vs-wall collision
2. Hitscan shooting (mouse1, raycast) + ammo/reload state + weapon fire sound (AudioSystem)
3. E-interact raycast
3.5. HUD (crosshair, ammo display, reload/interact prompts)
4. One hardcoded zombie: state machine + line-of-sight raycast + zombie sounds
4.5. Enemy health-label occlusion fix + player death handling (alive/dead state)
4.6. Points system (score for hits and kills, displayed in HUD)
5. content/ files (weapons.ts, enemies.ts, maps.ts, sounds.ts) + id-lookup; move zombie/weapon/map from hardcoded to data-driven
6. Map schema extended with entities (doors, buttons, pickups)
7. ZombieSurvival mode, hardcoded, as its own module in modes/
8. Shooting Range mode added → GameMode interface extracted now that two real modes exist
9. Menus (mode select, loadout, enemy select) + ambience/music

## Current status

Checkpoint 4.6 complete. The fire sound (`public/sounds/pistol_fire.wav`) and the zombie growl/death sounds (`public/sounds/zombie_growl.wav`, `zombie_death.wav`) are all synthesized placeholders (Node-generated tones), not real recordings — swap them for real audio in a later checkpoint (9, ambience/music, is the natural point to revisit all placeholder audio).

Note: the original checkpoint 4 scope (state machine + line-of-sight + sounds) didn't explicitly cover damage/kill mechanics, and no later checkpoint claimed them either, so they were added at checkpoint 4 rather than left to silently expand checkpoint 7's scope. Player death is now handled (checkpoint 4.5: `playerState` flips to `"dead"`, freezing movement/firing, "YOU DIED" shown). Respawn/reset and anything past "YOU DIED" are still deferred — see the decisions log and the new "Future mechanics" section below.

## Decisions log

- No physics engine: manual collision, chosen for full control and zero dependency weight.
- Hitscan only, no projectile physics, for simplicity.
- Player collision is radius-based, not box-based: simpler wall resolution, reusable later as a general distance-from-player check.
- Audio via Three.js native AudioListener/PositionalAudio, no external library.
- Weapon fire sound is non-positional (`SoundDef.positional: false`): heard the same regardless of player position since it's always the local player firing; positional audio is deferred to checkpoint 4 (zombie growls), the first sound that actually needs a 3D source.
- Placeholder fire sound is a synthesized WAV (short decaying sine click), generated programmatically since no real audio asset was available — flagged for replacement, not meant to ship.
- `MapLoader.loadMap()` exposes raw wall meshes (`walls: THREE.Mesh[]`) alongside `wallBoxes` (checkpoint 2): a `Box3` isn't raycastable, so `WeaponSystem` needed the actual scene objects to hit-test against. `InteractSystem` (checkpoint 3) reuses the same `walls` array for its own raycast, combined with whatever interactables are in range — one shared list of "things that can occlude or receive a ray," no duplicate wall representation.
- Interactable objects are tagged via `mesh.userData.interactable = true`, not by name/convention matching, so `InteractSystem`'s check is a plain property lookup regardless of what the object is named.
- Line-of-sight blocking for interact/hitscan comes for free from raycasting against a combined target list (walls + interactables) and taking the nearest hit — no separate occlusion check needed.
- `Weapon.name` added as a separate field from `Weapon.id` — id is the data lookup key, name is player-facing display text.
- HUD (`ui/HUD.ts`) is a plain DOM overlay, not part of the Three.js scene: absolutely positioned, `pointer-events: none` so it never steals clicks from the canvas (pointer lock, firing, interact all still work). It reads only from `GameState`; `WeaponSystem`/`InteractSystem` write their relevant fields to `GameState` every frame. This replaces the checkpoint-2/3 `console.log` observability, which has been removed now that the same information is visible on screen.
- The 1-second delay before showing "Press R to reload" is tracked inside `HUD.ts` itself (a local `emptySince` timestamp), not in `WeaponSystem` or `GameState` — it's presentation timing, not a gameplay rule, so it belongs with the thing that renders it.
- Damage sources use a generic `userData.onHit(damage)` callback on the target mesh, the same pattern as `userData.interactable` — `WeaponSystem` calls whatever hook exists on the object it hit and never imports `EnemyAI`. Any future damageable object (barrels, other enemies) plugs into `WeaponSystem` for free by setting this one field.
- The floating enemy health label (current/max, projected above the enemy's head via `camera.project()`) is a debug/test aid for verifying damage and state transitions, not a final UI choice — it should be replaced with a real health bar, hidden, or otherwise redesigned once the game is closer to presentable. Noted here so it isn't mistaken for a deliberate design decision later. Checkpoint 4.5 fixed a bug where it showed through walls (it's now hidden whenever a wall occludes the enemy or the enemy is behind the camera), but its status as a placeholder is unchanged.
- `core/utils/Health.ts` centralizes "clamp damage at 0, fire a callback exactly once on crossing to zero" as a plain function (`applyDamage(current, amount, onZero?) → number`), not a class — it doesn't own any state itself, the caller still stores the returned value. This is the same reuse reasoning as `Raycast.ts`/`StateMachine.ts`: both the enemy's own health (in `EnemyAI`) and the player's health (in `PlayerState`) route through it instead of duplicating "clamp and detect zero" twice.
- `GameState.playerState` is a string union (`"alive" | "dead"`), not a boolean, because a future `"downed"` value (perk-gated revive, not built yet) sits between them — a boolean would force a breaking type change later. See "Future mechanics" below.
- Player health/lifecycle logic lives in its own file, `core/PlayerState.ts`, rather than in `PlayerController` or `WeaponSystem`: those two are movement-only and firing-only per the single-responsibility rule, and "what happens when health hits zero" isn't either of those things. `PlayerController` and `WeaponSystem` only read `gameState.playerState` to decide whether to no-op; only `PlayerState.applyDamage()` (called by whatever deals the damage, e.g. `EnemyAI`) is allowed to change it.
- Score (`gameState.score`) is awarded from inside `EnemyAI.takeDamage()` — the same method that already routes through `applyDamage()` — rather than from `WeaponSystem`'s generic `onHit` call site: `WeaponSystem` fires the hook on anything with `userData.onHit` (currently only the zombie) and has no notion of "this hit was worth points," so scoring stays with the thing that knows it died, not the thing that pulled the trigger. +10 is applied unconditionally on every processed hit; +50 is applied inside the same `applyDamage()` call's `onZero` callback, so a killing shot stacks both in one `takeDamage()` invocation rather than the two being alternatives.

## Future mechanics (documented, not built)

Ideas that came up while implementing checkpoint 4.5 but are deliberately out of scope until a later checkpoint gives them a real home. Listed so they're designed-for-later, not forgotten.

- **Downed/revive state for the player**: a third `playerState` value (e.g. `"downed"`) between `"alive"` and `"dead"`, gated behind a perk that doesn't exist yet. The string-union type was chosen specifically so adding this later doesn't require touching every call site that currently checks `=== "alive"` as a boolean-like condition.
- **Equivalent downed ("crawler") state for enemies**: an enemy that, below some health threshold, becomes slower and weaker instead of dying outright — reusing the same state-union pattern as the player's.
- **Perk system framework**: not designed yet. The downed/revive mechanic above depends on it existing first.
- **Post-death flow beyond "YOU DIED"**: spectate mode, a "you survived N rounds" summary screen, restart/respawn. All of this depends on game-mode/wave logic that doesn't exist until checkpoint 7 (`ZombieSurvival`), so it can't be designed concretely yet.
- **Spending points**: weapon wall-buys and paid interacts, extending `MapEntity`'s existing `"button"`/`"pickup"` types with a cost field. Not designed yet — depends on the map-entity work in checkpoint 6 and the content-driven weapons from checkpoint 5 both being in place first.
