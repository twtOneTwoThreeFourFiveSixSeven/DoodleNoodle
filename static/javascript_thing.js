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
        placingImage = {
          img, w, h,
          originalW: w, originalH: h,  // store original fitted size
          prevW: w, prevH: h,          // track previous size for re-centering
          x: (canvas.width - w) / 2,
          y: (canvas.height - h) / 2,
          dragging: false,
          rotation: 0
        };
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
    hint.innerHTML = "Drag to position &bull; Use sliders to resize & rotate &bull; Click <b>Stamp</b> to place";
    placeOverlay.appendChild(hint);

    // Controls bar container
    const controlsBar = document.createElement("div");
    controlsBar.style.cssText = "position:absolute;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);padding:10px 20px;border-radius:10px;display:flex;flex-direction:column;gap:10px;z-index:51;";

    // ---- Scale slider row ----
    const scaleRow = document.createElement("div");
    scaleRow.style.cssText = "display:flex;align-items:center;gap:10px;";
    const scaleLabel = document.createElement("label");
    scaleLabel.style.cssText = "color:white;font-size:14px;display:flex;align-items:center;gap:8px;white-space:nowrap;";
    scaleLabel.textContent = "📐 Size: ";
    const scaleSlider = document.createElement("input");
    scaleSlider.type = "range";
    scaleSlider.min = "10";
    scaleSlider.max = "300";
    scaleSlider.value = "100";
    scaleSlider.style.cssText = "width:150px;accent-color:#3498db;";
    const scaleVal = document.createElement("span");
    scaleVal.style.cssText = "color:white;font-size:14px;font-weight:bold;min-width:45px;";
    scaleVal.textContent = "100%";

    scaleSlider.addEventListener("input", () => {
      const pct = parseInt(scaleSlider.value);
      scaleVal.textContent = pct + "%";
      const scaleFactor = pct / 100;
      const aspect = placingImage.originalW / placingImage.originalH;
      placingImage.w = placingImage.originalW * scaleFactor;
      placingImage.h = placingImage.w / aspect;
      // Re-center on the current center point
      const cx = placingImage.x + placingImage.prevW / 2;
      const cy = placingImage.y + placingImage.prevH / 2;
      placingImage.x = cx - placingImage.w / 2;
      placingImage.y = cy - placingImage.h / 2;
      placingImage.prevW = placingImage.w;
      placingImage.prevH = placingImage.h;
      if (placingImage.savedData) ctx.putImageData(placingImage.savedData, 0, 0);
      drawRotatedPreview();
    });
    scaleSlider.addEventListener("mousedown", (e) => e.stopPropagation());
    scaleSlider.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: false });
    scaleSlider.addEventListener("touchmove", (e) => e.stopPropagation(), { passive: false });

    scaleLabel.appendChild(scaleSlider);
    scaleRow.appendChild(scaleLabel);
    scaleRow.appendChild(scaleVal);
    controlsBar.appendChild(scaleRow);

    // ---- Rotation slider row ----
    const rotateRow = document.createElement("div");
    rotateRow.style.cssText = "display:flex;align-items:center;gap:10px;";
    const rotateLabel = document.createElement("label");
    rotateLabel.style.cssText = "color:white;font-size:14px;display:flex;align-items:center;gap:8px;white-space:nowrap;";
    rotateLabel.textContent = "🔄 Rotate: ";
    const rotateSlider = document.createElement("input");
    rotateSlider.type = "range";
    rotateSlider.min = "-180";
    rotateSlider.max = "180";
    rotateSlider.value = "0";
    rotateSlider.style.cssText = "width:150px;accent-color:#e74c3c;";
    const rotateDeg = document.createElement("span");
    rotateDeg.style.cssText = "color:white;font-size:14px;font-weight:bold;min-width:40px;";
    rotateDeg.textContent = "0°";

    rotateSlider.addEventListener("input", () => {
      placingImage.rotation = parseInt(rotateSlider.value);
      rotateDeg.textContent = rotateSlider.value + "°";
      if (placingImage.savedData) ctx.putImageData(placingImage.savedData, 0, 0);
      drawRotatedPreview();
    });
    rotateSlider.addEventListener("mousedown", (e) => e.stopPropagation());
    rotateSlider.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: false });
    rotateSlider.addEventListener("touchmove", (e) => e.stopPropagation(), { passive: false });

    rotateLabel.appendChild(rotateSlider);
    rotateRow.appendChild(rotateLabel);
    rotateRow.appendChild(rotateDeg);
    controlsBar.appendChild(rotateRow);

    placeOverlay.appendChild(controlsBar);

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

function drawRotatedPreview() {
  if (!placingImage) return;
  const { img, x, y, w, h, rotation } = placingImage;
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.globalAlpha = 0.7;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotation || 0) * Math.PI / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawPreview() {
  if (!placingImage) return;
  const saved = ctx.getImageData(0, 0, canvas.width, canvas.height);
  ctx.putImageData(saved, 0, 0);
  placingImage.savedData = saved;
  drawRotatedPreview();
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
  drawRotatedPreview();
}
function stopDragImage() { if (placingImage) placingImage.dragging = false; }
function resizeImage(e) {
  if (!placingImage) return;
  e.preventDefault();
  const scale = e.deltaY < 0 ? 1.05 : 0.95;
  const aspect = placingImage.w / placingImage.h;
  const cx = placingImage.x + placingImage.w / 2;
  const cy = placingImage.y + placingImage.h / 2;
  placingImage.w *= scale;
  placingImage.h = placingImage.w / aspect;
  placingImage.x = cx - placingImage.w / 2;
  placingImage.y = cy - placingImage.h / 2;
  placingImage.prevW = placingImage.w;
  placingImage.prevH = placingImage.h;
  if (placingImage.savedData) ctx.putImageData(placingImage.savedData, 0, 0);
  drawRotatedPreview();
}

function commitImage() {
  if (!placingImage) return;
  if (placingImage.savedData) ctx.putImageData(placingImage.savedData, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;

  // Commit with rotation
  const { img, x, y, w, h, rotation } = placingImage;
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotation || 0) * Math.PI / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();

  placingImage = null;
  removePlaceOverlay();
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
let nearbyInterval = null;
let gl = null;
let renderer = null;
let scene = null;
let camera = null;
let reticleModel = null;
let previewMesh = null;
let lastHitPose = null;
let arScaleCm = 50; // default 50cm
let arRotationDeg = 0;         // user rotation for AR placement
let arStartBearing = 0;        // compass heading when AR started
let arStartLat = null;
let arStartLng = null;
let lastPlacedHeight = 1.5;    // last placed graffiti height (meters from floor)
let lastPlacedSurfaceType = "wall";
let lastPlacedQuaternion = [0, 0, 0, 1];
let lastPlacedX = undefined;
let lastPlacedZ = undefined;
const APP_VERSION = "2.0";   // Major version bump after conflict resolution

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

// Rotation slider
const arRotateSlider = document.getElementById("ar-rotate-slider");
const arRotateLabel = document.getElementById("ar-rotate-label");

if (arRotateSlider) {
  arRotateSlider.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: false });
  arRotateSlider.addEventListener("touchmove", (e) => e.stopPropagation(), { passive: false });
  arRotateSlider.addEventListener("click", (e) => e.stopPropagation());
  arRotateSlider.addEventListener("pointerdown", (e) => e.stopPropagation());

  arRotateSlider.addEventListener("input", () => {
    arRotationDeg = parseInt(arRotateSlider.value);
    if (arRotateLabel) arRotateLabel.textContent = arRotationDeg + "°";
  });
}

let debugNormalArrow = null;  // ArrowHelper showing surface normal
let debugPlane = null;        // translucent plane showing the detected surface

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

  // Preview Image Mesh
  const previewGeo = new THREE.PlaneGeometry(1, 1);
  const previewMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  });
  previewMesh = new THREE.Mesh(previewGeo, previewMat);
  previewMesh.visible = false;
  previewMesh.matrixAutoUpdate = false;
  scene.add(previewMesh);
}

// Create a plane with the drawing texture, oriented to lie FLAT on the detected surface
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

  const matrix = new THREE.Matrix4();
  matrix.fromArray(pose.transform.matrix);

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scaleVec = new THREE.Vector3();
  matrix.decompose(position, quaternion, scaleVec);

  const surfaceNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).normalize();

  const modeSelector = document.getElementById("ar-surface-mode");
  const mode = modeSelector ? modeSelector.value : "auto";

  let isWall = false;
  let isCeiling = false;
  let surfaceType = "floor";

  if (mode === "auto") {
    isWall = Math.abs(surfaceNormal.y) < 0.7;
    isCeiling = !isWall && surfaceNormal.y < -0.7;
    surfaceType = isWall ? "wall" : (isCeiling ? "ceiling" : "floor");
  } else if (mode === "wall") {
    isWall = true;
    surfaceType = "wall";
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    surfaceNormal.copy(camPos).sub(position);
    surfaceNormal.y = 0;
    if (surfaceNormal.lengthSq() > 0.001) surfaceNormal.normalize();
    else surfaceNormal.set(0, 0, 1);
  } else if (mode === "floor") {
    isWall = false;
    surfaceType = "floor";
    surfaceNormal.set(0, 1, 0);
  }

  // Align mesh flat on the surface
  const defaultNormal = new THREE.Vector3(0, 0, 1);
  const alignQuaternion = new THREE.Quaternion().setFromUnitVectors(defaultNormal, surfaceNormal);
  mesh.quaternion.copy(alignQuaternion);

  if (isWall) {
    const globalUp = new THREE.Vector3(0, 1, 0);
    const projectedUp = globalUp.clone().sub(surfaceNormal.clone().multiplyScalar(globalUp.dot(surfaceNormal))).normalize();
    const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion).normalize();
    const twistQuaternion = new THREE.Quaternion().setFromUnitVectors(currentUp, projectedUp);
    mesh.quaternion.premultiply(twistQuaternion);
  } else {
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    const toCam = camPos.clone().sub(position);
    const projectedToCam = toCam.sub(surfaceNormal.clone().multiplyScalar(toCam.dot(surfaceNormal))).normalize();
    const desiredUp = projectedToCam.clone().negate();
    if (isCeiling) desiredUp.negate();
    const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion).normalize();
    const twistQuaternion = new THREE.Quaternion().setFromUnitVectors(currentUp, desiredUp);
    mesh.quaternion.premultiply(twistQuaternion);
  }

  // Apply user rotation around the surface normal
  if (arRotationDeg !== 0) {
    const rotQ = new THREE.Quaternion().setFromAxisAngle(surfaceNormal.normalize(), arRotationDeg * Math.PI / 180);
    mesh.quaternion.premultiply(rotQ);
  }

  mesh.position.copy(position);
  mesh.position.add(surfaceNormal.clone().multiplyScalar(0.002));

  mesh.updateMatrix();
  mesh.updateMatrixWorld();
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldAutoUpdate = false;

  lastPlacedHeight = position.y;
  lastPlacedSurfaceType = surfaceType;
  lastPlacedQuaternion = [mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w];
  lastPlacedX = mesh.position.x;
  lastPlacedZ = mesh.position.z;

  scene.add(mesh);
  arStatus.textContent = "🔒 LOCKED on " + surfaceType.toUpperCase() + " at " + arScaleCm + "cm";
  return mesh;
}

// Also apply rotation to the preview mesh
function updatePreviewMesh(pose) {
  if (!previewMesh) return;

  if (!previewMesh.material.map) {
    const drawingTexture = new THREE.CanvasTexture(canvas);
    previewMesh.material.map = drawingTexture;
    previewMesh.material.needsUpdate = true;
  }

  const aspect = canvas.width / canvas.height;
  const planeWidth = arScaleCm / 100;
  const planeHeight = planeWidth / aspect;

  previewMesh.scale.set(planeWidth, planeHeight, 1);

  const matrix = new THREE.Matrix4();
  matrix.fromArray(pose.transform.matrix);

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scaleVec = new THREE.Vector3();
  matrix.decompose(position, quaternion, scaleVec);

  const surfaceNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).normalize();

  const modeSelector = document.getElementById("ar-surface-mode");
  const mode = modeSelector ? modeSelector.value : "auto";

  let isWall = false;
  let isCeiling = false;

  if (mode === "auto") {
    isWall = Math.abs(surfaceNormal.y) < 0.7;
    isCeiling = !isWall && surfaceNormal.y < -0.7;
  } else if (mode === "wall") {
    isWall = true;
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    surfaceNormal.copy(camPos).sub(position);
    surfaceNormal.y = 0;
    if (surfaceNormal.lengthSq() > 0.001) surfaceNormal.normalize();
    else surfaceNormal.set(0, 0, 1);
  } else if (mode === "floor") {
    isWall = false;
    surfaceNormal.set(0, 1, 0);
  }

  const defaultNormal = new THREE.Vector3(0, 0, 1);
  const alignQuaternion = new THREE.Quaternion().setFromUnitVectors(defaultNormal, surfaceNormal);
  previewMesh.quaternion.copy(alignQuaternion);

  if (isWall) {
    const globalUp = new THREE.Vector3(0, 1, 0);
    const projectedUp = globalUp.clone().sub(surfaceNormal.clone().multiplyScalar(globalUp.dot(surfaceNormal))).normalize();
    const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(previewMesh.quaternion).normalize();
    const twistQuaternion = new THREE.Quaternion().setFromUnitVectors(currentUp, projectedUp);
    previewMesh.quaternion.premultiply(twistQuaternion);
  } else {
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    const toCam = camPos.clone().sub(position);
    const projectedToCam = toCam.sub(surfaceNormal.clone().multiplyScalar(toCam.dot(surfaceNormal))).normalize();
    const desiredUp = projectedToCam.clone().negate();
    if (isCeiling) desiredUp.negate();
    const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(previewMesh.quaternion).normalize();
    const twistQuaternion = new THREE.Quaternion().setFromUnitVectors(currentUp, desiredUp);
    previewMesh.quaternion.premultiply(twistQuaternion);
  }

  // Apply user rotation to preview too
  if (arRotationDeg !== 0) {
    const rotQ = new THREE.Quaternion().setFromAxisAngle(surfaceNormal.normalize(), arRotationDeg * Math.PI / 180);
    previewMesh.quaternion.premultiply(rotQ);
  }

  previewMesh.position.copy(position);
  previewMesh.position.add(surfaceNormal.clone().multiplyScalar(0.003));

  previewMesh.updateMatrix();
  previewMesh.updateMatrixWorld();
  previewMesh.visible = true;
}

function isSecureContext() {
  return location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

// Start WebXR AR session
document.getElementById("ar-btn").addEventListener("click", async () => {
  if (!isSecureContext()) {
    alert("AR requires HTTPS.");
    return;
  }
  if (!navigator.xr) {
    alert("WebXR not supported.");
    return;
  }
  const supported = await navigator.xr.isSessionSupported("immersive-ar");
  if (!supported) {
    alert("Immersive AR not supported.");
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

    arStartBearing = userBearing;
    arStartLat = userLat;
    arStartLng = userLng;

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

    // Auto-load any graffiti placed near the user's current GPS position,
    // then keep polling every 8 seconds as the user walks around.
    loadNearbyGraffiti();
    nearbyInterval = setInterval(loadNearbyGraffiti, 8000);

    xrSession.addEventListener("select", () => {
      if (lastHitPose) placeDrawingAtHit(lastHitPose);
    });

    xrSession.addEventListener("end", () => {
      clearInterval(nearbyInterval);
      nearbyInterval = null;
      arOverlay.style.display = "none";
      document.getElementById("draw-toolbar").style.display = "flex";
      document.getElementById("canvas").style.display = "block";
      if (previewMesh) { previewMesh.visible = false; previewMesh.material.map = null; }
      xrSession = null;
    });

    renderer.setAnimationLoop((timestamp, frame) => {
      if (!frame) return;
      const hitResults = frame.getHitTestResults(xrHitTestSource);
      if (hitResults.length > 0) {
        const hit = hitResults[0];
        lastHitPose = hit.getPose(xrRefSpace);
        reticleModel.visible = true;
        updatePreviewMesh(lastHitPose);

        const hitQ = new THREE.Quaternion(lastHitPose.transform.orientation.x, lastHitPose.transform.orientation.y, lastHitPose.transform.orientation.z, lastHitPose.transform.orientation.w);
        const rawHitNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(hitQ);
        const mode = document.getElementById("ar-surface-mode")?.value || "auto";
        let hitNormal = rawHitNormal.clone();
        let hitSurface = "floor";
        const hitPos = new THREE.Vector3(lastHitPose.transform.position.x, lastHitPose.transform.position.y, lastHitPose.transform.position.z);

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

        const debugColors = { wall: 0xff3333, floor: 0x33ff33, ceiling: 0x33ccff };
        const col = debugColors[hitSurface] || 0xffffff;
        reticleModel.material.color.setHex(col);

        if (debugNormalArrow) {
          debugNormalArrow.position.copy(hitPos);
          debugNormalArrow.setDirection(hitNormal);
          debugNormalArrow.setColor(new THREE.Color(col));
          debugNormalArrow.visible = true;
        }
        if (debugPlane) {
          debugPlane.matrix.copy(reticleModel.matrix);
          debugPlane.material.color.setHex(col);
          debugPlane.visible = true;
        }
        arStatus.textContent = "[" + hitSurface.toUpperCase() + (mode !== "auto" ? " OVERRIDE" : "") + "] - tap to place!";
      } else {
        reticleModel.visible = false;
        if (debugNormalArrow) debugNormalArrow.visible = false;
        if (debugPlane) debugPlane.visible = false;
        if (previewMesh) previewMesh.visible = false;
        lastHitPose = null;
        arStatus.textContent = "Scanning...";
      }
      renderer.render(scene, camera);
    });

  } catch (err) {
    console.error(err);
    alert("AR failed: " + err.message);
  }
});

document.getElementById("ar-exit-btn").addEventListener("click", () => {
  if (xrSession) xrSession.end();
});

// ===================== GPS + GLOBAL GRAFFITI =====================
let userLat = null, userLng = null, userBearing = 0;
let gpsWatchId = null;
const gpsStatus = document.getElementById("ar-gps-status");

function startGPSTracking() {
  if (gpsWatchId !== null || !("geolocation" in navigator)) return;
  gpsWatchId = navigator.geolocation.watchPosition((pos) => {
    userLat = pos.coords.latitude; userLng = pos.coords.longitude;
    if (pos.coords.heading != null && !isNaN(pos.coords.heading)) userBearing = pos.coords.heading;
    if (gpsStatus) gpsStatus.textContent = `📍 GPS: ${userLat.toFixed(5)}, ${userLng.toFixed(5)}`;
  }, (err) => {
    console.warn("GPS error:", err.message);
  }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 });
}
startGPSTracking();

window.addEventListener("deviceorientation", (e) => {
  if (e.webkitCompassHeading != null) userBearing = e.webkitCompassHeading;
  else if (e.alpha != null) userBearing = 360 - e.alpha;
});

document.getElementById("ar-share-btn").addEventListener("click", async () => {
  if (userLat === null || userLng === null) {
    alert("Determining location...");
    return;
  }
  const imageData = canvas.toDataURL("image/png");
  const description = document.getElementById("ar-description").value.trim();

  if (lastPlacedX === undefined || arStartLat === null || arStartLng === null) {
    alert("Place graffiti on a surface first!");
    return;
  }

  const bRad = arStartBearing * Math.PI / 180;
  const eastMeters = lastPlacedX * Math.cos(bRad) - lastPlacedZ * Math.sin(bRad);
  const northMeters = -lastPlacedX * Math.sin(bRad) - lastPlacedZ * Math.cos(bRad);
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(arStartLat * Math.PI / 180);

  const graffitiLat = arStartLat + (northMeters / metersPerDegLat);
  const graffitiLng = arStartLng + (eastMeters / metersPerDegLng);

  try {
    const resp = await fetch("/api/graffiti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: graffitiLat, lng: graffitiLng, image: imageData, scale: arScaleCm,
        bearing: arStartBearing, description: description, height: lastPlacedHeight,
        surfaceType: lastPlacedSurfaceType, quaternion: lastPlacedQuaternion
      })
    });
    if (resp.ok) {
      if (gpsStatus) gpsStatus.textContent = "✅ Shared globally!";
      document.getElementById("ar-description").value = "";
    }
  } catch (err) { console.error(err); }
});

document.getElementById("ar-load-btn").addEventListener("click", () => loadNearbyGraffiti());

async function loadNearbyGraffiti() {
  // Must have an active AR scene and known GPS anchor point
  if (!scene || arStartLat === null || arStartLng === null) return;
  if (userLat === null || userLng === null) return;

  try {
    const resp = await fetch(`/api/graffiti/nearby?lat=${userLat}&lng=${userLng}&radius=200`);
    if (!resp.ok) return;
    const items = await resp.json();

    const mLat = 111320;
    const mLng = 111320 * Math.cos(arStartLat * Math.PI / 180);
    const bRad = arStartBearing * Math.PI / 180;
    let loaded = 0;

    for (const item of items) {
      // Skip pieces already in the scene
      if (scene.getObjectByName("global_" + item.id)) continue;

      const { image, scale, bearing, height, surfaceType, quaternion, id } = item;

      const img = new Image();
      img.src = image;
      await new Promise((resolve) => { img.onload = resolve; });

      // CanvasTexture handles power-of-two scaling automatically
      const tex = new THREE.CanvasTexture(img);

      const aspect = img.width / img.height;
      const planeWidth = (scale || 50) / 100;
      const planeHeight = planeWidth / aspect;

      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(planeWidth, planeHeight),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: true })
      );
      mesh.name = "global_" + id;

      // --- Position: convert saved GPS back into viewer's XR local space ---
      // The saved lat/lng is the real-world point where the graffiti sits.
      // arStartLat/Lng is where THIS viewer began their XR session (origin = 0,0,0).
      // We convert the GPS delta to a north/east offset in metres, then rotate
      // into the viewer's local XR frame using their starting compass bearing.
      const nM = (item.lat - arStartLat) * mLat;    // metres northward
      const eM = (item.lng - arStartLng) * mLng;    // metres eastward
      // Viewer XR frame: +X = right (bearing+90), -Z = forward (bearing)
      const sX =  eM * Math.cos(bRad) - nM * Math.sin(bRad);
      const sZ = -eM * Math.sin(bRad) - nM * Math.cos(bRad);
      mesh.position.set(sX, height || 1.5, sZ);

      // --- Orientation: restore saved quaternion then compensate for the
      //     difference between creator's and viewer's XR reference frames.
      //     Both frames share Y-up; they differ only by a Y-rotation equal
      //     to (creatorBearing - viewerBearing). ---
      if (quaternion && quaternion.length === 4) {
        mesh.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
        const frameDelta = ((bearing || 0) - arStartBearing) * Math.PI / 180;
        mesh.quaternion.premultiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), frameDelta)
        );
      } else {
        // Fallback for legacy records without a quaternion
        mesh.rotation.y = ((bearing || 0) - arStartBearing) * Math.PI / 180;
        if (surfaceType === "floor") mesh.rotation.x = -Math.PI / 2;
      }

      mesh.updateMatrixWorld();
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
      loaded++;
    }

    if (gpsStatus) {
      gpsStatus.textContent = loaded > 0
        ? `🎨 ${loaded} piece${loaded > 1 ? "s" : ""} loaded nearby`
        : "No graffiti nearby";
    }
  } catch (err) {
    console.error("loadNearbyGraffiti:", err);
  }
}

// ===================== DEBUGGING =====================
const debugElem = document.getElementById("debug-info");

function updateDebugInfo() {
  if (!debugElem) return;
  debugElem.innerHTML = `
    <strong>Debug Info:</strong><br>
    AR Session: ${xrSession ? "Active" : "Inactive"}<br>
    Last Hit Pose: ${JSON.stringify(lastHitPose, null, 2)}<br>
    Placed X: ${lastPlacedX}<br>
    Placed Z: ${lastPlacedZ}<br>
    Scale CM: ${arScaleCm}<br>
    Bearing: ${arStartBearing}<br>
    Latitude: ${arStartLat}<br>
    Longitude: ${arStartLng}<br>
    User Bearing: ${userBearing}<br>
    `;
}
setInterval(updateDebugInfo, 1000);

// ===================== SERVICE WORKER =====================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then((reg) => console.log("Service Worker registered:", reg))
      .catch((err) => console.warn("Service Worker registration failed:", err));
  });
}
