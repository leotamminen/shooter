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
  // campaign_room1 (checkpoint 17, extended at 19): Room 1 is unchanged in
  // shape/mechanics -- its whole grid section (and every one of its
  // entities' positions) simply shifted down by 8 rows (z += 16) to make
  // room for Room 2 above it. Reading the grid top to bottom: Room 3 (rows
  // 0-4, empty, reached via campaign_door_2's gap at row4/col6 -- gated by
  // campaign_lock_3, a secretField: "username" lock checked against
  // room2_terminal's username); Room 2 (rows 5-9, cols 1-10 interior,
  // bigger than Room 1) holding the required part/terminal puzzle
  // (campaign_part_1 + campaign_terminal_2, requiresPart-gated) and an
  // optional vault side-path (campaign_door_3 + campaign_lock_2, a
  // secretField: "vaultPin" lock, gating a 1x2 alcove at cols 12-13
  // holding campaign_wall_buy_1, a bonus MAC-10); row 10 (the wall
  // separating Room 2 from Room 1, with campaign_door_1's gap at col3 --
  // exactly the same relative position it held before this checkpoint);
  // Room 1 itself (rows 11-13, unchanged interior). No enemy_spawn or
  // target entities -- supportedModes below still excludes this map from
  // the modes that would ever look for them.
  {
    id: "campaign_room1",
    name: "Campaign: Room 1",
    supportedModes: ["campaign"],
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
      [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
    entities: [
      { id: "campaign_spawn_1", type: "spawn", position: [2, 0, 24] },
      {
        id: "campaign_terminal_1",
        type: "terminal",
        linkedTo: "room1_terminal",
        position: [10, 0.3, 24],
      },
      { id: "campaign_door_1", type: "door", position: [6, 1.5, 20] },
      {
        id: "campaign_lock_1",
        type: "password_lock",
        linkedTo: "campaign_door_1",
        terminalId: "room1_terminal",
        position: [6, 0.3, 22],
      },
      // Room 2's required path: the power cable and the terminal it feeds.
      // The terminal sits at the far (north) end of the same column as
      // Room 1's entry gap (row10/col3), so walking straight in from Room
      // 1 leads directly to it, passing the part along the way.
      { id: "campaign_part_1", type: "computer_part", position: [6, 0.3, 14] },
      {
        id: "campaign_terminal_2",
        type: "terminal",
        linkedTo: "room2_terminal",
        requiresPart: "campaign_part_1",
        position: [6, 0.3, 10],
      },
      // Room 2's optional vault side-path: a password_lock checking
      // Campaign's live vault pin (not a terminal's fixed password),
      // sitting just outside the vault's own doorway so it's never trapped
      // behind the door it controls -- same placement discipline as
      // corridors_button_2 (checkpoint 12).
      { id: "campaign_door_3", type: "door", position: [22, 1.5, 12] },
      {
        id: "campaign_lock_2",
        type: "password_lock",
        linkedTo: "campaign_door_3",
        secretField: "vaultPin",
        position: [20, 0.3, 12],
      },
      { id: "campaign_wall_buy_1", type: "wall_buy", linkedTo: "mac10", position: [24, 0.3, 12] },
      // Room 3's connector door (checkpoint 19, corrected same checkpoint):
      // originally opened programmatically when room2_terminal's "whoami"
      // ran -- corrected to a real password_lock instead, the same
      // mechanism every other locked door in this codebase uses.
      // campaign_lock_3 checks room2_terminal's username (secretField:
      // "username"), revealed by running whoami in that terminal (which no
      // longer opens anything by itself). Positioned just south of the
      // door's gap, in Room 2, so it's never trapped behind its own door --
      // same placement discipline as every other lock in this file. Room 3
      // itself (rows 0-3, cols 4-7) is deliberately empty this checkpoint.
      { id: "campaign_door_2", type: "door", position: [12, 1.5, 8] },
      {
        id: "campaign_lock_3",
        type: "password_lock",
        linkedTo: "campaign_door_2",
        terminalId: "room2_terminal",
        secretField: "username",
        promptLabel: "Identity, who you are:",
        position: [12, 0.3, 10],
      },
    ],
  },
];
