import os
from datetime import datetime, timezone
from urllib.parse import quote_plus, urlencode

from authlib.integrations.flask_client import OAuth
from bson import ObjectId
from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, OperationFailure
from werkzeug.middleware.proxy_fix import ProxyFix

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("APP_SECRET_KEY", os.urandom(32))
# Trust proxy headers (Cloudflare tunnel sets X-Forwarded-Proto/Host)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# ---- Auth0 configuration ----
AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN", "")
AUTH0_CLIENT_ID = os.getenv("AUTH0_CLIENT_ID", "")
AUTH0_CLIENT_SECRET = os.getenv("AUTH0_CLIENT_SECRET", "")

oauth = OAuth(app)
if AUTH0_DOMAIN and "your-tenant" not in AUTH0_DOMAIN:
    oauth.register(
        "auth0",
        client_id=AUTH0_CLIENT_ID,
        client_secret=AUTH0_CLIENT_SECRET,
        client_kwargs={"scope": "openid profile email"},
        server_metadata_url=f"https://{AUTH0_DOMAIN}/.well-known/openid-configuration",
    )

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
def home():
    return render_template("home.html", user=session.get("user"))


@app.route("/login")
def login():
    if not AUTH0_DOMAIN or not AUTH0_CLIENT_ID:
        return "Auth0 not configured. Update .env with your Auth0 credentials.", 500
    # Use the actual request host so it works via tunnel, localhost, or 127.0.0.1
    callback = url_for("callback", _external=True)
    return oauth.auth0.authorize_redirect(redirect_uri=callback)


@app.route("/callback")
def callback():
    token = oauth.auth0.authorize_access_token()
    session["user"] = token.get("userinfo")
    return redirect(url_for("app_page"))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(
        "https://" + AUTH0_DOMAIN + "/v2/logout?"
        + urlencode(
            {"returnTo": url_for("home", _external=True), "client_id": AUTH0_CLIENT_ID},
            quote_via=quote_plus,
        )
    )


@app.route("/app")
def app_page():
    user = session.get("user")
    if not user:
        return redirect(url_for("login"))
    return render_template("thing.html", user=user)


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
        "description": data.get("description", "")[:500],
        "author": session.get("user", {}).get("name", "Anonymous"),
        "author_pic": session.get("user", {}).get("picture", ""),
        "likes": [],
        "comments": [],
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
            "description": doc.get("description", ""),
            "author": doc.get("author", "Anonymous"),
            "likes": len(doc.get("likes", [])),
            "comments": len(doc.get("comments", [])),
            "created": doc.get("created", "").isoformat() if doc.get("created") else ""
        })

    return jsonify(results)


@app.route("/graffiti/<graffiti_id>")
def graffiti_detail(graffiti_id):
    """View a single graffiti with comments and likes."""
    if not graffiti_col:
        return "Database not connected", 503
    try:
        doc = graffiti_col.find_one({"_id": ObjectId(graffiti_id)})
    except Exception:
        return "Invalid graffiti ID", 400
    if not doc:
        return "Graffiti not found", 404
    graffiti = {
        "id": str(doc["_id"]),
        "image": doc["image"],
        "description": doc.get("description", ""),
        "author": doc.get("author", "Anonymous"),
        "author_pic": doc.get("author_pic", ""),
        "scale": doc.get("scale", 50),
        "likes": doc.get("likes", []),
        "like_count": len(doc.get("likes", [])),
        "comments": doc.get("comments", []),
        "created": doc.get("created", ""),
    }
    user = session.get("user")
    user_email = user.get("email", "") if user else ""
    graffiti["user_liked"] = user_email in graffiti["likes"]
    return render_template("graffiti_detail.html", g=graffiti, user=user)


@app.route("/api/graffiti/<graffiti_id>/like", methods=["POST"])
def toggle_like(graffiti_id):
    """Toggle like for the logged-in user."""
    if not graffiti_col:
        return jsonify({"error": "Database not connected"}), 503
    user = session.get("user")
    if not user:
        return jsonify({"error": "Login required"}), 401
    email = user.get("email", "")
    if not email:
        return jsonify({"error": "No email in session"}), 400
    try:
        doc = graffiti_col.find_one({"_id": ObjectId(graffiti_id)})
    except Exception:
        return jsonify({"error": "Invalid ID"}), 400
    if not doc:
        return jsonify({"error": "Not found"}), 404
    likes = doc.get("likes", [])
    if email in likes:
        graffiti_col.update_one({"_id": ObjectId(graffiti_id)}, {"$pull": {"likes": email}})
        liked = False
    else:
        graffiti_col.update_one({"_id": ObjectId(graffiti_id)}, {"$addToSet": {"likes": email}})
        liked = True
    new_count = len(likes) + (1 if liked else -1)
    return jsonify({"liked": liked, "count": new_count})


@app.route("/api/graffiti/<graffiti_id>/comment", methods=["POST"])
def add_comment(graffiti_id):
    """Add a comment to a graffiti."""
    if not graffiti_col:
        return jsonify({"error": "Database not connected"}), 503
    user = session.get("user")
    if not user:
        return jsonify({"error": "Login required"}), 401
    data = request.get_json()
    text = (data.get("text", "") if data else "").strip()
    if not text or len(text) > 1000:
        return jsonify({"error": "Comment must be 1-1000 characters"}), 400
    comment = {
        "author": user.get("name", "Anonymous"),
        "author_pic": user.get("picture", ""),
        "text": text,
        "created": datetime.now(timezone.utc).isoformat()
    }
    try:
        graffiti_col.update_one(
            {"_id": ObjectId(graffiti_id)},
            {"$push": {"comments": comment}}
        )
    except Exception:
        return jsonify({"error": "Invalid ID"}), 400
    return jsonify({"ok": True, "comment": comment}), 201


if __name__ == "__main__":
    app.run(debug=True, port=5500)
