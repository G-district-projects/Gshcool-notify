from flask import Flask, request, render_template, jsonify, send_from_directory
from pywebpush import webpush, WebPushException
import json
import os

app = Flask(__name__)

# 🔑 Your VAPID Keys
VAPID_PRIVATE_KEY = "aQQ_yES66dqt8fSYp1O_Da1hMqrb0XJsNrozaudZn2g"
VAPID_PUBLIC_KEY = "BJgdh_YtcGFQcEHhcrEnnTOXOSjU3xMJwnhpqzEBSIpGZOECE4RHBfrqPoA6siWuRkOVRkSYqMcwmxdb_WMX_7Y"

# 📂 Always save subscriptions in the same folder as this script
SUBS_FILE = os.path.join(os.path.dirname(__file__), "subscriptions.json")


@app.route("/")
def index():
    return render_template("index.html", vapid_key=VAPID_PUBLIC_KEY)


@app.route("/admin")
def admin():
    return render_template("admin.html")


@app.route("/ios")
def ios():
    return render_template("ios.html")


@app.route("/manifest.json")
def manifest():
    return send_from_directory("static", "manifest.json")


# ✅ Save subscription (multiple users stored)
@app.route("/save-subscription", methods=["POST"])
def save_subscription():
    sub = request.json

    subs = []
    if os.path.exists(SUBS_FILE):
        with open(SUBS_FILE, "r") as f:
            try:
                subs = json.load(f)
            except json.JSONDecodeError:
                subs = []

    # Avoid duplicates (check endpoint)
    if not any(s.get("endpoint") == sub.get("endpoint") for s in subs):
        subs.append(sub)

    # Save back safely
    with open(SUBS_FILE, "w") as f:
        json.dump(subs, f, indent=2)

    print(f"✅ Subscription saved: {sub['endpoint'][:50]}...")
    return jsonify({"success": True, "count": len(subs)})


@app.route("/service-worker.js")
def sw():
    return app.send_static_file("service-worker.js")


# ✅ Send push to ALL subscribers
@app.route("/send-all", methods=["POST"])
def send_all():
    if not os.path.exists(SUBS_FILE):
        return jsonify({"error": "No subscriptions found."}), 400

    message = request.json.get("message", "🚨 G Schools")

    with open(SUBS_FILE, "r") as f:
        subs = json.load(f)

    results = []
    still_valid = []

    for sub in subs:
        try:
            webpush(
                sub,
                data=message,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": "mailto:admin@gdistrict.org"}
            )
            results.append({"endpoint": sub["endpoint"], "status": "sent"})
            still_valid.append(sub)  # keep only working ones
        except WebPushException as e:
            print("❌ WebPushException:", e)
            if hasattr(e, "response") and e.response is not None:
                print("📩 Response:", e.response.text)
            results.append({"endpoint": sub["endpoint"], "error": str(e)})

    # ✅ Cleanup dead subscriptions
    with open(SUBS_FILE, "w") as f:
        json.dump(still_valid, f, indent=2)

    return jsonify({"success": True, "results": results})


# ✅ Debug: view all stored subscriptions
@app.route("/subscriptions")
def list_subscriptions():
    if not os.path.exists(SUBS_FILE):
        return jsonify([])
    with open(SUBS_FILE, "r") as f:
        subs = json.load(f)
    return jsonify(subs)


if __name__ == "__main__":
    # Just run on HTTP locally — Ngrok provides HTTPS
    app.run(host="0.0.0.0", port=5000, debug=True)

