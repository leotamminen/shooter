import type { SoundDef } from "../types";

export const SOUNDS: SoundDef[] = [
  {
    id: "pistol_fire",
    path: "/sounds/pistol_fire.wav",
    volume: 0.5,
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
