import * as THREE from "three";

// The single source of truth for "what can be hit or occluded by a ray" —
// replaces four separately hand-built target arrays (WeaponSystem's fire
// raycast, EnemyAI's line-of-sight raycast, HUD's enemy-label occlusion
// raycast, InteractSystem's interact raycast) that drifted out of sync as
// entity types were added (checkpoint 6 doors/buttons/pickups, checkpoint 7
// dynamic enemies). Anything solid — walls, doors, buttons, pickups,
// wall_buys, enemies — registers itself here once, and every raycasting
// system reads the same list.
export class RaycastRegistry {
  private readonly objects: THREE.Object3D[] = [];

  register(object: THREE.Object3D): void {
    this.objects.push(object);
  }

  unregister(object: THREE.Object3D): void {
    const index = this.objects.indexOf(object);
    if (index !== -1) this.objects.splice(index, 1);
  }

  getAll(): THREE.Object3D[] {
    return this.objects;
  }
}
