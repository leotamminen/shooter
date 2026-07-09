import type { SoundDef } from "../types";

export const SOUNDS: SoundDef[] = [
  {
    id: "pistol_fire",
    path: "/sounds/pistol_fire.wav",
    volume: 0.5,
    positional: false,
    loop: false,
  },
  // Melee attack sound (checkpoint 16): a synthesized placeholder,
  // generated the same way pistol_fire.wav originally was (a short
  // Node-generated tone, not a real recording -- see CLAUDE.md) --
  // deliberately a lower, heavier "thud" character rather than a sharp
  // click, so it's easy to tell apart from gunfire by ear. Non-positional,
  // like pistol_fire: it's always the local player's own action, not
  // something with a world position.
  {
    id: "melee_hit",
    path: "/sounds/melee_hit.wav",
    volume: 0.6,
    positional: false,
    loop: false,
  },
  {
    id: "zombie_growl",
    path: "/sounds/zombie_growl.wav",
    volume: 0.6,
    positional: true,
    loop: false,
  },
  {
    id: "zombie_death",
    path: "/sounds/zombie_death.wav",
    volume: 0.7,
    positional: true,
    loop: false,
  },
];
