import * as THREE from "three";

// Checkpoint 20: the name every caller uses to retrieve the solid "body"
// mesh out of the returned Group via getObjectByName() -- this is the
// mesh callers register as the actual raycast/interact target (see
// core/MapEntitySystem.ts's createTerminal()). The screen and keyboard
// children are purely decorative and are never registered anywhere.
export const COMPUTER_BODY_NAME = "computerBody";

const BODY_COLOR = 0x2a2a2a;
const BODY_WIDTH = 0.5;
const BODY_HEIGHT = 0.5;
const BODY_DEPTH = 0.4;

const SCREEN_WIDTH = 0.36;
const SCREEN_HEIGHT = 0.3;
const SCREEN_DEPTH = 0.02;
const SCREEN_Y_OFFSET = 0.02; // lifts the screen slightly above the body's vertical center, roughly where a monitor sits on a body-box "case"

const KEYBOARD_COLOR = 0x1a1a1a;
const KEYBOARD_WIDTH = 0.4;
const KEYBOARD_HEIGHT = 0.04;
const KEYBOARD_DEPTH = 0.2;

const TEXTURE_SIZE = 128;
const SCREEN_OFF_COLOR = "#0a0a0a";
const SCREEN_ON_BACKGROUND = "#0a1a0a";
const SCREEN_ON_TEXT_COLOR = "#33ff55";
const SCREEN_ON_LINES = ["> boot ok", "> user: ???", "> _"];

// Checkpoint 20: the one shared factory every current and future
// terminal/computer entity uses -- no individual room hand-builds its own
// computer mesh, which is exactly the "recode it every time" problem this
// checkpoint is meant to avoid. A body box, a screen box mounted flush on
// the body's front face (its material a generated CanvasTexture -- see
// createScreenTexture below), and a flat keyboard box in front of the
// body, all grouped into one THREE.Group -- the same simple procedural-box
// aesthetic as every other mesh in this game, no external models/textures.
//
// Pure factory: no interactivity, no userData set on anything here. The
// caller still owns setting userData.interactable/onInteract/
// interactPrompt on whichever mesh it registers as the actual raycast
// target (see COMPUTER_BODY_NAME above for why that must be the body
// mesh specifically, not this returned Group).
export function createComputerMesh(poweredOn: boolean): THREE.Group {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH),
    new THREE.MeshStandardMaterial({ color: BODY_COLOR }),
  );
  body.name = COMPUTER_BODY_NAME;
  body.position.set(0, BODY_HEIGHT / 2, 0);
  group.add(body);

  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(SCREEN_WIDTH, SCREEN_HEIGHT, SCREEN_DEPTH),
    new THREE.MeshStandardMaterial({ map: createScreenTexture(poweredOn) }),
  );
  screen.position.set(
    0,
    BODY_HEIGHT / 2 + SCREEN_Y_OFFSET,
    BODY_DEPTH / 2 + SCREEN_DEPTH / 2,
  );
  group.add(screen);

  const keyboard = new THREE.Mesh(
    new THREE.BoxGeometry(KEYBOARD_WIDTH, KEYBOARD_HEIGHT, KEYBOARD_DEPTH),
    new THREE.MeshStandardMaterial({ color: KEYBOARD_COLOR }),
  );
  keyboard.position.set(0, KEYBOARD_HEIGHT / 2, BODY_DEPTH / 2 + KEYBOARD_DEPTH / 2);
  group.add(keyboard);

  return group;
}

// Local-space point where a power cable visually connects, on the body's
// back face (opposite the screen, which faces local +Z) -- exported so
// MapEntitySystem can transform it into world space via
// computerGroup.localToWorld() and get the correct point regardless of
// whatever rotationY the terminal entity has.
export function getCableAnchorLocalPosition(): THREE.Vector3 {
  return new THREE.Vector3(0, BODY_HEIGHT / 2, -BODY_DEPTH / 2);
}

// Drawn once onto an offscreen <canvas> (not redrawn per frame -- no
// animation loop, kept cheap) -- dark and mostly blank when off, a dark
// green-tinted background with a few lines of monospace-ish "code" marks
// when on. This is a generated placeholder, matching this project's
// existing approach to every other procedural visual (no asset-loading
// pipeline exists or should be added for this).
export function createScreenTexture(poweredOn: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("createScreenTexture: 2D canvas context unavailable");
  }

  ctx.fillStyle = poweredOn ? SCREEN_ON_BACKGROUND : SCREEN_OFF_COLOR;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  if (poweredOn) {
    ctx.fillStyle = SCREEN_ON_TEXT_COLOR;
    ctx.font = "10px monospace";
    SCREEN_ON_LINES.forEach((line, index) => {
      ctx.fillText(line, 8, 20 + index * 16);
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
