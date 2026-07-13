// Recognized but permanently denied in every terminal, in every room -- a
// world-building constraint (the player never gets filesystem write access
// anywhere), not something any future TerminalDef can ever opt into.
export const BLOCKED_COMMANDS = ["touch", "mkdir", "rm", "cp", "mv", "rmdir", "chmod"];

// Recognized, denied by default, but a specific TerminalDef can opt a
// specific command in via TerminalDef.unlockedCommands -- the mechanism a
// future checkpoint will use to make e.g. "ping" actually work in one
// particular room's terminal without touching ui/Terminal.ts or this
// file's BLOCKED_COMMANDS at all. No real behavior is implemented for any
// of these yet even when unlocked -- see CLAUDE.md's future mechanics.
export const RESTRICTED_COMMANDS = ["ping", "ifconfig", "grep", "nmap"];

// The commands ui/Terminal.ts actually implements -- used to drive help's
// output so a future core command addition shows up there automatically,
// without needing to also hand-edit a separate help string.
export const CORE_COMMANDS: { name: string; description: string }[] = [
  { name: "ls", description: "list files and directories" },
  { name: "cd", description: "change directory" },
  { name: "cat", description: "print a file's contents" },
  { name: "pwd", description: "print the current directory path" },
  { name: "clear", description: "clear the terminal screen" },
  { name: "whoami", description: "print the current username" },
  { name: "help", description: "show this list" },
];
