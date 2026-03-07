# Wall Graffiti AR

A Flask-based web app that lets you draw graffiti and place it on real-world surfaces using AR (WebXR) or a camera fallback.

## Features

- **Drawing canvas** — pen, eraser, adjustable brush size, save to PNG
- **AR placement (WebXR)** — point at a wall/floor and tap to place your drawing in 3D space
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

## Phone Camera Stream (optional)

```bash
python trust.py http://<phone-ip>:8080/video
```

Requires an IP camera app on your phone (e.g. "IP Webcam" on Android). Both devices must be on the same Wi-Fi network.
