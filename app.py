import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, OperationFailure

load_dotenv()

app = Flask(__name__)

# ---- MongoDB Atlas connection ----
MONGODB_URI = os.getenv("MONGODB_URI", "")
db = None
graffiti_col = None

if MONGODB_URI and "<username>" not in MONGODB_URI:
    try:
        client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        db = client.get_database("gogoGraffiti")
        graffiti_col = db["graffiti"]
        # Geospatial index for nearby queries
        graffiti_col.create_index([("location", "2dsphere")])
        print("✅ Connected to MongoDB Atlas")
    except (ConnectionFailure, OperationFailure) as e:
        print(f"⚠️  MongoDB connection failed: {e}")
        print("   Global graffiti will be disabled. Local mode still works.")
else:
    print("⚠️  No MONGODB_URI set in .env — global graffiti disabled.")


@app.route("/")
def index():
    return render_template("thing.html")


@app.route("/api/graffiti", methods=["POST"])
def save_graffiti():
    """Save graffiti with GPS location to MongoDB."""
    if not graffiti_col:
        return jsonify({"error": "Database not connected"}), 503

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    lat = data.get("lat")
    lng = data.get("lng")
    image = data.get("image")  # base64 PNG
    scale = data.get("scale", 50)
    bearing = data.get("bearing", 0)  # compass direction the art faces

    if lat is None or lng is None or not image:
        return jsonify({"error": "Missing lat, lng, or image"}), 400

    # Limit image size (~2MB base64 max)
    if len(image) > 2_800_000:
        return jsonify({"error": "Image too large (max ~2MB)"}), 413

    doc = {
        "location": {
            "type": "Point",
            "coordinates": [float(lng), float(lat)]  # GeoJSON: [lng, lat]
        },
        "image": image,
        "scale": int(scale),
        "bearing": float(bearing),
        "created": datetime.now(timezone.utc)
    }

    result = graffiti_col.insert_one(doc)
    return jsonify({"id": str(result.inserted_id), "ok": True}), 201


@app.route("/api/graffiti/nearby")
def get_nearby_graffiti():
    """Fetch graffiti within radius_m meters of lat/lng."""
    if not graffiti_col:
        return jsonify({"error": "Database not connected"}), 503

    lat = request.args.get("lat", type=float)
    lng = request.args.get("lng", type=float)
    radius = request.args.get("radius", default=200, type=int)  # meters

    if lat is None or lng is None:
        return jsonify({"error": "Missing lat or lng"}), 400

    # Cap radius at 2km
    radius = min(radius, 2000)

    cursor = graffiti_col.find({
        "location": {
            "$nearSphere": {
                "$geometry": {
                    "type": "Point",
                    "coordinates": [lng, lat]
                },
                "$maxDistance": radius
            }
        }
    }).limit(50)  # max 50 graffiti at once

    results = []
    for doc in cursor:
        results.append({
            "id": str(doc["_id"]),
            "lat": doc["location"]["coordinates"][1],
            "lng": doc["location"]["coordinates"][0],
            "image": doc["image"],
            "scale": doc.get("scale", 50),
            "bearing": doc.get("bearing", 0),
            "created": doc.get("created", "").isoformat() if doc.get("created") else ""
        })

    return jsonify(results)


if __name__ == "__main__":
    app.run(debug=True, port=5500)
