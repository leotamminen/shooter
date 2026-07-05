import * as THREE from "three";
import type { MapDef } from "../types";
import type { RaycastRegistry } from "./RaycastRegistry";
import { computeCollisionBox } from "./utils/CollisionBox";

export const CELL_SIZE = 2;
export const WALL_HEIGHT = 3;

export interface LoadedMap {
  group: THREE.Group;
  walls: THREE.Mesh[];
  wallBoxes: THREE.Box3[];
}

export function loadMap(grid: number[][], raycastRegistry: RaycastRegistry): LoadedMap {
  const group = new THREE.Group();
  const walls: THREE.Mesh[] = [];
  const wallBoxes: THREE.Box3[] = [];

  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const width = cols * CELL_SIZE;
  const depth = rows * CELL_SIZE;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color: 0x808080 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(width / 2 - CELL_SIZE / 2, 0, depth / 2 - CELL_SIZE / 2);
  group.add(floor);

  const wallGeometry = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (grid[row][col] !== 1) continue;

      const wall = new THREE.Mesh(wallGeometry, wallMaterial);
      wall.position.set(col * CELL_SIZE, WALL_HEIGHT / 2, row * CELL_SIZE);
      group.add(wall);
      walls.push(wall);
      wallBoxes.push(computeCollisionBox(wall));
      raycastRegistry.register(wall);
    }
  }

  return { group, walls, wallBoxes };
}

export function getSpawnPosition(map: MapDef): { x: number; y: number; z: number } {
  const spawn = map.entities.find((entity) => entity.type === "spawn");
  if (!spawn) throw new Error(`Map "${map.id}" has no spawn entity`);

  const [x, y, z] = spawn.position;
  return { x, y, z };
}
