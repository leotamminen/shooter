import * as THREE from "three";
import { createFistMesh, createKnifeMesh } from "./utils/HandMesh";

const VIEWMODEL_FOV = 50;
const VIEWMODEL_NEAR = 0.01;
const VIEWMODEL_FAR = 10;

// The resting/start pose both performances begin from -- roughly where a
// held knife would sit in a relaxed guard, in front of and slightly below
// the camera. Verified against this viewmodel's own camera projection
// (checkpoint 22 in-browser pass): the first-guess (0.15, -0.15, -0.25)
// projected below the visible frame entirely (its own y magnitude exceeded
// the vertical frustum bound at that depth) -- adjusted to sit farther from
// the camera (more negative z) with a shallower y so the resting pose is
// actually on-screen, confirmed via THREE.Vector3.project().
const GUARD_POSITION = { x: 0.15, y: -0.1, z: -0.35 };

// Stab (checkpoint 22): a quick two-part tween, not built on ImpulseOffset
// -- see CLAUDE.md's decisions log for why a decaying/snapping impulse is
// the wrong feel for a deliberate, choreographed attack. First ~35% of
// STAB_DURATION eases out into a forward thrust; the remaining ~65% eases
// in toward a quick pull back in and down (the "nopea liike itseen päin ja
// alas" motion), ending low enough to visually hand off to the carrier
// rising back into view "from below" in MeleeSequencer's return phase --
// the pullback position is deliberately allowed to project off-screen
// (unlike GUARD_POSITION/STAB_THRUST_POSITION above, which were corrected
// specifically because they need to stay visible mid-performance). Same
// relative deltas from GUARD_POSITION as the original first-guess values,
// re-based onto the corrected guard pose above.
const STAB_DURATION = 0.2;
const STAB_THRUST_FRACTION = 0.35;
const STAB_THRUST_POSITION = { x: 0.15, y: -0.1, z: -0.55 };
const STAB_PULLBACK_POSITION = { x: 0.05, y: -0.3, z: -0.25 };

// Swing (checkpoint 22): a single accelerating sweep of local X from the
// guard position past the left edge of view. Z/Y are left at the guard
// pose's own values throughout -- a straight sideways sweep reads clearly
// enough without also arcing depth/height, and adding that would be
// tuning complexity with no clear payoff. First-guess numbers, tuned by
// eye in-browser.
const SWING_DURATION = 0.25;
const SWING_END_X = -0.6;

type Performance = "stab" | "swing" | null;

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeIn(t: number): number {
  return t * t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Renders the one-and-only melee performer: a right hand gripping a knife,
// never a left hand, never a weapon model -- the performance is always
// identical regardless of what the player has equipped, per this
// checkpoint's own design (only the retract/return carrier around it
// differs, see MeleeSequencer.ts). Copies WeaponViewmodel/HandsViewmodel's
// proven dual-scene/camera, second-pass depth-cleared render technique
// rather than inventing a new one.
//
// Both performances are explicit, driven, timed interpolations -- not
// built on the shared ImpulseOffset mechanism WeaponViewmodel/
// HandsViewmodel use for fire-kick/swap-dip/idle impulses. ImpulseOffset's
// whole design is "decay linearly back toward zero from wherever the base
// pose already is," which is the wrong shape for a performance with a
// specific choreographed start, middle, and end pose -- this needs a
// controlled tween with a known duration MeleeSequencer can query
// (getDuration()) to plan its own phase timing around, not an offset that
// merely fades out on its own schedule. See CLAUDE.md's decisions log.
export class MeleeViewmodel {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly hand: THREE.Group;

  private currentPerformance: Performance = null;
  private elapsed = 0;

  constructor() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      VIEWMODEL_FOV,
      window.innerWidth / window.innerHeight,
      VIEWMODEL_NEAR,
      VIEWMODEL_FAR,
    );
    this.scene.add(this.camera);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    // Checkpoint 22 fix: a closed fist + forearm (createFistMesh()), not
    // createHandMesh()'s open, fanned-fingers hand -- a different pose for
    // gripping a knife, with a forearm segment long enough to always
    // render off the bottom of the screen instead of visibly ending
    // mid-air. HandsViewmodel's idle open-hand pair is unaffected -- it
    // still calls createHandMesh() directly, unchanged.
    this.hand = createFistMesh();
    const knife = createKnifeMesh();
    // createKnifeMesh() extends its blade along local +Z (the same
    // direction createHandMesh()'s fingers curl toward, i.e. toward the
    // camera once attached with no rotation) -- flipped 180° here so the
    // blade points away from the camera (-Z, toward whatever's being
    // attacked) with the hilt nearer the camera, matching a normal grip.
    knife.rotation.y = Math.PI;
    this.hand.add(knife);
    this.hand.position.set(GUARD_POSITION.x, GUARD_POSITION.y, GUARD_POSITION.z);
    this.camera.add(this.hand);

    window.addEventListener("resize", this.handleResize);
  }

  private readonly handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };

  playStab(): void {
    this.currentPerformance = "stab";
    this.elapsed = 0;
  }

  playSwing(): void {
    this.currentPerformance = "swing";
    this.elapsed = 0;
  }

  isPerforming(): boolean {
    return this.currentPerformance !== null;
  }

  // Total time the currently-playing performance takes -- 0 when nothing
  // is playing. MeleeSequencer reads this once, right after calling
  // playStab()/playSwing(), to know how long to hold its own "performing"
  // phase before transitioning to "returning".
  getDuration(): number {
    if (this.currentPerformance === "stab") return STAB_DURATION;
    if (this.currentPerformance === "swing") return SWING_DURATION;
    return 0;
  }

  // Called every frame MeleeSequencer is in its "performing" phase.
  update(deltaTime: number): void {
    if (!this.currentPerformance) {
      this.hand.position.set(GUARD_POSITION.x, GUARD_POSITION.y, GUARD_POSITION.z);
      return;
    }

    this.elapsed += deltaTime;
    const duration = this.getDuration();
    const t = Math.min(1, this.elapsed / duration);

    if (this.currentPerformance === "stab") {
      if (t < STAB_THRUST_FRACTION) {
        const localT = easeOut(t / STAB_THRUST_FRACTION);
        this.hand.position.set(
          lerp(GUARD_POSITION.x, STAB_THRUST_POSITION.x, localT),
          lerp(GUARD_POSITION.y, STAB_THRUST_POSITION.y, localT),
          lerp(GUARD_POSITION.z, STAB_THRUST_POSITION.z, localT),
        );
      } else {
        const localT = easeIn((t - STAB_THRUST_FRACTION) / (1 - STAB_THRUST_FRACTION));
        this.hand.position.set(
          lerp(STAB_THRUST_POSITION.x, STAB_PULLBACK_POSITION.x, localT),
          lerp(STAB_THRUST_POSITION.y, STAB_PULLBACK_POSITION.y, localT),
          lerp(STAB_THRUST_POSITION.z, STAB_PULLBACK_POSITION.z, localT),
        );
      }
    } else {
      const localT = easeIn(t);
      this.hand.position.set(
        lerp(GUARD_POSITION.x, SWING_END_X, localT),
        GUARD_POSITION.y,
        GUARD_POSITION.z,
      );
    }

    if (t >= 1) {
      this.currentPerformance = null;
    }
  }

  // The second render pass -- identical technique to WeaponViewmodel's own
  // render(), see that method's comment for why autoClear is toggled.
  render(renderer: THREE.WebGLRenderer): void {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }
}
