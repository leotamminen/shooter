import * as THREE from "three";
import type { Weapon } from "../types";
import type { AudioSystem } from "./AudioSystem";
import { AK47_MAGAZINE_REST_POSITION, AK47_BOLT_REST_POSITION } from "./utils/WeaponMesh";

type ReloadPhase =
  | "tiltOut"
  | "magOut"
  | "magRise"
  | "magIn"
  | "boltPull"
  | "boltRelease"
  | "tiltBack";

interface PhaseBreakpoint {
  phase: ReloadPhase;
  start: number; // fraction of the full reload duration, 0-1
  end: number;
  sound?: string; // SoundDef id, played once at the instant this phase begins
}

// Two percentage-breakpoint tables (checkpoint 25) -- each phase's duration
// is a PERCENTAGE of weapon.reloadTime, never a hardcoded second value, so
// a future reload-speed perk scales the whole choreography automatically
// just by changing the one number the underlying WeaponSystem reload timer
// already reads. Each table's breakpoints sum to exactly the reload's full
// duration (0 to 1). First-guess splits, tuned by eye in-browser.
//
// Empty reload (fired the mag dry): includes the bolt-rack phases, since a
// round is never chambered.
const EMPTY_RELOAD_PHASES: PhaseBreakpoint[] = [
  { phase: "tiltOut", start: 0, end: 0.12 },
  { phase: "magOut", start: 0.12, end: 0.3, sound: "reload_mag_out" },
  { phase: "magRise", start: 0.3, end: 0.45, sound: "reload_mag_rise" },
  { phase: "magIn", start: 0.45, end: 0.6, sound: "reload_mag_in" },
  { phase: "boltPull", start: 0.6, end: 0.72, sound: "reload_bolt_pull" },
  { phase: "boltRelease", start: 0.72, end: 0.88, sound: "reload_bolt_release" },
  { phase: "tiltBack", start: 0.88, end: 1 },
];

// Tactical reload (ammo still chambered): the bolt-rack phases are skipped
// entirely -- one round is already chambered, there's nothing to rack.
const TACTICAL_RELOAD_PHASES: PhaseBreakpoint[] = [
  { phase: "tiltOut", start: 0, end: 0.15 },
  { phase: "magOut", start: 0.15, end: 0.38, sound: "reload_mag_out" },
  { phase: "magRise", start: 0.38, end: 0.58, sound: "reload_mag_rise" },
  { phase: "magIn", start: 0.58, end: 0.8, sound: "reload_mag_in" },
  { phase: "tiltBack", start: 0.8, end: 1 },
];

// First-guess magnitudes, tuned by eye in-browser -- see WeaponMesh.ts's own
// local-space convention (+Z toward the muzzle) for why these signs read as
// "down and back toward the player" / "straight back."
const MAX_TILT_ANGLE = 0.55; // radians, added to displayGroup.rotation.z
const MAGAZINE_OUT_OFFSET = { x: 0.02, y: -0.18, z: -0.05 };
const BOLT_PULL_OFFSET = { x: 0, y: 0, z: -0.05 };
// A small adjustment so the support hand's grip doesn't sit exactly at the
// magazine's own geometric center while tracking it.
const SUPPORT_HAND_MAG_GRIP_ADJUST = { x: -0.015, y: -0.01, z: 0.01 };

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeIn(t: number): number {
  return t * t;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Checkpoint 25: a phase-timer sequencer, similar in spirit to
// MeleeSequencer but structurally different -- it never takes over
// rendering from WeaponViewmodel (the AK-47 stays visible and rendered
// normally throughout a reload). It just supplies additional offsets/
// rotations that WeaponViewmodel layers on top of the AK-47's normal
// rendering while a reload is active. Not built on core/utils/StateMachine.ts
// -- reload phases advance purely by elapsed-time-vs-percentage-breakpoint
// comparison, not by discrete enter/exit events, so a simple elapsed-time +
// breakpoint-table lookup fit more directly than forcing per-phase
// onEnter/onExit machinery for what's fundamentally "which time bucket am I
// in right now."
export class ReloadSequencer {
  private readonly audioSystem: AudioSystem;

  private active = false;
  private elapsed = 0;
  private totalDuration = 1;
  private phases: PhaseBreakpoint[] = EMPTY_RELOAD_PHASES;
  private emptyReload = true;
  // The weapon's own static supportHandOffset (checkpoint 24), captured at
  // trigger() time -- what getSupportHandOverride() eases back toward
  // during the closing phase(s), and the value main.ts/WeaponViewmodel
  // falls back to whenever this sequencer returns null.
  private restSupportHandOffset: { x: number; y: number; z: number } | null = null;

  private currentPhase: PhaseBreakpoint | null = null;
  private currentLocalFraction = 0;
  private globalFraction = 0;
  // Tracks which phase's one-shot sound has already played -- the same
  // "have I already fired this transition" guard any one-shot trigger
  // elsewhere in this codebase already uses (e.g. MeleeSequencer's own
  // per-phase onEnter calls, which only ever run once per transition).
  private lastPhaseName: ReloadPhase | null = null;

  constructor(audioSystem: AudioSystem) {
    this.audioSystem = audioSystem;
  }

  // Called once, from WeaponSystem's onReloadStart callback (main.ts),
  // only for the AK-47 -- M1911/MAC-10 use the simpler generic
  // ImpulseOffset dip instead (see WeaponViewmodel.ts/main.ts).
  trigger(weapon: Weapon, emptyReload: boolean): void {
    this.active = true;
    this.elapsed = 0;
    this.totalDuration = weapon.reloadTime ?? 1;
    this.emptyReload = emptyReload;
    this.phases = emptyReload ? EMPTY_RELOAD_PHASES : TACTICAL_RELOAD_PHASES;
    this.restSupportHandOffset = weapon.supportHandOffset ?? null;
    this.currentPhase = this.phases[0];
    this.currentLocalFraction = 0;
    this.globalFraction = 0;
    this.lastPhaseName = null;
  }

  // Called every frame gameplay is active, regardless of whether a reload
  // is in progress -- a no-op while !active, the same "harmless every
  // frame" shape MeleeSequencer.update() already has.
  update(deltaTime: number): void {
    if (!this.active) return;

    this.elapsed += deltaTime;
    if (this.elapsed >= this.totalDuration) {
      this.active = false;
      this.currentPhase = null;
      return;
    }

    this.globalFraction = this.elapsed / this.totalDuration;
    const phase =
      this.phases.find((p) => this.globalFraction < p.end) ?? this.phases[this.phases.length - 1];
    this.currentPhase = phase;
    this.currentLocalFraction = clamp01(
      (this.globalFraction - phase.start) / (phase.end - phase.start),
    );

    if (phase.phase !== this.lastPhaseName) {
      this.lastPhaseName = phase.phase;
      if (phase.sound) this.audioSystem.play(phase.sound);
    }
  }

  isActive(): boolean {
    return this.active;
  }

  // Radians added to the weapon display group's rotation.z -- 0 outside the
  // tilt-out/tilt-back ramps, held at MAX_TILT_ANGLE through every phase in
  // between.
  getTiltAngle(): number {
    if (!this.currentPhase) return 0;
    if (this.currentPhase.phase === "tiltOut") {
      return MAX_TILT_ANGLE * easeOut(this.currentLocalFraction);
    }
    if (this.currentPhase.phase === "tiltBack") {
      return MAX_TILT_ANGLE * (1 - easeIn(this.currentLocalFraction));
    }
    return MAX_TILT_ANGLE;
  }

  // Added on top of AK47_MAGAZINE_NAME's rest local position. Moves down
  // and out during mag-out, then eases back toward (0,0,0) continuously
  // across mag-rise/mag-in (one combined ease, not two disjoint ones, so
  // there's no visible kink at their shared boundary).
  getMagazineOffset(): THREE.Vector3 {
    if (!this.currentPhase) return new THREE.Vector3();

    if (this.currentPhase.phase === "magOut") {
      const t = easeOut(this.currentLocalFraction);
      return new THREE.Vector3(
        lerp(0, MAGAZINE_OUT_OFFSET.x, t),
        lerp(0, MAGAZINE_OUT_OFFSET.y, t),
        lerp(0, MAGAZINE_OUT_OFFSET.z, t),
      );
    }

    if (this.currentPhase.phase === "magRise" || this.currentPhase.phase === "magIn") {
      const t = easeInOut(this.combinedFraction(["magRise", "magIn"]));
      return new THREE.Vector3(
        lerp(MAGAZINE_OUT_OFFSET.x, 0, t),
        lerp(MAGAZINE_OUT_OFFSET.y, 0, t),
        lerp(MAGAZINE_OUT_OFFSET.z, 0, t),
      );
    }

    return new THREE.Vector3();
  }

  // Added on top of AK47_BOLT_NAME's rest local position. (0,0,0) except
  // during bolt-pull (moves back) and bolt-release (a fast ease-in snap
  // back to (0,0,0) -- the "spring-loaded" feel). Never active at all
  // during a tactical reload, since TACTICAL_RELOAD_PHASES has no
  // boltPull/boltRelease entries for currentPhase to ever be.
  getBoltOffset(): THREE.Vector3 {
    if (!this.currentPhase) return new THREE.Vector3();

    if (this.currentPhase.phase === "boltPull") {
      const t = easeOut(this.currentLocalFraction);
      return new THREE.Vector3(
        lerp(0, BOLT_PULL_OFFSET.x, t),
        lerp(0, BOLT_PULL_OFFSET.y, t),
        lerp(0, BOLT_PULL_OFFSET.z, t),
      );
    }

    if (this.currentPhase.phase === "boltRelease") {
      const t = easeIn(this.currentLocalFraction);
      return new THREE.Vector3(
        lerp(BOLT_PULL_OFFSET.x, 0, t),
        lerp(BOLT_PULL_OFFSET.y, 0, t),
        lerp(BOLT_PULL_OFFSET.z, 0, t),
      );
    }

    return new THREE.Vector3();
  }

  // null when not active, or during tilt-out (support hand uses its normal
  // static supportHandOffset from checkpoint 24 -- see WeaponViewmodel.ts's
  // fallback). During mag-out/mag-rise/mag-in, roughly tracks the
  // magazine's current animated position plus a small grip adjustment.
  // During bolt-pull, tracks the bolt's position. During bolt-release (and
  // tiltBack, for both reload kinds), eases back toward the weapon's own
  // resting supportHandOffset captured at trigger() -- the hand lets go and
  // the bolt/magazine finishes settling on its own.
  getSupportHandOverride(): THREE.Vector3 | null {
    if (!this.currentPhase) return null;

    if (
      this.currentPhase.phase === "magOut" ||
      this.currentPhase.phase === "magRise" ||
      this.currentPhase.phase === "magIn"
    ) {
      const magOffset = this.getMagazineOffset();
      return new THREE.Vector3(
        AK47_MAGAZINE_REST_POSITION.x + magOffset.x + SUPPORT_HAND_MAG_GRIP_ADJUST.x,
        AK47_MAGAZINE_REST_POSITION.y + magOffset.y + SUPPORT_HAND_MAG_GRIP_ADJUST.y,
        AK47_MAGAZINE_REST_POSITION.z + magOffset.z + SUPPORT_HAND_MAG_GRIP_ADJUST.z,
      );
    }

    if (this.currentPhase.phase === "boltPull") {
      const boltOffset = this.getBoltOffset();
      return new THREE.Vector3(
        AK47_BOLT_REST_POSITION.x + boltOffset.x,
        AK47_BOLT_REST_POSITION.y + boltOffset.y,
        AK47_BOLT_REST_POSITION.z + boltOffset.z,
      );
    }

    if (this.currentPhase.phase === "boltRelease" || this.currentPhase.phase === "tiltBack") {
      if (!this.restSupportHandOffset) return null;
      // Combined across both phases when both exist (empty reload) so
      // there's no kink at their shared boundary -- a tactical reload's
      // phase table has no "boltRelease" entry, so this naturally reduces
      // to just tiltBack's own range.
      const t = easeInOut(this.combinedFraction(["boltRelease", "tiltBack"]));
      // Eases from wherever the hand was last tracking something real: the
      // bolt (empty reload, which just finished boltPull) or the magazine
      // (tactical reload, which just finished magIn) -- both already back
      // at their own rest position by the time this phase starts, since
      // getBoltOffset()/getMagazineOffset() have each already eased to
      // (0,0,0) by their own phase's end.
      const from = this.emptyReload ? AK47_BOLT_REST_POSITION : AK47_MAGAZINE_REST_POSITION;
      return new THREE.Vector3(
        lerp(from.x, this.restSupportHandOffset.x, t),
        lerp(from.y, this.restSupportHandOffset.y, t),
        lerp(from.z, this.restSupportHandOffset.z, t),
      );
    }

    return null; // tiltOut
  }

  private combinedFraction(phaseNames: ReloadPhase[]): number {
    const relevant = this.phases.filter((p) => phaseNames.includes(p.phase));
    if (relevant.length === 0) return 0;
    const start = relevant[0].start;
    const end = relevant[relevant.length - 1].end;
    return clamp01((this.globalFraction - start) / (end - start));
  }
}
