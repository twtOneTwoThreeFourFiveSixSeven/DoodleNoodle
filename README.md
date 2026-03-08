# Wall Graffiti AR

A Flask-based web app that lets you draw graffiti and place it on real-world surfaces using AR (WebXR) or a camera fallback.

## Features

- **Drawing canvas** — pen, eraser, adjustable brush size, save to PNG
- **AR placement (WebXR)** — point at a wall/floor and tap to place your drawing in 3D space
- **Address tagging** — graffiti posts are tagged with the real-world address using reverse geocoding (OpenStreetMap Nominatim)
- **Community display** — see the actual address where each graffiti was placed
- **Fallback mode** — camera overlay for devices without WebXR (iOS, etc.)
- **Phone camera stream** — `trust.py` streams video from a phone's IP camera via OpenCV

## Project Structure

```
GoGoGraffiti/
├── app.py                         # Flask server (port 5500)
├── templates/
│   └── thing.html                 # Main page template
├── static/
│   ├── css.css                    # Styles
│   └── javascript_thing.js        # Drawing + AR logic
├── trust.py                       # Phone camera stream (OpenCV)
├── requirements.txt               # Python dependencies
└── Yellow1.glb                    # 3D model asset
```

## Setup

```bash
pip install -r requirements.txt
python app.py
```

Open **http://127.0.0.1:5500** in your browser.


### AR Rendering: WebGL2

GoGoGraffiti uses WebGL2 (the web version of OpenGL ES 3.0) for all AR rendering. This enables fast, hardware-accelerated 3D graphics directly in the browser without plugins. The app implements custom GLSL shaders for drawing graffiti textures, reticle rings, and handling 3D placement logic. All AR overlays, object placement, and surface detection are managed with raw WebGL2 and WebXR APIs—no Three.js or other 3D libraries are used. This approach gives full control over rendering and performance, and is compatible with modern browsers supporting WebGL2 and WebXR.
