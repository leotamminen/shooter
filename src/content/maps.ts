import type { MapDef } from "../types";

// Interior pillar at row 4, col 2 doubles as a line-of-sight blocker for
// testing InteractSystem: it sits directly between the spawn point and the
// placeholder interactable box. The row-2 partition (checkpoint 6) walls off
// the row-1 alcove behind door_1, opened by button_1 (row 3, next to the
// gap but not inside it, so it doesn't block the doorway itself).
export const MAPS: MapDef[] = [
  {
    id: "test-grid",
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 0, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1],
    ],
    entities: [
      { id: "spawn_1", type: "spawn", position: [8, 0, 8] },
      { id: "door_1", type: "door", position: [6, 1.5, 4] },
      {
        id: "button_1",
        type: "button",
        linkedTo: "door_1",
        position: [6, 0.3, 6],
      },
      { id: "pickup_1", type: "pickup", position: [10, 0.3, 10] },
    ],
  },
];
