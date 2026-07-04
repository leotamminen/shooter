import * as THREE from "three";

export const CELL_SIZE = 2;
const WALL_HEIGHT = 3;

export interface LoadedMap {
  group: THREE.Group;
  wallBoxes: THREE.Box3[];
}

export function loadMap(grid: number[][]): LoadedMap {
  const group = new THREE.Group();
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
      wallBoxes.push(new THREE.Box3().setFromObject(wall));
    }
  }

  return { group, wallBoxes };
}
