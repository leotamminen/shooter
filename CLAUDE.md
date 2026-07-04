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
    utils/
      Raycast.ts                [1]
      StateMachine.ts           [4]
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
5. content/ files (weapons.ts, enemies.ts, maps.ts, sounds.ts) + id-lookup; move zombie/weapon/map from hardcoded to data-driven
6. Map schema extended with entities (doors, buttons, pickups)
7. ZombieSurvival mode, hardcoded, as its own module in modes/
8. Shooting Range mode added → GameMode interface extracted now that two real modes exist
9. Menus (mode select, loadout, enemy select) + ambience/music

## Current status

Checkpoint 3.5 complete. The fire sound (`public/sounds/pistol_fire.wav`) is a synthesized placeholder click (Node-generated decaying sine beep), not a real recording — swap it for real audio in a later checkpoint (9, ambience/music, is the natural point to revisit all placeholder audio).

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
