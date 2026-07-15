import * as THREE from "three";

interface Impulse {
  offset: { x: number; y: number; z: number };
  elapsed: number;
  decayTime: number;
}

// Extracted from WeaponViewmodel.ts (checkpoint 14) once HandsViewmodel.ts
// (checkpoint 21) became a second real consumer of the same sum/clamp/
// jitter mechanism -- per this project's own "shared/reusable logic goes in
// core/utils/" rule, duplicating it for a second class was exactly the
// situation that rule exists to prevent. maxMagnitude/jitterFrequency/
// jitterMaxAmplitude are constructor parameters, not module-level constants
// baked into the class, since the hands viewmodel needs its own,
// independently-tuned values for its own frustum/positioning setup, not
// necessarily the same numbers WeaponViewmodel was tuned against.
export class ImpulseOffset {
  private readonly impulses: Impulse[] = [];
  private jitterPhase = 0;

  private readonly maxMagnitude: number;
  private readonly jitterFrequency: number;
  private readonly jitterMaxAmplitude: number;

  constructor(maxMagnitude: number, jitterFrequency: number, jitterMaxAmplitude: number) {
    this.maxMagnitude = maxMagnitude;
    this.jitterFrequency = jitterFrequency;
    this.jitterMaxAmplitude = jitterMaxAmplitude;
  }

  // Adds a temporary offset that decays linearly from its full value back to
  // zero over decayTime seconds, then is discarded. Multiple concurrent
  // impulses sum rather than overwrite each other.
  addImpulse(offset: THREE.Vector3Like, decayTime: number): void {
    this.impulses.push({
      offset: { x: offset.x, y: offset.y, z: offset.z },
      elapsed: 0,
      decayTime,
    });
  }

  // Called once per frame; returns the current composed (summed, clamped,
  // jittered) offset. Callers add this to their own base/bob position.
  update(deltaTime: number): THREE.Vector3 {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let i = this.impulses.length - 1; i >= 0; i--) {
      const impulse = this.impulses[i];
      impulse.elapsed += deltaTime;
      if (impulse.elapsed >= impulse.decayTime) {
        this.impulses.splice(i, 1);
        continue;
      }
      const remaining = 1 - impulse.elapsed / impulse.decayTime;
      x += impulse.offset.x * remaining;
      y += impulse.offset.y * remaining;
      z += impulse.offset.z * remaining;
    }

    // Clamp the combined magnitude, preserving direction -- this is what
    // lets many overlapping/rapid impulses visibly stack up to the ceiling
    // and hold there (rather than being rejected outright), while
    // guaranteeing the result can never exceed maxMagnitude from the
    // caller's own base position.
    const magnitude = Math.hypot(x, y, z);
    if (magnitude > this.maxMagnitude) {
      const scale = this.maxMagnitude / magnitude;
      x *= scale;
      y *= scale;
      z *= scale;
    }

    // Proximity to the cap, measured against the pre-clamp magnitude so it
    // reads as 1 (full jitter) throughout a spam/hold, not just at the
    // instant the sum first crosses the cap. Cubed easing keeps jitter
    // negligible at low proximity (a single normal impulse) and only makes
    // it clearly visible once several impulses have stacked close to or
    // past the cap -- a smooth ramp, not a threshold snap.
    this.jitterPhase += this.jitterFrequency * deltaTime;
    const proximity = Math.min(1, magnitude / this.maxMagnitude);
    const jitterAmount = proximity * proximity * proximity * this.jitterMaxAmplitude;
    // Different multipliers on the two axes' phases (not both 1x) avoid a
    // clean back-and-forth line, giving a small chaotic wobble that reads
    // more like straining than a mechanical metronome. Z is deliberately
    // left un-jittered, matching the original WeaponViewmodel behavior.
    const jitterX = Math.sin(this.jitterPhase) * jitterAmount;
    const jitterY = Math.sin(this.jitterPhase * 1.3) * jitterAmount;

    return new THREE.Vector3(x + jitterX, y + jitterY, z);
  }
}
