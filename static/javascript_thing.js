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
    let arScaleCm = 50;

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

    // Three.js scene setup
    function initThreeScene() {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

      const ringGeo = new THREE.RingGeometry(0.05, 0.07, 32).rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      reticleModel = new THREE.Mesh(ringGeo, ringMat);
      reticleModel.visible = false;
      reticleModel.matrixAutoUpdate = false;
      scene.add(reticleModel);
    }

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
      mesh.matrixAutoUpdate = false;

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
    }

    // Start WebXR AR session
    document.getElementById("ar-btn").addEventListener("click", async () => {
      if (!navigator.xr) {
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

        const arCanvas = document.createElement("canvas");
        gl = arCanvas.getContext("webgl", { xrCompatible: true });
        renderer = new THREE.WebGLRenderer({ canvas: arCanvas, context: gl, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;

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
        stopFallbackAR();
      }
    });

    // ===================== FALLBACK — GYRO-TRACKED AR (iOS + others) =====================
    let fbScene = null, fbCamera = null, fbRenderer = null;
    let fbOrientAlpha = 0, fbOrientBeta = 0, fbOrientGamma = 0;
    let fbActive = false;

    async function startFallbackAR() {
      arOverlay.style.display = "block";
      document.getElementById("draw-toolbar").style.display = "none";
      document.getElementById("canvas").style.display = "none";
      fbActive = true;

      // ---- Request gyroscope permission on iOS 13+ ----
      if (typeof DeviceOrientationEvent !== "undefined" &&
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

      // ---- Camera feed background ----
      let vid = document.getElementById("fallback-video");
      if (!vid) {
        vid = document.createElement("video");
        vid.id = "fallback-video";
        vid.autoplay = true;
        vid.playsInline = true;
        vid.muted = true;
        vid.setAttribute("playsinline", "");
        vid.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:-1;";
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
        fbCanvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;touch-action:none;";
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

      function setDeviceQuaternion(cam, alpha, beta, gamma, screenOrientation) {
        const degToRad = Math.PI / 180;
        const euler = new THREE.Euler();
        const q0 = new THREE.Quaternion();
        const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

        euler.set(beta * degToRad, alpha * degToRad, -gamma * degToRad, "YXZ");
        cam.quaternion.setFromEuler(euler);
        cam.quaternion.multiply(q1);
        cam.quaternion.multiply(q0.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -screenOrientation * degToRad));
      }

      // ---- Tap to place drawing in 3D ----
      const fb3d = document.getElementById("fallback-3d");

      function handleFallbackPlace(evt) {
        const clientX = evt.clientX || evt.pageX;
        const clientY = evt.clientY || evt.pageY;

        const target = document.elementFromPoint(clientX, clientY);
        if (target && (
          target.closest("#ar-scale-bar") ||
          target.closest("#ar-exit-btn") ||
          target.closest("#ar-status")
        )) {
          return;
        }

        // Raycast from tap point to find a virtual wall
        const mouse = new THREE.Vector2(
          (clientX / window.innerWidth) * 2 - 1,
          -(clientY / window.innerHeight) * 2 + 1
        );

        raycaster.setFromCamera(mouse, fbCamera);
        const walls = fbScene.children.filter(c => c.name === "wall");
        const hits = raycaster.intersectObjects(walls);

        if (hits.length > 0) {
          const hit = hits[0];
          placeDrawingOnWall(fbScene, hit.point, hit.face.normal.clone().transformDirection(hit.object.matrixWorld), hit.object);
        } else {
          placeDrawingInFront(fbScene, fbCamera);
        }
      }

      fb3d.addEventListener("click", handleFallbackPlace);
      fb3d.addEventListener("touchend", (e) => {
        if (e.target.tagName === "BUTTON") return;
        const touch = e.changedTouches[0];
        handleFallbackPlace(touch);
      });

      function placeDrawingOnWall(sc, point, normal, wall) {
        const drawingTexture = new THREE.CanvasTexture(canvas);
        drawingTexture.needsUpdate = true;

        const currentScale = parseInt(arScaleSlider.value);
        const aspect = canvas.width / canvas.height;
        const planeWidth = currentScale / 100;
        const planeHeight = planeWidth / aspect;

        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        const material = new THREE.MeshBasicMaterial({
          map: drawingTexture,
          transparent: true,
          side: THREE.DoubleSide,
          depthTest: false
        });
        const mesh = new THREE.Mesh(geometry, material);

        // Offset slightly off the wall to prevent z-fighting
        const offsetPoint = point.clone().add(normal.clone().multiplyScalar(0.01));
        mesh.position.copy(offsetPoint);

        // Face perpendicular to the wall — look along the surface normal
        const lookTarget = offsetPoint.clone().add(normal);
        mesh.lookAt(lookTarget);

        sc.add(mesh);
      }

      // Replace the old placeDrawingInScene with this
      function placeDrawingInFront(sc, cam) {
        const drawingTexture = new THREE.CanvasTexture(canvas);
        drawingTexture.needsUpdate = true;

        const currentScale = parseInt(arScaleSlider.value);
        const aspect = canvas.width / canvas.height;
        const planeWidth = currentScale / 100;
        const planeHeight = planeWidth / aspect;

        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        const material = new THREE.MeshBasicMaterial({
          map: drawingTexture,
          transparent: true,
          side: THREE.DoubleSide,
          depthTest: false
        });
        const mesh = new THREE.Mesh(geometry, material);

        // Place 2m in front of camera
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        const pos = cam.position.clone().add(dir.multiplyScalar(2));
        mesh.position.copy(pos);

        // Orient perpendicular to the wall, NOT facing the camera
        // Snap to nearest cardinal wall direction
        const absX = Math.abs(dir.x);
        const absY = Math.abs(dir.y);
        const absZ = Math.abs(dir.z);

        const wallNormal = new THREE.Vector3();

        if (absY > absX && absY > absZ) {
          // Looking mostly up/down → place on floor/ceiling
          wallNormal.set(0, dir.y > 0 ? -1 : 1, 0);
        } else if (absX > absZ) {
          // Looking mostly left/right → place on side wall
          wallNormal.set(dir.x > 0 ? -1 : 1, 0, 0);
        } else {
          // Looking mostly forward/back → place on front/back wall
          wallNormal.set(0, 0, dir.z > 0 ? -1 : 1);
        }

        // Face outward from the wall (along the normal)
        const lookTarget = pos.clone().add(wallNormal);
        mesh.lookAt(lookTarget);

        sc.add(mesh);
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
    }

    // Clean up fallback AR on exit
    function stopFallbackAR() {
      fbActive = false;
      arOverlay.style.display = "none";
      document.getElementById("draw-toolbar").style.display = "flex";
      document.getElementById("canvas").style.display = "block";
      const vid = document.getElementById("fallback-video");
      if (vid && vid.srcObject) { vid.srcObject.getTracks().forEach(t => t.stop()); }
      if (fbScene) {
        while (fbScene.children.length > 0) {
          const obj = fbScene.children[0];
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) { if (obj.material.map) obj.material.map.dispose(); obj.material.dispose(); }
          fbScene.remove(obj);
        }
      }
    }
