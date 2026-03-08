// ============================================================
// GoGoGraffiti — WebXR AR Engine
// Dual renderer: WebGPU (WGSL) preferred, WebGL2 fallback.
// WebXR hit-test for surface detection, 4x4 matrices for
// placement, MongoDB Atlas for persistence.
// ============================================================

// ──────────── WGSL Shaders (WebGPU path) ────────────

const BRUSH_WGSL = /* wgsl */`
struct Uniforms {
  viewProj : mat4x4<f32>,
  model    : mat4x4<f32>,
  color    : vec4<f32>,
  time     : f32,
  pressure : f32,
  _pad0    : f32,
  _pad1    : f32,
};
@group(0) @binding(0) var<uniform> u : Uniforms;

struct VSIn  { @location(0) position: vec3<f32>, @location(1) uv: vec2<f32> };
struct VSOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>, @location(1) col: vec4<f32> };

@vertex fn vs_main(vin: VSIn) -> VSOut {
  var out: VSOut;
  out.pos = u.viewProj * u.model * vec4<f32>(vin.position, 1.0);
  out.uv  = vin.uv;
  out.col = u.color;
  return out;
}
@fragment fn fs_main(fin: VSOut) -> @location(0) vec4<f32> {
  let dist = distance(fin.uv, vec2<f32>(0.5)) * 2.0;
  let alpha = 1.0 - smoothstep(0.6, 1.0, dist);
  let glow = 1.0 + 0.08 * sin(u.time * 3.0 + dist * 6.0);
  var col = fin.col;
  col.a *= alpha * mix(0.3, 1.0, u.pressure) * glow;
  if (col.a < 0.01) { discard; }
  return col;
}
`;

const RETICLE_WGSL = /* wgsl */`
struct Uniforms {
  viewProj : mat4x4<f32>,
  model    : mat4x4<f32>,
  color    : vec4<f32>,
  time     : f32, _p0: f32, _p1: f32, _p2: f32,
};
@group(0) @binding(0) var<uniform> u : Uniforms;

struct VSIn  { @location(0) position: vec3<f32>, @location(1) uv: vec2<f32> };
struct VSOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };

@vertex fn vs_main(vin: VSIn) -> VSOut {
  var out: VSOut;
  out.pos = u.viewProj * u.model * vec4<f32>(vin.position, 1.0);
  out.uv  = vin.uv;
  return out;
}
@fragment fn fs_main(fin: VSOut) -> @location(0) vec4<f32> {
  let dist = distance(fin.uv, vec2<f32>(0.5)) * 2.0;
  let ring = smoothstep(0.65, 0.72, dist) * (1.0 - smoothstep(0.92, 1.0, dist));
  var col = u.color;
  col.a = ring * (0.7 + 0.3 * sin(u.time * 4.0));
  if (col.a < 0.01) { discard; }
  return col;
}
`;

// ──────────── GLSL Shaders (WebGL2 fallback) ────────────
// Same visual effects as the WGSL versions above

const BRUSH_VS_GLSL = `#version 300 es
uniform mat4 uViewProj;
uniform mat4 uModel;
in vec3 aPosition;
in vec2 aUV;
out vec2 vUV;
void main() {
  gl_Position = uViewProj * uModel * vec4(aPosition, 1.0);
  vUV = aUV;
}
`;

const BRUSH_FS_GLSL = `#version 300 es
precision highp float;
uniform vec4  uColor;
uniform float uTime;
uniform float uPressure;
in vec2 vUV;
out vec4 fragColor;
void main() {
  float dist = distance(vUV, vec2(0.5)) * 2.0;
  float alpha = 1.0 - smoothstep(0.6, 1.0, dist);
  float glow = 1.0 + 0.08 * sin(uTime * 3.0 + dist * 6.0);
  vec4 col = uColor;
  col.a *= alpha * mix(0.3, 1.0, uPressure) * glow;
  if (col.a < 0.01) discard;
  fragColor = col;
}
`;

const RETICLE_VS_GLSL = BRUSH_VS_GLSL;

const RETICLE_FS_GLSL = `#version 300 es
precision highp float;
uniform vec4  uColor;
uniform float uTime;
in vec2 vUV;
out vec4 fragColor;
void main() {
  float dist = distance(vUV, vec2(0.5)) * 2.0;
  float ring = smoothstep(0.65, 0.72, dist) * (1.0 - smoothstep(0.92, 1.0, dist));
  vec4 col = uColor;
  col.a = ring * (0.7 + 0.3 * sin(uTime * 4.0));
  if (col.a < 0.01) discard;
  fragColor = col;
}
`;

// ──────────── State ────────────

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const toolbar = document.getElementById("draw-toolbar");
const arOverlay = document.getElementById("ar-overlay");
const arStatus = document.getElementById("ar-status");
const gpsStatus = document.getElementById("ar-gps-status");

let renderBackend = null; // "webgpu" or "webgl"

// WebGPU handles
let gpuDevice = null, gpuFormat = null, xrGpuBinding = null;
let brushPipelineGPU = null, reticlePipelineGPU = null;
let quadVB_GPU = null, quadIB_GPU = null;
let reticleUB_GPU = null, brushUBPoolGPU = [];

// WebGL handles
let gl = null, brushProgGL = null, reticleProgGL = null, quadVAO_GL = null;

// WebXR handles
let xrSession = null, xrRefSpace = null, xrHitTestSource = null;

// Scene
let lastHitPose = null, lastHitMatrix = null;
let placedStrokes = [];
let arScaleCm = 50, arRotationDeg = 0;
let startTime = performance.now() / 1000;

// Drawing
let drawing = false, erasing = false, brushSize = 4, currentColor = "#ff0000";

// GPS
let userLat = null, userLng = null, userBearing = 0, gpsWatchId = null;
let arStartLat = null, arStartLng = null, arStartBearing = 0;
let nearbyInterval = null;

// ──────────── Canvas Drawing (pre-AR) ────────────

function resizeCanvas() {
  const toolbarH = toolbar.getBoundingClientRect().height;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - toolbarH;
  canvas.style.width = canvas.width + "px";
  canvas.style.height = canvas.height + "px";
  const cx = Math.floor(canvas.width / 2), cy = Math.floor(canvas.height / 2);
  canvas.style.backgroundPosition = `${cx % 10}px ${cy % 10}px`;
  const crosshair = document.getElementById("crosshair");
  if (crosshair) { crosshair.style.top = toolbarH + "px"; crosshair.style.height = canvas.height + "px"; }
}
resizeCanvas();
ctx.clearRect(0, 0, canvas.width, canvas.height);

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
  if (erasing) { ctx.globalCompositeOperation = "destination-out"; ctx.strokeStyle = "rgba(0,0,0,1)"; }
  else { ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = currentColor; }
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

const colorPicker = document.getElementById("color-picker");
const hexInput = document.getElementById("hex-input");
if (colorPicker) colorPicker.addEventListener("input", (e) => { currentColor = e.target.value; if (hexInput) hexInput.value = currentColor; });
if (hexInput) hexInput.addEventListener("change", (e) => {
  let val = e.target.value.trim(); if (!val.startsWith("#")) val = "#" + val;
  if (/^#[0-9a-fA-F]{6}$/.test(val)) { currentColor = val; if (colorPicker) colorPicker.value = val; }
  else e.target.value = currentColor;
});
document.getElementById("clear-btn").addEventListener("click", () => ctx.clearRect(0, 0, canvas.width, canvas.height));
window.addEventListener("resize", () => {
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  resizeCanvas(); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.putImageData(img, 0, 0);
});

// ──────────── GPS Tracking ────────────

function startGPSTracking() {
  if (gpsWatchId !== null || !("geolocation" in navigator)) return;
  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      userLat = pos.coords.latitude; userLng = pos.coords.longitude;
      if (pos.coords.heading != null && !isNaN(pos.coords.heading)) userBearing = pos.coords.heading;
      if (gpsStatus) gpsStatus.textContent = `📍 GPS: ${userLat.toFixed(5)}, ${userLng.toFixed(5)}`;
    },
    (err) => console.warn("GPS error:", err.message),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
}
startGPSTracking();
window.addEventListener("deviceorientation", (e) => {
  if (e.webkitCompassHeading != null) userBearing = e.webkitCompassHeading;
  else if (e.alpha != null) userBearing = 360 - e.alpha;
});

// ──────────── Matrix Utilities ────────────

function mat4Multiply(a, b) {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
    o[j*4+i] = a[i]*b[j*4] + a[4+i]*b[j*4+1] + a[8+i]*b[j*4+2] + a[12+i]*b[j*4+3];
  return o;
}
function mat4Identity() { const m = new Float32Array(16); m[0]=m[5]=m[10]=m[15]=1; return m; }
function mat4Translate(x,y,z) { const m=mat4Identity(); m[12]=x; m[13]=y; m[14]=z; return m; }
function mat4Scale(sx,sy,sz) { const m=new Float32Array(16); m[0]=sx; m[5]=sy; m[10]=sz; m[15]=1; return m; }
function mat4RotateY(r) { const c=Math.cos(r),s=Math.sin(r),m=mat4Identity(); m[0]=c; m[2]=s; m[8]=-s; m[10]=c; return m; }

function getSurfaceNormal(matrix) { return { x: matrix[4], y: matrix[5], z: matrix[6] }; }
function classifySurface(normalY) {
  if (Math.abs(normalY) < 0.5) return "wall";
  if (normalY < -0.5) return "ceiling";
  return "floor";
}

function buildStrokeModel(hitMatrix, scaleCm, rotationDeg) {
  const s = scaleCm / 100, r = rotationDeg * Math.PI / 180;
  const scaleM = mat4Scale(s, s, 1);
  const c = Math.cos(r), sn = Math.sin(r);
  const rotM = mat4Identity(); rotM[0]=c; rotM[1]=sn; rotM[4]=-sn; rotM[5]=c;
  let model = mat4Multiply(hitMatrix, rotM);
  model = mat4Multiply(model, scaleM);
  const n = getSurfaceNormal(hitMatrix);
  model[12] += n.x*0.002; model[13] += n.y*0.002; model[14] += n.z*0.002;
  return model;
}

function hexToRGBA(hex) {
  return [parseInt(hex.slice(1,3),16)/255, parseInt(hex.slice(3,5),16)/255, parseInt(hex.slice(5,7),16)/255, 1.0];
}

// ──────────── WebGPU Backend ────────────

const UB_SIZE = 160;

async function initWebGPUBackend() {
  if (!navigator.gpu) return false;
  if (typeof XRGPUBinding === "undefined") {
    console.warn("XRGPUBinding not available — skipping WebGPU");
    return false;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return false;
    gpuDevice = await adapter.requestDevice();
    gpuFormat = navigator.gpu.getPreferredCanvasFormat();

    const verts = new Float32Array([-0.5,-0.5,0,0,1, 0.5,-0.5,0,1,1, 0.5,0.5,0,1,0, -0.5,0.5,0,0,0]);
    const idx = new Uint16Array([0,1,2,0,2,3]);
    quadVB_GPU = gpuDevice.createBuffer({ size: verts.byteLength, usage: GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST });
    gpuDevice.queue.writeBuffer(quadVB_GPU, 0, verts);
    quadIB_GPU = gpuDevice.createBuffer({ size: idx.byteLength, usage: GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST });
    gpuDevice.queue.writeBuffer(quadIB_GPU, 0, idx);

    function makePipeline(code, label) {
      const mod = gpuDevice.createShaderModule({ code, label });
      const bgl = gpuDevice.createBindGroupLayout({ entries:[{binding:0, visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT, buffer:{type:"uniform"}}] });
      return gpuDevice.createRenderPipeline({ label,
        layout: gpuDevice.createPipelineLayout({ bindGroupLayouts:[bgl] }),
        vertex: { module:mod, entryPoint:"vs_main", buffers:[{ arrayStride:20, attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x2"}] }] },
        fragment: { module:mod, entryPoint:"fs_main", targets:[{format:gpuFormat, blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}] },
        primitive:{topology:"triangle-list",cullMode:"none"},
        depthStencil:{format:"depth24plus",depthWriteEnabled:true,depthCompare:"less"},
      });
    }
    brushPipelineGPU = makePipeline(BRUSH_WGSL, "brush");
    reticlePipelineGPU = makePipeline(RETICLE_WGSL, "reticle");
    reticleUB_GPU = createUB_GPU();

    console.log("✅ WebGPU + XRGPUBinding backend ready");
    return true;
  } catch (e) {
    console.warn("WebGPU init failed:", e.message);
    if (gpuDevice) { gpuDevice.destroy(); gpuDevice = null; }
    return false;
  }
}

function createUB_GPU() {
  return gpuDevice.createBuffer({ size: UB_SIZE, usage: GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });
}
function writeUB_GPU(buf, viewProj, model, color, time, pressure) {
  const d = new Float32Array(40);
  d.set(viewProj,0); d.set(model,16); d.set(color,32); d[36]=time; d[37]=pressure;
  gpuDevice.queue.writeBuffer(buf, 0, d);
}
function getStrokeUB_GPU(i) { while(brushUBPoolGPU.length<=i) brushUBPoolGPU.push(createUB_GPU()); return brushUBPoolGPU[i]; }

// ──────────── WebGL2 Backend ────────────

function initWebGLBackend(glCtx) {
  gl = glCtx;

  function compile(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  function link(vs, fs) {
    const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return null; }
    return p;
  }

  brushProgGL = link(compile(gl.VERTEX_SHADER, BRUSH_VS_GLSL), compile(gl.FRAGMENT_SHADER, BRUSH_FS_GLSL));
  brushProgGL.uViewProj = gl.getUniformLocation(brushProgGL, "uViewProj");
  brushProgGL.uModel    = gl.getUniformLocation(brushProgGL, "uModel");
  brushProgGL.uColor    = gl.getUniformLocation(brushProgGL, "uColor");
  brushProgGL.uTime     = gl.getUniformLocation(brushProgGL, "uTime");
  brushProgGL.uPressure = gl.getUniformLocation(brushProgGL, "uPressure");

  reticleProgGL = link(compile(gl.VERTEX_SHADER, RETICLE_VS_GLSL), compile(gl.FRAGMENT_SHADER, RETICLE_FS_GLSL));
  reticleProgGL.uViewProj = gl.getUniformLocation(reticleProgGL, "uViewProj");
  reticleProgGL.uModel    = gl.getUniformLocation(reticleProgGL, "uModel");
  reticleProgGL.uColor    = gl.getUniformLocation(reticleProgGL, "uColor");
  reticleProgGL.uTime     = gl.getUniformLocation(reticleProgGL, "uTime");

  // Quad VAO
  const verts = new Float32Array([-0.5,-0.5,0,0,1, 0.5,-0.5,0,1,1, 0.5,0.5,0,1,0, -0.5,0.5,0,0,0]);
  const idx = new Uint16Array([0,1,2,0,2,3]);

  quadVAO_GL = gl.createVertexArray();
  gl.bindVertexArray(quadVAO_GL);

  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(brushProgGL, "aPosition");
  const uvLoc  = gl.getAttribLocation(brushProgGL, "aUV");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(uvLoc);
  gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 20, 12);

  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

  gl.bindVertexArray(null);

  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);

  console.log("✅ WebGL2 backend ready");
}

// ──────────── AR Session Launch ────────────

document.getElementById("ar-btn").addEventListener("click", async () => {
  if (!(location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    alert("AR requires HTTPS."); return;
  }
  if (!navigator.xr) { alert("WebXR not supported."); return; }
  const supported = await navigator.xr.isSessionSupported("immersive-ar");
  if (!supported) { alert("Immersive AR not supported."); return; }

  try {
    // Force WebGL2 — WebGPU+XRGPUBinding not yet supported on most Android devices
    const useGPU = false;
    renderBackend = "webgl";
    console.log("🎮 Renderer:", renderBackend);

    arStartLat = userLat; arStartLng = userLng; arStartBearing = userBearing;

    xrSession = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay", "anchors"],
      domOverlay: { root: arOverlay },
    });

    arOverlay.style.display = "block";
    toolbar.style.display = "none";
    canvas.style.display = "none";

    if (renderBackend === "webgpu") {
      // ── WebGPU path ──
      xrGpuBinding = new XRGPUBinding(xrSession, gpuDevice);
      const xrLayer = xrGpuBinding.createProjectionLayer({
        textureFormat: gpuFormat, depthStencilFormat: "depth24plus", scaleFactor: 1.0,
      });
      xrSession.updateRenderState({ layers: [xrLayer] });

      xrRefSpace = await xrSession.requestReferenceSpace("local");
      const viewerSpace = await xrSession.requestReferenceSpace("viewer");
      xrHitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });

      loadNearbyGraffiti();
      nearbyInterval = setInterval(loadNearbyGraffiti, 8000);
      setupSessionEvents();
      xrSession.requestAnimationFrame((t, f) => onXRFrame_GPU(xrLayer, t, f));

    } else {
      // ── WebGL2 path (universal fallback) ──
      const arCanvas = document.createElement("canvas");
      const glCtx = arCanvas.getContext("webgl2", { xrCompatible: true, alpha: true });
      if (!glCtx) throw new Error("WebGL2 not available");
      initWebGLBackend(glCtx);

      const xrLayer = new XRWebGLLayer(xrSession, gl);
      xrSession.updateRenderState({ baseLayer: xrLayer });

      xrRefSpace = await xrSession.requestReferenceSpace("local");
      const viewerSpace = await xrSession.requestReferenceSpace("viewer");
      xrHitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });

      loadNearbyGraffiti();
      nearbyInterval = setInterval(loadNearbyGraffiti, 8000);
      setupSessionEvents();
      xrSession.requestAnimationFrame((t, f) => onXRFrame_GL(xrLayer, t, f));
    }

  } catch (err) {
    console.error("AR init failed:", err);
    alert("AR failed: " + err.message);
  }
});

function setupSessionEvents() {
  xrSession.addEventListener("select", () => {
    if (lastHitMatrix) {
      const model = buildStrokeModel(lastHitMatrix, arScaleCm, arRotationDeg);
      placedStrokes.push({
        matrix: Array.from(model), hitMatrix: Array.from(lastHitMatrix),
        color: hexToRGBA(currentColor), scale: arScaleCm, rotation: arRotationDeg,
      });
      arStatus.textContent = `🔒 Placed! (${placedStrokes.length} strokes)`;
    }
  });

  xrSession.addEventListener("end", () => {
    clearInterval(nearbyInterval); nearbyInterval = null;
    xrSession = null; xrHitTestSource = null; xrGpuBinding = null;
    lastHitPose = null; lastHitMatrix = null;
    arOverlay.style.display = "none";
    toolbar.style.display = "flex"; canvas.style.display = "block";
  });
}

// ──────────── Hit-test processing (shared) ────────────

const SURFACE_COLORS = { wall:[1,.2,.2,.8], floor:[.2,1,.2,.8], ceiling:[.2,.8,1,.8], none:[1,1,1,.5] };

function processHitTests(frame) {
  const hitResults = frame.getHitTestResults(xrHitTestSource);
  let surfaceType = "none";
  if (hitResults.length > 0) {
    lastHitPose = hitResults[0].getPose(xrRefSpace);
    if (lastHitPose) {
      lastHitMatrix = new Float32Array(lastHitPose.transform.matrix);
      surfaceType = classifySurface(getSurfaceNormal(lastHitMatrix).y);
      arStatus.textContent = `[${surfaceType.toUpperCase()}] — tap to place!`;
    }
  } else {
    lastHitPose = null; lastHitMatrix = null;
    arStatus.textContent = "Scanning…";
  }
  return surfaceType;
}

// ──────────── WebGPU Render Loop ────────────

function onXRFrame_GPU(xrLayer, time, frame) {
  frame.session.requestAnimationFrame((t, f) => onXRFrame_GPU(xrLayer, t, f));
  const pose = frame.getViewerPose(xrRefSpace);
  if (!pose) return;

  const now = time / 1000 - startTime;
  const surfaceType = processHitTests(frame);

  for (const view of pose.views) {
    const subImage = xrGpuBinding.getViewSubImage(xrLayer, view);
    const colorView = subImage.colorTexture.createView();
    const depthView = subImage.depthStencilTexture.createView();
    const viewProj = mat4Multiply(new Float32Array(view.projectionMatrix), new Float32Array(view.transform.inverse.matrix));

    const encoder = gpuDevice.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: colorView, loadOp: "load", storeOp: "store" }],
      depthStencilAttachment: { view: depthView, depthLoadOp: "clear", depthClearValue: 1.0, depthStoreOp: "store" },
    });
    pass.setVertexBuffer(0, quadVB_GPU);
    pass.setIndexBuffer(quadIB_GPU, "uint16");

    if (lastHitMatrix) {
      const rs = (arScaleCm / 100) * 0.3;
      const rm = mat4Multiply(lastHitMatrix, mat4Scale(rs, rs, 1));
      writeUB_GPU(reticleUB_GPU, viewProj, rm, new Float32Array(SURFACE_COLORS[surfaceType]||SURFACE_COLORS.none), now, 0);
      const bg = gpuDevice.createBindGroup({ layout:reticlePipelineGPU.getBindGroupLayout(0), entries:[{binding:0,resource:{buffer:reticleUB_GPU}}] });
      pass.setPipeline(reticlePipelineGPU); pass.setBindGroup(0, bg); pass.drawIndexed(6);
    }

    pass.setPipeline(brushPipelineGPU);
    for (let i = 0; i < placedStrokes.length; i++) {
      const s = placedStrokes[i], ub = getStrokeUB_GPU(i);
      writeUB_GPU(ub, viewProj, new Float32Array(s.matrix), new Float32Array(s.color), now, 1.0);
      const bg = gpuDevice.createBindGroup({ layout:brushPipelineGPU.getBindGroupLayout(0), entries:[{binding:0,resource:{buffer:ub}}] });
      pass.setBindGroup(0, bg); pass.drawIndexed(6);
    }

    pass.end();
    gpuDevice.queue.submit([encoder.finish()]);
  }
}

// ──────────── WebGL2 Render Loop ────────────

function onXRFrame_GL(xrLayer, time, frame) {
  frame.session.requestAnimationFrame((t, f) => onXRFrame_GL(xrLayer, t, f));
  const pose = frame.getViewerPose(xrRefSpace);
  if (!pose) return;

  const now = time / 1000 - startTime;
  const surfaceType = processHitTests(frame);

  gl.bindFramebuffer(gl.FRAMEBUFFER, xrLayer.framebuffer);
  gl.clear(gl.DEPTH_BUFFER_BIT);

  for (const view of pose.views) {
    const vp = xrLayer.getViewport(view);
    gl.viewport(vp.x, vp.y, vp.width, vp.height);
    const viewProj = mat4Multiply(new Float32Array(view.projectionMatrix), new Float32Array(view.transform.inverse.matrix));

    gl.bindVertexArray(quadVAO_GL);

    // Reticle
    if (lastHitMatrix) {
      const rs = (arScaleCm / 100) * 0.3;
      const rm = mat4Multiply(lastHitMatrix, mat4Scale(rs, rs, 1));
      const col = SURFACE_COLORS[surfaceType] || SURFACE_COLORS.none;
      gl.useProgram(reticleProgGL);
      gl.uniformMatrix4fv(reticleProgGL.uViewProj, false, viewProj);
      gl.uniformMatrix4fv(reticleProgGL.uModel, false, rm);
      gl.uniform4fv(reticleProgGL.uColor, col);
      gl.uniform1f(reticleProgGL.uTime, now);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    // Strokes
    gl.useProgram(brushProgGL);
    gl.uniform1f(brushProgGL.uTime, now);
    for (const s of placedStrokes) {
      gl.uniformMatrix4fv(brushProgGL.uViewProj, false, viewProj);
      gl.uniformMatrix4fv(brushProgGL.uModel, false, new Float32Array(s.matrix));
      gl.uniform4fv(brushProgGL.uColor, s.color);
      gl.uniform1f(brushProgGL.uPressure, 1.0);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    gl.bindVertexArray(null);
  }
}

// ──────────── AR Controls ────────────

const arScaleSlider = document.getElementById("ar-scale-slider");
const arScaleLabel = document.getElementById("ar-scale-label");
if (arScaleSlider) {
  arScaleSlider.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: false });
  arScaleSlider.addEventListener("touchmove", (e) => e.stopPropagation(), { passive: false });
  arScaleSlider.addEventListener("input", () => {
    arScaleCm = parseInt(arScaleSlider.value);
    arScaleLabel.textContent = arScaleCm >= 100 ? (arScaleCm/100).toFixed(1)+"m" : arScaleCm+"cm";
  });
}

const arRotateSlider = document.getElementById("ar-rotate-slider");
const arRotateLabel = document.getElementById("ar-rotate-label");
if (arRotateSlider) {
  arRotateSlider.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: false });
  arRotateSlider.addEventListener("touchmove", (e) => e.stopPropagation(), { passive: false });
  arRotateSlider.addEventListener("input", () => {
    arRotationDeg = parseInt(arRotateSlider.value);
    arRotateLabel.textContent = arRotationDeg + "°";
  });
}

document.getElementById("ar-exit-btn").addEventListener("click", () => { if (xrSession) xrSession.end(); });

// ──────────── Save to MongoDB ────────────

document.getElementById("ar-share-btn").addEventListener("click", async () => {
  if (userLat === null || userLng === null) { alert("Waiting for GPS…"); return; }
  if (placedStrokes.length === 0) { alert("Place at least one stroke!"); return; }

  const matrices = placedStrokes.map(s => s.matrix);       // 16-number arrays
  const strokes = placedStrokes.map(s => ({ color: s.color, scale: s.scale, rotation: s.rotation, hitMatrix: s.hitMatrix }));
  const description = document.getElementById("ar-description").value.trim();

  try {
    const resp = await fetch("/api/graffiti", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: userLat, lng: userLng, strokes, matrices, description, scale: arScaleCm, bearing: arStartBearing }),
    });
    if (resp.ok) {
      const result = await resp.json();
      gpsStatus.textContent = `✅ Saved! (${matrices.length} matrices) ID: ${result.id.slice(-6)}`;
      document.getElementById("ar-description").value = "";
    } else {
      const err = await resp.json();
      alert("Save failed: " + (err.error || resp.statusText));
    }
  } catch (err) { console.error("Save:", err); alert("Save error: " + err.message); }
});

// ──────────── Load Nearby ────────────

document.getElementById("ar-load-btn").addEventListener("click", () => loadNearbyGraffiti());

async function loadNearbyGraffiti() {
  if (!xrSession || !arStartLat || !arStartLng || userLat === null || userLng === null) return;
  try {
    const resp = await fetch(`/api/graffiti/nearby?lat=${userLat}&lng=${userLng}&radius=500`);
    if (!resp.ok) return;
    const items = await resp.json();
    const mLat = 111320, mLng = 111320 * Math.cos(arStartLat * Math.PI / 180);
    const bRad = arStartBearing * Math.PI / 180;
    let loaded = 0;

    for (const item of items) {
      if (placedStrokes.some(s => s.remoteId === item.id)) continue;
      const nM = (item.lat - arStartLat) * mLat, eM = (item.lng - arStartLng) * mLng;
      const sX = eM * Math.cos(bRad) - nM * Math.sin(bRad);
      const sZ = -eM * Math.sin(bRad) - nM * Math.cos(bRad);

      if (item.matrices && item.strokes) {
        for (let i = 0; i < item.matrices.length; i++) {
          const frameDelta = ((item.bearing||0) - arStartBearing) * Math.PI / 180;
          const translated = mat4Multiply(mat4Translate(sX,0,sZ), mat4Multiply(mat4RotateY(frameDelta), new Float32Array(item.matrices[i])));
          const sd = item.strokes[i] || {};
          placedStrokes.push({ matrix:Array.from(translated), hitMatrix:sd.hitMatrix||Array.from(mat4Identity()), color:sd.color||[1,0,0,1], scale:sd.scale||50, rotation:sd.rotation||0, remoteId:item.id });
          loaded++;
        }
      }
    }
    if (gpsStatus) {
      if (items.length===0) gpsStatus.textContent = "No graffiti nearby";
      else if (loaded>0) gpsStatus.textContent = `🎨 ${loaded} stroke${loaded>1?"s":""} loaded`;
      else gpsStatus.textContent = `${items.length} found, already loaded`;
    }
  } catch (err) { console.error("loadNearby:", err); if (gpsStatus) gpsStatus.textContent = "❌ Load error: " + err.message; }
}

// ──────────── Debug ────────────

const debugElem = document.getElementById("debug-info");
setInterval(() => {
  if (!debugElem) return;
  debugElem.innerHTML = `<b>GoGoGraffiti ${renderBackend||"idle"}</b><br>
    XR: ${xrSession?"Active":"Idle"} | Strokes: ${placedStrokes.length}<br>
    Hit: ${lastHitMatrix?"YES":"—"} | GPS: ${userLat?.toFixed(4)||"?"}, ${userLng?.toFixed(4)||"?"}<br>
    Scale: ${arScaleCm}cm | Rot: ${arRotationDeg}°`;
}, 1000);
