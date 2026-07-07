import type { MapDef } from "../types";

// test-grid: interior pillar at row 4, col 2 doubles as a line-of-sight
// blocker for testing InteractSystem: it originally sat directly between the
// spawn point and the checkpoint-3 placeholder interactable box (deleted at
// checkpoint 11). The row-2 partition
// (checkpoint 6) walls off the row-1 alcove behind door_1, opened by
// button_1 (row 3, next to the gap but not inside it, so it doesn't block
// the doorway itself).
//
// corridors (checkpoint 9.5): two full-sized rooms (west "Room A", cols
// 1-3; east "Room B", cols 7-9) connected by a single-file, 3-cell-long
// corridor (row 4, cols 4-6) — genuinely more corridor structure than
// test-grid's single 1-cell gap, and door_1 at the corridor's middle cell
// fully seals the only path between the two rooms, since the corridor is
// exactly one row tall (rows 3 and 5 at cols 4-6 are walls, so there's no
// way around it).
//
// corridors (checkpoint 12): a small vault room (row 9, cols 7-9) was added
// south of Room B, gated by a paid door — corridors_door_2 sits at the one
// gap (row 8, col 8) in an otherwise solid partition wall between Room B and
// the vault, opened by corridors_button_2 (row 7, col 8, on the Room B side
// so it's never trapped behind its own door) at a cost of 300 points. The
// vault holds corridors_pickup_2, a bonus ammo refill — the first real
// instance of a paid button, alongside the existing free door_1/button_1
// pairs on both maps, which are untouched.
export const MAPS: MapDef[] = [
  {
    id: "test-grid",
    name: "Test Grid",
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
      { id: "enemy_spawn_1", type: "enemy_spawn", position: [10, 0.9, 6] },
      { id: "enemy_spawn_2", type: "enemy_spawn", position: [4, 0.9, 10] },
      // Shooting Range targets: two share space with the enemy_spawn points
      // above (only one mode is ever active at a time) plus two more of
      // their own, for four total.
      { id: "target_1", type: "target", position: [10, 0.9, 6] },
      { id: "target_2", type: "target", position: [4, 0.9, 10] },
      { id: "target_3", type: "target", position: [10, 0.9, 12] },
      { id: "target_4", type: "target", position: [2, 0.9, 12] },
      // Wall-buy (checkpoint 11): reuses the exact position the
      // checkpoint-10 test terminal occupied (row 6, col 6) — already
      // verified open floor, not shared with any other entity, now that the
      // terminal itself is gone.
      { id: "wall_buy_1", type: "wall_buy", linkedTo: "pistol", position: [12, 0.3, 12] },
    ],
  },
  {
    id: "corridors",
    name: "Corridors",
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
    entities: [
      { id: "corridors_spawn_1", type: "spawn", position: [4, 0, 4] },
      { id: "corridors_door_1", type: "door", position: [10, 1.5, 8] },
      {
        id: "corridors_button_1",
        type: "button",
        linkedTo: "corridors_door_1",
        position: [6, 0.3, 6],
      },
      { id: "corridors_pickup_1", type: "pickup", position: [16, 0.3, 12] },
      { id: "corridors_enemy_spawn_1", type: "enemy_spawn", position: [16, 0.9, 4] },
      { id: "corridors_enemy_spawn_2", type: "enemy_spawn", position: [14, 0.9, 12] },
      // Two targets share space with the enemy_spawn points above (only one
      // mode is ever active at a time, same dual-purpose pattern as
      // test-grid), plus two more of their own.
      { id: "corridors_target_1", type: "target", position: [16, 0.9, 4] },
      { id: "corridors_target_2", type: "target", position: [14, 0.9, 12] },
      { id: "corridors_target_3", type: "target", position: [4, 0.9, 12] },
      { id: "corridors_target_4", type: "target", position: [16, 0.9, 2] },
      // Wall-buy (checkpoint 11): Room A, row 3 col 2 — open floor, not
      // shared with any other corridors entity.
      { id: "corridors_wall_buy_1", type: "wall_buy", linkedTo: "pistol", position: [4, 0.3, 6] },
      // Paid door (checkpoint 12): gates the small vault room at row 9,
      // cols 7-9, added south of Room B. corridors_door_2 is the sole gap
      // (row 8, col 8) in the partition wall between Room B and the vault —
      // rows 8's other columns are solid, so this is the only way in.
      // corridors_button_2 sits on the Room B side (row 7, col 8, not
      // inside the vault) and costs 300 points; corridors_pickup_2 inside
      // the vault is a bonus ammo refill.
      { id: "corridors_door_2", type: "door", position: [16, 1.5, 16] },
      {
        id: "corridors_button_2",
        type: "button",
        linkedTo: "corridors_door_2",
        cost: 300,
        position: [16, 0.3, 14],
      },
      { id: "corridors_pickup_2", type: "pickup", position: [16, 0.3, 18] },
    ],
  },
];
