import type { MapDef } from "../types";

// Interior pillar at row 4, col 2 doubles as a line-of-sight blocker for
// testing InteractSystem: it sits directly between the spawn point and the
// placeholder interactable box.
export const MAPS: MapDef[] = [
  {
    id: "test-grid",
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1],
    ],
    entities: [{ type: "spawn", position: [8, 0, 8] }],
  },
];
