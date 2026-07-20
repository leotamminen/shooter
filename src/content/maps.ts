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
      // AK-47 wall-buy (checkpoint 23): row 1, col 1 — open floor, unused by
      // any other entity. First guess, expect retuning like every other
      // entity position in this project.
      { id: "wall_buy_2", type: "wall_buy", linkedTo: "ak47", position: [2, 0.3, 2] },
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
      // AK-47 wall-buy (checkpoint 23): Room A, row 1, col 1 — open floor,
      // unused by any other entity. First guess, expect retuning like every
      // other entity position in this project.
      { id: "corridors_wall_buy_2", type: "wall_buy", linkedTo: "ak47", position: [2, 0.3, 2] },
    ],
  },
  // campaign_room1 (checkpoint 17, extended at 19; further extended by a
  // manual, hand-edited grid change not yet assigned a checkpoint number --
  // tested working in-browser). Room 1, Room 2, and Room 3 are all
  // unchanged in shape/mechanics from the checkpoint-19/20 layout -- that
  // whole existing block simply shifted down by a further 9 rows (z += 18)
  // to make room for a new area added above the old Room 3. Reading the
  // grid top to bottom:
  //
  // Rows 0-1 are the map's north border wall. Rows 2-9 hold a new,
  // currently-unnamed room north of Room 3 (called "Room 4" below, matching
  // how it's being talked about, though nothing in the data itself labels
  // it). Its interior is rows 4-8 (narrower at its row-4 entrance, which
  // only reaches col11; rows 5-8 reach col13) with a hand-placed pillar
  // layout: a solid single-width wall at col2 forms the room's own west
  // boundary; inside it, rows 5 and 7 each repeat individual pillars at
  // cols 4/6/8 (a loose pillar-forest rather than open floor), and a
  // further isolated pillar sits at col12 on both row5 and row8. This room
  // has zero entities placed in it and no exit besides the way in -- its
  // east wall (col14) is solid throughout, and row9 is fully sealed except
  // for the one corridor gap described below, so as the data stands today
  // it's a dead end: no door, no button, nothing wired up beyond it. There
  // is no separately-identifiable "Room 5" in this grid/entity data.
  //
  // Room 4 is reached from Room 3 via a corridor loop, not a direct
  // opening: a new breach in Room 3's own west wall (row11/col3) leads west
  // to col1, then up a col1 corridor spine (rows 2-11, running just outside
  // Room 4's west wall the whole way), then east along row2 (cols1-9), then
  // down through a gap at row3/col9 into Room 4's row4. That breach is the
  // only connection between Room 3 and Room 4 -- there's no separate
  // shortcut back, only the same loop retraced.
  //
  // Room 3 (still reached from Room 2 below via campaign_door_2, gated by
  // campaign_lock_3 -- both unchanged) now holds the hidden-files terminal
  // puzzle: campaign_terminal_5 (linkedTo room3_terminal) and
  // campaign_sign_1 (a "sign" decoration hinting at ls -a) sit against
  // Room 3's own north wall; campaign_door_4 converts what used to be an
  // open, undoored breach in Room 3's west wall (the sole gap in an
  // otherwise-solid two-cell-thick wall segment, leading out toward the
  // corridor loop and the pillar room north of it) into a real locked
  // door, gated by campaign_lock_4 (secretField defaults to "password",
  // checked against room3_terminal, whose .bash_history reveals it) --
  // positioned on the Room 3 side, same discipline as every other lock in
  // this file.
  //
  // Room 2 (rows 14-18, cols 1-10 interior; row15 alone extends to col13
  // for the vault alcove) is otherwise unchanged: the required part/
  // terminal puzzle (campaign_part_1 + campaign_terminal_2, requiresPart-
  // gated) and the optional vault side-path (campaign_door_3 +
  // campaign_lock_2, a secretField: "vaultPin" lock, gating
  // campaign_wall_buy_1, a bonus MAC-10) both still work exactly as before,
  // just at their shifted row numbers. Row 19 is the wall separating Room 2
  // from Room 1, with campaign_door_1's gap at col3 -- the same relative
  // position it's always held. Room 1 itself (rows 20-21, cols 1-6
  // interior) is unchanged. No enemy_spawn or target entities anywhere on
  // this map -- supportedModes below still excludes it from the modes that
  // would ever look for them.
  {
    id: "campaign_room1",
    name: "Campaign: Room 1",
    supportedModes: ["campaign"],
      grid: [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 1],
    [1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1, 0, 0, 1],
    [1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1],
    [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1],
    [1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 0, 0, 0, 1],
    [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1],
    [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1],
    [1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
      entities: [
    {
      // id: "campaign_spawn_1", type: "spawn", position: [2, 0, 62],
      id: "campaign_spawn_1", type: "spawn", position: [39, 0, 44],
    },
    {
      id: "campaign_terminal_1",
      type: "terminal",
      linkedTo: "room1_terminal",
      rotationY: 270,
      position: [12.8, 1, 62],
    },
    {
      id: "campaign_door_1",
      type: "door",
      position: [6, 1.5, 58],
    },
    {
      id: "campaign_lock_1",
      type: "password_lock",
      linkedTo: "campaign_door_1",
      terminalId: "room1_terminal",
      position: [7.4, 1.2, 59],
    },
    {
      id: "campaign_part_1",
      type: "computer_part",
      position: [20.3, 0, 56],
    },
    {
      id: "campaign_terminal_2",
      type: "terminal",
      linkedTo: "room2_terminal",
      requiresPart: "campaign_part_1",
      rotationY: 90,
      position: [1.4, 1.1, 51],
      outletPosition: [1.0, 0.6, 51],
    },
    {
      id: "campaign_outlet_1",
      type: "decoration",
      variant: "outlet",
      position: [1.0, 0.6, 51],
    },
    {
      id: "campaign_desk_1",
      type: "decoration",
      variant: "desk",
      rotationY: 90,
      position: [1.4, 0, 51],
    },
    {
      id: "campaign_chair_1",
      type: "decoration",
      variant: "chair",
      rotationY: 270,
      position: [2.4, 0, 51],
    },
    {
      id: "campaign_decoration_1",
      type: "decoration",
      variant: "crate",
      position: [18, 0.3, 48],
    },
    {
      id: "campaign_decoration_2",
      type: "decoration",
      variant: "debris",
      position: [16, 0.3, 56],
    },
    {
      id: "campaign_decoration_3",
      type: "decoration",
      variant: "crate",
      position: [17, 0.3, 56.5],
    },
    {
      id: "campaign_decoration_4",
      type: "decoration",
      variant: "crate",
      position: [19.5, 0.3, 56],
    },
    {
      id: "campaign_door_3",
      type: "door",
      position: [22, 1.5, 50],
    },
    {
      id: "campaign_lock_2",
      type: "password_lock",
      linkedTo: "campaign_door_3",
      secretField: "vaultPin",
      position: [21, 1.2, 51.4],
    },
    {
      id: "campaign_wall_buy_1",
      type: "wall_buy",
      linkedTo: "mac10",
      position: [27, 1.3, 50],
    },
    {
      id: "campaign_door_2",
      type: "door",
      position: [12, 1.5, 46],
    },
    {
      id: "campaign_lock_3",
      type: "password_lock",
      linkedTo: "campaign_door_2",
      terminalId: "room2_terminal",
      secretField: "username",
      promptLabel: "Identity, who you are:",
      position: [13.4, 1.2, 47],
    },
    {
      id: "campaign_wall_buy_2",
      type: "wall_buy",
      linkedTo: "ak47",
      position: [8, 1.3, 60],
    },
    // Room 3 hidden-files terminal puzzle. campaign_terminal_5 and
    // campaign_sign_1 sit against Room 3's own north wall (row 19), open
    // floor confirmed against the current grid -- rotationY 0 (the
    // default, set explicitly here for the same reason every other
    // terminal in this file sets it) leaves both facing local +Z/south,
    // i.e. into the room, away from the wall behind them.
    {
      id: "campaign_terminal_5",
      type: "terminal",
      linkedTo: "room3_terminal",
      rotationY: 0,
      position: [14, 1, 39.2],
    },
    {
      id: "campaign_sign_1",
      type: "decoration",
      variant: "sign",
      text: "Not everything is visible.",
      rotationY: 0,
      position: [12, 1.3, 39],
    },
    // Converts the open, undoored breach in Room 3's west wall (col 3,
    // row 21 -- the sole gap in an otherwise-solid two-cell-thick wall
    // segment at cols 2-3 across rows 19-23, confirmed against the current
    // grid data directly rather than assumed) into a real locked door.
    // campaign_lock_4 sits just inside Room 3 (col 4, same row), on the
    // Room 3 side per this file's placement discipline -- the player must
    // already be in Room 3 (and have read room3_terminal's password) to
    // reach it, never trapped behind the door it opens.
    {
      id: "campaign_door_4",
      type: "door",
      position: [6, 1.5, 42],
    },
    {
      id: "campaign_lock_4",
      type: "password_lock",
      linkedTo: "campaign_door_4",
      terminalId: "room3_terminal",
      position: [6.9, 1.2, 40.6],
    },
    // Paired-teleport terminals, in the pillar room north of Room 3 (reached
    // via the corridor loop off Room 3's west wall). Located by reading the
    // current grid directly, not from any stale prior coordinate reference:
    // rows 3-7 / cols 14-18 is a clean, fully enclosed 5x5 sub-room within
    // the wider pillar area (solid walls at row 2 north, row 8 south, col 13
    // west, col 19 east -- each side wall has exactly one gap, at row 5,
    // connecting it to the rest of the pillar forest) holding 3 isolated
    // pillars at (row4,col16)/(row6,col15)/(row6,col18). campaign_terminal_3
    // (col 14) and campaign_terminal_4 (col 18) sit at that sub-room's two
    // open north corners (row 3), symmetric around its center column
    // (col 16), each with row 2's solid wall immediately north of it -- the
    // same wall direction for both, so both share rotationY: 0 (screen
    // faces +Z/south, away from the wall, matching campaign_terminal_5's
    // convention). linkedTo empty_room_terminal (deliberately unremarkable
    // content -- the point of these two is the silent teleport itself, not
    // their filesystem).
    {
      id: "campaign_terminal_3",
      type: "terminal",
      // Unused fallback (createTerminal() only reads this when
      // teleportPairId doesn't resolve to a pair) -- what's actually shown
      // is campaign_terminal_4's own linkedTo (workstation_terminal), per
      // the one-directional teleport + content-swap follow-up below.
      linkedTo: "empty_room_terminal",
      rotationY: 90,
      position: [1.4, 1, 42],
      teleportPairId: "campaign_terminal_4",
    },
    // One-directional teleport + content-swap follow-up: campaign_terminal_4
    // no longer has its own teleportPairId back to campaign_terminal_3 --
    // opening it directly is now just a normal, non-teleporting terminal.
    // Its linkedTo changed from empty_room_terminal to workstation_terminal:
    // this is the content shown both when interacting with terminal_4
    // directly and when arriving via terminal_3's teleport (createTerminal()
    // resolves the SAME TerminalDef either way, by construction).
    {
      id: "campaign_terminal_4",
      type: "terminal",
      linkedTo: "workstation_terminal",
      rotationY: 90,
      position: [19.4, 1, 42],
    },
    // Data Center entrance follow-up (corrected placement): confirmed,
    // not assumed -- the large open area at rows ~22-27/cols 18-25 IS the
    // reserved Data Center; the isolated 2x2 pocket a first pass carved at
    // rows 24-25/cols 14-15 (south of the pillar area's east span) was the
    // wrong spot and has been reverted back to plain wall, matching what
    // was there before. campaign_door_5 now sits at the Data Center's own
    // real entrance -- row 22/col 18 (world x/z [36, 44]; y is 0 here and
    // computed internally by createDoorPropDecoration() as
    // DOOR_PROP_HEIGHT / 2, floor-anchored like every other
    // floor-standing decoration, not read from this entity's own y), the
    // exact point where the solid wall column at col 18 (blocking rows
    // 18-21) ends and the room's own open floor begins, found by parsing
    // the live grid with a script, not by eye. It's a "decoration"
    // (variant door_prop), not a "door" entity -- purely visual set
    // dressing, reusing the real door mesh's own color (shape fixed to a
    // real thin door slab in the same follow-up that added the
    // furnishing below, not the full CELL_SIZE x WALL_HEIGHT block a real
    // "door" entity uses) so it reads as an actual doorway, but
    // permanently passable and visible from the very first frame, with
    // no button/password_lock/other trigger. The earlier onFileRead ->
    // MapEntitySystem.openNoteDoor() mechanism this door used to be wired
    // to (workstation_terminal's note.txt reveal opening it as a
    // narrative consequence) has been removed entirely, not just
    // disconnected -- it has no purpose left now that this door is always
    // open regardless of whether note.txt is ever read. See CLAUDE.md's
    // decisions log.
    {
      id: "campaign_door_5",
      type: "decoration",
      variant: "door_prop",
      rotationY: 30,
      position: [35.5, 2, 44.7],
    },
    // Data Center placeholder furnishing: rough placements only, the
    // player will rearrange all of this by hand afterward -- exact
    // positions don't matter beyond "inside the room and not overlapping
    // each other," confirmed against the live grid (rows ~22-27, cols
    // ~18-25) rather than assumed, the same discipline every prior task
    // touching this file has needed. Sequential, predictable ids
    // (campaign_server_rack_1..9, campaign_decoration_5..7) so this batch
    // is easy to find and re-edit once the room's real layout is designed.
    // Data Center polish: respaced along Z for the new, more than doubled
    // SERVER_RACK_SIZE depth (was 0.6, now 1.2) -- the original 1-unit
    // step would have overlapped every adjacent pair. New 1.25 step (a
    // small gap, not touching) re-verified against a fresh script parse of
    // the live grid, confirmed open floor for all 9, not assumed from the
    // old comment's rough row/col estimate.
    { id: "campaign_server_rack_1", type: "decoration", variant: "server_rack", position: [49, 0, 45.9] },
    { id: "campaign_server_rack_2", type: "decoration", variant: "server_rack", position: [49, 0, 47.15] },
    { id: "campaign_server_rack_3", type: "decoration", variant: "server_rack", position: [49, 0, 48.4] },
    { id: "campaign_server_rack_4", type: "decoration", variant: "server_rack", position: [49, 0, 49.65] },
    { id: "campaign_server_rack_5", type: "decoration", variant: "server_rack", position: [49, 0, 50.9] },
    { id: "campaign_server_rack_6", type: "decoration", variant: "server_rack", position: [49, 0, 52.15] },
    { id: "campaign_server_rack_7", type: "decoration", variant: "server_rack", position: [49, 0, 53.4] },
    { id: "campaign_server_rack_8", type: "decoration", variant: "server_rack", position: [49, 0, 54.65] },
    { id: "campaign_server_rack_9", type: "decoration", variant: "server_rack", position: [49, 0, 55.9] },
    // Desk/coffee-cup/terminal grouping, mirroring the existing Room 2
    // desk+terminal pairing (checkpoint 20): terminal and cup both rest
    // at the desk's own y=1.1 surface height. campaign_terminal_6 links
    // to a placeholder TerminalDef (data_center_terminal, content/
    // terminals.ts) -- the room's real puzzle isn't designed yet. Data
    // Center polish: variant is now "black_desk" (wider, collidable, its
    // own dark material -- see MapEntitySystem.ts's decisions log; Room
    // 2's own "desk" entity is untouched and still renders identically).
    { id: "campaign_desk_2", type: "decoration", variant: "black_desk", position: [45, 0, 45] },
    // Data Center polish: promoted from a "decoration" to its own
    // "coffee_cup" MapEntity type, gated by the new campaign_tape_roll_1
    // pickup below (requiresItem) -- see MapEntitySystem.ts's
    // createCoffeeCup()/createTapeRoll() and the decisions log for the
    // narrowly-scoped live-prompt-update wiring between this specific
    // pair. Position/y unchanged from the prior decoration.
    { id: "campaign_coffee_cup_1", type: "coffee_cup", requiresItem: "campaign_tape_roll_1", position: [45.3, 1.2, 45] },
    {
      id: "campaign_terminal_6",
      type: "terminal",
      linkedTo: "data_center_terminal",
      rotationY: 0,
      position: [45, 1.1, 45],
    },
    // Data Center polish: two always-off decorative computers flanking
    // campaign_terminal_6, plus a phone and a mouse -- all pure flavor,
    // zero interactivity, resting on the new wider black_desk (spans
    // x 43.8-46.2 at this desk's position/rotation).
    { id: "campaign_computer_off_1", type: "decoration", variant: "computer_off", position: [44.25, 1.1, 45] },
    { id: "campaign_computer_off_2", type: "decoration", variant: "computer_off", position: [45.75, 1.1, 45] },
    { id: "campaign_phone_1", type: "decoration", variant: "phone", position: [44.6, 1.1, 44.85] },
    { id: "campaign_computer_mouse_1", type: "decoration", variant: "computer_mouse", position: [45.35, 1.1, 44.85] },
    // Scattered junk. campaign_decoration_6's original rough spot ([52,
    // 0.3, 43]) landed on col 26 -- the map's own east border wall, not
    // open floor -- confirmed via a script-parsed grid check rather than
    // assumed; nudged to [50, 0.3, 44], confirmed open.
    { id: "campaign_decoration_5", type: "decoration", variant: "crate", position: [43, 0.3, 52] },
    { id: "campaign_decoration_6", type: "decoration", variant: "debris", position: [50, 0.3, 44] },
    { id: "campaign_decoration_7", type: "decoration", variant: "crate", position: [41, 0.3, 48] },
    // Data Center polish: gates campaign_coffee_cup_1 above (requiresItem).
    // Placed loosely near the existing junk (campaign_decoration_7, a
    // crate) rather than in the open -- a placeholder position, confirmed
    // open floor via the same script-parsed grid check as everything else
    // in this room, expected to be moved by hand later.
    {
      id: "campaign_tape_roll_1",
      type: "tape_roll",
      interactPrompt: "Press E to pick up clear tape roll",
      position: [41.5, 0.03, 47.5],
    },
  ],
  },
];
