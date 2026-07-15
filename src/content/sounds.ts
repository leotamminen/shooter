import type { SoundDef } from "../types";

export const SOUNDS: SoundDef[] = [
  {
    id: "pistol_fire",
    path: "/sounds/pistol_fire.wav",
    volume: 0.5,
    positional: false,
    loop: false,
  },
  // Checkpoint 23 fix: MAC-10/AK-47 each got their own real fire-sound
  // recording (replacing the checkpoint-15/23 pistol_fire reuse) -- same
  // non-positional convention as pistol_fire, since it's always the local
  // player's own weapon, never something with a 3D source.
  {
    id: "mac10_fire",
    path: "/sounds/mac10_fire.wav",
    volume: 0.5,
    positional: false,
    loop: false,
  },
  {
    id: "ak47_single",
    path: "/sounds/ak47_single.wav",
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
  // AK-47 reload sounds (checkpoint 25): six synthesized placeholder tones,
  // the same Node-generated-PCM technique every other placeholder sound in
  // this project already uses -- clearly named for later replacement, not
  // meant to ship as final audio. All non-positional, same rationale as
  // pistol_fire: always the local player's own action, never a 3D source.
  // core/ReloadSequencer.ts plays each once, at the moment its own phase
  // begins -- see that file for the phase-to-sound mapping.
  {
    id: "reload_mag_out",
    path: "/sounds/reload_mag_out.wav",
    volume: 0.5,
    positional: false,
    loop: false,
  },
  // A soft sway/rustle, not a hard sound -- deliberately quieter than the
  // others, since this is the new magazine merely being brought into
  // position, not an impact.
  {
    id: "reload_mag_rise",
    path: "/sounds/reload_mag_rise.wav",
    volume: 0.3,
    positional: false,
    loop: false,
  },
  {
    id: "reload_mag_in",
    path: "/sounds/reload_mag_in.wav",
    volume: 0.5,
    positional: false,
    loop: false,
  },
  {
    id: "reload_bolt_pull",
    path: "/sounds/reload_bolt_pull.wav",
    volume: 0.5,
    positional: false,
    loop: false,
  },
  // Deliberately the most percussive of the set -- a hard, sharp click,
  // distinct in character from the other five, matching the "bolt snapping
  // forward" moment it represents.
  {
    id: "reload_bolt_release",
    path: "/sounds/reload_bolt_release.wav",
    volume: 0.6,
    positional: false,
    loop: false,
  },
  // The one sound used for M1911/MAC-10's simple generic dip (see
  // WeaponSystem.onReloadStart's non-AK-47 branch in main.ts) -- distinct
  // from all five AK-47-specific phase sounds above, since neither of those
  // weapons has named parts for a real phase sequence to play against.
  {
    id: "reload_generic",
    path: "/sounds/reload_generic.wav",
    volume: 0.5,
    positional: false,
    loop: false,
  },
];
