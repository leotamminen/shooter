import * as THREE from "three";
import { StateMachine } from "./utils/StateMachine";
import type { WeaponSystem } from "./WeaponSystem";
import type { MeleeViewmodel } from "./MeleeViewmodel";

type MeleePhase = "idle" | "retracting" | "performing" | "returning";

// Symmetric with RETURN_DURATION -- both first-guess values, tuned by eye
// in-browser. "performing"'s own duration isn't a constant here: it comes
// from meleeViewmodel.getDuration(), read once right after playStab()/
// playSwing() is called, since stab and swing take different amounts of
// time.
const RETRACT_DURATION = 0.12;
const RETURN_DURATION = 0.12;

// How far out of view the carrier (weapon or hands) translates during
// "retracting", held fixed there through the whole "performing" phase, and
// eased back from during "returning". Well below the frame at this
// viewmodel scale -- first-guess value, tuned by eye in-browser.
const HIDDEN_OFFSET = new THREE.Vector3(0, -0.5, 0);

const ZERO_OFFSET = new THREE.Vector3(0, 0, 0);

// Orchestrates the checkpoint-22 three-phase melee sequence: whatever's
// currently shown (weapon or hands) retracts out of view, MeleeViewmodel's
// dedicated right-hand-plus-knife performance plays, then the same carrier
// returns to its resting position. Reuses core/utils/StateMachine.ts --
// the same generic context-driven state machine EnemyAI already uses for
// its own idle/chase/attack states -- rather than a bespoke mechanism,
// since a small set of named phases each with their own enter/per-frame
// logic is exactly the shape that class was built for. Like EnemyAI's own
// usage, phase *transitions* are decided by this class's own update() (by
// comparing the just-advanced phaseElapsed against each phase's duration),
// not by the StateMachine itself -- it only ever advances whichever
// phase's timer/interpolation is currently active.
export class MeleeSequencer {
  private readonly weaponSystem: WeaponSystem;
  private readonly meleeViewmodel: MeleeViewmodel;

  private readonly stateMachine: StateMachine<MeleePhase, MeleeSequencer>;
  private phaseElapsed = 0;
  private performingDuration = 0;
  private capturedWasWeaponActive = false;
  private capturedHitEnemy = false;
  private readonly carrierOffset = new THREE.Vector3();

  constructor(weaponSystem: WeaponSystem, meleeViewmodel: MeleeViewmodel) {
    this.weaponSystem = weaponSystem;
    this.meleeViewmodel = meleeViewmodel;

    this.stateMachine = new StateMachine<MeleePhase, MeleeSequencer>(
      "idle",
      {
        idle: {},
        retracting: {
          onEnter: (self) => {
            self.phaseElapsed = 0;
          },
          onUpdate: (self, delta) => {
            self.phaseElapsed += delta;
            const t = Math.min(1, self.phaseElapsed / RETRACT_DURATION);
            self.carrierOffset.lerpVectors(ZERO_OFFSET, HIDDEN_OFFSET, t);
          },
        },
        performing: {
          onEnter: (self) => {
            self.phaseElapsed = 0;
            self.carrierOffset.copy(HIDDEN_OFFSET);
            if (self.capturedHitEnemy) {
              self.meleeViewmodel.playStab();
            } else {
              self.meleeViewmodel.playSwing();
            }
            self.performingDuration = self.meleeViewmodel.getDuration();
          },
          onUpdate: (self, delta) => {
            self.phaseElapsed += delta;
            self.meleeViewmodel.update(delta);
          },
        },
        returning: {
          onEnter: (self) => {
            self.phaseElapsed = 0;
          },
          onUpdate: (self, delta) => {
            self.phaseElapsed += delta;
            const t = Math.min(1, self.phaseElapsed / RETURN_DURATION);
            self.carrierOffset.lerpVectors(HIDDEN_OFFSET, ZERO_OFFSET, t);
          },
        },
      },
      this,
    );
  }

  // Called from the onMeleeAttack wiring (main.ts), the instant WeaponSystem
  // resolves a melee attack. Captures which carrier (weapon vs hands) was
  // active *at this moment* -- not read again later, so a weapon pickup/
  // switch mid-sequence can't retroactively change which viewmodel this
  // specific swing hands off to (see CLAUDE.md's decisions log for the
  // known, deliberately-unhandled edge case this doesn't fully solve).
  trigger(hitEnemy: boolean): void {
    if (this.stateMachine.state !== "idle") return; // shouldn't normally happen -- WeaponSystem's own melee cooldown already blocks a second V press mid-sequence
    this.capturedWasWeaponActive = this.weaponSystem.hasActiveWeapon();
    this.capturedHitEnemy = hitEnemy;
    this.stateMachine.transition("retracting");
  }

  // Called every frame gameplay is active, regardless of phase -- a no-op
  // while idle (the "idle" phase has no onUpdate handler).
  update(deltaTime: number): void {
    this.stateMachine.update(deltaTime);

    switch (this.stateMachine.state) {
      case "retracting":
        if (this.phaseElapsed >= RETRACT_DURATION) this.stateMachine.transition("performing");
        break;
      case "performing":
        if (this.phaseElapsed >= this.performingDuration) this.stateMachine.transition("returning");
        break;
      case "returning":
        if (this.phaseElapsed >= RETURN_DURATION) this.stateMachine.transition("idle");
        break;
    }
  }

  isIdle(): boolean {
    return this.stateMachine.state === "idle";
  }

  // Which viewmodel main.ts should render this frame -- meaningless while
  // isIdle(). Only "performing" shows MeleeViewmodel; retracting/returning
  // both still show the carrier (mid-transition), just offset by
  // getCarrierOffset().
  getActiveLayer(): "carrier" | "melee" {
    return this.stateMachine.state === "performing" ? "melee" : "carrier";
  }

  // Which carrier (weapon vs hands) this sequence captured at trigger() --
  // meaningless while isIdle().
  wasWeaponActive(): boolean {
    return this.capturedWasWeaponActive;
  }

  // Current interpolated retract/return offset -- (0,0,0) during "idle"
  // (never read then) and held fixed at HIDDEN_OFFSET throughout
  // "performing" (also never read then, since getActiveLayer() routes to
  // "melee" and the carrier isn't rendered at all that phase).
  getCarrierOffset(): THREE.Vector3 {
    return this.carrierOffset;
  }
}
