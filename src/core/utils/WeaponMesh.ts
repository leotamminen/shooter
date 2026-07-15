import * as THREE from "three";

// Checkpoint 23: names for the three parts a future reload-animation
// checkpoint is expected to need to target individually via
// group.getObjectByName() -- mirrors ComputerMesh.ts's COMPUTER_BODY_NAME
// convention (one named "the thing callers actually need a handle to",
// decorative siblings left unnamed). The magazine needs to eject/insert,
// the charging handle (bolt) needs to rack, and the body/receiver is the
// stable parent everything else is positioned relative to. The barrel and
// handguard have no anticipated future need to be targeted individually,
// so they stay unnamed, the same "only name what a caller will actually
// look up" restraint ComputerMesh.ts's screen/keyboard already established.
export const AK47_BODY_NAME = "ak47Body";
export const AK47_MAGAZINE_NAME = "ak47Magazine";
export const AK47_BOLT_NAME = "ak47Bolt";

// Local-space convention: +Z is "toward the muzzle" (forward, away from the
// camera), matching the same "+Z is forward" convention already established
// for MeleeViewmodel's knife (see core/utils/HandMesh.ts) -- kept
// consistent across every procedural viewmodel mesh in this project rather
// than each file inventing its own axis convention.
const RECEIVER_COLOR = 0x2b2b2a;
const RECEIVER_SIZE: [number, number, number] = [0.05, 0.07, 0.28];

const BARREL_COLOR = 0x1c1c1c;
const BARREL_SIZE: [number, number, number] = [0.018, 0.018, 0.22];
// Slight negative overlap into the receiver's front face so there's no
// seam, matching the overlap technique already used for MeleeViewmodel's
// forearm-to-fist connection (core/utils/HandMesh.ts).
const BARREL_OVERLAP = 0.02;
const BARREL_Z = RECEIVER_SIZE[2] / 2 + BARREL_SIZE[2] / 2 - BARREL_OVERLAP;
const BARREL_Y = RECEIVER_SIZE[1] * 0.15;

// A distinct dark tone from the receiver -- close enough to read as "the
// same gun" but visually separable, the same "related but distinct" color
// relationship MeleeViewmodel's blade/guard/grip already use.
const MAGAZINE_COLOR = 0x1a1a1a;
const MAGAZINE_SIZE: [number, number, number] = [0.026, 0.16, 0.05];
const MAGAZINE_Z = -0.02;
const MAGAZINE_Y = -RECEIVER_SIZE[1] / 2 - MAGAZINE_SIZE[1] / 2 + 0.03;
// A small negative X rotation tilts the (straight) magazine box back
// toward the receiver's rear -- reads as the AK's distinctive curved
// magazine even though the geometry itself is a plain box, the same
// "stylized, not anatomically precise" approach every other placeholder
// mesh in this project already takes (see e.g. HandMesh.ts's hand).
const MAGAZINE_ROTATION_X = -0.3;

// Wood-tone furniture -- the classic AK-47 look. Positioned forward of the
// magazine, under the barrel: this is where a future support-hand
// checkpoint should grip, per the reference image (not the magazine).
const HANDGUARD_COLOR = 0x6b4a2b;
const HANDGUARD_SIZE: [number, number, number] = [0.048, 0.035, 0.11];
const HANDGUARD_Z = RECEIVER_SIZE[2] / 2 - 0.01;
const HANDGUARD_Y = -RECEIVER_SIZE[1] / 2 + HANDGUARD_SIZE[1] / 2 + 0.005;

// Charging handle: a small block on the receiver's right (+X) side,
// roughly above the magazine well -- distinct color from both the
// receiver and the magazine.
const BOLT_COLOR = 0x3a3a3a;
const BOLT_SIZE: [number, number, number] = [0.015, 0.014, 0.05];
const BOLT_X = RECEIVER_SIZE[0] / 2 + BOLT_SIZE[0] / 2 - 0.005;
const BOLT_Y = RECEIVER_SIZE[1] * 0.1;
const BOLT_Z = -0.02;

// Checkpoint 23: the first weapon with a real per-weapon viewmodel mesh
// instead of the generic gray box every weapon has used since checkpoint
// 13 -- see WeaponViewmodel.ts's own checkpoint-23 comments for why only
// the AK-47 gets one (M1911/MAC-10 are unaffected, still the generic box).
// A recognizable AK-47 silhouette from five procedural boxes (the same
// "everything's a box" aesthetic every other mesh in this project already
// uses, ComputerMesh.ts being the closest precedent for the
// named-parts-in-a-Group technique), roughly matching the generic box's
// on-screen size/placement so switching weapons doesn't jump wildly in
// scale -- the caller positions the returned group via the same
// VIEWMODEL_CONFIG-style base offset every other viewmodel mesh already
// uses, this factory only builds local geometry.
export function createAK47Mesh(): THREE.Group {
  const group = new THREE.Group();

  const receiver = new THREE.Mesh(
    new THREE.BoxGeometry(...RECEIVER_SIZE),
    new THREE.MeshStandardMaterial({ color: RECEIVER_COLOR }),
  );
  receiver.name = AK47_BODY_NAME;
  group.add(receiver);

  const barrel = new THREE.Mesh(
    new THREE.BoxGeometry(...BARREL_SIZE),
    new THREE.MeshStandardMaterial({ color: BARREL_COLOR }),
  );
  barrel.position.set(0, BARREL_Y, BARREL_Z);
  group.add(barrel);

  const magazine = new THREE.Mesh(
    new THREE.BoxGeometry(...MAGAZINE_SIZE),
    new THREE.MeshStandardMaterial({ color: MAGAZINE_COLOR }),
  );
  magazine.name = AK47_MAGAZINE_NAME;
  magazine.position.set(0, MAGAZINE_Y, MAGAZINE_Z);
  magazine.rotation.x = MAGAZINE_ROTATION_X;
  group.add(magazine);

  const handguard = new THREE.Mesh(
    new THREE.BoxGeometry(...HANDGUARD_SIZE),
    new THREE.MeshStandardMaterial({ color: HANDGUARD_COLOR }),
  );
  handguard.position.set(0, HANDGUARD_Y, HANDGUARD_Z);
  group.add(handguard);

  const bolt = new THREE.Mesh(
    new THREE.BoxGeometry(...BOLT_SIZE),
    new THREE.MeshStandardMaterial({ color: BOLT_COLOR }),
  );
  bolt.name = AK47_BOLT_NAME;
  bolt.position.set(BOLT_X, BOLT_Y, BOLT_Z);
  group.add(bolt);

  return group;
}
