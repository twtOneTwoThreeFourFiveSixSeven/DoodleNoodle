import os
from datetime import datetime
from zoneinfo import ZoneInfo

from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from pymongo import MongoClient
from dotenv import load_dotenv
from authlib.integrations.flask_client import OAuth

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("APP_SECRET_KEY", os.urandom(24).hex())


# Prevent browser from caching static files (serves fresh JS/CSS every time)
@app.after_request
def add_no_cache_headers(response):
    if "static" in request.path:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# --------------- MongoDB Atlas ---------------
mongo_client = MongoClient(os.environ["MONGODB_URI"])
db = mongo_client.gogoGraffiti
graffiti_col = db.graffiti

# Ensure geospatial index for nearby queries
graffiti_col.create_index([("location", "2dsphere")])

# --------------- Auth0 ---------------
oauth = OAuth(app)
auth0 = oauth.register(
    "auth0",
    client_id=os.environ["AUTH0_CLIENT_ID"],
    client_secret=os.environ["AUTH0_CLIENT_SECRET"],
    api_base_url=f"https://{os.environ['AUTH0_DOMAIN']}",
    access_token_url=f"https://{os.environ['AUTH0_DOMAIN']}/oauth/token",
    authorize_url=f"https://{os.environ['AUTH0_DOMAIN']}/authorize",
    client_kwargs={"scope": "openid profile email"},
    server_metadata_url=f"https://{os.environ['AUTH0_DOMAIN']}/.well-known/openid-configuration",
)


# --------------- Pages ---------------
@app.route("/")
def home():
    return render_template("index.html", user=session.get("user"))


@app.route("/app")
def ar_app():
    return render_template("ar.html", user=session.get("user"))


# --------------- Auth routes ---------------
@app.route("/login")
def login():
    return auth0.authorize_redirect(redirect_uri=url_for("callback", _external=True))


@app.route("/callback")
def callback():
    token = auth0.authorize_access_token()
    session["user"] = token.get("userinfo", {})
    return redirect(url_for("ar_app"))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("home"))


# --------------- API: Save graffiti ---------------
@app.route("/api/graffiti", methods=["POST"])
def save_graffiti():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON body"}), 400

    lat = data.get("lat")
    lng = data.get("lng")
    strokes = data.get("strokes")  # list of stroke objects
    matrices = data.get("matrices")  # list of 16-number arrays

    if lat is None or lng is None:
        return jsonify({"error": "lat/lng required"}), 400
    if not strokes or not matrices:
        return jsonify({"error": "strokes and matrices required"}), 400

    doc = {
        "location": {"type": "Point", "coordinates": [float(lng), float(lat)]},
        "lat": float(lat),
        "lng": float(lng),
        "strokes": strokes,
        "matrices": matrices,  # 4x4 transformation matrices (16-number arrays)
        "description": data.get("description", ""),
        "scale": data.get("scale", 50),
        "bearing": data.get("bearing", 0),
        "author": session.get("user", {}).get("name", "anonymous"),
        "created": datetime.now(ZoneInfo("America/Toronto")),
    }

    result = graffiti_col.insert_one(doc)
    return jsonify({"id": str(result.inserted_id), "ok": True})


# --------------- API: Load nearby graffiti ---------------
@app.route("/api/graffiti/nearby")
def nearby_graffiti():
    lat = request.args.get("lat", type=float)
    lng = request.args.get("lng", type=float)
    radius = request.args.get("radius", 500, type=float)

    if lat is None or lng is None:
        return jsonify({"error": "lat/lng required"}), 400

    docs = graffiti_col.find({
        "location": {
            "$nearSphere": {
                "$geometry": {"type": "Point", "coordinates": [lng, lat]},
                "$maxDistance": radius,
            }
        }
    }).limit(50)

    items = []
    for d in docs:
        items.append({
            "id": str(d["_id"]),
            "lat": d["lat"],
            "lng": d["lng"],
            "strokes": d.get("strokes", []),
            "matrices": d.get("matrices", []),
            "scale": d.get("scale", 50),
            "bearing": d.get("bearing", 0),
            "description": d.get("description", ""),
            "author": d.get("author", "anonymous"),
            "created": d.get("created", "").isoformat() if d.get("created") else "",
        })

    return jsonify(items)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5501, debug=True)
