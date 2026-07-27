import { CELL_SIZE } from "../MapLoader";

export interface GridCell {
  row: number;
  col: number;
}

// World<->grid conversion, using the same col*CELL_SIZE/row*CELL_SIZE
// convention MapLoader.ts's own wall placement already establishes -- a
// small shared helper so callers (core/GuardAI.ts) don't duplicate this
// math inline.
export function worldToGrid(x: number, z: number): GridCell {
  return { row: Math.round(z / CELL_SIZE), col: Math.round(x / CELL_SIZE) };
}

export function gridToWorld(cell: GridCell): { x: number; z: number } {
  return { x: cell.col * CELL_SIZE, z: cell.row * CELL_SIZE };
}

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

// Cardinal-only (no diagonal steps): matches PlayerController's own
// movement, which resolves collision against axis-aligned wall boxes with
// no diagonal corner-cutting assumed anywhere else in this codebase.
// Allowing a diagonal step between two cells that are only
// corner-adjacent (both orthogonal neighbors walls) would produce a path
// a real box-collision mover couldn't actually walk in a straight line
// without clipping a wall corner -- staying cardinal-only sidesteps that
// whole problem rather than needing corner-cutting-prevention logic.
const CARDINAL_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

// Breadth-first search over the same grid: number[][] every map already
// uses (0 = floor, 1 = wall). Deliberately simpler than A*: every cell
// costs the same to move through (no weighted terrain exists anywhere in
// this game), so BFS already finds a shortest path with no need for a
// heuristic or priority queue -- A* would be solving a problem this game
// doesn't have.
//
// Returns the ordered list of cells from start to goal, EXCLUSIVE of
// start and INCLUSIVE of goal (an empty array if start and goal are the
// same cell), or null if goal is unreachable (or either cell is itself a
// wall/out of bounds).
export function findPath(
  grid: number[][],
  start: GridCell,
  goal: GridCell,
): GridCell[] | null {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  function isFloor(row: number, col: number): boolean {
    return row >= 0 && row < rows && col >= 0 && col < cols && grid[row][col] === 0;
  }

  if (!isFloor(start.row, start.col) || !isFloor(goal.row, goal.col)) return null;
  if (start.row === goal.row && start.col === goal.col) return [];

  const cameFrom = new Map<string, GridCell>();
  const visited = new Set<string>([cellKey(start.row, start.col)]);
  const queue: GridCell[] = [start];

  let reached = false;
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (current.row === goal.row && current.col === goal.col) {
      reached = true;
      break;
    }
    for (const [dr, dc] of CARDINAL_DIRECTIONS) {
      const row = current.row + dr;
      const col = current.col + dc;
      if (!isFloor(row, col)) continue;
      const key = cellKey(row, col);
      if (visited.has(key)) continue;
      visited.add(key);
      cameFrom.set(key, current);
      queue.push({ row, col });
    }
  }

  if (!reached) return null;

  const path: GridCell[] = [];
  let cursor: GridCell | undefined = goal;
  while (cursor && !(cursor.row === start.row && cursor.col === start.col)) {
    path.push(cursor);
    cursor = cameFrom.get(cellKey(cursor.row, cursor.col));
  }
  path.reverse();
  return path;
}
