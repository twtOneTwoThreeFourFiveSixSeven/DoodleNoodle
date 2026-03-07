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
    }
    resizeCanvas();

    // Transparent background — don't fill with white
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let drawing = false, erasing = false, brushSize = 4;

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
        // Erase to transparency instead of painting white
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = "black";
      }

      ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    function stopDraw() { drawing = false; ctx.beginPath(); }

    canvas.addEventListener("mousedown", startDraw); canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", stopDraw); canvas.addEventListener("mouseleave", stopDraw);
    canvas.addEventListener("touchstart", startDraw); canvas.addEventListener("touchmove", draw);
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
    document.getElementById("clear-btn").addEventListener("click", () => {
      // Clear to transparent instead of white
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

    // Three.js scene setup
    function initThreeScene() {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

      // Reticle — a ring that shows where surfaces are detected
      const ringGeo = new THREE.RingGeometry(0.05, 0.07, 32).rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      reticleModel = new THREE.Mesh(ringGeo, ringMat);
      reticleModel.visible = false;
      reticleModel.matrixAutoUpdate = false;
      scene.add(reticleModel);
    }

    // Create a plane with the drawing texture, oriented to face the detected surface
    function placeDrawingAtHit(pose) {
      const drawingTexture = new THREE.CanvasTexture(canvas);
      drawingTexture.needsUpdate = true;

      const aspect = canvas.width / canvas.height;
      const planeWidth = 0.5; // 50cm wide in real world
      const planeHeight = planeWidth / aspect;

      const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
      const material = new THREE.MeshBasicMaterial({
        map: drawingTexture,
        transparent: true,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.matrixAutoUpdate = false;

      // Position the drawing at the hit point, oriented along the surface
      const matrix = new THREE.Matrix4();
      matrix.fromArray(pose.transform.matrix);

      // Rotate to stand upright on detected surface (wall-like)
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      matrix.decompose(position, quaternion, scale);

      mesh.position.copy(position);
      mesh.quaternion.copy(quaternion);
      mesh.updateMatrix();

      scene.add(mesh);
      arStatus.textContent = "✅ Drawing placed! Tap again to place more.";
    }

    // Start WebXR AR session
    document.getElementById("ar-btn").addEventListener("click", async () => {
      // Check WebXR support
      if (!navigator.xr) {
        // Fallback: simple camera overlay (for iOS / unsupported browsers)
        startFallbackAR();
        return;
      }

      const supported = await navigator.xr.isSessionSupported("immersive-ar");
      if (!supported) {
        startFallbackAR();
        return;
      }

      try {
        initThreeScene();

        // Create WebGL renderer
        const arCanvas = document.createElement("canvas");
        gl = arCanvas.getContext("webgl", { xrCompatible: true });
        renderer = new THREE.WebGLRenderer({ canvas: arCanvas, context: gl, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;

        // Request AR session with hit-test
        xrSession = await navigator.xr.requestSession("immersive-ar", {
          requiredFeatures: ["hit-test"],
          optionalFeatures: ["dom-overlay"],
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

        // Tap to place
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

        // Render loop
        renderer.setAnimationLoop((timestamp, frame) => {
          if (!frame) return;

          const hitResults = frame.getHitTestResults(xrHitTestSource);
          if (hitResults.length > 0) {
            const hit = hitResults[0];
            lastHitPose = hit.getPose(xrRefSpace);
            reticleModel.visible = true;
            reticleModel.matrix.fromArray(lastHitPose.transform.matrix);
            arStatus.textContent = "Surface detected — tap to place!";
          } else {
            reticleModel.visible = false;
            lastHitPose = null;
            arStatus.textContent = "Scanning for surfaces... point at a wall or floor";
          }

          renderer.render(scene, camera);
        });

      } catch (err) {
        console.error(err);
        startFallbackAR();
      }
    });

    // Exit AR
    document.getElementById("ar-exit-btn").addEventListener("click", () => {
      if (xrSession) {
        xrSession.end();
      } else {
        // Fallback exit
        arOverlay.style.display = "none";
        document.getElementById("draw-toolbar").style.display = "flex";
        document.getElementById("canvas").style.display = "block";
        const vid = document.getElementById("fallback-video");
        if (vid && vid.srcObject) { vid.srcObject.getTracks().forEach(t => t.stop()); }
      }
    });

    // ===================== FALLBACK (iOS / no WebXR) =====================
    async function startFallbackAR() {
      arOverlay.style.display = "block";
      document.getElementById("draw-toolbar").style.display = "none";
      document.getElementById("canvas").style.display = "none";
      arStatus.textContent = "Tap to place drawing (no surface tracking)";

      // Create video background
      let vid = document.getElementById("fallback-video");
      if (!vid) {
        vid = document.createElement("video");
        vid.id = "fallback-video";
        vid.autoplay = true;
        vid.playsInline = true;
        vid.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:-1;";
        arOverlay.insertBefore(vid, arOverlay.firstChild);
      }

      // Create overlay canvas for placed drawings
      let fCanvas = document.getElementById("fallback-canvas");
      if (!fCanvas) {
        fCanvas = document.createElement("canvas");
        fCanvas.id = "fallback-canvas";
        fCanvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;touch-action:none;";
        arOverlay.insertBefore(fCanvas, vid.nextSibling);
        fCanvas.width = window.innerWidth;
        fCanvas.height = window.innerHeight;
      }
      const fCtx = fCanvas.getContext("2d");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        vid.srcObject = stream;
      } catch (err) {
        arStatus.textContent = "❌ Camera error: " + err.message;
        return;
      }

      const fallbackDrawings = [];

      fCanvas.addEventListener("click", (e) => {
        const img = new Image();
        img.src = canvas.toDataURL("image/png");
        img.onload = () => {
          const size = Math.min(window.innerWidth, window.innerHeight) * 0.4;
          const aspect = img.width / img.height;
          fallbackDrawings.push({
            x: e.clientX - size / 2,
            y: e.clientY - (size / aspect) / 2,
            width: size,
            height: size / aspect,
            img
          });
        };
      });

      function renderFallback() {
        if (arOverlay.style.display === "none") return;
        fCtx.clearRect(0, 0, fCanvas.width, fCanvas.height);
        for (const d of fallbackDrawings) {
          fCtx.globalAlpha = 0.85;
          fCtx.drawImage(d.img, d.x, d.y, d.width, d.height);
        }
        fCtx.globalAlpha = 1;
        requestAnimationFrame(renderFallback);
      }
      requestAnimationFrame(renderFallback);
    }