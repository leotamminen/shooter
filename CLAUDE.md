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
  ui/                           [9]
  types/
    index.ts                    [1]
```

## Checkpoints

1. Vite+TS+Three.js scaffold, box room, PointerLockControls, WASD + manual radius-vs-wall collision
2. Hitscan shooting (mouse1, raycast) + ammo/reload state + weapon fire sound (AudioSystem)
3. E-interact raycast
4. One hardcoded zombie: state machine + line-of-sight raycast + zombie sounds
5. content/ files (weapons.ts, enemies.ts, maps.ts, sounds.ts) + id-lookup; move zombie/weapon/map from hardcoded to data-driven
6. Map schema extended with entities (doors, buttons, pickups)
7. ZombieSurvival mode, hardcoded, as its own module in modes/
8. Shooting Range mode added → GameMode interface extracted now that two real modes exist
9. Menus (mode select, loadout, enemy select) + ambience/music

## Current status

Checkpoint 1 complete

## Decisions log

- No physics engine: manual collision, chosen for full control and zero dependency weight.
- Hitscan only, no projectile physics, for simplicity.
- Player collision is radius-based, not box-based: simpler wall resolution, reusable later as a general distance-from-player check.
- Audio via Three.js native AudioListener/PositionalAudio, no external library.
