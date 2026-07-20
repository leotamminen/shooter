import type { TerminalDef } from "../types";

// The password lives in exactly one place in source -- this constant --
// even though it also appears (via template-literal interpolation, not a
// second hardcoded copy) inside the fake filesystem's file content below.
// If this file ever changes, never hardcode the password a second time.
const ROOM1_PASSWORD = "X7K-92Q4";

export const TERMINALS: TerminalDef[] = [
  {
    id: "room1_terminal",
    password: ROOM1_PASSWORD,
    // Root has zero files directly in it and exactly one subdirectory, so
    // "cd" is actually exercised by a player solving this, not dead
    // functionality only "ls"/"cat" ever touch.
    root: {
      name: "/",
      files: [],
      directories: [
        {
          name: "backup",
          files: [
            {
              name: "credentials.txt",
              // Checkpoint 19: {{VAULT_PIN}} is substituted live by
              // ui/Terminal.ts's runCat() with Campaign's current per-run
              // vault pin (via a getVaultPin callback) -- it is never a
              // literal value in source, unlike ROOM1_PASSWORD above,
              // since the vault pin regenerates every run and this content
              // string is static.
              content: `Top secret do not share this!
// TODO: hide the password better
door override password: ${ROOM1_PASSWORD}

vault pin: {{VAULT_PIN}}`,
            },
          ],
          directories: [],
        },
      ],
    },
  },
  // room2_terminal (checkpoint 19): no password, no files -- its username
  // is revealed by the "whoami" command and checked by Room 3's real
  // password_lock (campaign_lock_3, secretField: "username" in
  // content/maps.ts), which is what actually opens the door.
  {
    id: "room2_terminal",
    username: "svc-maintenance",
    root: {
      name: "/",
      files: [],
      directories: [],
    },
  },
  // room3_terminal: teaches hidden-file discovery ("ls -a") rather than a
  // straight cat-the-obvious-file puzzle -- ls with no flags only ever
  // shows the 8 non-hidden home-directory folders (see
  // ui/Terminal.ts's runLs() hidden-file convention), so a player has to
  // already know (or be told, via the paired "sign" decoration in
  // content/maps.ts) that dotfiles exist and go looking with -a before
  // .bash_history is even visible. password's copy-button still fires
  // automatically once .bash_history's content is read, via the existing
  // checkpoint-17 content.includes(password) mechanism -- no new
  // accessibility code needed.
  {
    id: "room3_terminal",
    password: "NIGHTFALL",
    root: {
      name: "/",
      files: [
        { name: ".bash_history", content: "doorctl unlock --code NIGHTFALL" },
        {
          name: ".bashrc",
          content: "# ~/.bashrc\n# User-specific aliases and functions\nalias ll='ls -la'",
        },
        {
          name: ".bash_logout",
          content: "# ~/.bash_logout\n# executed by bash when login shell exits",
        },
      ],
      directories: [
        { name: "Desktop", files: [], directories: [] },
        { name: "Documents", files: [], directories: [] },
        { name: "Downloads", files: [], directories: [] },
        { name: "Music", files: [], directories: [] },
        { name: "Pictures", files: [], directories: [] },
        { name: "Public", files: [], directories: [] },
        { name: "Templates", files: [], directories: [] },
        { name: "Videos", files: [], directories: [] },
        { name: ".cache", files: [], directories: [] },
        { name: ".config", files: [], directories: [] },
      ],
    },
  },
  // empty_room_terminal: the pair of terminals in the pillar room (linkedTo
  // this) exist purely to carry the silent paired-teleport effect
  // (MapEntity.teleportPairId) -- deliberately unremarkable, no password,
  // no secret, just enough of a filesystem that "ls"/"cd" aren't dead
  // commands here. Not room1_terminal's real puzzle content and not a
  // second copy of it -- reusing puzzle content in a room where nothing is
  // actually being solved would be confusing, implying a password matters
  // here when it doesn't.
  {
    id: "empty_room_terminal",
    root: {
      name: "/",
      files: [],
      directories: [
        { name: "misc", files: [], directories: [] },
        { name: "temp", files: [], directories: [] },
      ],
    },
  },
];
