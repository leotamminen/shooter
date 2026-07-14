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
const COMPUTER_PART_COLOR = 0x212427;
const COMPUTER_PART_EMISSIVE = 0x000000;
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
        computerGroup.rotation.y = THREE.MathUtils.degToRad(entity.rotationY ?? 0);
        this.group.add(computerGroup);
        bodyMesh = attachBody(computerGroup);

        poweredOn = true;
      }
      openTerminal(terminalDef);
    };

    computerGroup = createComputerMesh(poweredOn);
    computerGroup.position.set(...entity.position);
    computerGroup.rotation.y = THREE.MathUtils.degToRad(entity.rotationY ?? 0);
    this.group.add(computerGroup);
    bodyMesh = attachBody(computerGroup);

    if (entity.requiresPart !== undefined) {
      runManager.registerResettable(() => {
        if (!poweredOn) return; // already off, nothing to revert

        this.group.remove(computerGroup);
        raycastRegistry.unregister(bodyMesh);

        computerGroup = createComputerMesh(false);
        computerGroup.position.set(...entity.position);
        computerGroup.rotation.y = THREE.MathUtils.degToRad(entity.rotationY ?? 0);
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
