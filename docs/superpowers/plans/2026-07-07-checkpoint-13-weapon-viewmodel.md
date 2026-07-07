# Checkpoint 13: Weapon Viewmodel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a static placeholder weapon shape in the bottom-right of the screen that never clips through world geometry and disappears on player death.

**Architecture:** A new `core/WeaponViewmodel.ts` owns a second, wholly separate `THREE.Scene`/`THREE.PerspectiveCamera` pair containing one placeholder mesh parented to that camera at a fixed local offset (read from an exported `VIEWMODEL_CONFIG`). Every frame, its camera's rotation is synced from the main camera's rotation (so the mesh appears to track the player's look direction), then it is rendered as a second pass in `main.ts`'s `animate()` — after the main scene renders, the depth buffer is cleared and the viewmodel scene is drawn with a very-close-near-plane camera, guaranteeing it draws in front of world geometry regardless of actual proximity to a wall. `main.ts` (the composition root) gates both the per-frame sync and the render call on `gameState.playerState === "alive"`, so the viewmodel itself never imports `GameState` and stays a pure rendering system.

**Tech Stack:** Three.js, TypeScript (`strict`, `noUnusedParameters`, `noUnusedLocals`, `erasableSyntaxOnly` — no parameter-property constructor shorthand, no enums; declare fields then assign in the constructor body, matching `PlayerController`'s existing style), Vite.

## Global Constraints

- `core/WeaponViewmodel.ts` is a new file: rendering-only, no gameplay logic — it must not import `GameState` or make any alive/dead decision itself. `main.ts` gates calls into it on `gameState.playerState === "alive"`, the same pattern already used for `gameMode.update()`.
- One placeholder weapon mesh only (simple elongated box, generic gray/dark `MeshStandardMaterial`) — do not vary appearance by weapon; only one weapon (`pistol`) currently exists in `content/weapons.ts`, and per-weapon appearance is explicitly deferred to a later checkpoint once a second weapon exists to prove what should actually differ. This is a deliberate, spec-mandated exception to "no hardcoded content" — there is no per-weapon *data* to move into `content/` yet, since nothing varies.
- All positioning math (the mesh's local offset relative to its camera) must read from a single exported `VIEWMODEL_CONFIG` object: `{ offset: { x: number; y: number; z: number }; mirrored: boolean }`. `mirrored: true` flips the offset's `x` sign only — nothing else. Default: `{ offset: { x: 0.3, y: -0.3, z: -0.5 }, mirrored: false }` (bottom-right, per the brief).
- No settings UI, no persistence, no handedness toggle UI — `VIEWMODEL_CONFIG` being editable in source is the only adjustability this checkpoint builds.
- Depth-clip fix is mandatory: the viewmodel must render as a genuine second pass (`renderer.clearDepth()` before rendering the viewmodel scene, with the renderer's `autoClear` temporarily disabled so the depth-clear doesn't also wipe the just-drawn main-scene color buffer), using a camera with a very close near-plane (e.g. `0.01`) so its own geometry is never near-clipped at typical viewmodel distances.
- Wired into `main.ts`'s `animate()`: the viewmodel's orientation sync and render pass run immediately after `sceneManager.render()`.
- Hidden whenever `gameState.playerState !== "alive"` — implemented by skipping the render pass entirely (and the orientation sync, since there's no reason to do it when not rendering), not by toggling a `visible` flag inside `WeaponViewmodel` — this keeps the class free of any gameplay-state awareness.
- No fire/reload animation, no idle sway/bob this checkpoint — static positioning only. Both must be logged in CLAUDE.md's "Future mechanics" section as deferred, not built.
- Must work identically on both maps (`test-grid`, `corridors`) and in both modes (`ZombieSurvival`, `ShootingRange`) — the viewmodel has no map/mode awareness at all, so this falls out for free, but Task 3's manual verification must actually confirm it on both.

---

### Task 1: Create `core/WeaponViewmodel.ts`

**Files:**
- Create: `src/core/WeaponViewmodel.ts`

**Interfaces:**
- Consumes: `THREE.PerspectiveCamera` (the main camera, passed into `updateOrientation()` each frame — not stored, not imported as a type from anywhere project-specific, just the `three` library type), `THREE.WebGLRenderer` (passed into `render()` each frame).
- Produces: `export const VIEWMODEL_CONFIG: { offset: { x: number; y: number; z: number }; mirrored: boolean }` (mutable-shape object, read at construction time only — changing it after construction does not move an already-built mesh; that's fine, this checkpoint has no runtime reconfiguration UI). `export class WeaponViewmodel` with a public no-arg constructor, `updateOrientation(mainCamera: THREE.PerspectiveCamera): void`, and `render(renderer: THREE.WebGLRenderer): void`. Task 2 constructs one instance and calls both methods every frame.

- [ ] **Step 1: Write `src/core/WeaponViewmodel.ts`**

```typescript
import * as THREE from "three";

const VIEWMODEL_FOV = 50;
const VIEWMODEL_NEAR = 0.01;
const VIEWMODEL_FAR = 10;
const WEAPON_COLOR = 0x333333;
const WEAPON_WIDTH = 0.1;
const WEAPON_HEIGHT = 0.1;
const WEAPON_LENGTH = 0.4;

// The only piece of this file meant to be tuned later: every positioning
// computation below reads from this object, so a future per-weapon offset
// or a handedness toggle is a one-line change here, not a code change.
// mirrored: true flips the x offset's sign only -- nothing else about the
// mesh or camera changes.
export const VIEWMODEL_CONFIG = {
  offset: { x: 0.3, y: -0.3, z: -0.5 },
  mirrored: false,
};

// Renders the player's held weapon as a static placeholder shape, always
// drawn in front of world geometry regardless of proximity to a wall. A
// naive single-pass render (the weapon mesh parented directly into the main
// scene/camera) would clip through nearby walls, since it would share the
// main scene's depth buffer -- a wall 0.3 units away is closer to the
// camera than the far side of a viewmodel gun. Instead this owns a wholly
// separate THREE.Scene/THREE.PerspectiveCamera pair, rendered as a second
// pass after the main scene with a freshly cleared depth buffer (see
// render()) and a very close near-plane, so the depth test the second pass
// runs is only ever against this file's own (trivial) geometry.
//
// Rendering-only: this class has no notion of "alive"/"dead" or any other
// gameplay state. main.ts (the composition root) decides when to call
// updateOrientation()/render() based on gameState.playerState, the same way
// it already gates gameMode.update() -- keeping this file free of a
// GameState import.
export class WeaponViewmodel {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly weaponMesh: THREE.Mesh;

  constructor() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      VIEWMODEL_FOV,
      window.innerWidth / window.innerHeight,
      VIEWMODEL_NEAR,
      VIEWMODEL_FAR,
    );
    // The camera itself must be added to this scene (not just constructed)
    // so that its children -- the weapon mesh below -- are reachable when
    // the renderer traverses this scene's graph in render().
    this.scene.add(this.camera);

    // A dedicated scene has no lights of its own by default; without this
    // the MeshStandardMaterial below would render solid black.
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    this.weaponMesh = new THREE.Mesh(
      new THREE.BoxGeometry(WEAPON_WIDTH, WEAPON_HEIGHT, WEAPON_LENGTH),
      new THREE.MeshStandardMaterial({ color: WEAPON_COLOR }),
    );
    const offsetX = VIEWMODEL_CONFIG.mirrored
      ? -VIEWMODEL_CONFIG.offset.x
      : VIEWMODEL_CONFIG.offset.x;
    this.weaponMesh.position.set(
      offsetX,
      VIEWMODEL_CONFIG.offset.y,
      VIEWMODEL_CONFIG.offset.z,
    );
    // Child of the camera, not of the scene directly: this is what makes
    // the weapon track the player's look direction for free every frame --
    // only the camera's own rotation (synced in updateOrientation()) ever
    // changes; the mesh's local offset never does.
    this.camera.add(this.weaponMesh);

    window.addEventListener("resize", this.handleResize);
  }

  private readonly handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };

  // Matches this system's own camera rotation to the main camera's, so the
  // weapon appears to swing with the player's look direction exactly like
  // the world does. Position is never synced -- this camera stays at its
  // constructed origin forever, since the weapon mesh's fixed local offset
  // already produces the correct on-screen position regardless of the main
  // camera's world position.
  updateOrientation(mainCamera: THREE.PerspectiveCamera): void {
    this.camera.quaternion.copy(mainCamera.quaternion);
  }

  // The second render pass -- must run after the main scene's render() this
  // frame. autoClear is switched off only for this call so clearDepth()'s
  // fresh depth buffer isn't immediately re-cleared by render()'s own
  // implicit clear (which would also wipe the color buffer holding the
  // just-drawn main scene), then restored immediately after, so next
  // frame's main-scene render() still clears normally.
  render(renderer: THREE.WebGLRenderer): void {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }
}
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors. (Nothing imports this file yet, so this step only proves the new file itself is syntactically and structurally valid — `noUnusedLocals`/`noUnusedParameters` do not flag exported symbols, so an as-yet-unconsumed export is not an error.)

- [ ] **Step 3: Commit**

```bash
git add src/core/WeaponViewmodel.ts
git commit -m "Checkpoint 13 task 1: add core/WeaponViewmodel.ts"
```

---

### Task 2: Wire the viewmodel into `main.ts`

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `WeaponViewmodel` (Task 1) — constructed with no arguments; `updateOrientation(mainCamera: THREE.PerspectiveCamera): void` and `render(renderer: THREE.WebGLRenderer): void`.
- Produces: nothing new for later tasks — this is the last piece of wiring, only Task 3 (manual verification) and Task 4 (docs) follow.

- [ ] **Step 1: Add the import**

In `src/main.ts`, add this import alongside the other `core/` imports (after the `RaycastRegistry` import, before the `modes/GameMode` import):

```typescript
import { WeaponViewmodel } from "./core/WeaponViewmodel";
```

- [ ] **Step 2: Construct the viewmodel inside `startGame()`**

In `src/main.ts`, inside `startGame()`, immediately after the existing `const hud = new HUD(...)` block (i.e. right before the `canvas.addEventListener("click", ...)` line), add:

```typescript
  const weaponViewmodel = new WeaponViewmodel();
```

- [ ] **Step 3: Call it from `animate()`**

In `src/main.ts`'s `animate()` function, the current body ends with:

```typescript
    hud.update();
    sceneManager.render();
  }

  animate();
```

Change it to:

```typescript
    hud.update();
    sceneManager.render();
    if (gameState.playerState === "alive") {
      weaponViewmodel.updateOrientation(sceneManager.camera);
      weaponViewmodel.render(sceneManager.renderer);
    }
  }

  animate();
```

(This is the only change to `animate()` — every other line above it, including the existing `if (gameState.playerState === "alive") { gameMode.update(delta); }` block earlier in the function, is unchanged.)

- [ ] **Step 4: Verify the project builds**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "Checkpoint 13 task 2: wire WeaponViewmodel into main.ts's render loop"
```

---

### Task 3: Manual verification against acceptance criteria

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL in a browser.

- [ ] **Step 2: Verify basic visibility and positioning**

Start a run (either mode, either map). Confirm a visible dark-gray elongated box sits in the bottom-right corner of the screen once gameplay begins.

- [ ] **Step 3: Verify it tracks look direction correctly**

Look around (move the mouse in all directions, including straight up and straight down). Confirm the shape stays fixed in the bottom-right corner of the screen the whole time — it should never appear to slide, detach, or lag behind the view.

- [ ] **Step 4: Verify the depth-clip fix**

Walk directly up to a wall until the camera is very close to it (close enough that, without the fix, the wall would visually swallow the gun). Confirm the weapon shape remains fully visible, drawn in front of the wall, at every distance including nose-to-wall.

- [ ] **Step 5: Verify death/respawn behavior**

Let the player die (Zombie Survival: take zombie damage down to 0 health; Shooting Range: not applicable since there's no death in this mode — use Zombie Survival for this check). Confirm the weapon shape disappears the instant the death panel appears (it must not be visible layered behind or in front of the death panel). Click Respawn. Confirm the weapon shape reappears correctly positioned once gameplay resumes.

- [ ] **Step 6: Verify both maps and both modes**

Repeat step 2 (basic visibility) on: Test Grid + Zombie Survival, Test Grid + Shooting Range, Corridors + Zombie Survival, Corridors + Shooting Range. Confirm the weapon renders identically (same position, same depth behavior) in all four combinations.

- [ ] **Step 7: Regression check**

Confirm shooting (hitscan), the HUD (ammo/points/round display), interacting with doors/buttons/pickups/wall-buys, and enemy AI are all otherwise unaffected by this checkpoint's changes.

---

### Task 4: Update CLAUDE.md and commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the folder structure tree**

Add a new line under `core/` (alphabetically placed with the other `core/` entries — insert it after the `RaycastRegistry.ts` line and before the `utils/` subsection, matching the tree's existing ordering):

```
    WeaponViewmodel.ts           [13, static-positioned placeholder viewmodel — own scene/camera, rendered as a second depth-cleared pass so it never clips through world geometry]
```

- [ ] **Step 2: Update the Checkpoints list**

Add a new line immediately after checkpoint 12's line:

```
13. Weapon viewmodel — `core/WeaponViewmodel.ts` renders a static placeholder weapon shape (own scene/camera, second-pass depth-cleared render) in the bottom-right corner via `VIEWMODEL_CONFIG`; no fire/reload animation or idle sway/bob yet
```

- [ ] **Step 3: Update "Current status"**

Change the opening sentence from `Checkpoint 12 complete.` to `Checkpoint 13 complete.`, and append a new paragraph after the existing checkpoint-12 paragraph (before `## Decisions log`):

```

`core/WeaponViewmodel.ts` (checkpoint 13) renders a static placeholder weapon shape — a small dark-gray box, positioned via the module-level `VIEWMODEL_CONFIG` object (`offset: { x, y, z }` plus a `mirrored` flag that flips only the x offset's sign) — in the bottom-right corner of the screen. It owns a wholly separate `THREE.Scene`/`THREE.PerspectiveCamera` pair rather than sharing the main scene: the weapon mesh is a child of this second camera at a fixed local offset, and every frame `main.ts` copies the main camera's rotation onto this camera (`updateOrientation()`) so the weapon appears to track the player's look direction, then renders it as a second pass (`render()`) after the main scene — `renderer.clearDepth()` plus a `0.01` near-plane camera guarantees the weapon draws in front of world geometry no matter how close the player stands to a wall, which a naive single-pass render sharing the main depth buffer could not guarantee. Both calls are gated in `main.ts`'s `animate()` on `gameState.playerState === "alive"`, the same pattern already used for `gameMode.update()` — `WeaponViewmodel` itself never imports `GameState` and makes no gameplay decisions, keeping it a pure rendering system per this checkpoint's own requirement. The mesh's appearance does not vary by equipped weapon yet — only one weapon (`pistol`) exists in `content/weapons.ts`, so there is nothing to differentiate; see the decisions log and future mechanics below. Verified in-browser: the weapon shape appears bottom-right immediately on gameplay start, stays fixed in that screen position through all look directions, remains fully visible (never clipped) even standing nose-to-wall, disappears the instant the death panel appears and reappears correctly on Respawn, and behaves identically across both maps and both modes.
```

- [ ] **Step 4: Add decisions log entries**

Append after the last existing decisions-log line, before `## Future mechanics`:

```
- The weapon viewmodel (checkpoint 13) renders as a genuine second pass rather than being parented directly into the main scene: `WeaponViewmodel` owns its own `THREE.Scene`/`THREE.PerspectiveCamera`, and `render()` calls `renderer.clearDepth()` (with `autoClear` temporarily disabled so the depth-clear doesn't also wipe the just-drawn main-scene color buffer) before rendering that second scene with a camera whose near-plane is `0.01` — far closer than the main camera's `0.1`. This guarantees the weapon's depth test only ever runs against its own trivial geometry, so it draws in front of world geometry at any distance, including standing nose-to-wall; a single-pass approach sharing the main scene's depth buffer would let nearby walls clip through the gun.
- `VIEWMODEL_CONFIG` (checkpoint 13) is the one piece of this system built for future adjustability, deliberately minimal: an `offset: { x, y, z }` plus a `mirrored: boolean` that flips only the offset's x sign. No settings UI, no persistence, and no handedness *toggle* control were built — the point was only to make sure a future one-line change to this object (e.g. a per-weapon offset, or wiring `mirrored` to a real settings toggle) doesn't require touching any positioning math, not to build that future feature now.
- The placeholder weapon mesh's appearance is intentionally not data-driven yet (checkpoint 13), an explicit exception to this project's "content lives in `content/*.ts`" rule: with only one weapon (`pistol`) currently defined, there is nothing for a per-weapon viewmodel appearance to actually vary against, so hardcoding one generic gray box directly in `WeaponViewmodel.ts` was chosen over inventing a speculative `Weapon.viewmodelColor`-style field with a single possible value. Revisit once a second weapon exists to prove what should actually differ (shape, color, scale) — see future mechanics.
```

- [ ] **Step 5: Add future-mechanics entries**

Append two new bullets to the "Future mechanics" section (at the end, after the existing last bullet):

```
- **Weapon fire/reload viewmodel animation**: `core/WeaponViewmodel.ts` (checkpoint 13) is static positioning only — no recoil kick, no reload animation. `WeaponSystem` already tracks firing/reloading state in `GameState`; a later checkpoint could read that state to drive simple positional/rotational tweens on the weapon mesh, but this isn't designed yet.
- **Weapon idle sway/bob**: also not built at checkpoint 13 — no subtle idle movement or footstep-driven bob on the viewmodel mesh. Would likely read from `PlayerController`'s movement state the same way a future fire animation would read from `WeaponSystem`'s state, but the exact approach isn't designed yet.
- **Per-weapon viewmodel appearance**: `WeaponViewmodel`'s placeholder mesh (checkpoint 13) is one hardcoded gray box regardless of the equipped weapon — deferred until a second weapon exists in `content/weapons.ts` to prove what should actually differ (shape, color, scale), per the checkpoint-13 decisions log.
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Search for staleness this checkpoint may have introduced**

This project's CLAUDE.md has needed a staleness fix in every one of the last several checkpoints (9, 9.5, 10, 10's final review, 11 across two rounds, and 12) — always the same failure mode: an older sentence elsewhere in the document making a present-tense claim that this checkpoint's changes now contradict. Before committing, read the entire document (not just the sections edited above) and specifically check for:
- Any sentence describing the rendering pipeline as strictly single-pass (`sceneManager.render()` called once per frame with nothing after it) that this checkpoint's second render pass would now contradict.
- Any sentence describing `main.ts`'s `animate()` function's full contents in a way that omits or contradicts the new viewmodel calls.
- Any other claim this checkpoint's changes would now contradict.

If you find staleness, fix it using the established `**Superseded at checkpoint N** (was: "...")` convention (match the format of existing examples in the document exactly). If you find nothing beyond what Steps 1-5 already added, say so explicitly in your commit's task report — don't skip stating the negative result.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Checkpoint 13: weapon viewmodel

Adds core/WeaponViewmodel.ts: a static-positioned placeholder weapon
shape (own scene/camera, second-pass depth-cleared render with a
0.01-near-plane camera) so it never clips through world geometry.
Positioning reads from an exported VIEWMODEL_CONFIG (offset + mirrored
flag) for future adjustability. Wired into main.ts's animate() loop,
gated on gameState.playerState === "alive" the same way gameMode.update()
already is, so the weapon disappears on death and reappears on respawn.
No fire/reload animation or idle sway/bob yet -- static positioning only,
logged as future mechanics. Per-weapon appearance is also deferred,
since only one weapon currently exists to differentiate against.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Verify the commit**

Run: `git status` and `git log -1 --stat`
Expected: working tree clean; the commit touches `CLAUDE.md` (plus this plan doc, if not already committed by an earlier task).

---

## Self-Review Notes

- **Spec coverage:** `core/WeaponViewmodel.ts` as a rendering-only, single-responsibility system (Task 1) ✓; own scene + own camera + one placeholder mesh, generic gray material, no per-weapon appearance (Task 1) ✓; `VIEWMODEL_CONFIG` with `offset`/`mirrored`, all positioning math reading from it, `mirrored` flipping only the x sign (Task 1) ✓; default bottom-right position (Task 1, matches the brief's exact example values) ✓; depth-clip fix via second pass + `clearDepth()` + close near-plane (Task 1) ✓; wired into `main.ts`'s `animate()` immediately after `sceneManager.render()` (Task 2) ✓; hidden whenever not alive, via skipping the render pass (Task 2) ✓; no fire/reload/sway/bob, logged as future mechanics (Task 4, Step 5) ✓; acceptance-criteria walkthrough including both maps/both modes (Task 3) ✓; CLAUDE.md status + three named decisions (two-pass depth-clear technique, `VIEWMODEL_CONFIG` extensibility hook, deferred per-weapon-appearance) + staleness sweep + commit named "checkpoint 13" (Task 4) ✓.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code; Task 3's verification steps are concrete observable behaviors (screen position, depth ordering, death/respawn timing), not vague "make sure it works" language.
- **Type consistency check:** `WeaponViewmodel`'s constructor is public/no-arg in both Task 1 (definition) and Task 2 (call site, `new WeaponViewmodel()`) — matches. `updateOrientation(mainCamera: THREE.PerspectiveCamera): void` (Task 1) is called in Task 2 as `weaponViewmodel.updateOrientation(sceneManager.camera)` — `sceneManager.camera` is declared as `THREE.PerspectiveCamera` in `core/Scene.ts`, so the argument type matches exactly. `render(renderer: THREE.WebGLRenderer): void` (Task 1) is called as `weaponViewmodel.render(sceneManager.renderer)` — `sceneManager.renderer` is `THREE.WebGLRenderer` in `core/Scene.ts`, matches. `VIEWMODEL_CONFIG`'s shape (`{ offset: { x, y, z }; mirrored: boolean }`) is referenced identically in Task 1's own code and in Task 4's CLAUDE.md prose — no drift.
- **Compile-safety / task-ordering check:** Task 1 alone is a new, self-contained file with no consumers yet — exported-but-unused symbols do not trigger `noUnusedLocals`/`noUnusedParameters` (those flag unused *locals*/*parameters*, not unused exports), so `npm run build` succeeds standalone after Task 1. Task 2 depends on Task 1 (imports `WeaponViewmodel`) and must follow it; Task 2 alone (without Task 1 landed) would fail to compile (`Cannot find module`). No `erasableSyntaxOnly` violations: `WeaponViewmodel`'s constructor declares fields (`private readonly scene: THREE.Scene;` etc.) and assigns them in the constructor body, matching `PlayerController`'s and `SceneManager`'s existing style — no parameter-property shorthand (`constructor(private x: ...)`) is used anywhere in Task 1's code, since that construct requires non-erasable emitted JS under `erasableSyntaxOnly`. No enums used either.
- **Architecture-rule cross-check:** `core/WeaponViewmodel.ts` imports only `three` — zero imports from `content/` or `modes/`, satisfying the non-negotiable rule. It takes no `GameState`/`content` dependency at all, which is what makes the "no gameplay logic" requirement structurally enforced rather than just a comment.
