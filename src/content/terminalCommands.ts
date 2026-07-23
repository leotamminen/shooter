// Recognized but permanently denied in every terminal, in every room -- a
// world-building constraint (the player never gets filesystem write access
// anywhere), not something any future TerminalDef can ever opt into.
export const BLOCKED_COMMANDS = ["touch", "mkdir", "rm", "cp", "mv", "rmdir", "chmod"];

// Recognized, denied by default, but a specific TerminalDef can opt a
// specific command in via TerminalDef.unlockedCommands -- the mechanism a
// future checkpoint will use to make e.g. "ping" actually work in one
// particular room's terminal without touching ui/Terminal.ts or this
// file's BLOCKED_COMMANDS at all. records_terminal puzzle follow-up: "grep"
// (unused since checkpoint 19) and the new "john" both get real behavior
// now, in ui/Terminal.ts's runGrep()/runJohn() -- "ping"/"ifconfig"/"nmap"
// remain inert even when unlocked, since nothing unlocks them yet.
export const RESTRICTED_COMMANDS = ["ping", "ifconfig", "grep", "nmap", "john"];

// records_terminal puzzle follow-up: a narrow, deliberate exception to
// help's own "don't list restricted/blocked commands" rule (checkpoint 19) --
// john's syntax has no real-world command a player could already know, so
// without some in-game hint the puzzle would be unsolvable rather than
// merely undiscovered, unlike grep (a real, widely-known command whose
// syntax needs no in-game teaching). Only an entry for a command the
// CURRENT terminal's own unlockedCommands actually includes is ever shown
// (see ui/Terminal.ts's runHelp()) -- most restricted commands, including
// grep, deliberately have no entry here at all.
export const RESTRICTED_COMMAND_USAGE: Record<string, string> = {
  john: "john --format=raw-<hash-type> <hash>",
};

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
