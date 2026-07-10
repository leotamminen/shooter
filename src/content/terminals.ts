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
  // room2_terminal (checkpoint 19): no password, no files -- its only
  // purpose is the "whoami" command, watched for by main.ts's onCommand
  // callback to open Room 3's door and advance Campaign to "complete".
  {
    id: "room2_terminal",
    username: "svc-maintenance",
    root: {
      name: "/",
      files: [],
      directories: [],
    },
  },
];
