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
        // Erase to transparency instead of painting white
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

    colorPicker.addEventListener("input", (e) => {
      currentColor = e.target.value;
      hexInput.value = currentColor;
    });
    hexInput.addEventListener("change", (e) => {
      let val = e.target.value.trim();
      if (!val.startsWith("#")) val = "#" + val;
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        currentColor = val;
        colorPicker.value = val;
      } else {
        e.target.value = currentColor;
      }
    });

    // ===================== IMAGE INSERT =====================
    const imgBtn = document.getElementById("img-btn");
    const imgUpload = document.getElementById("img-upload");

    imgBtn.addEventListener("click", () => imgUpload.click());
    imgUpload.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          // Scale image to fit within 40% of canvas, preserving aspect ratio
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

    // Overlay UI for positioning the image before stamping it
    let placeOverlay = null;

    function renderPlacingImage() {
      if (!placingImage) return;
      // Create a floating overlay for drag-to-position
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

        // Drag handlers
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
      // Draw current canvas + preview image
      const saved = ctx.getImageData(0, 0, canvas.width, canvas.height);
      ctx.putImageData(saved, 0, 0);
      ctx.globalAlpha = 0.7;
      ctx.drawImage(placingImage.img, placingImage.x, placingImage.y, placingImage.w, placingImage.h);
      ctx.globalAlpha = 1;
      // Store saved data so we can redraw
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
    let arScaleCm = 50; // default 50cm

    // Scale slider
    const arScaleSlider = document.getElementById("ar-scale-slider");
    const arScaleLabel = document.getElementById("ar-scale-label");
    const reticleEl = document.getElementById("reticle");

    if (arScaleSlider) {
      arScaleSlider.addEventListener("input", () => {
        arScaleCm = parseInt(arScaleSlider.value);

        // Update label
        if (arScaleLabel) {
          arScaleLabel.textContent = arScaleCm >= 100
            ? (arScaleCm / 100).toFixed(1) + "m"
            : arScaleCm + "cm";
        }

        // Update the HTML reticle circle diameter
        // Map 10cm–300cm → 30px–250px
        const minPx = 30;
        const maxPx = 250;
        const diameter = minPx + ((arScaleCm - 10) / (300 - 10)) * (maxPx - minPx);
        if (reticleEl) {
          reticleEl.style.width = diameter + "px";
          reticleEl.style.height = diameter + "px";
        }

        // Also update the Three.js reticle ring if in WebXR mode
        if (reticleModel) {
          const radius = (arScaleCm / 100) / 2;
          reticleModel.scale.set(radius / 0.07, radius / 0.07, radius / 0.07);
        }
      });
    }

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
      const planeWidth = arScaleCm / 100; // convert cm to meters
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

      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      matrix.decompose(position, quaternion, scale);

      mesh.position.copy(position);
      mesh.quaternion.copy(quaternion);
      mesh.updateMatrix();

      scene.add(mesh);
      arStatus.textContent = "✅ Placed at " + arScaleCm + "cm wide! Tap again to place more.";
    }

    // ===================== HTTPS CHECK =====================
    function isSecureContext() {
      return location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
    }

    // ===================== iOS DETECTION =====================
    function isIOS() {
      return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
             (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    }

    // ===================== iOS PERMISSION GATE =====================
    const iosGate = document.getElementById("ios-ar-gate");
    const iosStartBtn = document.getElementById("ios-start-ar-btn");
    const iosCancelBtn = document.getElementById("ios-cancel-btn");
    const iosGateStatus = document.getElementById("ios-gate-status");

    // iOS "Start AR" button — handles permission requests inside a user gesture
    iosStartBtn.addEventListener("click", async () => {
      iosGateStatus.textContent = "Requesting permissions...";

      // 1. Request gyroscope permission (iOS 13+ requires user gesture)
      if (typeof DeviceOrientationEvent !== "undefined" &&
          typeof DeviceOrientationEvent.requestPermission === "function") {
        try {
          const motionPerm = await DeviceOrientationEvent.requestPermission();
          if (motionPerm !== "granted") {
            iosGateStatus.textContent = "❌ Motion sensor denied. AR needs gyroscope access.";
            return;
          }
        } catch (err) {
          iosGateStatus.textContent = "❌ Motion sensor error: " + err.message;
          return;
        }
      }

      // 2. Permissions granted — hide gate, launch AR
      iosGate.style.display = "none";
      startFallbackAR(true); // true = permissions already granted
    });

    iosCancelBtn.addEventListener("click", () => {
      iosGate.style.display = "none";
    });

    // Start WebXR AR session
    document.getElementById("ar-btn").addEventListener("click", async () => {
      // HTTPS check — camera won't work without it
      if (!isSecureContext()) {
        alert("AR requires HTTPS. Camera and sensors are blocked on insecure connections.\n\nUse https:// or localhost.");
        return;
      }

      // iOS path — show permission gate (button required for user gesture)
      if (isIOS() && (!navigator.xr)) {
        iosGate.style.display = "flex";
        iosGateStatus.textContent = "";
        return;
      }

      // Check WebXR support
      if (!navigator.xr) {
        startFallbackAR(false);
        return;
      }

      const supported = await navigator.xr.isSessionSupported("immersive-ar");
      if (!supported) {
        startFallbackAR(false);
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
        startFallbackAR(false);
      }
    });

    // Exit AR
    document.getElementById("ar-exit-btn").addEventListener("click", () => {
      if (xrSession) {
        xrSession.end();
      } else {
        stopFallbackAR();
      }
    });

    // ===================== FALLBACK — GYRO-TRACKED AR (iOS + others) =====================
    let fbScene = null, fbCamera = null, fbRenderer = null;
    let fbOrientAlpha = 0, fbOrientBeta = 0, fbOrientGamma = 0;
    let fbActive = false;

    async function startFallbackAR(permissionsGranted) {
      arOverlay.style.display = "block";
      document.getElementById("draw-toolbar").style.display = "none";
      document.getElementById("canvas").style.display = "none";
      fbActive = true;

      // ---- Request gyroscope permission (non-iOS, or if not already granted) ----
      if (!permissionsGranted &&
          typeof DeviceOrientationEvent !== "undefined" &&
          typeof DeviceOrientationEvent.requestPermission === "function") {
        try {
          const perm = await DeviceOrientationEvent.requestPermission();
          if (perm !== "granted") {
            arStatus.textContent = "⚠️ Gyroscope permission denied — tap to place without tracking";
          }
        } catch (err) {
          arStatus.textContent = "⚠️ Could not request gyroscope — tap to place without tracking";
        }
      }

      // ---- Camera feed background (iOS-compatible attributes) ----
      let vid = document.getElementById("fallback-video");
      if (!vid) {
        vid = document.createElement("video");
        vid.id = "fallback-video";
        vid.autoplay = true;
        vid.playsInline = true;
        vid.muted = true;
        // iOS Safari requires all three attributes set explicitly
        vid.setAttribute("playsinline", "");
        vid.setAttribute("muted", "");
        vid.setAttribute("autoplay", "");
        vid.setAttribute("webkit-playsinline", ""); // older iOS
        vid.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1;-webkit-transform:translateZ(0);transform:translateZ(0);";
        arOverlay.insertBefore(vid, arOverlay.firstChild);
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        vid.srcObject = stream;
      } catch (err) {
        arStatus.textContent = "❌ Camera error: " + err.message;
        return;
      }

      // ---- Three.js scene over camera feed ----
      if (!fbRenderer) {
        fbScene = new THREE.Scene();
        fbCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
        fbCamera.position.set(0, 0, 0);

        const fbCanvas = document.createElement("canvas");
        fbCanvas.id = "fallback-3d";
        fbCanvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2;touch-action:none;-webkit-transform:translateZ(0);transform:translateZ(0);";
        arOverlay.insertBefore(fbCanvas, vid.nextSibling);

        fbRenderer = new THREE.WebGLRenderer({ canvas: fbCanvas, alpha: true, antialias: true });
        fbRenderer.setPixelRatio(window.devicePixelRatio);
        fbRenderer.setSize(window.innerWidth, window.innerHeight);
        fbRenderer.setClearColor(0x000000, 0);
      }

      // ---- Device orientation → camera rotation ----
      function onOrientation(e) {
        if (e.alpha != null) fbOrientAlpha = e.alpha;
        if (e.beta != null) fbOrientBeta = e.beta;
        if (e.gamma != null) fbOrientGamma = e.gamma;
      }
      window.addEventListener("deviceorientation", onOrientation, true);

      // Helper: convert device orientation angles to Three.js quaternion
      // Uses the standard ZXY Euler convention for device orientation
      function setDeviceQuaternion(camera, alpha, beta, gamma, screenOrientation) {
        const degToRad = Math.PI / 180;
        const euler = new THREE.Euler();
        const q0 = new THREE.Quaternion();
        const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° around X

        euler.set(beta * degToRad, alpha * degToRad, -gamma * degToRad, "YXZ");
        camera.quaternion.setFromEuler(euler);
        camera.quaternion.multiply(q1);
        camera.quaternion.multiply(q0.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -screenOrientation * degToRad));
      }

      // ---- Tap to place drawing in 3D (passive:false for iOS) ----
      const fb3d = document.getElementById("fallback-3d");
      fb3d.addEventListener("click", (e) => {
        placeDrawingInScene(fbScene, fbCamera, e);
      });
      fb3d.addEventListener("touchstart", (e) => {
        if (e.target.tagName === "BUTTON") return;
        e.preventDefault(); // prevent iOS scroll/bounce
      }, { passive: false });
      fb3d.addEventListener("touchend", (e) => {
        if (e.target.tagName === "BUTTON") return;
        e.preventDefault();
        const touch = e.changedTouches[0];
        placeDrawingInScene(fbScene, fbCamera, touch);
      }, { passive: false });

      function placeDrawingInScene(sc, cam, evt) {
        const drawingTexture = new THREE.CanvasTexture(canvas);
        drawingTexture.needsUpdate = true;

        const aspect = canvas.width / canvas.height;
        const planeWidth = arScaleCm / 100;
        const planeHeight = planeWidth / aspect;

        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        const material = new THREE.MeshBasicMaterial({
          map: drawingTexture,
          transparent: true,
          side: THREE.DoubleSide,
          depthTest: false
        });
        const mesh = new THREE.Mesh(geometry, material);

        // Place 2m in front of the camera's current look direction
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        mesh.position.copy(cam.position).add(dir.multiplyScalar(2));
        mesh.quaternion.copy(cam.quaternion);

        sc.add(mesh);
        arStatus.textContent = "✅ Placed! Move phone to see it pinned. Tap to place more.";

        // Auto-anchor: save GPS coords with this placement
        if (userLat !== null && userLng !== null) {
          mesh.userData.lat = userLat;
          mesh.userData.lng = userLng;
          mesh.userData.bearing = userBearing;
          mesh.userData.anchored = true;
        }
      }

      // ---- Render loop ----
      function renderFallbackAR() {
        if (!fbActive) return;

        const screenOrient = window.screen.orientation ? window.screen.orientation.angle : (window.orientation || 0);
        setDeviceQuaternion(fbCamera, fbOrientAlpha, fbOrientBeta, fbOrientGamma, screenOrient);

        fbRenderer.render(fbScene, fbCamera);
        requestAnimationFrame(renderFallbackAR);
      }
      requestAnimationFrame(renderFallbackAR);
      arStatus.textContent = "Tap to place your drawing — move phone to look around";

      // ---- Auto-load nearby graffiti on AR start ----
      loadNearbyGraffiti();
    }

    // ===================== GPS + GLOBAL GRAFFITI =====================
    let userLat = null, userLng = null, userBearing = 0;
    const gpsStatus = document.getElementById("ar-gps-status");

    // Continuously track GPS position
    if ("geolocation" in navigator) {
      navigator.geolocation.watchPosition(
        (pos) => {
          userLat = pos.coords.latitude;
          userLng = pos.coords.longitude;
          if (pos.coords.heading != null && !isNaN(pos.coords.heading)) {
            userBearing = pos.coords.heading;
          }
        },
        (err) => { console.warn("GPS error:", err.message); },
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    }

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
        if (gpsStatus) gpsStatus.textContent = "⚠️ Waiting for GPS... make sure location is enabled.";
        return;
      }

      const imageData = canvas.toDataURL("image/png");
      if (gpsStatus) gpsStatus.textContent = "Uploading...";

      try {
        const resp = await fetch("/api/graffiti", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: userLat,
            lng: userLng,
            image: imageData,
            scale: arScaleCm,
            bearing: userBearing
          })
        });
        const result = await resp.json();
        if (resp.ok) {
          if (gpsStatus) gpsStatus.textContent = "✅ Shared globally! Anyone nearby can see it.";
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
        if (gpsStatus) gpsStatus.textContent = "⚠️ Waiting for GPS...";
        return;
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
        const targetScene = fbScene || scene;
        const targetCamera = fbCamera || camera;

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
              map: tex, transparent: true, side: THREE.DoubleSide, depthTest: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.name = "global_" + item.id;

            // Position by GPS offset: convert lat/lng difference to meters
            const dLat = item.lat - userLat;
            const dLng = item.lng - userLng;
            const metersPerDegLat = 111320;
            const metersPerDegLng = 111320 * Math.cos(userLat * Math.PI / 180);

            const offsetX = dLng * metersPerDegLng; // east-west
            const offsetZ = -dLat * metersPerDegLat; // north-south (neg = north in Three.js)

            // Place at 1.5m height (roughly eye level on a wall)
            mesh.position.set(offsetX, 0, offsetZ);

            // Rotate to face the bearing it was placed at
            const bearingRad = (item.bearing || 0) * (Math.PI / 180);
            mesh.rotation.y = bearingRad;

            targetScene.add(mesh);
            loaded++;

            if (gpsStatus) gpsStatus.textContent = `🌍 Loaded ${loaded} graffiti nearby`;
          };
          img.src = item.image;
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

    // Clean up fallback AR on exit
    function stopFallbackAR() {
      fbActive = false;
      arOverlay.style.display = "none";
      document.getElementById("draw-toolbar").style.display = "flex";
      document.getElementById("canvas").style.display = "block";
      const vid = document.getElementById("fallback-video");
      if (vid && vid.srcObject) { vid.srcObject.getTracks().forEach(t => t.stop()); }
      // Clear placed drawings from scene
      if (fbScene) {
        while (fbScene.children.length > 0) {
          const obj = fbScene.children[0];
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) { if (obj.material.map) obj.material.map.dispose(); obj.material.dispose(); }
          fbScene.remove(obj);
        }
      }
    }
