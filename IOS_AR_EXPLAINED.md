# iOS AR — How It Works

## The Problem

WebXR (the standard AR API for browsers) **only works on Android Chrome**. Apple's Safari does not support WebXR, so the "Place on Wall" feature would fall back to a flat, non-tracked camera overlay on iPhones — drawings wouldn't stay pinned in space when you move the phone.

## The Solution

Instead of WebXR, the iOS path uses two web APIs that **Safari does support**:

1. **`getUserMedia`** — access the rear camera
2. **`DeviceOrientationEvent`** — read the phone's gyroscope (alpha/beta/gamma angles)

These are combined with **Three.js** (already loaded for the Android path) to create a gyroscope-tracked AR experience.

## Architecture

```
┌──────────────────────────────────┐
│           Screen Stack           │
├──────────────────────────────────┤
│  Three.js WebGL canvas (z: 0)   │  ← transparent background, 3D drawings float here
│  Camera <video> feed   (z: -1)  │  ← rear camera as background
│  AR overlay UI         (z: 100) │  ← buttons, status text, scale slider
└──────────────────────────────────┘
```

## Step-by-Step Flow

### 1. Permission Request (iOS 13+ only)

iOS 13 locked down gyroscope access behind a user permission. Before using it, we call:

```js
const perm = await DeviceOrientationEvent.requestPermission();
```

This triggers a system popup: *"Allow this website to access motion & orientation?"*. Only needed on iOS — Android and desktop browsers skip this.

### 2. Camera Feed

The rear camera is opened and streamed into a `<video>` element positioned behind everything:

```js
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: "environment" }
});
vid.srcObject = stream;
```

### 3. Three.js Scene (transparent overlay)

A Three.js scene is created with a **transparent WebGL canvas** layered on top of the video. The renderer's clear color is set to fully transparent:

```js
fbRenderer = new THREE.WebGLRenderer({ alpha: true });
fbRenderer.setClearColor(0x000000, 0); // fully transparent
```

This means you see the camera feed through the canvas, and only the 3D drawings are visible.

### 4. Gyroscope → Camera Rotation

The `deviceorientation` event fires ~60 times per second with three angles:

| Angle   | What it measures                    |
|---------|-------------------------------------|
| `alpha` | Compass heading (0°–360°)           |
| `beta`  | Front-back tilt (-180° to 180°)     |
| `gamma` | Left-right tilt (-90° to 90°)       |

These are converted into a Three.js quaternion using the **ZXY Euler convention** (the standard for device orientation), then corrected for:

- Screen orientation (portrait vs landscape)
- The -90° offset between device "up" and Three.js "up"

```js
function setDeviceQuaternion(camera, alpha, beta, gamma, screenOrientation) {
  const euler = new THREE.Euler();
  const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° X

  euler.set(beta * degToRad, alpha * degToRad, -gamma * degToRad, "YXZ");
  camera.quaternion.setFromEuler(euler);
  camera.quaternion.multiply(q1);
  // Correct for screen rotation
  camera.quaternion.multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -screenOrientation * degToRad)
  );
}
```

The camera stays at position `(0, 0, 0)` — only its rotation changes. This matches how a phone works: you rotate in place, you don't translate.

### 5. Placing Drawings

When you tap the screen, a textured plane is created 2 meters in front of wherever the camera is currently looking:

```js
const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
mesh.position.copy(cam.position).add(dir.multiplyScalar(2));
mesh.quaternion.copy(cam.quaternion);
```

Because the drawing is placed in 3D world space and the camera rotates with the gyroscope, when you move the phone away and back, **the drawing stays in place** — just like real AR.

### 6. Scale Slider

The size slider (10cm–300cm) controls `planeWidth` in meters. A 50cm setting creates a 0.5m wide plane at 2m distance.

## Limitations vs WebXR (Android)

| Feature              | WebXR (Android)     | Gyro AR (iOS)           |
|----------------------|---------------------|-------------------------|
| Surface detection    | ✅ Real hit-test    | ❌ No surface detection |
| Positional tracking  | ✅ 6DOF             | ❌ Rotation only (3DOF) |
| Drawing placement    | On detected surface | 2m in front of camera   |
| Occlusion            | ✅ Depth-aware      | ❌ None                 |
| Drift over time      | Minimal             | Gyro drift possible     |

The gyro approach doesn't know about real surfaces, so drawings are placed at a fixed distance. But it's good enough to preview graffiti on walls by pointing your phone at a wall and tapping.

## Browser Compatibility

| Browser         | Works? | Notes                                    |
|-----------------|--------|------------------------------------------|
| Safari (iOS 13+)| ✅     | Requires motion permission prompt        |
| Chrome Android  | ✅     | Uses WebXR (full AR), gyro as fallback   |
| Firefox Android | ✅     | Falls back to gyro mode                  |
| Desktop Chrome  | ⚠️     | No gyro, but camera overlay still works  |
