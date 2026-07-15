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
import { HandsViewmodel } from "./core/HandsViewmodel";
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
  // Checkpoint 21: constructed alongside weaponViewmodel, for the same
  // reason -- it has no dependency on anything else in this function, and
  // interactSystem's onSuccessfulInteract callback below needs to
  // reference it directly.
  const handsViewmodel = new HandsViewmodel();

  const weaponSystem = new WeaponSystem(
    sceneManager.camera,
    // Checkpoint 15: every run starts with M1911 in inventory slot 0 --
    // checkpoint 21 narrows this to only Zombie Survival/Shooting Range;
    // Campaign now starts with no ranged weapon at all (null), so the
    // player begins genuinely empty-handed (see core/HandsViewmodel.ts) and
    // must find a wall-buy. The main menu's Weapon selection
    // (selections.weaponId) still doesn't determine the starting loadout in
    // either case -- confirmed with the user at checkpoint 15, unchanged
    // since. See CLAUDE.md's checkpoint-15/21 decisions log and future
    // mechanics.
    selections.modeId === "campaign" ? null : findById(WEAPONS, "pistol"),
    // Checkpoint 16: the knife is always the starting/default melee weapon
    // -- there is no menu selection for melee (only one option exists), and
    // no wall-buy either (the knife is always available, never purchased).
    // Unaffected by checkpoint 21's nullable ranged starting weapon: melee
    // is always available regardless of ranged loadout.
    findById(WEAPONS, "knife"),
    audioSystem,
    gameState,
    runManager,
    raycastRegistry,
    // Checkpoint 16: a small viewmodel "lunge" as placeholder melee-attack
    // feedback, reusing the addImpulse() mechanism built at checkpoint 14
    // (its own future-mechanics notes already named melee-swing as an
    // intended integration point).
    //
    // Checkpoint 21 addendum: expanded into a unified two-phase swing
    // (down, then a right-to-left swing) played identically on whichever
    // viewmodel is currently showing -- both are called unconditionally,
    // regardless of hasActiveWeapon(), the same "harmless on the inactive
    // one" reasoning already established for the interact grab gesture, so
    // there's no branch to keep in sync here. The 70ms stagger between
    // phases is what makes the swing read as two distinct beats rather
    // than blending into one motion; the final setTimeout hides the knife
    // once the whole sequence (phase1Decay + stagger + phase2Decay ≈
    // 100 + 70 + 150 = 320ms) has visually finished decaying, rounded up
    // to 350ms rather than cut off early. No clearTimeout/cancellation for
    // either timer -- unlike the checkpoint-20 terminal boot delay, this
    // window is short enough (under half a second) that a mid-swing death
    // or reset is a negligible edge case, not worth the bookkeeping. All
    // values are first-guess, tuned by eye in-browser.
    () => {
      weaponViewmodel.addImpulse({ x: 0, y: -0.08, z: 0.05 }, 0.1);
      handsViewmodel.addImpulse("right", { x: 0, y: -0.08, z: 0.05 }, 0.1);
      handsViewmodel.setKnifeVisible(true);

      setTimeout(() => {
        weaponViewmodel.addImpulse({ x: -0.12, y: 0, z: 0.03 }, 0.15);
        handsViewmodel.addImpulse("right", { x: -0.12, y: 0, z: 0.03 }, 0.15);
      }, 70);

      setTimeout(() => {
        handsViewmodel.setKnifeVisible(false);
      }, 350);
    },
    // Checkpoint 21: fire-kick, scaled per weapon by weapon.kickStrength
    // (content/weapons.ts) -- a first-guess base vector, tuned by testing
    // both the M1911 and MAC-10 in-browser.
    (kickStrength) =>
      weaponViewmodel.addImpulse(
        { x: 0, y: -0.02 * kickStrength, z: 0.05 * kickStrength },
        0.12,
      ),
    // Checkpoint 21: the weapon-swap dip -- a simple downward nudge, tuned
    // by testing switching between two owned weapons in-browser.
    () => weaponViewmodel.addImpulse({ x: 0, y: -0.08, z: 0 }, 0.25),
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

  const interactSystem = new InteractSystem(
    sceneManager.camera,
    gameState,
    raycastRegistry,
    // Checkpoint 21: a quick forward-then-decay nudge on the right hand
    // only, reading as a grab -- harmless to call even when the weapon
    // viewmodel (not hands) is currently being rendered, since it just
    // queues an impulse on an ImpulseOffset instance nothing is currently
    // reading from.
    () => handsViewmodel.addImpulse("right", { x: 0, y: 0, z: -0.04 }, 0.12),
  );

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
    hud.update(delta);
    sceneManager.render();
    // Checkpoint 21: mutually exclusive with the hands viewmodel --
    // WeaponSystem.hasActiveWeapon() is the single source of truth for
    // which one is currently "held," matching whatever the player's
    // inventory actually shows (empty in Campaign until the first wall-buy,
    // always occupied in Zombie Survival/Shooting Range).
    //
    // Future extension point (checkpoint 21 addendum, not built): a third
    // state -- neither hands nor weapon rendered at all -- would branch
    // here too, once something actually needs to hide both (e.g. a cutscene
    // or a menu-like pause). No new flag/logic added for this yet.
    if (gameState.playerState === "alive") {
      if (weaponSystem.hasActiveWeapon()) {
        weaponViewmodel.update(playerController.getSpeed(), delta);
        weaponViewmodel.render(sceneManager.renderer);
      } else {
        handsViewmodel.update(delta);
        handsViewmodel.render(sceneManager.renderer);
      }
    }
  }

  animate();
}

const mainMenu = new MainMenu(WEAPONS, ENEMIES, MAPS, (selections) => {
  mainMenu.destroy();
  startGame(selections);
});
