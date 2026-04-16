import * as THREE from "three";
// @ts-ignore
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
// @ts-ignore
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls";

// === Scene Setup ===
const scene: THREE.Scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(5, 5, 10);

const renderer: THREE.WebGLRenderer = new THREE.WebGLRenderer({
  antialias: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// === Lighting ===
const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
keyLight.position.set(1, 2, 3);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
fillLight.position.set(-3, 0, 1);
scene.add(fillLight);

const rightLight = new THREE.DirectionalLight(0xffffff, 0.6);
rightLight.position.set(3, 0, 1);
scene.add(rightLight);

const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
backLight.position.set(0, 0, -3);
scene.add(backLight);

const topLight = new THREE.DirectionalLight(0xffffff, 0.5);
topLight.position.set(0, 3, 0);
scene.add(topLight);

const bottomLight = new THREE.DirectionalLight(0xffffff, 0.4);
bottomLight.position.set(0, -2, 0);
scene.add(bottomLight);

// === Trackball Controls ===
const controls = new TrackballControls(camera, renderer.domElement);
controls.rotateSpeed = 2.2;
controls.zoomSpeed = 1.5;
controls.panSpeed = 1.0;
controls.staticMoving = true;
controls.dynamicDampingFactor = 0.2;
controls.target.set(0, 0, 0);

// === Load Rubik's Cube Model ===
const loader: GLTFLoader = new GLTFLoader();
let cube: THREE.Object3D;
let isLoading = true;
let cubeRotationSpeed = 0.01;
let isScrambling = false;
let cubies: THREE.Object3D[] = [];
const SCRAMBLE_TOTAL_DURATION_MS = 4000;
const UNSCRAMBLE_MOVE_DURATION_MS = 1100;
const REVERSE_START_DELAY_MS = 2000;

type Axis = "x" | "y" | "z";

interface MoveStep {
  label: string;
  axis: Axis;
  quarterTurns: number;
  selector: () => THREE.Object3D[];
}

interface ActiveMove {
  step: MoveStep;
  pivot: THREE.Group;
  cubies: THREE.Object3D[];
  startTime: number;
  durationMs: number;
  targetAngle: number;
  lastAngle: number;
}

let moveSteps: MoveStep[] = [];
let forwardSteps: MoveStep[] = [];
let currentMoveIndex = 0;
let activeMove: ActiveMove | null = null;
let isReversing = false;
let scrambleMoveDuration = 550;
let reverseStartAt: number | null = null;
let isShowcasing = false;
let showcaseAxis = new THREE.Vector3(0.3, 1, 0.2).normalize();
let showcaseTargetAxis = showcaseAxis.clone();
let nextAxisShiftAt = 0;
let lastFrameTime = 0;

loader.load(
  "/rubix3.0.glb",
  (gltf: any) => {
    cube = gltf.scene;
    cube.scale.set(0.7, 0.7, 0.7);
    cube.position.set(0, 0, 0);

    console.log("✅ Rubik cube loaded:", cube);
    scene.add(cube);

    console.log("🔍 Analyzing cube structure...");
    cube.traverse((child) => {
      if (child.type === "Mesh" && child.name && child.name !== "cube_center") {
        cubies.push(child);

        const worldPos = new THREE.Vector3();
        child.getWorldPosition(worldPos);

        const localPos = child.position;

        const bbox = new THREE.Box3().setFromObject(child);
        const center = bbox.getCenter(new THREE.Vector3());

        console.log(
          `✅ Found cubie: ${child.name} - World Y: ${worldPos.y.toFixed(
            2,
          )}, Local Y: ${localPos.y.toFixed(2)}, BBox Y: ${center.y.toFixed(2)}`,
        );
      }
    });

    console.log("🧩 Total cubies found:", cubies.length);

    setTimeout(() => {
      startScrambling();
    }, 500);
  },
  undefined,
  (error: any) => {
    console.error("❌ Error loading cube:", error);
    isLoading = false;
    hideLoadingScreen();
  },
);

// === Scrambling Functions ===

function startScrambling() {
  isScrambling = true;
  currentMoveIndex = 0;
  activeMove = null;
  isReversing = false;
  reverseStartAt = null;

  forwardSteps = [
    {
      label: "green move",
      axis: "x",
      quarterTurns: -1,
      selector: () =>
        cubies.filter((c) => c.name.toLowerCase().startsWith("cube_g")),
    },
    {
      label: "blue move",
      axis: "x",
      quarterTurns: 1,
      selector: () =>
        cubies.filter((c) => c.name.toLowerCase().startsWith("cube_b")),
    },
    {
      label: "top move",
      axis: "y",
      quarterTurns: 1,
      selector: () => detectTopLayerCubies(),
    },
    {
      label: "bottom reverse move",
      axis: "y",
      quarterTurns: -1,
      selector: () => detectBottomLayerCubies(),
    },
    {
      label: "whole cube front-axis move",
      axis: "z",
      quarterTurns: -1,
      selector: () => cubies,
    },
    {
      label: "top reverse move",
      axis: "y",
      quarterTurns: -1,
      selector: () => detectTopLayerCubies(),
    },
    {
      label: "bottom move",
      axis: "y",
      quarterTurns: 1,
      selector: () => detectBottomLayerCubies(),
    },
    {
      label: "whole cube front-axis +90",
      axis: "z",
      quarterTurns: 1,
      selector: () => cubies,
    },
    {
      label: "top 180 move",
      axis: "y",
      quarterTurns: 2,
      selector: () => detectTopLayerCubies(),
    },
    {
      label: "middle row move",
      axis: "y",
      quarterTurns: 1,
      selector: () => detectMiddleLayerCubies(),
    },
    {
      label: "whole cube right-axis +90",
      axis: "x",
      quarterTurns: 1,
      selector: () => cubies,
    },
    {
      label: "top reverse move 2",
      axis: "y",
      quarterTurns: -1,
      selector: () => detectTopLayerCubies(),
    },
  ];

  scrambleMoveDuration = Math.max(
    120,
    SCRAMBLE_TOTAL_DURATION_MS / Math.max(1, forwardSteps.length),
  );

  moveSteps = [...forwardSteps];
}

function getCubieCenterY(cubie: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(cubie);
  return box.getCenter(new THREE.Vector3()).y;
}

function detectTopLayerCubies(): THREE.Object3D[] {
  if (!cubies.length) return [];

  const centers = cubies.map((c) => getCubieCenterY(c));
  const maxCenterY = Math.max(...centers);
  const minCenterY = Math.min(...centers);
  const centerTolerance = Math.max((maxCenterY - minCenterY) * 0.12, 0.01);

  const topByCenter = cubies.filter(
    (cubie) => getCubieCenterY(cubie) >= maxCenterY - centerTolerance,
  );

  // Include side-row pieces that physically touch the top plane.
  const maxYValues = cubies.map((cubie) => {
    const box = new THREE.Box3().setFromObject(cubie);
    return box.max.y;
  });
  const maxPlaneY = Math.max(...maxYValues);
  const minPlaneY = Math.min(...maxYValues);
  const planeTolerance = Math.max((maxPlaneY - minPlaneY) * 0.08, 0.008);

  const topByPlaneTouch = cubies.filter((cubie) => {
    const box = new THREE.Box3().setFromObject(cubie);
    return box.max.y >= maxPlaneY - planeTolerance;
  });

  return Array.from(new Set([...topByCenter, ...topByPlaneTouch]));
}

function detectBottomLayerCubies(): THREE.Object3D[] {
  if (!cubies.length) return [];

  const centers = cubies.map((c) => getCubieCenterY(c));
  const minCenterY = Math.min(...centers);
  const maxCenterY = Math.max(...centers);
  const centerTolerance = Math.max((maxCenterY - minCenterY) * 0.12, 0.01);

  const bottomByCenter = cubies.filter(
    (cubie) => getCubieCenterY(cubie) <= minCenterY + centerTolerance,
  );

  // Include side-row pieces that physically touch the bottom plane.
  const minYValues = cubies.map((cubie) => {
    const box = new THREE.Box3().setFromObject(cubie);
    return box.min.y;
  });
  const minPlaneY = Math.min(...minYValues);
  const maxPlaneY = Math.max(...minYValues);
  const planeTolerance = Math.max((maxPlaneY - minPlaneY) * 0.08, 0.008);

  const bottomByPlaneTouch = cubies.filter((cubie) => {
    const box = new THREE.Box3().setFromObject(cubie);
    return box.min.y <= minPlaneY + planeTolerance;
  });

  return Array.from(new Set([...bottomByCenter, ...bottomByPlaneTouch]));
}

function detectMiddleLayerCubies(): THREE.Object3D[] {
  if (!cubies.length) return [];

  const centers = cubies.map((c) => getCubieCenterY(c));
  const minCenterY = Math.min(...centers);
  const maxCenterY = Math.max(...centers);
  const midCenterY = (minCenterY + maxCenterY) / 2;
  const tolerance = Math.max((maxCenterY - minCenterY) * 0.2, 0.01);

  return cubies.filter(
    (cubie) => Math.abs(getCubieCenterY(cubie) - midCenterY) <= tolerance,
  );
}

function setAxisRotation(group: THREE.Group, axis: Axis, value: number): void {
  if (axis === "x") group.rotation.x = value;
  else if (axis === "y") group.rotation.y = value;
  else group.rotation.z = value;
}

function snapToQuarter(angle: number): number {
  const quarter = Math.PI / 2;
  return Math.round(angle / quarter) * quarter;
}

function snapCubieRotation(cubie: THREE.Object3D): void {
  cubie.rotation.set(
    snapToQuarter(cubie.rotation.x),
    snapToQuarter(cubie.rotation.y),
    snapToQuarter(cubie.rotation.z),
  );
}

function buildReverseSteps(steps: MoveStep[]): MoveStep[] {
  return [...steps].reverse().map((step) => ({
    label: `undo ${step.label}`,
    axis: step.axis,
    quarterTurns: -step.quarterTurns,
    selector: step.selector,
  }));
}

function beginNextMove(now: number): void {
  if (!cube) return;

  if (isReversing && reverseStartAt !== null && now < reverseStartAt) {
    return;
  }

  if (currentMoveIndex >= moveSteps.length) {
    if (!isReversing) {
      isReversing = true;
      moveSteps = buildReverseSteps(forwardSteps);
      currentMoveIndex = 0;
      reverseStartAt = now + REVERSE_START_DELAY_MS;
      console.log("⏸️ Pausing before undo...");
      return;
    }

    reverseStartAt = null;
    isScrambling = false;
    isLoading = false;
    hideLoadingScreen();
    console.log("✅ Scramble + undo complete");
    isShowcasing = true;
    nextAxisShiftAt = now + 2200;
    return;
  }

  const step = moveSteps[currentMoveIndex];
  const selected = step.selector();
  if (!selected.length) {
    console.warn(`⚠️ ${step.label}: selected 0 cubies, skipping.`);
    currentMoveIndex += 1;
    beginNextMove(now);
    return;
  }

  const pivot = new THREE.Group();
  cube.add(pivot);
  selected.forEach((cubie) => {
    pivot.attach(cubie);
  });

  const activeDuration = isReversing
    ? UNSCRAMBLE_MOVE_DURATION_MS
    : scrambleMoveDuration;

  activeMove = {
    step,
    pivot,
    cubies: selected,
    startTime: now,
    targetAngle: step.quarterTurns * (Math.PI / 2),
    lastAngle: 0,
    durationMs: activeDuration,
  };

  console.log(`➡️ ${step.label}: ${selected.length} cubies`);
}

function finishActiveMove(): void {
  if (!activeMove || !cube) return;

  setAxisRotation(
    activeMove.pivot,
    activeMove.step.axis,
    activeMove.targetAngle,
  );

  activeMove.cubies.forEach((cubie) => {
    cube.attach(cubie);
    snapCubieRotation(cubie);
  });

  cube.remove(activeMove.pivot);
  activeMove = null;
  currentMoveIndex += 1;
}

function updateScrambling() {
  if (!isScrambling || !cubies.length) return;

  const now = Date.now();

  if (!activeMove) {
    beginNextMove(now);
    return;
  }

  const elapsed = now - activeMove.startTime;
  const progress = Math.min(1, elapsed / activeMove.durationMs);
  const eased = 1 - Math.pow(1 - progress, 3);
  const currentAngle = activeMove.targetAngle * eased;
  const delta = currentAngle - activeMove.lastAngle;

  const rotation = activeMove.pivot.rotation;
  if (activeMove.step.axis === "x") rotation.x += delta;
  else if (activeMove.step.axis === "y") rotation.y += delta;
  else rotation.z += delta;

  activeMove.lastAngle = currentAngle;

  if (progress >= 1) {
    finishActiveMove();
  }
}

// === Loading Screen Functions ===
function hideLoadingScreen() {
  const loadingElement = document.getElementById("loading-screen");
  if (loadingElement) {
    loadingElement.style.opacity = "0.3";
    setTimeout(() => {
      loadingElement.style.display = "none";
    }, 500);
  }
}

// === Animation Loop ===
function animate(currentTime = 0): void {
  requestAnimationFrame(animate);

  const deltaSeconds = lastFrameTime
    ? (currentTime - lastFrameTime) / 1000
    : 0.016;
  lastFrameTime = currentTime;

  if (isScrambling) {
    updateScrambling();
  } else if (isLoading && cube) {
    cube.rotation.y += cubeRotationSpeed;
  } else if (isShowcasing && cube) {
    if (currentTime >= nextAxisShiftAt) {
      showcaseTargetAxis.set(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      );
      if (showcaseTargetAxis.lengthSq() < 0.0001) {
        showcaseTargetAxis.set(0.3, 1, 0.2);
      }
      showcaseTargetAxis.normalize();
      nextAxisShiftAt = currentTime + 2200 + Math.random() * 2800;
    }

    // Ease axis transitions so rotation feels like a slow planetary wobble.
    showcaseAxis.lerp(showcaseTargetAxis, Math.min(1, deltaSeconds * 0.35));
    showcaseAxis.normalize();
    cube.rotateOnAxis(showcaseAxis, 0.35 * deltaSeconds);
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();

// === Responsive Resize ===
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
