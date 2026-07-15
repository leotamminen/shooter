import * as THREE from "three";

// Simple procedural-box hand + knife (checkpoint 21, extracted to
// core/utils/ at checkpoint 22 once MeleeViewmodel became a second real
// consumer of the exact same geometry HandsViewmodel already built inline
// -- per this project's own "shared/reusable logic goes in core/utils/"
// rule, the same reasoning that moved ImpulseOffset here at checkpoint 21).
// The same "no external models/assets, everything's a box" aesthetic every
// other placeholder mesh in this project already uses (ComputerMesh.ts,
// the coiled power cable, the desk/chair decorations). Not anatomically
// precise: a palm slab, four fanned fingers with a slight relaxed curl,
// and an opposable-looking thumb is enough to read as "a hand" at
// viewmodel scale and distance.
const PALM_SIZE: [number, number, number] = [0.09, 0.025, 0.11];
const FINGER_SIZE: [number, number, number] = [0.018, 0.018, 0.055];
const THUMB_SIZE: [number, number, number] = [0.02, 0.02, 0.05];

// Local +Z is "toward the fingertips" (away from the wrist), matching the
// same local-space convention ComputerMesh.ts uses for "toward the front."
const PALM_HALF_DEPTH = PALM_SIZE[2] / 2;
const FINGER_X_POSITIONS = [-0.03, -0.01, 0.01, 0.03];
// Slight per-finger variation, not identical rotations, so the hand doesn't
// read as four mechanically-identical rods -- first-guess values within the
// -20/-35 degree range, tuned by eye in-browser.
const FINGER_CURL_DEGREES = [-22, -30, -32, -25];
const FINGER_Z = PALM_HALF_DEPTH + FINGER_SIZE[2] / 2 - 0.01;

const THUMB_POSITION: [number, number, number] = [-0.055, -0.005, 0.01];
const THUMB_ROTATION_Y_DEGREES = 45;
const THUMB_ROTATION_Z_DEGREES = 45;

// Skin texture: same technique as ComputerMesh.ts's createScreenTexture()
// -- drawn once onto an offscreen canvas, not per-frame. Each
// createHandMesh() call generates its own texture/material (cheap, and
// only ever called twice total in this project -- once per HandsViewmodel
// instance, whose left hand is a clone reusing the same material by
// reference rather than a second call, and once per MeleeViewmodel
// instance).
const SKIN_TEXTURE_SIZE = 64;
const SKIN_BASE_COLOR = "#d9a978";
const SKIN_BLOTCH_COLORS = ["#c69465", "#e8bd94"];
const SKIN_BLOTCH_COUNT = 10;

function createSkinTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = SKIN_TEXTURE_SIZE;
  canvas.height = SKIN_TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("createSkinTexture: 2D canvas context unavailable");
  }

  ctx.fillStyle = SKIN_BASE_COLOR;
  ctx.fillRect(0, 0, SKIN_TEXTURE_SIZE, SKIN_TEXTURE_SIZE);

  ctx.globalAlpha = 0.18;
  for (let i = 0; i < SKIN_BLOTCH_COUNT; i++) {
    ctx.fillStyle = SKIN_BLOTCH_COLORS[i % SKIN_BLOTCH_COLORS.length];
    const x = Math.random() * SKIN_TEXTURE_SIZE;
    const y = Math.random() * SKIN_TEXTURE_SIZE;
    const radius = 3 + Math.random() * 7;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Builds one hand (palm + four fingers + thumb) as a THREE.Group, with its
// own generated skin material. Always built as the "right" hand (thumb
// toward -X, i.e. toward the body's center when held at the right hip) --
// callers needing a left hand mirror this via .clone() + scale.x = -1
// rather than a second, separately hand-built geometry (see
// HandsViewmodel.ts).
export function createHandMesh(): THREE.Group {
  const material = new THREE.MeshStandardMaterial({ map: createSkinTexture() });
  const group = new THREE.Group();

  const palm = new THREE.Mesh(new THREE.BoxGeometry(...PALM_SIZE), material);
  group.add(palm);

  FINGER_X_POSITIONS.forEach((x, index) => {
    const finger = new THREE.Mesh(new THREE.BoxGeometry(...FINGER_SIZE), material);
    finger.position.set(x, 0, FINGER_Z);
    finger.rotation.x = THREE.MathUtils.degToRad(FINGER_CURL_DEGREES[index]);
    group.add(finger);
  });

  const thumb = new THREE.Mesh(new THREE.BoxGeometry(...THUMB_SIZE), material);
  thumb.position.set(...THUMB_POSITION);
  thumb.rotation.set(
    0,
    THREE.MathUtils.degToRad(THUMB_ROTATION_Y_DEGREES),
    THREE.MathUtils.degToRad(THUMB_ROTATION_Z_DEGREES),
  );
  group.add(thumb);

  return group;
}

// Closed fist + forearm (checkpoint 22 fix): a different pose for a
// different purpose than createHandMesh()'s open, fanned-fingers hand --
// MeleeViewmodel grips a knife, it doesn't hold anything out flat, so a
// blocky closed fist (main block + a small overlapping knuckle ridge) reads
// correctly where fanned fingers wouldn't. The forearm is a separate,
// narrower, elongated box directly below the fist, tall enough that its
// far end always renders below the visible frame regardless of pose --
// the same "let it run off-screen" trick every other viewmodel in this
// project already relies on instead of literally terminating at the
// screen edge -- with a deliberate Y overlap into the fist's own footprint
// (FOREARM_OVERLAP) so there's no seam/gap at any viewing angle, per this
// checkpoint's own verification requirement. Local +Z/-Z follow the same
// convention createHandMesh()'s fingers already established (unchanged,
// not re-tuned here) -- only the shape is different, not the orientation.
const FIST_SIZE: [number, number, number] = [0.08, 0.07, 0.09];
const FIST_HALF_DEPTH = FIST_SIZE[2] / 2;
const FIST_KNUCKLE_SIZE: [number, number, number] = [0.075, 0.02, 0.03];
const FIST_KNUCKLE_Y = FIST_SIZE[1] / 2 - FIST_KNUCKLE_SIZE[1] / 2;
// Centered exactly on the fist's own +Z face: half the knuckle box overlaps
// into the fist (no seam), half pokes out past it (a visible ridge).
const FIST_KNUCKLE_Z = FIST_HALF_DEPTH;

const FOREARM_SIZE: [number, number, number] = [0.06, 0.4, 0.075];
const FOREARM_OVERLAP = 0.02;
const FOREARM_Y = -(FIST_SIZE[1] / 2 + FOREARM_SIZE[1] / 2 - FOREARM_OVERLAP);

export function createFistMesh(): THREE.Group {
  const material = new THREE.MeshStandardMaterial({ map: createSkinTexture() });
  const group = new THREE.Group();

  const fist = new THREE.Mesh(new THREE.BoxGeometry(...FIST_SIZE), material);
  group.add(fist);

  const knuckles = new THREE.Mesh(new THREE.BoxGeometry(...FIST_KNUCKLE_SIZE), material);
  knuckles.position.set(0, FIST_KNUCKLE_Y, FIST_KNUCKLE_Z);
  group.add(knuckles);

  const forearm = new THREE.Mesh(new THREE.BoxGeometry(...FOREARM_SIZE), material);
  forearm.position.set(0, FOREARM_Y, 0);
  group.add(forearm);

  return group;
}

// Knife mesh: a grip (box, dark near-black -- matching the dark surface
// tones this project already uses elsewhere for grip/panel surfaces, e.g.
// ComputerMesh.ts's keyboard), a small hexagonal-prism guard between grip
// and blade (a distinct lighter metal tone from both the blade and the
// grip), and a tapered, faceted blade (a low-radial-segment cone, not a
// box, for a dagger-like silhouette instead of a flat rectangular slab) --
// all three extend along local +Z, the same axis convention
// createHandMesh()'s fingers curl toward and createFistMesh() above keeps
// unchanged; MeleeViewmodel is solely responsible for orienting the whole
// group correctly on screen (a 180° Y rotation applied where it attaches
// the knife -- unchanged here, not re-tuned). Visible by default -- unlike
// the checkpoint-21 version (a permanent-but-hidden child of
// HandsViewmodel's right hand, toggled via a since-removed
// setKnifeVisible()), this factory has no opinion about visibility;
// MeleeViewmodel (its only caller as of checkpoint 22) always shows it,
// since a knife is the whole point of that viewmodel.
const KNIFE_BLADE_COLOR = 0x555555;
const KNIFE_GUARD_COLOR = 0x8c8c8c;
const KNIFE_HILT_COLOR = 0x1a1a1a;
const KNIFE_HILT_SIZE: [number, number, number] = [0.02, 0.02, 0.04];
const KNIFE_GUARD_RADIUS = 0.018;
const KNIFE_GUARD_HEIGHT = 0.012;
const KNIFE_GUARD_SEGMENTS = 6;
// Near-zero top radius, wider base, 6 radial segments -- a faceted,
// non-round taper reading as a dagger rather than a round pin. Starting
// guesses, tuned by eye in-browser against the mockups' proportions.
const KNIFE_BLADE_TIP_RADIUS = 0.002;
const KNIFE_BLADE_BASE_RADIUS = 0.02;
const KNIFE_BLADE_LENGTH = 0.15;
const KNIFE_BLADE_SEGMENTS = 6;
const KNIFE_Y = 0.02;
const KNIFE_HILT_Z = FIST_HALF_DEPTH + KNIFE_HILT_SIZE[2] / 2;
const KNIFE_GUARD_Z = KNIFE_HILT_Z + KNIFE_HILT_SIZE[2] / 2 + KNIFE_GUARD_HEIGHT / 2;
const KNIFE_BLADE_Z = KNIFE_GUARD_Z + KNIFE_GUARD_HEIGHT / 2 + KNIFE_BLADE_LENGTH / 2;

export function createKnifeMesh(): THREE.Group {
  const group = new THREE.Group();

  const hilt = new THREE.Mesh(
    new THREE.BoxGeometry(...KNIFE_HILT_SIZE),
    new THREE.MeshStandardMaterial({ color: KNIFE_HILT_COLOR }),
  );
  hilt.position.set(0, KNIFE_Y, KNIFE_HILT_Z);
  group.add(hilt);

  // CylinderGeometry's default axis is local Y; rotating +90° about X maps
  // its +Y (radiusTop) end to +Z, matching this file's Z-extending
  // convention -- both the guard and the blade below need this same
  // rotation for their "length" to run along Z instead of Y.
  const guard = new THREE.Mesh(
    new THREE.CylinderGeometry(KNIFE_GUARD_RADIUS, KNIFE_GUARD_RADIUS, KNIFE_GUARD_HEIGHT, KNIFE_GUARD_SEGMENTS),
    new THREE.MeshStandardMaterial({ color: KNIFE_GUARD_COLOR }),
  );
  guard.rotation.x = Math.PI / 2;
  guard.position.set(0, KNIFE_Y, KNIFE_GUARD_Z);
  group.add(guard);

  const blade = new THREE.Mesh(
    new THREE.CylinderGeometry(KNIFE_BLADE_TIP_RADIUS, KNIFE_BLADE_BASE_RADIUS, KNIFE_BLADE_LENGTH, KNIFE_BLADE_SEGMENTS),
    new THREE.MeshStandardMaterial({ color: KNIFE_BLADE_COLOR }),
  );
  blade.rotation.x = Math.PI / 2;
  blade.position.set(0, KNIFE_Y, KNIFE_BLADE_Z);
  group.add(blade);

  return group;
}
