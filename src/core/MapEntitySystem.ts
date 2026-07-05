import * as THREE from "three";
import { CELL_SIZE, WALL_HEIGHT } from "./MapLoader";
import type { MapDef, MapEntity } from "../types";
import type { WeaponSystem } from "./WeaponSystem";
import type { RunManager } from "./RunManager";

const DOOR_COLOR = 0x8b5a2b;
const BUTTON_COLOR = 0xcc2222;
const BUTTON_EMISSIVE = 0x330000;
const BUTTON_SIZE = 0.4;
const PICKUP_COLOR = 0x22aacc;
const PICKUP_EMISSIVE = 0x003344;
const PICKUP_SIZE = 0.4;
const PICKUP_AMMO_AMOUNT = 24;

export interface DoorEntry {
  mesh: THREE.Mesh;
  box: THREE.Box3;
}

// Spawns one mesh per door/button/pickup MapEntity and wires their
// interaction behavior. Kept separate from MapLoader: MapLoader's job is
// grid-to-geometry and spawn lookup, this is entity behavior — a different
// responsibility per the single-responsibility-per-file rule.
export class MapEntitySystem {
  readonly group = new THREE.Group();
  readonly doors: DoorEntry[] = [];
  readonly interactables: THREE.Mesh[] = [];

  constructor(mapDef: MapDef, weaponSystem: WeaponSystem, runManager: RunManager) {
    const doorMeshById = new Map<string, THREE.Mesh>();

    for (const entity of mapDef.entities) {
      if (entity.type === "door") {
        doorMeshById.set(entity.id, this.createDoor(entity, runManager));
      }
    }

    for (const entity of mapDef.entities) {
      if (entity.type === "button") {
        this.createButton(entity, doorMeshById);
      } else if (entity.type === "pickup") {
        this.createPickup(entity, weaponSystem, runManager);
      }
    }
  }

  get doorMeshes(): THREE.Mesh[] {
    return this.doors.map((door) => door.mesh);
  }

  private createDoor(entity: MapEntity, runManager: RunManager): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE),
      new THREE.MeshStandardMaterial({ color: DOOR_COLOR }),
    );
    mesh.position.set(...entity.position);
    this.group.add(mesh);

    const box = new THREE.Box3().setFromObject(mesh);
    this.doors.push({ mesh, box });

    runManager.registerResettable(() => {
      mesh.visible = true;
    });

    return mesh;
  }

  private createButton(
    entity: MapEntity,
    doorMeshById: Map<string, THREE.Mesh>,
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
      if (!door.visible) return; // idempotent: door already open
      door.visible = false;
    };

    this.group.add(mesh);
    this.interactables.push(mesh);
  }

  private createPickup(
    entity: MapEntity,
    weaponSystem: WeaponSystem,
    runManager: RunManager,
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

    runManager.registerResettable(() => {
      mesh.visible = true;
    });
  }
}
