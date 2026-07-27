import * as THREE from "three";

export interface RaycastHit {
  point: THREE.Vector3;
  distance: number;
  object: THREE.Object3D;
}

export class Raycast {
  private readonly raycaster = new THREE.Raycaster();

  fromCamera(
    camera: THREE.Camera,
    targets: THREE.Object3D[],
    maxDistance = Infinity,
  ): RaycastHit | null {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    return this.cast(targets, maxDistance);
  }

  fromOrigin(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    targets: THREE.Object3D[],
    maxDistance = Infinity,
  ): RaycastHit | null {
    this.raycaster.set(origin, direction.clone().normalize());
    return this.cast(targets, maxDistance);
  }

  private cast(targets: THREE.Object3D[], maxDistance: number): RaycastHit | null {
    this.raycaster.far = maxDistance;
    const intersections = this.raycaster.intersectObjects(targets, false);
    // three.js's intersectObjects doesn't skip invisible objects on its own,
    // so this filter is what lets a mesh.visible = false object (e.g. a dead
    // enemy) be excluded from every caller's raycast for free.
    const hit = intersections.find((i) => i.object.visible);
    if (!hit) return null;
    return { point: hit.point, distance: hit.distance, object: hit.object };
  }
}

// Pathfinding+Guard follow-up: a generic "is there a clear line of sight
// from origin to target" check, the same shape EnemyAI.ts's own private
// hasLineOfSight() method already implements inline (raycast toward the
// target, excluding the caller's own mesh by reference so a ray starting
// at that mesh's center can't immediately re-intersect its own geometry).
// core/GuardAI.ts is the first consumer of this shared version --
// EnemyAI.ts's own copy is deliberately left exactly as it was rather than
// refactored to depend on this too, since this task's explicit scope is
// "the existing zombie EnemyAI is untouched, purely additive." That leaves
// a small, known duplication between the two; see CLAUDE.md's decisions
// log for why that trade-off was made deliberately rather than by
// oversight.
export function hasLineOfSight(
  raycast: Raycast,
  origin: THREE.Vector3,
  target: THREE.Vector3,
  candidates: THREE.Object3D[],
  excludeObject: THREE.Object3D,
): boolean {
  const toTarget = new THREE.Vector3().subVectors(target, origin);
  const distance = toTarget.length();
  if (distance < 1e-6) return true;

  const direction = toTarget.normalize();
  const targets = candidates.filter((object) => object !== excludeObject);
  const hit = raycast.fromOrigin(origin, direction, targets, distance);
  return hit === null;
}
