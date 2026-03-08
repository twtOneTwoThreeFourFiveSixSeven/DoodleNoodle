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
let appState = "DRAW"; // States: DRAW, IMAGE_PLACE, AR
let placingImage = null; // image being positioned before commit
let previewEnabled = true;
// ===================== PREVIEW TOGGLE =====================
const previewToggleBtn = document.getElementById("preview-toggle-btn");
if (previewToggleBtn) {
  previewToggleBtn.addEventListener("click", () => {
    previewEnabled = !previewEnabled;
    previewToggleBtn.textContent = previewEnabled ? "👁️ Preview On" : "🙈 Preview Off";
    if (!previewEnabled && placingImage) {
      // Remove preview overlay
      if (placingImage.savedData) ctx.putImageData(placingImage.savedData, 0, 0);
    } else if (previewEnabled && placingImage) {
      drawRotatedPreview();
    }
  });
  previewToggleBtn.textContent = previewEnabled ? "👁️ Preview On" : "🙈 Preview Off";
}

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
// ===================== IMAGE INSERT =====================
const imgBtn = document.getElementById("img-btn");
const imgUpload = document.getElementById("img-upload");
const placeOverlay = document.getElementById("place-overlay");
const placeScaleSlider = document.getElementById("place-scale-slider");
const placeScaleValueLabel = document.getElementById("place-scale-label");
const placeRotateSlider = document.getElementById("place-rotate-slider");
const placeRotateValueLabel = document.getElementById("place-rotate-label");
const placeStampBtn = document.getElementById("place-stamp-btn");
const placeCancelBtn = document.getElementById("place-cancel-btn");

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
          originalW: w, originalH: h,
          prevW: w, prevH: h,
          x: (canvas.width - w) / 2,
          y: (canvas.height - h) / 2,
          dragging: false,
          rotation: 0
        };
        appState = "IMAGE_PLACE";
        if (placeOverlay) placeOverlay.style.display = "block";
        if (placeScaleSlider) placeScaleSlider.value = 100;
        if (placeScaleValueLabel) placeScaleValueLabel.textContent = "100%";
        if (placeRotateSlider) placeRotateSlider.value = 0;
        if (placeRotateValueLabel) placeRotateValueLabel.textContent = "0°";
        drawPreview();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    imgUpload.value = "";
  });
}

// Global initialization of static overlay events
if (placeOverlay) {
  placeOverlay.addEventListener("pointerdown", (e) => {
    if (appState !== "IMAGE_PLACE" || !placingImage) return;
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") return;
    const p = getPos(e);
    placingImage.dragging = true;
    placingImage.offsetX = p.x - placingImage.x;
    placingImage.offsetY = p.y - placingImage.y;
    // Essential for touch handling to take over the pointer
    placeOverlay.setPointerCapture(e.pointerId);
  });
  placeOverlay.addEventListener("pointermove", (e) => {
    if (!placingImage || !placingImage.dragging) return;
    const p = getPos(e);
    placingImage.x = p.x - placingImage.offsetX;
    placingImage.y = p.y - placingImage.offsetY;
    if (placingImage.savedData) ctx.putImageData(placingImage.savedData, 0, 0);
    drawRotatedPreview();
  });
  placeOverlay.addEventListener("pointerup", (e) => {
    if (placingImage) {
      placingImage.dragging = false;
      placeOverlay.releasePointerCapture(e.pointerId);
    }
  });
  placeOverlay.addEventListener("pointercancel", (e) => {
    if (placingImage) {
      placingImage.dragging = false;
      placeOverlay.releasePointerCapture(e.pointerId);
    }
  });

  placeOverlay.addEventListener("wheel", (e) => {
    if (appState !== "IMAGE_PLACE" || !placingImage) return;
    e.preventDefault();
    const scrollScale = e.deltaY < 0 ? 1.05 : 0.95;
    const aspect = placingImage.w / placingImage.h;
    const cx = placingImage.x + placingImage.w / 2;
    const cy = placingImage.y + placingImage.h / 2;
    placingImage.w *= scrollScale;
    placingImage.h = placingImage.w / aspect;
    placingImage.x = cx - placingImage.w / 2;
    placingImage.y = cy - placingImage.h / 2;
    placingImage.prevW = placingImage.w;
    placingImage.prevH = placingImage.h;

    // Update slider visually too
    if (placeScaleSlider) {
      const currentPct = Math.round((placingImage.w / placingImage.originalW) * 100);
      placeScaleSlider.value = currentPct;
      if (placeScaleValueLabel) placeScaleValueLabel.textContent = currentPct + "%";
    }

    if (placingImage.savedData) ctx.putImageData(placingImage.savedData, 0, 0);
    drawRotatedPreview();
  }, { passive: false });
}

if (placeScaleSlider) {
  placeScaleSlider.addEventListener("input", () => {
    if (!placingImage) return;
    const pct = parseInt(placeScaleSlider.value);
    if (placeScaleValueLabel) placeScaleValueLabel.textContent = pct + "%";
    const scaleFactor = pct / 100;
    const aspect = placingImage.originalW / placingImage.originalH;
    placingImage.w = placingImage.originalW * scaleFactor;
    placingImage.h = placingImage.w / aspect;
    const cx = placingImage.x + placingImage.prevW / 2;
    const cy = placingImage.y + placingImage.prevH / 2;
    placingImage.x = cx - placingImage.w / 2;
    placingImage.y = cy - placingImage.h / 2;
    placingImage.prevW = placingImage.w;
    placingImage.prevH = placingImage.h;
    if (placingImage.savedData) ctx.putImageData(placingImage.savedData, 0, 0);
    drawRotatedPreview();
  });
}
if (placeRotateSlider) {
  placeRotateSlider.addEventListener("input", () => {
    if (!placingImage) return;
    placingImage.rotation = parseInt(placeRotateSlider.value);
    if (placeRotateValueLabel) placeRotateValueLabel.textContent = placeRotateSlider.value + "°";
    if (placingImage.savedData) ctx.putImageData(placingImage.savedData, 0, 0);
    drawRotatedPreview();
  });
}
if (placeStampBtn) {
  placeStampBtn.addEventListener("click", (e) => { e.preventDefault(); commitImage(); });
}
if (placeCancelBtn) {
  placeCancelBtn.addEventListener("click", (e) => { e.preventDefault(); removePlaceOverlay(); });
}

// Overlay UI for positioning the image before stamping it
// function renderPlacingImage() no longer needed, replaced by declarative UI toggle

function drawRotatedPreview() {
  if (!placingImage || !previewEnabled) return;
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
  if (!placingImage || !previewEnabled) return;
  const saved = ctx.getImageData(0, 0, canvas.width, canvas.height);
  ctx.putImageData(saved, 0, 0);
  placingImage.savedData = saved;
  drawRotatedPreview();
}

// function startDragImage, dragImage, stopDragImage, resizeImage replaced by global pointer listeners above


function commitImage() {
  try {
    if (!placingImage) return;
    if (placingImage.savedData) ctx.putImageData(placingImage.savedData, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    const { img, x, y, w, h, rotation } = placingImage;
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rotation || 0) * Math.PI / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();

    placingImage = null;
    appState = "DRAW";
    removePlaceOverlay(true);
  } catch (err) {
    console.error("Error in commitImage:", err);
    alert("Error in commitImage: " + err.message);
  }
}

function removePlaceOverlay(committed = false) {
  try {
    if (placeOverlay) placeOverlay.style.display = "none";
    appState = "DRAW";

    if (!committed && placingImage && placingImage.savedData) {
      ctx.putImageData(placingImage.savedData, 0, 0);
    }
    placingImage = null;
  } catch (err) {
    console.error("Error in removePlaceOverlay:", err);
  }
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

// ===================== AR MODE (WebXR + raw WebGL2) =====================
const arExitBtn = document.getElementById("ar-exit-btn");
if (arExitBtn) {
  arExitBtn.addEventListener("click", () => {
    if (xrSession) xrSession.end();
  });
}
const arOverlay = document.getElementById("ar-overlay");
const arStatus = document.getElementById("ar-status");
const reticle = document.getElementById("reticle");
let arPreviewEnabled = true;
const arPreviewToggleBtn = document.getElementById("ar-preview-toggle-btn");
if (arPreviewToggleBtn) {
  arPreviewToggleBtn.addEventListener("click", () => {
    arPreviewEnabled = !arPreviewEnabled;
    arPreviewToggleBtn.textContent = arPreviewEnabled ? "👁️ Preview On" : "🙈 Preview Off";
    // Optionally trigger AR preview redraw here
  });
  arPreviewToggleBtn.textContent = arPreviewEnabled ? "👁️ Preview On" : "🙈 Preview Off";
}

let xrSession = null;
let xrRefSpace = null;
let xrHitTestSource = null;
let nearbyInterval = null;
let gl = null;               // WebGL2RenderingContext
let glLayer = null;          // XRWebGLLayer
let shaderProgram = null;    // compiled GLSL program
let quadVAO = null;          // shared quad vertex array
let lastHitPose = null;
let arScaleCm = 50;
let arRotationDeg = 0;
let arStartBearing = 0;
let arStartLat = null;
let arStartLng = null;
let lastPlacedHeight = 1.5;
let lastPlacedSurfaceType = "wall";
let lastPlacedQuaternion = [0, 0, 0, 1];
let lastPlacedX = undefined;
let lastPlacedZ = undefined;
const APP_VERSION = "3.0-webgl2";

// Placed graffiti pieces (raw WebGL2 objects)
// Each: { modelMatrix, texture, id?, anchor?, anchorOffset?, surfaceType, scaleCm, aspect, rotDeg }
const placedPieces = [];
let placementRequested = false;  // set ONLY by the place button; consumed in onXRFrame
let previewTexture = null;   // WebGLTexture for live preview
let previewMatrix = null;    // Float32Array(16)
let reticleMatrix = null;    // Float32Array(16) for the reticle ring
let reticleSurface = "floor";
let lastCameraPos = [0, 0, 0];
let anchorsSupported = false; // set true if session grants 'anchors'
let lastHitFrame = null;      // current XR frame for anchor creation

// Uniform locations (filled after shader compile)
let uViewProjection, uModel, uOpacity, uMode, uColor;

// ---- 4x4 MATRIX UTILITIES (column-major for WebGL) ----
function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
function mat4Multiply(a, b) {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
  return o;
}
function mat4FromCols(x, y, z, p) {
  return new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, p[0], p[1], p[2], 1]);
}
function mat4RotateAxis(m, axis, rad) {
  const c = Math.cos(rad), s = Math.sin(rad), t = 1 - c;
  const [x, y, z] = axis;
  const r = new Float32Array([
    t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
    0, 0, 0, 1
  ]);
  return mat4Multiply(m, r);
}

// ---- VECTOR UTILITIES ----
function v3Dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function v3Cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function v3Sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function v3Add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function v3Scale(v, s) { return [v[0] * s, v[1] * s, v[2] * s]; }
function v3Norm(v) {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return l > 1e-6 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0];
}
function v3Len(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }

// ---- GLSL SHADERS (WebGL2 / GLSL 300 es) ----
const VERT_SRC = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
uniform mat4 u_vp;
uniform mat4 u_model;
out vec2 v_uv;
out vec2 v_pos;
void main(){
  gl_Position = u_vp * u_model * vec4(a_pos, 0.0, 1.0);
  v_uv = a_uv;
  v_pos = a_pos;
}`;

const FRAG_SRC = `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec2 v_pos;
uniform sampler2D u_tex;
uniform float u_opacity;
uniform int u_mode;       // 0 = textured quad, 1 = reticle ring
uniform vec3 u_color;
out vec4 outColor;
void main(){
  if(u_mode == 1){
    float d = length(v_pos * 2.0);
    float ring = smoothstep(0.70, 0.78, d) * (1.0 - smoothstep(0.92, 1.0, d));
    if(ring < 0.01) discard;
    outColor = vec4(u_color, ring * u_opacity);
  } else {
    vec4 t = texture(u_tex, v_uv);
    outColor = vec4(t.rgb, t.a * u_opacity);
  }
}`;

// ---- COMPILE SHADERS & BUILD PROGRAM ----
function compileShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("Shader compile:", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function initWebGL2() {
  const vs = compileShader(gl.VERTEX_SHADER, VERT_SRC);
  const fs = compileShader(gl.FRAGMENT_SHADER, FRAG_SRC);
  shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vs);
  gl.attachShader(shaderProgram, fs);
  gl.linkProgram(shaderProgram);
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    console.error("Program link:", gl.getProgramInfoLog(shaderProgram));
    return false;
  }
  gl.useProgram(shaderProgram);

  // Uniform locations
  uViewProjection = gl.getUniformLocation(shaderProgram, "u_vp");
  uModel = gl.getUniformLocation(shaderProgram, "u_model");
  uOpacity = gl.getUniformLocation(shaderProgram, "u_opacity");
  uMode = gl.getUniformLocation(shaderProgram, "u_mode");
  uColor = gl.getUniformLocation(shaderProgram, "u_color");

  // Shared quad VAO: XY plane, -0.5..0.5, with UVs
  const verts = new Float32Array([
    // pos (x,y)   uv (u,v)
    -0.5, -0.5, 0, 1,
    0.5, -0.5, 1, 1,
    0.5, 0.5, 1, 0,
    0.5, 0.5, 1, 0,
    -0.5, 0.5, 0, 0,
    -0.5, -0.5, 0, 1,
  ]);
  quadVAO = gl.createVertexArray();
  gl.bindVertexArray(quadVAO);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(shaderProgram, "a_pos");
  const aUV = gl.getAttribLocation(shaderProgram, "a_uv");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(aUV);
  gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 16, 8);
  gl.bindVertexArray(null);

  return true;
}

// ---- CREATE WEBGL TEXTURE FROM IMAGE/CANVAS ----
function createTexture(source) {
  if (!gl) return null;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

// ---- BUILD GRAFFITI MODEL MATRIX FROM HIT-TEST 4x4 ----
function buildSurfaceMatrix(hitMatrix, scaleCm, aspect, rotDeg, camPos, forceMode) {
  // Extract position from column 3
  const pos = [hitMatrix[12], hitMatrix[13], hitMatrix[14]];
  // Extract surface normal = Y column of hit matrix
  let normal = v3Norm([hitMatrix[4], hitMatrix[5], hitMatrix[6]]);

  // Classify or force surface type
  const absNY = Math.abs(normal[1]);
  let isWall, isCeiling, surfaceType;

  if (forceMode === "wall") {
    isWall = true; isCeiling = false; surfaceType = "wall";
    // Override normal: horizontal, facing camera
    let n = v3Sub(camPos, pos); n[1] = 0;
    normal = v3Len(n) > 0.001 ? v3Norm(n) : [0, 0, 1];
  } else if (forceMode === "floor") {
    isWall = false; isCeiling = false; surfaceType = "floor";
    normal = [0, 1, 0];
  } else if (forceMode === "ceiling") {
    isWall = false; isCeiling = true; surfaceType = "ceiling";
    normal = [0, -1, 0];
  } else {
    isWall = absNY < 0.707;
    isCeiling = !isWall && normal[1] < -0.707;
    surfaceType = isWall ? "wall" : (isCeiling ? "ceiling" : "floor");
  }

  // Build orthonormal frame: right (X), up (Y), normal (Z) of the graffiti plane
  let right, up;
  if (isWall) {
    const worldUp = [0, 1, 0];
    const d = v3Dot(worldUp, normal);
    up = v3Norm(v3Sub(worldUp, v3Scale(normal, d)));
    right = v3Norm(v3Cross(up, normal));
  } else {
    const toCamera = v3Sub(camPos, pos);
    const d = v3Dot(toCamera, normal);
    const projected = v3Norm(v3Sub(toCamera, v3Scale(normal, d)));
    up = v3Scale(projected, isCeiling ? 1 : -1);
    right = v3Norm(v3Cross(up, normal));
  }

  // User rotation around the normal axis
  if (rotDeg !== 0) {
    const rad = rotDeg * Math.PI / 180;
    const c = Math.cos(rad), s = Math.sin(rad);
    const nr = v3Add(v3Scale(right, c), v3Scale(up, s));
    const nu = v3Add(v3Scale(right, -s), v3Scale(up, c));
    right = nr; up = nu;
  }

  // Scale: width along right, height along up
  const w = scaleCm / 100;
  const h = w / aspect;
  const offset = v3Scale(normal, 0.002);
  const finalPos = v3Add(pos, offset);

  // Columns: right*w, up*h, normal, position
  const matrix = mat4FromCols(
    v3Scale(right, w), v3Scale(up, h), normal, finalPos
  );

  return { matrix, surfaceType, position: pos, normal, right, up };
}

// ---- RETICLE MATRIX (ring on surface, scaled to arScaleCm) ----
function buildReticleMatrix(hitMatrix, camPos, forceMode) {
  const info = buildSurfaceMatrix(hitMatrix, arScaleCm, 1, 0, camPos, forceMode);
  // Reticle is a unit ring; scale both axes equally
  const radius = (arScaleCm / 100) / 2;
  const m = mat4FromCols(
    v3Scale(info.right, radius), v3Scale(info.up, radius), info.normal,
    v3Add(info.position, v3Scale(info.normal, 0.001))
  );
  return { matrix: m, surfaceType: info.surfaceType };
}

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
        ? (arScaleCm / 100).toFixed(1) + "m" : arScaleCm + "cm";
    }
    const minPx = 30, maxPx = 250;
    const diameter = minPx + ((arScaleCm - 10) / (300 - 10)) * (maxPx - minPx);
    if (reticleEl) { reticleEl.style.width = diameter + "px"; reticleEl.style.height = diameter + "px"; }
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

// ---- PLACE GRAFFITI with WebXR ANCHOR (creates a new piece locked to the wall) ----
async function placeDrawingAtHit(pose, frame) {
  const aspect = canvas.width / canvas.height;
  const hitMat = pose.transform.matrix;
  const mode = document.getElementById("ar-surface-mode")?.value || "auto";
  const forceMode = mode === "auto" ? null : mode;
  const info = buildSurfaceMatrix(hitMat, arScaleCm, aspect, arRotationDeg, lastCameraPos, forceMode);

  const tex = createTexture(canvas);
  const piece = {
    modelMatrix: info.matrix,
    texture: tex,
    anchor: null,
    // Store placement params so we can rebuild the matrix from anchor pose
    surfaceType: info.surfaceType,
    scaleCm: arScaleCm,
    aspect: aspect,
    rotDeg: arRotationDeg,
    forceMode: forceMode,
    normal: info.normal,
    right: info.right,
    up: info.up
  };

  // Try to create a WebXR anchor at the hit-test position
  if (anchorsSupported && frame) {
    try {
      const anchor = await frame.createAnchor(pose.transform, xrRefSpace);
      // Session may have ended during await
      if (!gl || !xrSession) { console.warn("Session ended during anchor creation"); return; }
      piece.anchor = anchor;
      console.log("⚓ Anchor created for piece", placedPieces.length);
    } catch (e) {
      console.warn("Anchor creation failed, using static matrix:", e.message);
    }
  }

  placedPieces.push(piece);
  updateAnchorCount();

  lastPlacedHeight = info.position[1];
  lastPlacedSurfaceType = info.surfaceType;
  const m = info.matrix;
  lastPlacedQuaternion = matrixToQuat(m);
  lastPlacedX = info.position[0];
  lastPlacedZ = info.position[2];

  const lockIcon = piece.anchor ? "⚓" : "📌";
  arStatus.textContent = lockIcon + " LOCKED on " + info.surfaceType.toUpperCase() + " at " + arScaleCm + "cm";
}

// Undo last placed piece
function undoLastPiece() {
  if (placedPieces.length === 0) return;
  const removed = placedPieces.pop();
  if (removed.anchor) {
    try { removed.anchor.delete(); } catch (e) { /* ok */ }
  }
  if (removed.texture && gl) gl.deleteTexture(removed.texture);
  updateAnchorCount();
  arStatus.textContent = "↩ Undone — " + placedPieces.length + " piece(s) remain";
}

function updateAnchorCount() {
  const el = document.getElementById("ar-anchor-count");
  if (!el) return;
  const anchored = placedPieces.filter(p => p.anchor).length;
  const total = placedPieces.length;
  el.textContent = total === 0 ? "" : `⚓ ${anchored}/${total} anchored`;
}

// Extract quaternion from a rotation matrix (ignores scale)
function matrixToQuat(m) {
  // Normalize columns first
  const c0 = v3Norm([m[0], m[1], m[2]]);
  const c1 = v3Norm([m[4], m[5], m[6]]);
  const c2 = v3Norm([m[8], m[9], m[10]]);
  const trace = c0[0] + c1[1] + c2[2];
  let w, x, y, z;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s;
    x = (c1[2] - c2[1]) * s;
    y = (c2[0] - c0[2]) * s;
    z = (c0[1] - c1[0]) * s;
  } else if (c0[0] > c1[1] && c0[0] > c2[2]) {
    const s = 2 * Math.sqrt(1 + c0[0] - c1[1] - c2[2]);
    w = (c1[2] - c2[1]) / s;
    x = 0.25 * s;
    y = (c1[0] + c0[1]) / s;
    z = (c2[0] + c0[2]) / s;
  } else if (c1[1] > c2[2]) {
    const s = 2 * Math.sqrt(1 + c1[1] - c0[0] - c2[2]);
    w = (c2[0] - c0[2]) / s;
    x = (c1[0] + c0[1]) / s;
    y = 0.25 * s;
    z = (c2[1] + c1[2]) / s;
  } else {
    const s = 2 * Math.sqrt(1 + c2[2] - c0[0] - c1[1]);
    w = (c0[1] - c1[0]) / s;
    x = (c2[0] + c0[2]) / s;
    y = (c2[1] + c1[2]) / s;
    z = 0.25 * s;
  }
  return [x, y, z, w];
}

// ---- Rebuild model matrix from an anchor's updated pose ----
function rebuildMatrixFromAnchor(piece, anchorPose) {
  const anchorMat = anchorPose.transform.matrix;
  const pos = [anchorMat[12], anchorMat[13], anchorMat[14]];
  // Reconstruct the graffiti plane using saved orientation vectors + anchor position
  const w = piece.scaleCm / 100;
  const h = w / piece.aspect;
  const offset = v3Scale(piece.normal, 0.002);
  const finalPos = v3Add(pos, offset);
  piece.modelMatrix = mat4FromCols(
    v3Scale(piece.right, w), v3Scale(piece.up, h), piece.normal, finalPos
  );
}

// ---- XR FRAME LOOP (raw WebGL2) ----
function onXRFrame(time, frame) {
  // Guard against the race where 'end' fires and nulls xrSession/gl
  // but one final queued frame callback still executes.
  if (!xrSession || !gl || !glLayer) return;
  xrSession.requestAnimationFrame(onXRFrame);
  const pose = frame.getViewerPose(xrRefSpace);
  if (!pose) return;

  // Consume placement request set exclusively by the place button
  if (placementRequested) {
    placementRequested = false;
    if (lastHitPose && lastHitFrame) {
      placeDrawingAtHit(lastHitPose, lastHitFrame);
    }
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Update anchored pieces — WebXR may refine anchor positions as SLAM improves
  for (const piece of placedPieces) {
    if (piece.anchor) {
      const anchorPose = frame.getPose(piece.anchor.anchorSpace, xrRefSpace);
      if (anchorPose) {
        rebuildMatrixFromAnchor(piece, anchorPose);
      }
    }
  }

  // Process hit tests
  const mode = document.getElementById("ar-surface-mode")?.value || "auto";
  const forceMode = mode === "auto" ? null : mode;
  if (!xrHitTestSource) return; // not yet initialized or already cleaned up
  const hitResults = frame.getHitTestResults(xrHitTestSource);
  let hitSurface = "floor";

  if (hitResults.length > 0) {
    lastHitPose = hitResults[0].getPose(xrRefSpace);
    lastHitFrame = frame; // store for anchor creation on tap
    const hitMat = lastHitPose.transform.matrix;
    const aspect = canvas.width / canvas.height;

    // Build reticle matrix
    const retInfo = buildReticleMatrix(hitMat, lastCameraPos, forceMode);
    reticleMatrix = retInfo.matrix;
    hitSurface = retInfo.surfaceType;

    // Build preview matrix
    const prevInfo = buildSurfaceMatrix(hitMat, arScaleCm, aspect, arRotationDeg, lastCameraPos, forceMode);
    previewMatrix = prevInfo.matrix;

    // Update preview texture from current canvas
    if (!previewTexture) previewTexture = createTexture(canvas);
    else {
      gl.bindTexture(gl.TEXTURE_2D, previewTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    }

    arStatus.textContent = "[" + hitSurface.toUpperCase() + (forceMode ? " OVERRIDE" : "") + "] - use the ⬇️ button to place!";
  } else {
    lastHitPose = null;
    lastHitFrame = null;
    reticleMatrix = null;
    previewMatrix = null;
    arStatus.textContent = "Scanning...";
  }

  // Render for each XR view
  for (const view of pose.views) {
    const vp = glLayer.getViewport(view);
    gl.viewport(vp.x, vp.y, vp.width, vp.height);

    // viewProjection = projection * inverse(view)
    const vpMat = mat4Multiply(view.projectionMatrix, view.transform.inverse.matrix);

    // Store camera position for surface calculations
    lastCameraPos = [
      view.transform.position.x,
      view.transform.position.y,
      view.transform.position.z
    ];

    gl.useProgram(shaderProgram);
    gl.uniformMatrix4fv(uViewProjection, false, vpMat);
    gl.bindVertexArray(quadVAO);

    // Draw placed graffiti pieces (mode 0 = textured)
    gl.uniform1i(uMode, 0);
    for (const piece of placedPieces) {
      gl.uniformMatrix4fv(uModel, false, piece.modelMatrix);
      gl.uniform1f(uOpacity, 1.0);
      gl.bindTexture(gl.TEXTURE_2D, piece.texture);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // Draw preview (semi-transparent)
    if (arPreviewEnabled && previewMatrix && previewTexture) {
      gl.uniform1i(uMode, 0);
      gl.uniformMatrix4fv(uModel, false, previewMatrix);
      gl.uniform1f(uOpacity, 0.45);
      gl.bindTexture(gl.TEXTURE_2D, previewTexture);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // Draw reticle ring (mode 1)
    if (reticleMatrix) {
      gl.uniform1i(uMode, 1);
      gl.uniformMatrix4fv(uModel, false, reticleMatrix);
      gl.uniform1f(uOpacity, 0.9);
      const surfColors = { wall: [1, 0.2, 0.2], floor: [0.2, 1, 0.2], ceiling: [0.2, 0.8, 1] };
      gl.uniform3fv(uColor, surfColors[hitSurface] || [1, 1, 1]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.bindVertexArray(null);
  }
}

function isSecureContext() {
  return location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

// ---- PLACE BUTTON — wired once at page load ----
// A plain 'click' is fine here because the overlay capture-phase handlers below
// call preventDefault() on all background touches, preventing any click synthesis
// from taps that don't land on this button.
const putdownBtn = document.getElementById("ar-putdown-btn");
if (putdownBtn) {
  putdownBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (appState === "AR") {
      if (lastHitPose && lastHitFrame) {
        placementRequested = true;
      } else {
        alert("No surface detected. Try again.");
      }
    }
  });
}

// ---- BLOCK ALL NON-BUTTON TAPS ON THE AR OVERLAY ----
// Using capture:true so these handlers fire BEFORE any child element (including
// the place button) gets a chance to process the event. Background taps are
// fully killed here — no pointerdown/pointerup/click chain is ever generated.
if (arOverlay) {
  const isUIEl = (el) =>
    el.tagName === "BUTTON" || el.tagName === "INPUT" ||
    el.tagName === "SELECT" || !!el.closest("button, input, select");

  // Capture touchstart: kill non-UI taps before pointerdown is generated
  arOverlay.addEventListener("touchstart", (e) => {
    if (!isUIEl(e.target)) { e.preventDefault(); e.stopPropagation(); }
  }, { passive: false, capture: true });

  // Capture touchend: belt-and-suspenders — in case touchstart slipped through
  arOverlay.addEventListener("touchend", (e) => {
    if (!isUIEl(e.target)) { e.preventDefault(); e.stopPropagation(); }
  }, { passive: false, capture: true });

  // Capture pointerdown: covers any pointer that didn't start as touch
  arOverlay.addEventListener("pointerdown", (e) => {
    if (!isUIEl(e.target)) { e.preventDefault(); e.stopPropagation(); }
  }, { capture: true });

  // Capture pointerup: prevent any stray pointerup from reaching child listeners
  arOverlay.addEventListener("pointerup", (e) => {
    if (!isUIEl(e.target)) { e.preventDefault(); e.stopPropagation(); }
  }, { capture: true });

  // Capture click: last line of defence
  arOverlay.addEventListener("click", (e) => {
    if (!isUIEl(e.target)) { e.preventDefault(); e.stopPropagation(); }
  }, { capture: true });
}

// ---- START WEBXR AR SESSION ----
document.getElementById("ar-btn").addEventListener("click", async () => {
  if (!isSecureContext()) { alert("AR requires HTTPS."); return; }
  if (!navigator.xr) { alert("WebXR not supported."); return; }
  const supported = await navigator.xr.isSessionSupported("immersive-ar");
  if (!supported) { alert("Immersive AR not supported."); return; }

  try {
    // Create WebGL2 context
    const arCanvas = document.createElement("canvas");
    gl = arCanvas.getContext("webgl2", { xrCompatible: true, alpha: true });
    if (!gl) { alert("WebGL2 not available."); return; }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0, 0, 0, 0);

    if (!initWebGL2()) { alert("Shader compilation failed."); return; }

    arStartBearing = userBearing;
    arStartLat = userLat;
    arStartLng = userLng;
    placedPieces.length = 0;
    previewTexture = null;
    lastHitFrame = null;

    xrSession = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay", "anchors"],
      domOverlay: { root: arOverlay }
    });

    // Check if anchors were actually granted
    anchorsSupported = xrSession.enabledFeatures &&
      xrSession.enabledFeatures.includes("anchors");
    console.log("⚓ Anchors supported:", anchorsSupported);

    arOverlay.style.display = "block";
    document.getElementById("draw-toolbar").style.display = "none";
    document.getElementById("canvas").style.display = "none";

    // Create XRWebGLLayer and bind to session
    glLayer = new XRWebGLLayer(xrSession, gl);
    await xrSession.updateRenderState({ baseLayer: glLayer });
    if (!xrSession) return; // session ended during setup
    appState = "AR";

    xrRefSpace = await xrSession.requestReferenceSpace("local");
    if (!xrSession) return;
    const viewerSpace = await xrSession.requestReferenceSpace("viewer");
    if (!xrSession) return;
    xrHitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });
    if (!xrSession) return;

    // ---- CRITICAL: Consume WebXR 'select' events ----
    // In DOM overlay mode, if no 'select' listener is registered, the browser
    // synthesises a DOM 'click' at the tap position — which was reaching the
    // place button on every background tap. By handling 'select' ourselves
    // (even as a no-op), the browser stops generating those synthetic clicks.
    xrSession.addEventListener("select", (e) => {
      // Intentionally empty — placement is driven solely by the place button
      // setting the placementRequested flag, consumed in onXRFrame.
    });
    xrSession.addEventListener("selectstart", (e) => { /* absorb */ });
    xrSession.addEventListener("selectend", (e) => { /* absorb */ });

    loadNearbyGraffiti();
    nearbyInterval = setInterval(loadNearbyGraffiti, 8000);

    // Wire up undo button (added per-session is fine; session end cleans up the overlay)
    const undoBtn = document.getElementById("ar-undo-btn");
    if (undoBtn) undoBtn.addEventListener("click", (e) => { e.stopPropagation(); undoLastPiece(); });

    xrSession.addEventListener("end", () => {
      try {
        clearInterval(nearbyInterval);
        nearbyInterval = null;
        // Clean up all anchors and WebGL textures before nulling gl
        for (const piece of placedPieces) {
          if (piece.anchor) try { piece.anchor.delete(); } catch (e) { }
          if (piece.texture && gl) try { gl.deleteTexture(piece.texture); } catch (e) { }
        }
        if (previewTexture && gl) try { gl.deleteTexture(previewTexture); } catch (e) { }
        arOverlay.style.display = "none";
        document.getElementById("draw-toolbar").style.display = "flex";
        document.getElementById("canvas").style.display = "block";
        previewTexture = null;
        previewMatrix = null;
        reticleMatrix = null;
        placementRequested = false;
        lastHitPose = null;
        lastHitFrame = null;
        xrHitTestSource = null;
        anchorsSupported = false;
        xrSession = null;
        glLayer = null;
        gl = null;
        appState = "DRAW";
      } catch (err) {
        console.error("Error during AR session cleanup:", err);
        // Force-null everything even if cleanup threw
        xrSession = null;
        gl = null;
        glLayer = null;
        appState = "DRAW";
      }
    });

    // Start the XR frame loop
    xrSession.requestAnimationFrame(onXRFrame);

  } catch (err) {
    console.error(err);
    // Clean up partial state if session setup failed
    if (xrSession) {
      try { xrSession.end(); } catch (e) { /* already ended */ }
    }
    arOverlay.style.display = "none";
    document.getElementById("draw-toolbar").style.display = "flex";
    document.getElementById("canvas").style.display = "block";
    xrSession = null;
    gl = null;
    glLayer = null;
    appState = "DRAW";
    alert("AR failed: " + err.message);
  }
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
  if (userLat === null || userLng === null) { alert("Determining location..."); return; }
  const imageData = canvas.toDataURL("image/png");
  const description = document.getElementById("ar-description").value.trim();

  if (lastPlacedX === undefined || arStartLat === null || arStartLng === null) {
    alert("Place graffiti on a surface first!"); return;
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
        bearing: arStartBearing, description, height: lastPlacedHeight,
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
  if (!gl || arStartLat === null || arStartLng === null) return;
  if (userLat === null || userLng === null) return;

  try {
    const resp = await fetch(`/api/graffiti/nearby?lat=${userLat}&lng=${userLng}&radius=200`);
    if (!resp.ok) return;
    const items = await resp.json();

    // Re-check — session may have ended during the network request
    if (!gl) return;

    const mLat = 111320;
    const mLng = 111320 * Math.cos(arStartLat * Math.PI / 180);
    const bRad = arStartBearing * Math.PI / 180;
    let loaded = 0;
    const existingIds = new Set(placedPieces.filter(p => p.id).map(p => p.id));

    for (const item of items) {
      if (existingIds.has("global_" + item.id)) continue;

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = item.image;
      try { await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; }); }
      catch (e) { continue; }

      // Session may have ended while loading images
      if (!gl) return;

      const tex = createTexture(img);
      const aspect = img.width / img.height;
      const scale = item.scale || 50;
      const w = scale / 100;
      const h = w / aspect;
      const height = item.height || 1.5;

      // Convert saved GPS position to XR local space
      const nM = (item.lat - arStartLat) * mLat;
      const eM = (item.lng - arStartLng) * mLng;
      const sX = eM * Math.cos(bRad) - nM * Math.sin(bRad);
      const sZ = -eM * Math.sin(bRad) - nM * Math.cos(bRad);
      const pos = [sX, height, sZ];

      let modelMatrix;
      if (item.quaternion && item.quaternion.length === 4) {
        // Reconstruct orientation from saved quaternion
        const q = item.quaternion;
        const frameDelta = ((item.bearing || 0) - arStartBearing) * Math.PI / 180;
        // Build rotation matrix from quaternion
        const qm = quatToMat4(q);
        // Apply frame delta rotation around Y
        const ym = mat4RotateAxis(mat4Identity(), [0, 1, 0], frameDelta);
        const rotated = mat4Multiply(ym, qm);
        // Apply scale to X (width) and Y (height) columns
        modelMatrix = new Float32Array(rotated);
        modelMatrix[0] *= w; modelMatrix[1] *= w; modelMatrix[2] *= w;
        modelMatrix[4] *= h; modelMatrix[5] *= h; modelMatrix[6] *= h;
        modelMatrix[12] = pos[0]; modelMatrix[13] = pos[1]; modelMatrix[14] = pos[2];
      } else {
        // Legacy fallback: face bearing direction
        const yaw = ((item.bearing || 0) - arStartBearing) * Math.PI / 180;
        const right = [Math.cos(yaw) * w, 0, -Math.sin(yaw) * w];
        const up = item.surfaceType === "floor" ? [0, 0, h] : [0, h, 0];
        const normal = item.surfaceType === "floor" ? [0, 1, 0]
          : [Math.sin(yaw), 0, Math.cos(yaw)];
        modelMatrix = mat4FromCols(right, up, normal, pos);
      }

      placedPieces.push({ modelMatrix, texture: tex, id: "global_" + item.id });
      loaded++;
    }

    if (gpsStatus) {
      if (items.length === 0) gpsStatus.textContent = "No graffiti nearby";
      else if (loaded > 0) gpsStatus.textContent = `🎨 ${loaded} piece${loaded > 1 ? "s" : ""} loaded`;
      else gpsStatus.textContent = `${items.length} found, already loaded`;
    }
  } catch (err) {
    console.error("loadNearbyGraffiti:", err);
    if (gpsStatus) gpsStatus.textContent = "❌ Load error: " + err.message;
  }
}

// Build rotation matrix from quaternion [x,y,z,w]
function quatToMat4(q) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return new Float32Array([
    1 - yy - zz, xy + wz, xz - wy, 0,
    xy - wz, 1 - xx - zz, yz + wx, 0,
    xz + wy, yz - wx, 1 - xx - yy, 0,
    0, 0, 0, 1
  ]);
}

// ===================== DEBUGGING =====================
const debugElem = document.getElementById("debug-info");
function updateDebugInfo() {
  if (!debugElem) return;
  const anchored = placedPieces.filter(p => p.anchor).length;
  debugElem.innerHTML =
    `<b>v${APP_VERSION} WebGL2</b><br>` +
    `AR: ${xrSession ? "Active" : "Off"} | Pieces: ${placedPieces.length} (⚓${anchored})<br>` +
    `Anchors API: ${anchorsSupported ? "✅" : "❌"}<br>` +
    `Scale: ${arScaleCm}cm | Rot: ${arRotationDeg}°<br>` +
    `GPS: ${userLat?.toFixed(5) || "?"}, ${userLng?.toFixed(5) || "?"}<br>` +
    `Bearing: ${userBearing.toFixed(0)}°`;
}
setInterval(updateDebugInfo, 1000);
