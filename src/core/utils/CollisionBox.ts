import * as THREE from "three";

// The one place that turns an object into an axis-aligned collision box —
// MapLoader's wall boxes and MapEntitySystem's door box both need exactly
// this, and used to compute it independently inline. Typed as
// THREE.Object3D, not THREE.Mesh (Data Center polish) -- Box3.setFromObject()
// already works on any object and its descendants (it calls
// updateWorldMatrix() internally, so caller ordering doesn't matter), and
// the first multi-child-Group callers (server_rack/black_desk decorations,
// whose collision box needs to span a whole group of boxes, not one mesh)
// need that, not just single meshes.
export function computeCollisionBox(object: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(object);
}
