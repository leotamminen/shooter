import * as THREE from "three";
import { CELL_SIZE, WALL_HEIGHT } from "./MapLoader";
import { computeCollisionBox } from "./utils/CollisionBox";
import { findById } from "./utils/Lookup";
import { createComputerMesh, COMPUTER_BODY_NAME, getCableAnchorLocalPosition } from "./utils/ComputerMesh";
import type { MapDef, MapEntity, Weapon, TerminalDef, TerminalDirectory } from "../types";
import type { WeaponSystem } from "./WeaponSystem";
import type { RunManager } from "./RunManager";
import type { RaycastRegistry } from "./RaycastRegistry";
import type { GameState } from "../state/GameState";

const DOOR_COLOR = 0xe8e4da;
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
const PASSWORD_LOCK_COLOR = 0x1a1a1a;
const PASSWORD_LOCK_EMISSIVE = 0x000000;
const PASSWORD_LOCK_SIZE = 0.3;
// Boot-sequence follow-up: an independently-tunable constant even though
// it starts similar to PASSWORD_LOCK_COLOR -- a wall outlet and a
// password-lock panel are unrelated props that just happen to both be
// dark, and tying them to the same constant would make future retuning of
// one silently affect the other.
const DECORATION_OUTLET_COLOR = 0x2a2a2a;
const COMPUTER_PART_COLOR = 0x212427;
const COMPUTER_PART_EMISSIVE = 0x000000;
// Power cable visual: a coiled cable + two plugs, replacing the plain box
// this used to be. COMPUTER_PART_COLOR is already a near-black tone,
// reused as-is for the coil's rubber-black; the plugs get their own
// slightly-lighter dark-metal constant so the pieces still read as
// distinct parts against each other. The coil itself is a swept tube
// following a hand-generated spiral path (see createCoilPoints() below),
// not a flat TorusGeometry ring -- a closed uniform loop read as a plain
// donut shape, not a coiled cable with two ends for plugs to attach to.
// All of these are first-guess values tuned by eye in-browser, not
// measured against anything.
const COMPUTER_PART_PLUG_COLOR = 0x4a4a4a;
const COMPUTER_PART_PLUG_SIZE: [number, number, number] = [0.1, 0.04, 0.04];
// Second pass: the gameplay camera looks down at the floor at a steep
// angle, so the previous constant-radius/rising-Y version barely read as
// anything but a single ring from that angle -- the Y variation it relied
// on for a "coiled" look was nearly invisible from directly overhead. This
// version varies radius (shrinking each turn, spiraling inward like a
// garden hose rolled up on the ground) instead of height, which is the
// axis a top-down camera actually sees clearly. totalRise is now barely
// anything -- just enough that not every loop sits in the exact same
// plane, not a real "coiled height" cue like before.
const COMPUTER_PART_COIL_TURNS = 3.5;
const COMPUTER_PART_COIL_POINTS_PER_TURN = 16;
const COMPUTER_PART_COIL_START_RADIUS = 0.22;
const COMPUTER_PART_COIL_END_RADIUS = 0.06;
const COMPUTER_PART_COIL_BASE_Y = 0.03;
const COMPUTER_PART_COIL_RISE = 0.015;
const COMPUTER_PART_COIL_TUBE_RADIUS = 0.025;
const COMPUTER_PART_COIL_TUBULAR_SEGMENTS = 128;
const COMPUTER_PART_COIL_RADIAL_SEGMENTS = 8;
const DECORATION_CRATE_COLOR = 0x6b4a2a;
const DECORATION_CRATE_SIZE = 0.6;
const DECORATION_DEBRIS_COLOR = 0x555555;
const DECORATION_DEBRIS_SIZE = 0.35;
// Checkpoint 20 addendum: desk/chair reuse the crate's wood tone rather than
// introducing a new color constant -- plain furniture-grade wood fits both
// just as well as a crate.
const DECORATION_DESK_COLOR = DECORATION_CRATE_COLOR;
const DECORATION_CHAIR_COLOR = DECORATION_CRATE_COLOR;
// Desk geometry (checkpoint 20 addendum), relative to the desk group's own
// local origin at floor level. campaign_terminal_2 sits at y = 1.1, so the
// tabletop's top face is deliberately tuned to land exactly there (1.07 +
// 0.06 / 2 = 1.10) -- see CLAUDE.md's checkpoint-20 decisions log.
const DESK_TABLETOP_SIZE: [number, number, number] = [0.9, 0.06, 0.5];
const DESK_TABLETOP_Y = 1.07;
const DESK_LEG_SIZE: [number, number, number] = [0.04, 1.04, 0.04];
const DESK_LEG_Y = 0.52;
const DESK_LEG_OFFSETS: [number, number][] = [
  [0.4, 0.2],
  [0.4, -0.2],
  [-0.4, 0.2],
  [-0.4, -0.2],
];
// Chair geometry (checkpoint 20 addendum) -- a generic nearby seating prop,
// not load-bearing for anything else, so no exact-height tuning like the
// desk's.
const CHAIR_SEAT_SIZE: [number, number, number] = [0.4, 0.05, 0.4];
const CHAIR_SEAT_Y = 0.25;
const CHAIR_BACKREST_SIZE: [number, number, number] = [0.4, 0.35, 0.05];
const CHAIR_BACKREST_POSITION: [number, number, number] = [0, 0.45, -0.18];
const CHAIR_LEG_SIZE: [number, number, number] = [0.04, 0.25, 0.04];
const CHAIR_LEG_Y = 0.125;
const CHAIR_LEG_OFFSETS: [number, number][] = [
  [0.16, 0.16],
  [0.16, -0.16],
  [-0.16, 0.16],
  [-0.16, -0.16],
];
// Sign decoration (Room 3 hidden-files puzzle): a small flat board, one
// BoxGeometry with a 6-material array rather than a plane, so it reads as
// a solid board from any angle instead of vanishing edge-on -- only the
// front (+Z local) face gets the generated text texture, the other five
// reuse the same plain board color. Same generated-CanvasTexture technique
// as ComputerMesh.ts's screen (an offscreen <canvas>, drawn once, not
// per-frame).
const SIGN_WIDTH = 0.6;
const SIGN_HEIGHT = 0.35;
const SIGN_DEPTH = 0.04;
const SIGN_BOARD_COLOR = 0x4a3a2a;
const SIGN_TEXTURE_WIDTH = 256;
const SIGN_TEXTURE_HEIGHT = 128;
const SIGN_BACKGROUND_COLOR = "#1a1a1a";
const SIGN_TEXT_COLOR = "#e8e4da";
const SIGN_FONT = "16px monospace";
const TERMINAL_INTERACT_PROMPT = "Press E to use terminal";
const TERMINAL_GATED_MESSAGE = "The screen is dark. It needs power.";
const TERMINAL_BOOTING_MESSAGE = "Booting...";
const TERMINAL_BOOT_DELAY_MS = 1000;
// Straight cable connecting a booted terminal to its wall outlet -- same
// tube radius as the coiled power-cable pickup, so it visually reads as
// the same cable, uncoiled.
const TERMINAL_CABLE_TUBE_RADIUS = 0.025;
const TERMINAL_CABLE_TUBULAR_SEGMENTS = 32;
const TERMINAL_CABLE_RADIAL_SEGMENTS = 8;
// Server rack decoration: a tall narrow box, dark, with 2-3 small emissive
// squares near the top for a restrained "status light" detail -- the same
// level of restraint ComputerMesh.ts's screen already established (a
// generated texture/detail, not a fully modeled rack). Content-block
// primitive only; not placed anywhere yet, see CLAUDE.md's future
// mechanics for why.
const SERVER_RACK_COLOR = 0x1c1e22;
const SERVER_RACK_SIZE: [number, number, number] = [0.5, 1.8, 0.6];
const SERVER_RACK_LIGHT_COLOR = 0x33ff55;
const SERVER_RACK_LIGHT_EMISSIVE = 0x114411;
const SERVER_RACK_LIGHT_SIZE = 0.05;
const SERVER_RACK_LIGHT_Y_OFFSETS = [0.7, 0.62, 0.54];
// Coffee cup decoration: a small simple prop, purely decorative for now --
// deliberately NOT interactable. Turning this into a real pickup (the
// supervisor's fingerprint) is deferred until the Data Center room exists
// and its target lock is designed -- adding interactability now would mean
// guessing at a gate mechanism with no lock to check it against yet.
const COFFEE_CUP_COLOR = 0xe8e4da;
const COFFEE_CUP_RADIUS_TOP = 0.06;
const COFFEE_CUP_RADIUS_BOTTOM = 0.05;
const COFFEE_CUP_HEIGHT = 0.09;
const COFFEE_CUP_RADIAL_SEGMENTS = 12;

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
    // Paired-terminal teleport: a live read of the player's current x/z (not
    // a fixed/assumed stance -- interact is range/angle-based, so the
    // player can be anywhere nearby at any angle) and the actual reposition
    // trigger, both sourced from PlayerController via main.ts the same way
    // every other cross-system effect in this constructor (openTerminal,
    // openPasswordLock) is injected rather than reached for directly.
    getPlayerPosition: () => { x: number; z: number },
    teleportPlayer: (x: number, z: number) => void,
  ) {
    // Checkpoint 19 correction: reverted to local constructor variables --
    // Room 3's door is now opened by its own password_lock (the same
    // generic door.visible = false / onDoorStateChanged() mechanism every
    // other locked door already uses), not programmatically from main.ts,
    // so there's no longer any reason for doorMeshById to be a class field
    // (it briefly was, exposed via a getDoorMesh() method, both now
    // removed along with the mechanism that needed them).
    const doorMeshById = new Map<string, THREE.Mesh>();
    const computerPartMeshById = new Map<string, THREE.Group>();
    // Paired-terminal teleport: static data (every terminal's own entity,
    // known from mapDef.entities alone), so this doesn't need to follow the
    // door/computer_part meshes' construction-order-dependent first pass
    // below -- it's just a lookup table, built once, the same
    // cross-entity-reference pattern doorMeshById already establishes.
    // Stores the whole MapEntity, not just its position (as it briefly
    // did, position-only, before the terminal-content-swap follow-up) --
    // resolving a paired terminal's displayed content needs its linkedTo
    // too, and this is still the one lookup, not a second one built
    // alongside it.
    const terminalEntityById = new Map<string, MapEntity>();
    for (const entity of mapDef.entities) {
      if (entity.type === "terminal") {
        terminalEntityById.set(entity.id, entity);
      }
    }

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
          terminalEntityById,
          getPlayerPosition,
          teleportPlayer,
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

  // Traces a flat, inward-winding spiral (shrinking radius each turn, like
  // a garden hose rolled up on the ground) rather than a flat closed loop
  // or a constant-radius/rising-Y helix -- fed through
  // CatmullRomCurve3/TubeGeometry in createComputerPart() below, so the
  // coil has two distinguishable ends (one near the outer edge, one near
  // the center) for the two plug meshes to sit at.
  private createCoilPoints(): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const totalSteps = COMPUTER_PART_COIL_TURNS * COMPUTER_PART_COIL_POINTS_PER_TURN;

    for (let i = 0; i <= totalSteps; i++) {
      const t = i / totalSteps;
      const angle = t * COMPUTER_PART_COIL_TURNS * Math.PI * 2;
      const radius =
        COMPUTER_PART_COIL_START_RADIUS +
        (COMPUTER_PART_COIL_END_RADIUS - COMPUTER_PART_COIL_START_RADIUS) * t;
      points.push(
        new THREE.Vector3(
          Math.cos(angle) * radius,
          COMPUTER_PART_COIL_BASE_Y + t * COMPUTER_PART_COIL_RISE,
          Math.sin(angle) * radius,
        ),
      );
    }
    return points;
  }

  // Power cable visual: a coiled cable (a swept tube along the spiral
  // createCoilPoints() traces) + two plug boxes at its ends, grouped
  // together the same procedural-boxes-and-primitives approach as
  // ComputerMesh.ts. userData/raycast registration lives on the coil mesh
  // specifically -- the one concrete mesh RaycastRegistry/InteractSystem
  // target, mirroring how ComputerMesh.ts's named body mesh (not its
  // group) carries those. Plugs are simple axis-aligned boxes positioned
  // at the curve's two ends -- no tangent-based orientation matching,
  // since the fixed rotation reads fine at this scale.
  private createComputerPart(
    entity: MapEntity,
    runManager: RunManager,
    raycastRegistry: RaycastRegistry,
  ): THREE.Group {
    const group = new THREE.Group();

    const curve = new THREE.CatmullRomCurve3(this.createCoilPoints());
    const coil = new THREE.Mesh(
      new THREE.TubeGeometry(
        curve,
        COMPUTER_PART_COIL_TUBULAR_SEGMENTS,
        COMPUTER_PART_COIL_TUBE_RADIUS,
        COMPUTER_PART_COIL_RADIAL_SEGMENTS,
        false,
      ),
      new THREE.MeshStandardMaterial({
        color: COMPUTER_PART_COLOR,
        emissive: COMPUTER_PART_EMISSIVE,
      }),
    );
    group.add(coil);

    const startPlug = new THREE.Mesh(
      new THREE.BoxGeometry(...COMPUTER_PART_PLUG_SIZE),
      new THREE.MeshStandardMaterial({ color: COMPUTER_PART_PLUG_COLOR }),
    );
    startPlug.position.copy(curve.getPointAt(0));
    group.add(startPlug);

    const endPlug = new THREE.Mesh(
      new THREE.BoxGeometry(...COMPUTER_PART_PLUG_SIZE),
      new THREE.MeshStandardMaterial({ color: COMPUTER_PART_PLUG_COLOR }),
    );
    endPlug.position.copy(curve.getPointAt(1));
    group.add(endPlug);

    group.position.set(...entity.position);
    coil.userData.interactable = true;
    coil.userData.interactPrompt = "Press E to pick up power cable";
    coil.userData.onInteract = (): void => {
      if (!group.visible) return; // idempotent: already collected
      group.visible = false;
      // Raycast.ts's visibility filter checks the specific hit object's own
      // .visible, not its ancestors' -- coil (not group) is the registered
      // raycast target, so it needs its own flag cleared too, or it would
      // stay hittable/interactable (and the HUD prompt would keep showing)
      // even after the group is visually hidden.
      coil.visible = false;
    };

    this.group.add(group);
    this.interactables.push(coil);
    raycastRegistry.register(coil);

    runManager.registerResettable(() => {
      group.visible = true;
      coil.visible = true;
    });

    return group;
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
    computerPartMeshById: Map<string, THREE.Group>,
    gameState: GameState,
    runManager: RunManager,
    terminalEntityById: Map<string, MapEntity>,
    getPlayerPosition: () => { x: number; z: number },
    teleportPlayer: (x: number, z: number) => void,
  ): void {
    if (!entity.linkedTo) {
      throw new Error(`Terminal "${entity.id}" has no linkedTo terminal id`);
    }

    // Paired-terminal teleport: resolved once, at construction, since it's
    // just a lookup against static entity data -- same defensive "throw by
    // name on a dangling reference" pattern as every other
    // linkedTo/terminalId lookup in this file (createWallBuy, createButton,
    // createPasswordLock).
    const pairedEntity = entity.teleportPairId
      ? terminalEntityById.get(entity.teleportPairId)
      : undefined;
    if (entity.teleportPairId && !pairedEntity) {
      throw new Error(
        `Terminal "${entity.id}" has no matching terminal for teleportPairId "${entity.teleportPairId}"`,
      );
    }

    // Content swap: since the teleport already happens the instant the
    // overlay opens, the player is narratively already "at" the paired
    // terminal by the time they see anything -- showing THIS entity's own
    // linkedTo content first would be a screen for a machine they're no
    // longer standing in front of. entity.linkedTo itself is left
    // unchanged/still required above (it stays in the data as an unused
    // fallback if teleportPairId is ever removed), it's just not what
    // ultimately gets shown when a pair exists.
    if (entity.teleportPairId && pairedEntity && !pairedEntity.linkedTo) {
      throw new Error(
        `Terminal "${entity.id}"'s teleport pair "${pairedEntity.id}" has no linkedTo terminal id`,
      );
    }
    const displayedTerminalId = pairedEntity ? pairedEntity.linkedTo! : entity.linkedTo;
    const terminalDefToShow = findById(terminals, displayedTerminalId);

    let poweredOn = entity.requiresPart === undefined;
    // Boot-sequence follow-up: `booting` gates repeated E presses during the
    // 1s delay (no message, just a silent no-op -- the "Booting..."
    // feedback was already shown once, when the delay started).
    // `bootTimeoutId` is what a mid-boot death/respawn cancels, so a stale
    // callback can never fire into a freshly-reset run (see the resettable
    // below). setTimeout, not a per-frame Countdown (see CLAUDE.md's
    // decisions log for why): this delay has no per-frame visual (no
    // progress bar, nothing ticking), so there's nothing for a
    // per-frame-driven mechanism to buy here that a one-shot timer doesn't
    // already give for free.
    let booting = false;
    let bootTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let cableMesh: THREE.Mesh | undefined;
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

        if (booting) return; // already booting -- ignore repeated E presses, no message

        booting = true;
        gameState.showFeedback(TERMINAL_BOOTING_MESSAGE);

        bootTimeoutId = setTimeout(() => {
          this.group.remove(computerGroup);
          raycastRegistry.unregister(bodyMesh);

          computerGroup = createComputerMesh(true);
          computerGroup.position.set(...entity.position);
          computerGroup.rotation.y = THREE.MathUtils.degToRad(entity.rotationY ?? 0);
          this.group.add(computerGroup);
          bodyMesh = attachBody(computerGroup);

          if (entity.outletPosition) {
            // localToWorld() reads matrixWorld, which a just-constructed
            // group has never had computed (that normally happens lazily
            // during the next render) -- force it now so the anchor point
            // is correct the instant this setTimeout callback runs,
            // regardless of render timing.
            computerGroup.updateMatrixWorld(true);
            const anchorWorld = computerGroup.localToWorld(getCableAnchorLocalPosition());
            cableMesh = this.createStraightCable(anchorWorld, new THREE.Vector3(...entity.outletPosition));
            this.group.add(cableMesh);
          }

          poweredOn = true;
          booting = false;
          bootTimeoutId = undefined;
        }, TERMINAL_BOOT_DELAY_MS);

        return; // does NOT open the terminal on this press
      }

      // Paired-terminal teleport: fires only on an actual open (never on a
      // gated-rejection or a booting no-op above), and computes the target
      // live from the player's current position -- not a fixed landing
      // point -- so the player's exact stance relative to THIS terminal
      // (whatever range/angle they approached from) is preserved relative
      // to the paired terminal instead. Position only, no rotation/yaw:
      // PlayerController.teleportTo() never touches camera rotation. The
      // terminal's own full-screen backdrop is already covering the scene
      // for the whole time the overlay is open, so this happens instantly
      // with no visible transition.
      if (pairedEntity) {
        const playerPosition = getPlayerPosition();
        const delta = {
          x: playerPosition.x - entity.position[0],
          z: playerPosition.z - entity.position[2],
        };
        teleportPlayer(pairedEntity.position[0] + delta.x, pairedEntity.position[2] + delta.z);
      }

      openTerminal(terminalDefToShow);
    };

    computerGroup = createComputerMesh(poweredOn);
    computerGroup.position.set(...entity.position);
    computerGroup.rotation.y = THREE.MathUtils.degToRad(entity.rotationY ?? 0);
    this.group.add(computerGroup);
    bodyMesh = attachBody(computerGroup);

    if (entity.requiresPart !== undefined) {
      runManager.registerResettable(() => {
        if (bootTimeoutId !== undefined) {
          clearTimeout(bootTimeoutId);
          bootTimeoutId = undefined;
        }
        booting = false;

        if (!poweredOn) return; // already off, nothing to revert

        this.group.remove(computerGroup);
        raycastRegistry.unregister(bodyMesh);
        if (cableMesh) {
          this.group.remove(cableMesh);
          cableMesh = undefined;
        }

        computerGroup = createComputerMesh(false);
        computerGroup.position.set(...entity.position);
        computerGroup.rotation.y = THREE.MathUtils.degToRad(entity.rotationY ?? 0);
        this.group.add(computerGroup);
        bodyMesh = attachBody(computerGroup);

        poweredOn = false;
      });
    }
  }

  // Boot-sequence follow-up: a straight run from a booted terminal's
  // cable-anchor point to its wall outlet, reusing the coiled power
  // cable's own swept-tube technique (CatmullRomCurve3 -> TubeGeometry,
  // same tube radius) so it reads as the same cable, just uncoiled. Two
  // intermediate control points (rather than a straight two-point line)
  // give the curve a gentle bend instead of a perfectly rigid rod: mid1
  // rises to the outlet's height close to the terminal end, mid2 carries
  // most of the horizontal travel -- both fractions (0.4/0.7) are
  // first-guess values, tuned by eye in-browser, not measured against
  // anything.
  private createStraightCable(start: THREE.Vector3, end: THREE.Vector3): THREE.Mesh {
    const mid1 = start.clone().lerp(new THREE.Vector3(start.x, end.y, start.z), 0.4);
    const mid2 = start.clone().lerp(new THREE.Vector3(end.x, end.y, end.z), 0.7);
    const curve = new THREE.CatmullRomCurve3([start, mid1, mid2, end]);
    const geometry = new THREE.TubeGeometry(
      curve,
      TERMINAL_CABLE_TUBULAR_SEGMENTS,
      TERMINAL_CABLE_TUBE_RADIUS,
      TERMINAL_CABLE_RADIAL_SEGMENTS,
      false,
    );
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: COMPUTER_PART_COLOR }));
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
    if (entity.variant === "desk") {
      this.createDeskDecoration(entity);
      return;
    }
    if (entity.variant === "chair") {
      this.createChairDecoration(entity);
      return;
    }
    if (entity.variant === "sign") {
      this.createSignDecoration(entity);
      return;
    }
    if (entity.variant === "server_rack") {
      this.createServerRackDecoration(entity);
      return;
    }
    if (entity.variant === "coffee_cup") {
      this.createCoffeeCupDecoration(entity);
      return;
    }
    if (entity.variant === "door_prop") {
      this.createDoorPropDecoration(entity);
      return;
    }
    if (entity.variant === "outlet") {
      // Present from the start of the run regardless of terminal/power
      // state -- a single box like crate/debris, just reusing
      // PASSWORD_LOCK_SIZE for its dimensions instead of either decoration
      // size, since it's meant to read as a small wall-mounted panel, not
      // a floor prop.
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(PASSWORD_LOCK_SIZE, PASSWORD_LOCK_SIZE, PASSWORD_LOCK_SIZE),
        new THREE.MeshStandardMaterial({ color: DECORATION_OUTLET_COLOR }),
      );
      mesh.position.set(...entity.position);
      this.group.add(mesh);
      return;
    }

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

  // Shared by createDeskDecoration()/createChairDecoration() below: adds one
  // box, positioned relative to the parent group's own local origin, as a
  // child of that group. The group itself (not its individual box children)
  // is what entity.position/rotationY get applied to.
  private addDecorationBox(
    group: THREE.Group,
    size: [number, number, number],
    position: [number, number, number],
    color: number,
  ): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      new THREE.MeshStandardMaterial({ color }),
    );
    mesh.position.set(...position);
    group.add(mesh);
  }

  // Checkpoint 20 addendum: a desk built to support campaign_terminal_2
  // resting directly on top of it -- see DESK_TABLETOP_Y's comment above for
  // the exact top-surface-at-y=1.1 math. Same rotationY handling as
  // createTerminal(), so a desk can be turned to match whatever sits on it.
  private createDeskDecoration(entity: MapEntity): void {
    const group = new THREE.Group();
    this.addDecorationBox(group, DESK_TABLETOP_SIZE, [0, DESK_TABLETOP_Y, 0], DECORATION_DESK_COLOR);
    for (const [x, z] of DESK_LEG_OFFSETS) {
      this.addDecorationBox(group, DESK_LEG_SIZE, [x, DESK_LEG_Y, z], DECORATION_DESK_COLOR);
    }
    group.position.set(...entity.position);
    group.rotation.y = THREE.MathUtils.degToRad(entity.rotationY ?? 0);
    this.group.add(group);
  }

  // Checkpoint 20 addendum: a generic seating prop, no precise height
  // requirement (unlike the desk above) -- just a nearby, reasonably-sized
  // companion to a desk entity.
  private createChairDecoration(entity: MapEntity): void {
    const group = new THREE.Group();
    this.addDecorationBox(group, CHAIR_SEAT_SIZE, [0, CHAIR_SEAT_Y, 0], DECORATION_CHAIR_COLOR);
    this.addDecorationBox(group, CHAIR_BACKREST_SIZE, CHAIR_BACKREST_POSITION, DECORATION_CHAIR_COLOR);
    for (const [x, z] of CHAIR_LEG_OFFSETS) {
      this.addDecorationBox(group, CHAIR_LEG_SIZE, [x, CHAIR_LEG_Y, z], DECORATION_CHAIR_COLOR);
    }
    group.position.set(...entity.position);
    group.rotation.y = THREE.MathUtils.degToRad(entity.rotationY ?? 0);
    this.group.add(group);
  }

  // Room 3 hidden-files puzzle: a small flat board, entity.text rendered
  // onto only the front (+Z local) face via a 6-material array -- reads
  // rotationY the same way createTerminal()/the desk/chair decorations
  // already do, no collision/interactable/raycast registration, same as
  // every other decoration.
  private createSignDecoration(entity: MapEntity): void {
    const sideMaterial = new THREE.MeshStandardMaterial({ color: SIGN_BOARD_COLOR });
    const materials = [
      sideMaterial, // +x
      sideMaterial, // -x
      sideMaterial, // +y
      sideMaterial, // -y
      new THREE.MeshStandardMaterial({ map: this.createSignTexture(entity.text ?? "") }), // +z (front)
      sideMaterial, // -z
    ];
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(SIGN_WIDTH, SIGN_HEIGHT, SIGN_DEPTH),
      materials,
    );
    mesh.position.set(...entity.position);
    mesh.rotation.y = THREE.MathUtils.degToRad(entity.rotationY ?? 0);
    this.group.add(mesh);
  }

  // Drawn once onto an offscreen <canvas>, not redrawn per frame -- same
  // "no animation loop, kept cheap" approach as ComputerMesh.ts's
  // createScreenTexture(). Text is centered both axes via
  // CanvasRenderingContext2D's own textAlign/textBaseline rather than
  // hand-computed offsets.
  private createSignTexture(text: string): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = SIGN_TEXTURE_WIDTH;
    canvas.height = SIGN_TEXTURE_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("createSignTexture: 2D canvas context unavailable");
    }

    ctx.fillStyle = SIGN_BACKGROUND_COLOR;
    ctx.fillRect(0, 0, SIGN_TEXTURE_WIDTH, SIGN_TEXTURE_HEIGHT);

    ctx.fillStyle = SIGN_TEXT_COLOR;
    ctx.font = SIGN_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, SIGN_TEXTURE_WIDTH / 2, SIGN_TEXTURE_HEIGHT / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // Content-block primitive: a tall narrow box plus 2-3 small emissive
  // squares near the top, the same restrained "a couple of generated
  // details, not a fully modeled object" level ComputerMesh.ts's screen
  // texture already established for this project's other tech-prop meshes
  // -- deliberately not a real named-child/texture factory of its own
  // (unlike ComputerMesh.ts) since this is a single flat-color box, not
  // something any other system needs to look up by name. No
  // collision/interactable/raycast registration, matching every other
  // decoration in this file.
  private createServerRackDecoration(entity: MapEntity): void {
    const group = new THREE.Group();
    this.addDecorationBox(group, SERVER_RACK_SIZE, [0, SERVER_RACK_SIZE[1] / 2, 0], SERVER_RACK_COLOR);

    const lightMaterial = new THREE.MeshStandardMaterial({
      color: SERVER_RACK_LIGHT_COLOR,
      emissive: SERVER_RACK_LIGHT_EMISSIVE,
    });
    for (const y of SERVER_RACK_LIGHT_Y_OFFSETS) {
      const light = new THREE.Mesh(
        new THREE.BoxGeometry(SERVER_RACK_LIGHT_SIZE, SERVER_RACK_LIGHT_SIZE, 0.01),
        lightMaterial,
      );
      light.position.set(
        SERVER_RACK_SIZE[0] / 2 - SERVER_RACK_LIGHT_SIZE, // near the rack's own +X edge, not centered
        y,
        SERVER_RACK_SIZE[2] / 2 + 0.005, // flush against the front (+Z) face
      );
      group.add(light);
    }

    group.position.set(...entity.position);
    group.rotation.y = THREE.MathUtils.degToRad(entity.rotationY ?? 0);
    this.group.add(group);
  }

  // Content-block primitive: a small cylinder, purely decorative -- see
  // this file's own COFFEE_CUP_* constants' comment for why it's
  // deliberately NOT wired up as a pickup/interactable yet (no
  // userData.interactable, no raycastRegistry.register(), matching every
  // other decoration).
  private createCoffeeCupDecoration(entity: MapEntity): void {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(
        COFFEE_CUP_RADIUS_TOP,
        COFFEE_CUP_RADIUS_BOTTOM,
        COFFEE_CUP_HEIGHT,
        COFFEE_CUP_RADIAL_SEGMENTS,
      ),
      new THREE.MeshStandardMaterial({ color: COFFEE_CUP_COLOR }),
    );
    mesh.position.set(...entity.position);
    this.group.add(mesh);
  }

  // Data Center entrance follow-up: reuses the real "door" MapEntity
  // type's own box geometry/color (CELL_SIZE x WALL_HEIGHT x CELL_SIZE,
  // DOOR_COLOR) so it visually reads as an actual door, exactly like
  // campaign_door_1-4 -- but as a decoration, not a "door" entity, it's
  // never added to this.doors (no collision box, so PlayerController never
  // gates movement through it) and stays permanently visible (a real
  // "door" only ever looks like this while closed; there's no "open/ajar"
  // visual state to reuse for "always open"). This is the correct fit for
  // a doorway meant to read as open and passable from the very first
  // frame, with no button/password_lock/other trigger ever changing it --
  // rather than a real "door" entity that would need a new always-open
  // flag layered onto a mechanic whose whole purpose is gating movement.
  private createDoorPropDecoration(entity: MapEntity): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE),
      new THREE.MeshStandardMaterial({ color: DOOR_COLOR }),
    );
    mesh.position.set(...entity.position);
    this.group.add(mesh);
  }
}
