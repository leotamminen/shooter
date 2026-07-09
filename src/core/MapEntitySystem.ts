import * as THREE from "three";
import { CELL_SIZE, WALL_HEIGHT } from "./MapLoader";
import { computeCollisionBox } from "./utils/CollisionBox";
import { findById } from "./utils/Lookup";
import type { MapDef, MapEntity, Weapon, TerminalDef } from "../types";
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
const TERMINAL_COLOR = 0x223344;
const TERMINAL_EMISSIVE = 0x114477;
const TERMINAL_SIZE = 0.6;
const PASSWORD_LOCK_COLOR = 0x444444;
const PASSWORD_LOCK_EMISSIVE = 0x552200;
const PASSWORD_LOCK_SIZE = 0.3;

export interface DoorEntry {
  mesh: THREE.Mesh;
  box: THREE.Box3;
}

// Spawns one mesh per door/button/pickup/wall_buy/terminal/password_lock
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
    openPasswordLock: (terminalDef: TerminalDef, onCorrectPassword: () => void) => void,
  ) {
    const doorMeshById = new Map<string, THREE.Mesh>();

    for (const entity of mapDef.entities) {
      if (entity.type === "door") {
        doorMeshById.set(
          entity.id,
          this.createDoor(entity, runManager, raycastRegistry, onDoorStateChanged),
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
        this.createTerminal(entity, terminals, raycastRegistry, openTerminal);
      } else if (entity.type === "password_lock") {
        this.createPasswordLock(
          entity,
          doorMeshById,
          terminals,
          raycastRegistry,
          onDoorStateChanged,
          openPasswordLock,
        );
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
    mesh.userData.onInteract = (): void => {
      if (!door.visible) return; // idempotent: door already open — checked
      // before any spend attempt below, so this never charges twice.

      if (entity.cost !== undefined) {
        const paid = gameState.spendPoints(entity.cost);
        if (!paid) {
          console.log(
            `Button "${entity.id}": rejected (need ${entity.cost}, have ${gameState.pointsBalance}) — door stays closed`,
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

  // The first real GameState.spendPoints() caller (checkpoint 11) — replaces
  // the checkpoint-10 test terminal, which only proved the mechanism worked.
  // linkedTo here is a Weapon id (content/weapons.ts), not another
  // MapEntity's id — findById() throws by name if it doesn't resolve, same
  // as every other content lookup in this codebase. No
  // RunManager.registerResettable() call: like the test terminal before it,
  // this has no visible on/off state of its own to reset — spendPoints()'s
  // effect on pointsBalance already resets via RunManager ->
  // GameState.resetScore(). What a new run does to an already-purchased
  // weapon was originally an open question here — resolved at checkpoint 15,
  // see below.
  // (checkpoint 15: pickupWeapon() replaces the checkpoint-11 setWeapon() —
  // it fills an empty inventory slot if one exists, or replaces the active
  // slot if the inventory is full, rather than always overwriting a single
  // current weapon. WeaponSystem.reset() now rebuilds the whole inventory
  // back to the starting loadout on a new run, so a purchased weapon does
  // NOT survive a run reset. See WeaponSystem.ts and the checkpoint-15
  // decisions log.)
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
      }
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);
  }

  // Checkpoint 17: linkedTo here is a TerminalDef id (content/terminals.ts),
  // resolved via findById() the same way createWallBuy() resolves a Weapon
  // id -- same pattern, different content array. openTerminal is a generic
  // UI-trigger callback (this class never imports ui/Terminal.ts directly),
  // matching how onDoorStateChanged/onMeleeAttack are already injected
  // elsewhere in this codebase rather than reached into directly.
  private createTerminal(
    entity: MapEntity,
    terminals: TerminalDef[],
    raycastRegistry: RaycastRegistry,
    openTerminal: (terminalDef: TerminalDef) => void,
  ): void {
    if (!entity.linkedTo) {
      throw new Error(`Terminal "${entity.id}" has no linkedTo terminal id`);
    }
    const terminalDef = findById(terminals, entity.linkedTo);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(TERMINAL_SIZE, TERMINAL_SIZE, TERMINAL_SIZE),
      new THREE.MeshStandardMaterial({
        color: TERMINAL_COLOR,
        emissive: TERMINAL_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      openTerminal(terminalDef);
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);
  }

  // Checkpoint 17: mirrors createButton()'s shape closely, reusing the same
  // doorMeshById map rather than rebuilding it -- linkedTo is the door's
  // MapEntity id (like button), terminalId is a separate TerminalDef id
  // (unlike button/wall_buy, a password lock has two distinct relationships:
  // which door, which terminal). The idempotency guard (door already open ->
  // no-op) runs before the password-lock UI is even opened, the same
  // "check before doing anything" ordering createButton() already
  // establishes for its cost-gating.
  private createPasswordLock(
    entity: MapEntity,
    doorMeshById: Map<string, THREE.Mesh>,
    terminals: TerminalDef[],
    raycastRegistry: RaycastRegistry,
    onDoorStateChanged: () => void,
    openPasswordLock: (terminalDef: TerminalDef, onCorrectPassword: () => void) => void,
  ): void {
    const door = entity.linkedTo ? doorMeshById.get(entity.linkedTo) : undefined;
    if (!door) {
      throw new Error(
        `Password lock "${entity.id}" has no matching door for linkedTo "${entity.linkedTo}"`,
      );
    }
    if (!entity.terminalId) {
      throw new Error(`Password lock "${entity.id}" has no terminalId`);
    }
    const terminalDef = findById(terminals, entity.terminalId);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(PASSWORD_LOCK_SIZE, PASSWORD_LOCK_SIZE, PASSWORD_LOCK_SIZE),
      new THREE.MeshStandardMaterial({
        color: PASSWORD_LOCK_COLOR,
        emissive: PASSWORD_LOCK_EMISSIVE,
      }),
    );
    mesh.position.set(...entity.position);
    mesh.userData.interactable = true;
    mesh.userData.onInteract = (): void => {
      if (!door.visible) return; // idempotent: door already open

      openPasswordLock(terminalDef, () => {
        door.visible = false;
        onDoorStateChanged();
      });
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
    raycastRegistry.register(mesh);
  }
}
