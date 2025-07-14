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
  1000
);
camera.position.set(5, 5, 10);

const renderer: THREE.WebGLRenderer = new THREE.WebGLRenderer({
  antialias: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// === Lighting ===
// Ambient light: base lighting everywhere
const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
scene.add(ambientLight);

// Key light: main light from front-top
const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
keyLight.position.set(1, 2, 3);
scene.add(keyLight);

// Fill light: from left side
const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
fillLight.position.set(-3, 0, 1);
scene.add(fillLight);

// Right light: from right side
const rightLight = new THREE.DirectionalLight(0xffffff, 0.6);
rightLight.position.set(3, 0, 1);
scene.add(rightLight);

// Back light: from behind
const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
backLight.position.set(0, 0, -3);
scene.add(backLight);

// Top light: from above
const topLight = new THREE.DirectionalLight(0xffffff, 0.5);
topLight.position.set(0, 3, 0);
scene.add(topLight);

// Bottom light: from below
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
let scrambleTime = 0;
let isScrambling = false;
let cubies: THREE.Object3D[] = [];

// const axesHelper = new THREE.AxesHelper(5);
// scene.add(axesHelper);

loader.load(
  "/rubix3.0.glb",
  (gltf: any) => {
    cube = gltf.scene;
    cube.scale.set(0.7, 0.7, 0.7);
    cube.position.set(0, 0, 0);

    console.log("✅ Rubik cube loaded:", cube);
    scene.add(cube);

    // Extract individual cubies from the model based on your naming system
    console.log("🔍 Analyzing cube structure...");
    cube.traverse((child) => {
      // Only add mesh objects (the actual cubie pieces)
      if (child.type === "Mesh" && child.name) {
        cubies.push(child);
        console.log(`✅ Found cubie: ${child.name}`);
      }
    });

    console.log("🧩 Total cubies found:", cubies.length);

    // Start scrambling after a brief moment
    setTimeout(() => {
      startScrambling();
    }, 500);

    // Finish loading after scrambling is done
    setTimeout(() => {
      isLoading = false;
      isScrambling = false;
      hideLoadingScreen();
    }, 4000);
  },
  undefined,
  (error: any) => {
    console.error("❌ Error loading cube:", error);
    isLoading = false;
    hideLoadingScreen();
  }
);

// === Scrambling Functions ===
let scrambleStartTime = 0;
let scrambleDuration = 3000;
let initialRotation = new THREE.Euler(0, 0, 0);

function startScrambling() {
  isScrambling = true;
  scrambleStartTime = Date.now();

  if (cube) {
    initialRotation.copy(cube.rotation);
  }
}

function updateScrambling() {
  if (!isScrambling || !cubies.length) return;

  const currentTime = Date.now();
  const elapsed = currentTime - scrambleStartTime;

  if (elapsed >= scrambleDuration) {
    isScrambling = false;
    return;
  }

  // Simple Front face (F) rotation test
  const rotationAmount = ((elapsed / scrambleDuration) * Math.PI) / 2; // 90 degrees

  console.log(
    `🔄 Rotating Front face: ${((rotationAmount * 180) / Math.PI).toFixed(1)}°`
  );

  // Find and rotate all "Front" face cubies (positive Z world position)
  let rotatedCount = 0;
  cubies.forEach((cubie) => {
    if (cubie) {
      // Get world position to determine if it's on the front face
      const worldPos = new THREE.Vector3();
      cubie.getWorldPosition(worldPos);

      // Try a much lower threshold and also try rotating some cubies by name
      // Let's rotate all cubies with 'o' (orange) in their name as a test
      if (worldPos.z > 0.1 || (cubie.name && cubie.name.includes("o"))) {
        // Simple rotation test - rotate around the Z-axis (front face normal)
        cubie.rotation.z = rotationAmount;
        rotatedCount++;

        if (rotatedCount <= 5) {
          // Log first few
          console.log(
            `🟦 Rotating ${cubie.name} (Z: ${worldPos.z.toFixed(2)}) by ${(
              (rotationAmount * 180) /
              Math.PI
            ).toFixed(1)}°`
          );
        }
      }
    }
  });

  console.log(`🔄 Total pieces rotated: ${rotatedCount}`);

  // Keep gentle whole cube rotation
  if (cube) {
    cube.rotation.y += 0.002;
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
let lastTime = 0;

function animate(currentTime: number = 0): void {
  requestAnimationFrame(animate);

  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;

  // Handle scrambling animation during loading
  if (isScrambling) {
    updateScrambling();
  }
  // Gentle auto-rotation when not scrambling during loading
  else if (isLoading && cube) {
    cube.rotation.y += cubeRotationSpeed;
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
