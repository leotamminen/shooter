import * as THREE from "three";

// The one place that turns a mesh into an axis-aligned collision box —
// MapLoader's wall boxes and MapEntitySystem's door box both need exactly
// this, and used to compute it independently inline.
export function computeCollisionBox(mesh: THREE.Mesh): THREE.Box3 {
  return new THREE.Box3().setFromObject(mesh);
}
