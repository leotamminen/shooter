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
