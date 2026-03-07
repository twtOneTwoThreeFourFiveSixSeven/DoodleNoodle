// ===================== DRAWING MODE =====================
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const toolbar = document.getElementById("draw-toolbar");

function resizeCanvas() {
  const toolbarHeight = toolbar.getBoundingClientRect().height;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - toolbarHeight;
  canvas.style.width = canvas.width + "px";
  canvas.style.height = canvas.height + "px";

  // Calculate canvas center in pixels
  const centerX = Math.floor(canvas.width / 2);
  const centerY = Math.floor(canvas.height / 2);

  // Offset the grid so an intersection lands exactly at center
  const offsetX = centerX % 10;
  const offsetY = centerY % 10;
  canvas.style.backgroundPosition = `${offsetX}px ${offsetY}px`;

  // Position the crosshair relative to the canvas, not the viewport
  const crosshair = document.getElementById("crosshair");
  if (crosshair) {
    crosshair.style.top = toolbarHeight + "px";
    crosshair.style.height = canvas.height + "px";
  }
}
resizeCanvas();

// Transparent background — don't fill with white
ctx.clearRect(0, 0, canvas.width, canvas.height);

let drawing = false, erasing = false, brushSize = 4;
let currentColor = "#000000";
let placingImage = null; // image being positioned before commit

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  return { x, y };
}
function startDraw(e) { e.preventDefault(); drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
function draw(e) {
  if (!drawing) return; e.preventDefault(); const p = getPos(e);
  ctx.lineWidth = brushSize; ctx.lineCap = "round"; ctx.lineJoin = "round";

  if (erasing) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = currentColor;
  }

  ctx.lineTo(p.x, p.y); ctx.stroke();
}
function stopDraw() { drawing = false; ctx.beginPath(); }

canvas.addEventListener("mousedown", startDraw); canvas.addEventListener("mousemove", draw);
canvas.addEventListener("mouseup", stopDraw); canvas.addEventListener("mouseleave", stopDraw);
canvas.addEventListener("touchstart", startDraw, { passive: false });
canvas.addEventListener("touchmove", draw, { passive: false });
canvas.addEventListener("touchend", stopDraw);

document.getElementById("pen-btn").addEventListener("click", () => {
  erasing = false; document.getElementById("pen-btn").classList.add("active");
  document.getElementById("eraser-btn").classList.remove("active"); canvas.style.cursor = "crosshair";
});
document.getElementById("eraser-btn").addEventListener("click", () => {
  erasing = true; document.getElementById("eraser-btn").classList.add("active");
  document.getElementById("pen-btn").classList.remove("active"); canvas.style.cursor = "cell";
});
document.getElementById("size-slider").addEventListener("input", (e) => {
  brushSize = parseInt(e.target.value); document.getElementById("size-label").textContent = brushSize;
});

// ===================== COLOR PICKER =====================
const colorPicker = document.getElementById("color-picker");
const hexInput = document.getElementById("hex-input");

if (colorPicker) {
  colorPicker.addEventListener("input", (e) => {
    currentColor = e.target.value;
    if (hexInput) hexInput.value = currentColor;
  });
}
if (hexInput) {
  hexInput.addEventListener("change", (e) => {
    let val = e.target.value.trim();
    if (!val.startsWith("#")) val = "#" + val;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      currentColor = val;
      if (colorPicker) colorPicker.value = val;
    } else {
      e.target.value = currentColor;
    }
  });
}

// ===================== IMAGE INSERT =====================
const imgBtn = document.getElementById("img-btn");
const imgUpload = document.getElementById("img-upload");

if (imgBtn && imgUpload) {
  imgBtn.addEventListener("click", () => imgUpload.click());
  imgUpload.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const maxW = canvas.width * 0.4;
        const maxH = canvas.height * 0.4;
        let w = img.width, h = img.height;
        if (w > maxW) { h *= maxW / w; w = maxW; }
        if (h > maxH) { w *= maxH / h; h = maxH; }
        placingImage = { img, w, h, x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, dragging: false };
        renderPlacingImage();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    imgUpload.value = "";
  });
}

// Overlay UI for positioning the image before stamping it
let placeOverlay = null;

function renderPlacingImage() {
  if (!placingImage) return;
  if (!placeOverlay) {
    placeOverlay = document.createElement("div");
    placeOverlay.id = "place-overlay";
    placeOverlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:50;cursor:move;touch-action:none;";
    const hint = document.createElement("div");
    hint.style.cssText = "position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:white;padding:10px 20px;border-radius:8px;font-size:14px;text-align:center;";
    hint.innerHTML = "Drag to position &bull; Scroll to resize &bull; Click <b>Stamp</b> to place";
    placeOverlay.appendChild(hint);

    const stampBtn = document.createElement("button");
    stampBtn.textContent = "✅ Stamp";
    stampBtn.style.cssText = "position:absolute;bottom:70px;left:50%;transform:translateX(-50%);padding:10px 24px;border:none;border-radius:6px;background:#27ae60;color:white;font-size:16px;font-weight:bold;cursor:pointer;z-index:51;";
    stampBtn.addEventListener("click", commitImage);
    stampBtn.addEventListener("touchend", (e) => { e.stopPropagation(); commitImage(); });
    placeOverlay.appendChild(stampBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "❌ Cancel";
    cancelBtn.style.cssText = "position:absolute;bottom:70px;left:calc(50% + 90px);padding:10px 24px;border:none;border-radius:6px;background:#e74c3c;color:white;font-size:16px;font-weight:bold;cursor:pointer;z-index:51;";
    cancelBtn.addEventListener("click", () => { placingImage = null; removePlaceOverlay(); });
    cancelBtn.addEventListener("touchend", (e) => { e.stopPropagation(); placingImage = null; removePlaceOverlay(); });
    placeOverlay.appendChild(cancelBtn);

    document.body.appendChild(placeOverlay);

    placeOverlay.addEventListener("mousedown", startDragImage);
    placeOverlay.addEventListener("mousemove", dragImage);
    placeOverlay.addEventListener("mouseup", stopDragImage);
    placeOverlay.addEventListener("touchstart", startDragImage);
    placeOverlay.addEventListener("touchmove", dragImage);
    placeOverlay.addEventListener("touchend", stopDragImage);
    placeOverlay.addEventListener("wheel", resizeImage);
  }
  drawPreview();
}

function drawPreview() {
  if (!placingImage) return;
  const saved = ctx.getImageData(0, 0, canvas.width, canvas.height);
  ctx.putImageData(saved, 0, 0);
  ctx.globalAlpha = 0.7;
  ctx.drawImage(placingImage.img, placingImage.x, placingImage.y, placingImage.w, placingImage.h);
  ctx.globalAlpha = 1;
  placingImage.savedData = saved;
}

function startDragImage(e) {
  if (!placingImage) return;
  if (e.target.tagName === "BUTTON") return;
  e.preventDefault();
  const p = getPos(e);
  placingImage.dragging = true;
  placingImage.offsetX = p.x - placingImage.x;
  placingImage.offsetY = p.y - placingImage.y;
}
function dragImage(e) {
  if (!placingImage || !placingImage.dragging) return;
  e.preventDefault();
  const p = getPos(e);
  placingImage.x = p.x - placingImage.offsetX;
  placingImage.y = p.y - placingImage.offsetY;
  if (placingImage.savedData) ctx.putImageData(placingImage.savedData, 0, 0);
  ctx.globalAlpha = 0.7;
  ctx.drawImage(placingImage.img, placingImage.x, placingImage.y, placingImage.w, placingImage.h);
  ctx.globalAlpha = 1;
}
function stopDragImage() { if (placingImage) placingImage.dragging = false; }
function resizeImage(e) {
  if (!placingImage) return;
  e.preventDefault();
  const scale = e.deltaY < 0 ? 1.05 : 0.95;
  const aspect = placingImage.w / placingImage.h;
  placingImage.w *= scale;
  placingImage.h = placingImage.w / aspect;
  if (placingImage.savedData) ctx.putImageData(placingImage.savedData, 0, 0);
  ctx.globalAlpha = 0.7;
  ctx.drawImage(placingImage.img, placingImage.x, placingImage.y, placingImage.w, placingImage.h);
  ctx.globalAlpha = 1;
}

function commitImage() {
  if (!placingImage) return;
  if (placingImage.savedData) ctx.putImageData(placingImage.savedData, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.drawImage(placingImage.img, placingImage.x, placingImage.y, placingImage.w, placingImage.h);
  placingImage = null;
  removePlaceOverlay();
}

function removePlaceOverlay() {
  if (placeOverlay) { placeOverlay.remove(); placeOverlay = null; }
}

// ===================== CLEAR / SAVE / RESIZE =====================
document.getElementById("clear-btn").addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});
document.getElementById("save-btn").addEventListener("click", () => {
  const a = document.createElement("a"); a.download = "drawing.png"; a.href = canvas.toDataURL(); a.click();
});
window.addEventListener("resize", () => {
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.putImageData(img, 0, 0);
});

// ===================== AR MODE (WebXR) =====================
const arOverlay = document.getElementById("ar-overlay");
const arStatus = document.getElementById("ar-status");
const reticle = document.getElementById("reticle");

let xrSession = null;
let xrRefSpace = null;
let xrHitTestSource = null;
let gl = null;
let renderer = null;
let scene = null;
let camera = null;
let reticleModel = null;
let lastHitPose = null;
let arScaleCm = 50; // default 50cm
let arStartBearing = 0;        // compass heading when AR started
let arStartLat = null;
let arStartLng = null;
let lastPlacedHeight = 1.5;    // last placed graffiti height (meters from floor)
let lastPlacedSurfaceType = "wall";
let lastPlacedQuaternion = [0, 0, 0, 1];
let lastPlacedX = undefined;
let lastPlacedZ = undefined;
const APP_VERSION = "1.6";   // Version number - update when making changes
// Scale slider
const arScaleSlider = document.getElementById("ar-scale-slider");
const arScaleLabel = document.getElementById("ar-scale-label");
const reticleEl = document.getElementById("reticle");

if (arScaleSlider) {
  arScaleSlider.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: false });
  arScaleSlider.addEventListener("touchmove", (e) => e.stopPropagation(), { passive: false });
  arScaleSlider.addEventListener("click", (e) => e.stopPropagation());
  arScaleSlider.addEventListener("pointerdown", (e) => e.stopPropagation());

  arScaleSlider.addEventListener("input", () => {
    arScaleCm = parseInt(arScaleSlider.value);

    if (arScaleLabel) {
      arScaleLabel.textContent = arScaleCm >= 100
        ? (arScaleCm / 100).toFixed(1) + "m"
        : arScaleCm + "cm";
    }

    const minPx = 30;
    const maxPx = 250;
    const diameter = minPx + ((arScaleCm - 10) / (300 - 10)) * (maxPx - minPx);
    if (reticleEl) {
      reticleEl.style.width = diameter + "px";
      reticleEl.style.height = diameter + "px";
    }

    if (reticleModel) {
      const radius = (arScaleCm / 100) / 2;
      reticleModel.scale.set(radius / 0.07, radius / 0.07, radius / 0.07);
    }
  });
}

let debugNormalArrow = null;  // ArrowHelper showing surface normal
let debugPlane = null;        // translucent plane showing detected surface

// Three.js scene setup
function initThreeScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  // Reticle — a ring that shows where surfaces are detected (color changes per surface type)
  const ringGeo = new THREE.RingGeometry(0.05, 0.07, 32).rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  reticleModel = new THREE.Mesh(ringGeo, ringMat);
  reticleModel.visible = false;
  reticleModel.matrixAutoUpdate = false;
  scene.add(reticleModel);

  // Debug: arrow showing surface normal direction (red=wall, green=floor, blue=ceiling)
  debugNormalArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.15, 0x00ff00, 0.04, 0.03
  );
  debugNormalArrow.visible = false;
  scene.add(debugNormalArrow);

  // Debug: translucent quad showing the detected surface patch
  const dbgGeo = new THREE.PlaneGeometry(0.3, 0.3);
  const dbgMat = new THREE.MeshBasicMaterial({
    color: 0x00ff00, transparent: true, opacity: 0.25,
    side: THREE.DoubleSide, depthTest: false
  });
  debugPlane = new THREE.Mesh(dbgGeo, dbgMat);
  debugPlane.visible = false;
  debugPlane.matrixAutoUpdate = false;
  scene.add(debugPlane);
}

// Create a plane with the drawing texture, oriented to lie FLAT on the detected surface
// Place drawing at WebXR hit point
function placeDrawingAtHit(pose) {
  const drawingTexture = new THREE.CanvasTexture(canvas);
  drawingTexture.needsUpdate = true;

  const aspect = canvas.width / canvas.height;
  const planeWidth = arScaleCm / 100;
  const planeHeight = planeWidth / aspect;

  const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);

  const material = new THREE.MeshBasicMaterial({
    map: drawingTexture,
    transparent: true,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);

  // Decompose hit pose to get position and surface orientation
  const matrix = new THREE.Matrix4();
  matrix.fromArray(pose.transform.matrix);

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scaleVec = new THREE.Vector3();
  matrix.decompose(position, quaternion, scaleVec);

  // In WebXR hit test results, the local +Y axis of the pose represents the surface normal
  const surfaceNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).normalize();

  // Read the manual surface mode override
  const modeSelector = document.getElementById("ar-surface-mode");
  const mode = modeSelector ? modeSelector.value : "auto";

  let isWall = false;
  let isCeiling = false;
  let surfaceType = "floor";

  if (mode === "auto") {
    // Classify surface naturally based on normal direction
    isWall = Math.abs(surfaceNormal.y) < 0.7;
    isCeiling = !isWall && surfaceNormal.y < -0.7;
    surfaceType = isWall ? "wall" : (isCeiling ? "ceiling" : "floor");
  } else if (mode === "wall") {
    // Force a wall (vertical) orientation
    isWall = true;
    surfaceType = "wall";
    
    // Construct a normal pointing horizontally towards the camera
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    
    surfaceNormal.copy(camPos).sub(position);
    surfaceNormal.y = 0; // Flatten the normal to be strictly horizontal
    if (surfaceNormal.lengthSq() > 0.001) {
      surfaceNormal.normalize();
    } else {
      surfaceNormal.set(0, 0, 1); // fallback if camera directly above
    }
  } else if (mode === "floor") {
    // Force a floor (horizontal) orientation
    isWall = false;
    surfaceType = "floor";
    surfaceNormal.set(0, 1, 0); // pointing straight up
  }

  // === ALIGN MESH FLAT ON THE SURFACE ===
  // A THREE.PlaneGeometry is created facing the +Z axis (0, 0, 1).
  // To make it lie flat on the surface, we must rotate the mesh so its +Z axis aligns with the surface normal.
  const defaultNormal = new THREE.Vector3(0, 0, 1);

  // Calculate the basic rotation to align the plane with the surface normal
  const alignQuaternion = new THREE.Quaternion().setFromUnitVectors(defaultNormal, surfaceNormal);
  mesh.quaternion.copy(alignQuaternion);

  // Now the plane is flat against the surface, but it might be rotated around that normal (like a steering wheel).
  // We want to orient the "up" direction of the drawing (the local +Y axis) logically.

  if (isWall) {
    // For a wall, we want the drawing's top (+Y) to point UP towards the sky (global +Y)
    const globalUp = new THREE.Vector3(0, 1, 0);

    // Project global UP onto the plane (remove the component along the surface normal)
    const projectedUp = globalUp.clone().sub(surfaceNormal.clone().multiplyScalar(globalUp.dot(surfaceNormal))).normalize();

    // What is the mesh's current UP direction after the basic alignment?
    const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion).normalize();

    // Calculate the twist needed to align currentUp with projectedUp, around the surface normal
    const twistQuaternion = new THREE.Quaternion().setFromUnitVectors(currentUp, projectedUp);

    // Apply the twist
    mesh.quaternion.premultiply(twistQuaternion);

  } else {
    // For floors and ceilings, we want the top of the drawing to point away from the camera
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);

    // Vector from drawing to camera (projected onto the floor/ceiling plane)
    const toCam = camPos.clone().sub(position);
    const projectedToCam = toCam.sub(surfaceNormal.clone().multiplyScalar(toCam.dot(surfaceNormal))).normalize();

    // The drawing's UP should point AWAY from the camera so it looks right-side up to the user
    const desiredUp = projectedToCam.clone().negate();
    if (isCeiling) desiredUp.negate(); // Flip for ceiling so it isn't mirrored

    // Apply the twist
    const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion).normalize();
    const twistQuaternion = new THREE.Quaternion().setFromUnitVectors(currentUp, desiredUp);
    mesh.quaternion.premultiply(twistQuaternion);
  }

  // Position mesh ON the surface with tiny offset to prevent z-fighting
  mesh.position.copy(position);
  mesh.position.add(surfaceNormal.clone().multiplyScalar(0.002));

  // LOCK THE MESH: Disable auto-updates so it stays fixed in world space
  mesh.updateMatrix();
  mesh.updateMatrixWorld();
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldAutoUpdate = false;

  // Store data for anchor updates
  mesh.userData.surfaceType = surfaceType;
  mesh.userData.surfaceNormal = surfaceNormal.clone();
  mesh.userData.lockedPosition = mesh.position.clone();
  mesh.userData.lockedQuaternion = mesh.quaternion.clone();
  mesh.userData.lockedMatrix = mesh.matrix.clone();
  
  lastPlacedHeight = position.y;
  lastPlacedSurfaceType = surfaceType;
  lastPlacedQuaternion = [mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w];
  lastPlacedX = mesh.position.x;
  lastPlacedZ = mesh.position.z;

  scene.add(mesh);
  arStatus.textContent = "🔒 LOCKED on " + surfaceType.toUpperCase() + " at " + arScaleCm + "cm — graffiti is now anchored in place!";
  return mesh;
}

// ===================== HTTPS CHECK =====================
function isSecureContext() {
  return location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

// ===================== AR MODE (WebXR) =====================
document.getElementById("ar-btn").addEventListener("click", async () => {
  // HTTPS check — camera won't work without it
  if (!isSecureContext()) {
    alert("AR requires HTTPS. Camera and sensors are blocked on insecure connections.\n\nUse https:// or localhost.");
    return;
  }

  // Check WebXR support
  if (!navigator.xr) {
    alert("WebXR is not supported on this device/browser.");
    return;
  }

  const supported = await navigator.xr.isSessionSupported("immersive-ar");
  if (!supported) {
    alert("Immersive AR is not supported on this device/browser.");
    return;
  }

  try {
    initThreeScene();

    const arCanvas = document.createElement("canvas");
    gl = arCanvas.getContext("webgl", { xrCompatible: true });
    renderer = new THREE.WebGLRenderer({ canvas: arCanvas, context: gl, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;

    // Record compass and GPS at AR start for true global anchor calculations
    arStartBearing = userBearing;
    arStartLat = userLat;
    arStartLng = userLng;

    // Request AR session with hit-test + spatial anchors
    xrSession = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay", "anchors"],
      domOverlay: { root: arOverlay }
    });

    arOverlay.style.display = "block";
    document.getElementById("draw-toolbar").style.display = "none";
    document.getElementById("canvas").style.display = "none";

    renderer.xr.setReferenceSpaceType("local");
    await renderer.xr.setSession(xrSession);

    xrRefSpace = await xrSession.requestReferenceSpace("local");
    const viewerSpace = await xrSession.requestReferenceSpace("viewer");
    xrHitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });

    // Tap to place graffiti (no anchors - just static placement)
    xrSession.addEventListener("select", () => {
      if (lastHitPose) {
        placeDrawingAtHit(lastHitPose);
      }
    });

    xrSession.addEventListener("end", () => {
      arOverlay.style.display = "none";
      document.getElementById("draw-toolbar").style.display = "flex";
      document.getElementById("canvas").style.display = "block";
      xrSession = null;
    });

    renderer.setAnimationLoop((timestamp, frame) => {
      if (!frame) return;

      const hitResults = frame.getHitTestResults(xrHitTestSource);
      if (hitResults.length > 0) {
        const hit = hitResults[0];
        lastHitResult = hit;
        lastHitPose = hit.getPose(xrRefSpace);
        reticleModel.visible = true;
        reticleModel.matrix.fromArray(lastHitPose.transform.matrix);

        // Detect surface type from hit normal
        const hitQ = new THREE.Quaternion(
          lastHitPose.transform.orientation.x,
          lastHitPose.transform.orientation.y,
          lastHitPose.transform.orientation.z,
          lastHitPose.transform.orientation.w
        );
        const rawHitNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(hitQ);
        
        const modeSelector = document.getElementById("ar-surface-mode");
        const mode = modeSelector ? modeSelector.value : "auto";
        
        let hitNormal = rawHitNormal.clone();
        let hitSurface = "floor";

        const hitPos = new THREE.Vector3(
          lastHitPose.transform.position.x,
          lastHitPose.transform.position.y,
          lastHitPose.transform.position.z
        );

        if (mode === "auto") {
          hitSurface = Math.abs(hitNormal.y) < 0.5 ? "wall" : (hitNormal.y < -0.5 ? "ceiling" : "floor");
          reticleModel.matrix.fromArray(lastHitPose.transform.matrix);
        } else if (mode === "wall") {
          hitSurface = "wall";
          const camPos = new THREE.Vector3();
          camera.getWorldPosition(camPos);
          hitNormal.copy(camPos).sub(hitPos);
          hitNormal.y = 0;
          if (hitNormal.lengthSq() > 0.001) hitNormal.normalize();
          else hitNormal.set(0, 0, 1);
          
          const alignQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), hitNormal);
          reticleModel.matrix.makeRotationFromQuaternion(alignQ);
          reticleModel.matrix.setPosition(hitPos);
        } else if (mode === "floor") {
          hitSurface = "floor";
          hitNormal.set(0, 1, 0);
          
          const alignQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), hitNormal);
          reticleModel.matrix.makeRotationFromQuaternion(alignQ);
          reticleModel.matrix.setPosition(hitPos);
        }

        // Debug colors: red=wall, green=floor, cyan=ceiling
        const debugColors = { wall: 0xff3333, floor: 0x33ff33, ceiling: 0x33ccff };
        const col = debugColors[hitSurface] || 0xffffff;
        reticleModel.material.color.setHex(col);

        // Debug: position arrow at hit point, pointing along surface normal
        if (debugNormalArrow) {
          debugNormalArrow.position.copy(hitPos);
          debugNormalArrow.setDirection(hitNormal);
          debugNormalArrow.setColor(new THREE.Color(col));
          debugNormalArrow.visible = true;
        }

        // Debug: translucent surface patch aligned to the hit
        if (debugPlane) {
          debugPlane.matrix.copy(reticleModel.matrix);
          debugPlane.material.color.setHex(col);
          debugPlane.visible = true;
        }

        arStatus.textContent = "[" + hitSurface.toUpperCase() + (mode !== "auto" ? " OVERRIDE" : "") + "] normal Y=" + hitNormal.y.toFixed(2)
          + " — tap to place!";
      } else {
        reticleModel.visible = false;
        if (debugNormalArrow) debugNormalArrow.visible = false;
        if (debugPlane) debugPlane.visible = false;
        lastHitResult = null;
        lastHitPose = null;
        arStatus.textContent = "Scanning for surfaces... point at a wall or floor";
      }

      renderer.render(scene, camera);
    });

  } catch (err) {
    console.error(err);
    alert("Failed to start AR session: " + err.message);
  }
});

// Exit AR
document.getElementById("ar-exit-btn").addEventListener("click", () => {
  if (xrSession) {
    xrSession.end();
  }
});

// ===================== GPS + GLOBAL GRAFFITI =====================
let userLat = null, userLng = null, userBearing = 0;
let gpsWatchId = null;
const gpsStatus = document.getElementById("ar-gps-status");

// Start GPS tracking — called on user gesture for iOS compatibility
function startGPSTracking() {
  if (gpsWatchId !== null) return; // already tracking
  if (!("geolocation" in navigator)) {
    console.warn("Geolocation not available");
    return;
  }
  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      if (pos.coords.heading != null && !isNaN(pos.coords.heading)) {
        userBearing = pos.coords.heading;
      }
      if (gpsStatus) {
        gpsStatus.textContent = `📍 GPS: ${userLat.toFixed(5)}, ${userLng.toFixed(5)}`;
      }
    },
    (err) => {
      console.warn("GPS error:", err.code, err.message);
      if (gpsStatus) {
        const msgs = {
          1: "⚠️ GPS: Permission denied. Allow location access in browser settings.",
          2: "⚠️ GPS: Position unavailable. Try moving outdoors.",
          3: "⚠️ GPS: Timed out. Retrying..."
        };
        gpsStatus.textContent = msgs[err.code] || ("⚠️ GPS: " + err.message);
      }
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
}

// Try starting GPS on load (works on Android/desktop, may silently fail on iOS)
startGPSTracking();

// Also use compass for bearing when GPS heading unavailable
window.addEventListener("deviceorientation", (e) => {
  if (e.webkitCompassHeading != null) {
    userBearing = e.webkitCompassHeading; // iOS
  } else if (e.alpha != null) {
    userBearing = 360 - e.alpha; // Android
  }
});

// Share graffiti globally (save to MongoDB)
document.getElementById("ar-share-btn").addEventListener("click", async () => {
  if (userLat === null || userLng === null) {
    if (gpsStatus) gpsStatus.textContent = "📡 Acquiring GPS position...";
    // Try a one-shot position request as fallback
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 15000
        });
      });
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      startGPSTracking();
    } catch (err) {
      const msgs = {
        1: "❌ Location permission denied. Allow location access in your browser/device settings and reload.",
        2: "❌ Position unavailable. Make sure GPS/Location Services are turned on.",
        3: "❌ GPS timed out. Try again outdoors or check device location settings."
      };
      if (gpsStatus) gpsStatus.textContent = msgs[err.code] || ("❌ GPS error: " + err.message);
      return;
    }
  }

  const imageData = canvas.toDataURL("image/png");
  const description = document.getElementById("ar-description").value.trim();
  
  if (lastPlacedX === undefined || arStartLat === null || arStartLng === null) {
    if (gpsStatus) gpsStatus.textContent = "❌ Please place graffiti on a surface first!";
    alert("Please place your graffiti onto a wall or floor in AR before sharing.");
    return;
  }

  // Convert local WebXR (X, Z) back to Global GPS (Lat, Lng)
  const bRad = arStartBearing * Math.PI / 180;
  const eastMeters = lastPlacedX * Math.cos(bRad) - lastPlacedZ * Math.sin(bRad);
  const northMeters = -lastPlacedX * Math.sin(bRad) - lastPlacedZ * Math.cos(bRad);

  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(arStartLat * Math.PI / 180);

  const graffitiLat = arStartLat + (northMeters / metersPerDegLat);
  const graffitiLng = arStartLng + (eastMeters / metersPerDegLng);

  if (gpsStatus) gpsStatus.textContent = "Uploading true 3D coordinates...";

  try {
    const resp = await fetch("/api/graffiti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: graffitiLat,
        lng: graffitiLng,
        image: imageData,
        scale: arScaleCm,
        bearing: arStartBearing,
        description: description,
        height: lastPlacedHeight,
        surfaceType: lastPlacedSurfaceType,
        quaternion: lastPlacedQuaternion
      })
    });
    const result = await resp.json();
    if (resp.ok) {
      if (gpsStatus) gpsStatus.textContent = "✅ Shared globally! Anyone nearby can see it.";
      document.getElementById("ar-description").value = "";
    } else {
      if (gpsStatus) gpsStatus.textContent = "❌ " + (result.error || "Upload failed");
    }
  } catch (err) {
    if (gpsStatus) gpsStatus.textContent = "❌ Network error: " + err.message;
  }
});

// Load nearby graffiti from MongoDB and render in 3D scene
document.getElementById("ar-load-btn").addEventListener("click", () => loadNearbyGraffiti());

async function loadNearbyGraffiti() {
  if (userLat === null || userLng === null) {
    if (gpsStatus) gpsStatus.textContent = "📡 Acquiring GPS position...";
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 15000
        });
      });
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      startGPSTracking();
    } catch (err) {
      const msgs = {
        1: "❌ Location permission denied. Allow in browser settings.",
        2: "❌ Position unavailable. Check GPS/Location Services.",
        3: "❌ GPS timed out. Try outdoors."
      };
      if (gpsStatus) gpsStatus.textContent = msgs[err.code] || ("❌ GPS error: " + err.message);
      return;
    }
  }

  if (gpsStatus) gpsStatus.textContent = "📡 Loading nearby graffiti...";

  try {
    const resp = await fetch(`/api/graffiti/nearby?lat=${userLat}&lng=${userLng}&radius=200`);
    if (!resp.ok) {
      const err = await resp.json();
      if (gpsStatus) gpsStatus.textContent = "❌ " + (err.error || "Load failed");
      return;
    }

    const items = await resp.json();
    if (items.length === 0) {
      if (gpsStatus) gpsStatus.textContent = "No graffiti nearby. Be the first!";
      return;
    }

    // Determine which scene to render into
    const targetScene = scene;
    const targetCamera = camera;

    if (!targetScene) {
      if (gpsStatus) gpsStatus.textContent = "⚠️ AR scene not ready";
      return;
    }

    let loaded = 0;
    for (const item of items) {
      // Skip if already loaded (check by ID tag)
      if (targetScene.getObjectByName("global_" + item.id)) continue;

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const tex = new THREE.CanvasTexture(imageToCanvas(img));
        tex.needsUpdate = true;

        const aspect = img.width / img.height;
        const planeW = (item.scale || 50) / 100;
        const planeH = planeW / aspect;

        const geo = new THREE.PlaneGeometry(planeW, planeH);
        const mat = new THREE.MeshBasicMaterial({
          map: tex, 
          transparent: true, 
          side: THREE.DoubleSide, 
          depthWrite: false // prevents z-fighting
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = "global_" + item.id;

        // Load graffiti relative to your precise starting anchor
        const dLat = item.lat - arStartLat;
        const dLng = item.lng - arStartLng;
        const metersPerDegLat = 111320;
        const metersPerDegLng = 111320 * Math.cos(arStartLat * Math.PI / 180);
        const northMeters = dLat * metersPerDegLat;
        const eastMeters = dLng * metersPerDegLng;

        // Rotate GPS offset into scene coordinates
        const sceneBearing = arStartBearing;
        const bRad = sceneBearing * Math.PI / 180;
        const sceneX = eastMeters * Math.cos(bRad) - northMeters * Math.sin(bRad);
        const sceneZ = -eastMeters * Math.sin(bRad) - northMeters * Math.cos(bRad);

        // Height: stored value or default 1.5m
        let h = item.height != null ? item.height : 1.5;

        mesh.position.set(sceneX, h, sceneZ);

        if (item.quaternion && item.quaternion.length === 4) {
          // Restore exact 3D orientation
          mesh.quaternion.set(item.quaternion[0], item.quaternion[1], item.quaternion[2], item.quaternion[3]);
          
          // Adjust for user's compass bearing vs the placed bearing
          const itemBearingRad = ((item.bearing || 0) - arStartBearing) * Math.PI / 180;
          const globalY = new THREE.Vector3(0, 1, 0);
          mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(globalY, itemBearingRad));
        } else {
          // Fallback for older graffiti without quaternions
          const itemBearingRad = ((item.bearing || 0) - arStartBearing) * Math.PI / 180;
          mesh.rotation.y = itemBearingRad;
          if (item.surfaceType === "floor") {
            mesh.rotation.x = -Math.PI / 2;
          } else if (item.surfaceType === "ceiling") {
            mesh.rotation.x = Math.PI / 2;
          }
        }

        // LOCK THE MESH: Disable auto-updates so tracking is pristine
        mesh.updateMatrix();
        mesh.updateMatrixWorld();
        mesh.matrixAutoUpdate = false;
        mesh.matrixWorldAutoUpdate = false;

        targetScene.add(mesh);
        loaded++;

        if (gpsStatus) gpsStatus.textContent = `🌍 Loaded ${loaded} graffiti nearby`;
      };
      img.src = item.image;
    }

    // Show a clickable list of nearby graffiti
    if (items.length > 0) {
      showNearbyList(items);
    }

    if (loaded === 0 && gpsStatus) {
      gpsStatus.textContent = `🌍 ${items.length} graffiti nearby (loading images...)`;
    }
  } catch (err) {
    if (gpsStatus) gpsStatus.textContent = "❌ " + err.message;
  }
}

// Helper: convert Image to canvas (for Three.js texture)
function imageToCanvas(img) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  return c;
}

// Show clickable list of nearby graffiti in AR overlay
function showNearbyList(items) {
  let list = document.getElementById("nearby-list");
  if (!list) {
    list = document.createElement("div");
    list.id = "nearby-list";
    list.className = "nearby-list";
    arOverlay.appendChild(list);
  }
  list.innerHTML = "<h4>🌍 Nearby Graffiti</h4>";
  items.forEach(item => {
    const card = document.createElement("a");
    card.href = "/graffiti/" + item.id;
    card.className = "nearby-card";
    card.innerHTML = `<img src="${item.image}" alt="graffiti">`
      + `<div class="nearby-card-info">`
      + `<span class="nearby-card-author">${item.author || 'Anon'}</span>`
      + `<span class="nearby-card-desc">${(item.description || '').slice(0, 60)}</span>`
      + `<span class="nearby-card-stats">❤️ ${item.likes || 0} · 💬 ${item.comments || 0}</span>`
      + `</div>`;
    list.appendChild(card);
  });
}


