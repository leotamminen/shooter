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
              content: `door override password: ${ROOM1_PASSWORD}`,
            },
          ],
          directories: [],
        },
      ],
    },
  },
];
