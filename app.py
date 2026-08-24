# app.py
# --------------------------------------------------------------------------
# A small Flask server with two jobs:
#   1. Serve the frontend (templates/index.html)
#   2. Provide /api/videos, which calls the YouTube Data API once per
#      (category, language) pair from config.CATEGORIES / config.LANGUAGES,
#      filters results by config.MIN_VIEWS, and returns clean JSON.
#
# Setup:
#   pip install -r requirements.txt
#   copy .env and fill in YOUTUBE_API_KEY (see README.md)
#   python app.py
#   then open http://127.0.0.1:5000
#
# To open the site from a phone or other device on the same network, set
# HOST=0.0.0.0 (see README.md for the security caveat that comes with that).
#
# Get a free API key: https://console.cloud.google.com/
#   -> create a project -> enable "YouTube Data API v3" -> Credentials -> API key
# --------------------------------------------------------------------------

import os
import re
import threading
import time
from datetime import datetime, timedelta
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template
import requests

import config

load_dotenv()

app = Flask(__name__)

API_KEY = os.environ.get("YOUTUBE_API_KEY", "")
SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"

# Videos are fetched from YouTube once a day (at REFRESH_HOUR:00) and served
# out of this cache the rest of the time, instead of hitting the YouTube API
# on every page load. Set to 10 (not 1) because YouTube's daily quota resets
# around midnight Pacific Time, which is ~09:00-10:00 in this server's local
# timezone (UTC+2) - refreshing before that would just hit yesterday's
# still-exhausted quota.
REFRESH_HOUR = 10
cache_lock = threading.Lock()
CACHE = {"videos": [], "errors": [], "last_updated": None}


def safe_error_text(exc):
    """requests' exception messages include the full request URL, which
    contains our API key as a query param — strip it before this ever
    reaches a jsonify() response the browser can see."""
    return re.sub(r"key=[^&\s]+", "key=[REDACTED]", str(exc))

DESCRIPTION_MAX_LEN = 160


def trim_description(text):
    text = (text or "").strip().replace("\n", " ")
    if len(text) <= DESCRIPTION_MAX_LEN:
        return text
    return text[:DESCRIPTION_MAX_LEN].rsplit(" ", 1)[0] + "…"


def fetch_videos(category_label, language_label, search_query, language_code, region_code):
    """Search YouTube for one (category, language) pair and fetch stats for
    every result. The view-count floor is applied client-side (the bar in
    the UI), not here, so the cache holds the full range for users to filter
    themselves. Returns (videos, error) — error is None on success."""
    search_params = {
        "part": "snippet",
        "q": search_query,
        "type": "video",
        "maxResults": config.MAX_RESULTS,
        "order": "viewCount",
        "relevanceLanguage": language_code,
        "regionCode": region_code,
        "key": API_KEY,
    }

    tag = f"'{category_label}' / {language_label}"

    try:
        search_resp = requests.get(SEARCH_URL, params=search_params, timeout=10)
        search_resp.raise_for_status()
    except requests.RequestException as exc:
        return [], f"Search failed for {tag}: {safe_error_text(exc)}"

    items = search_resp.json().get("items", [])
    video_ids = [item["id"]["videoId"] for item in items if "videoId" in item.get("id", {})]

    if not video_ids:
        return [], None

    stats_params = {
        "part": "statistics,snippet",
        "id": ",".join(video_ids),
        "key": API_KEY,
    }

    try:
        stats_resp = requests.get(VIDEOS_URL, params=stats_params, timeout=10)
        stats_resp.raise_for_status()
    except requests.RequestException as exc:
        return [], f"Video-details failed for {tag}: {safe_error_text(exc)}"

    videos = []
    for item in stats_resp.json().get("items", []):
        views = int(item["statistics"].get("viewCount", 0))
        videos.append({
            "id": item["id"],
            "title": item["snippet"]["title"],
            "channel": item["snippet"]["channelTitle"],
            "description": trim_description(item["snippet"].get("description")),
            "thumbnail": item["snippet"]["thumbnails"]["high"]["url"],
            "views": views,
            "url": f"https://www.youtube.com/watch?v={item['id']}",
            "category": category_label,
            "language": language_label,
        })

    return videos, None


@app.route("/")
def index():
    return render_template(
        "index.html",
        min_views=config.MIN_VIEWS,
        categories=list(config.CATEGORIES.keys()),
        languages=list(config.LANGUAGES.keys()),
    )


@app.route("/api/videos")
def get_videos():
    if not API_KEY:
        return jsonify({
            "error": "No YouTube API key found. Set the YOUTUBE_API_KEY "
                     "environment variable before starting the server."
        }), 500

    with cache_lock:
        videos, errors = CACHE["videos"], CACHE["errors"]

    if not videos and errors:
        return jsonify({"error": " | ".join(errors)}), 502

    return jsonify({"videos": videos, "errors": errors})


def refresh_cache():
    """Call the YouTube API once for every (category, language) pair and
    store the results in CACHE. Runs at startup and then once a day at
    REFRESH_HOUR:00, via scheduler_loop."""
    all_videos = []
    errors = []

    for category_label, queries_by_lang in config.CATEGORIES.items():
        for language_label, lang_info in config.LANGUAGES.items():
            search_query = queries_by_lang.get(lang_info["code"])
            if not search_query:
                continue
            videos, error = fetch_videos(
                category_label,
                language_label,
                search_query,
                lang_info["code"],
                lang_info["region"],
            )
            all_videos.extend(videos)
            if error:
                errors.append(error)

    all_videos.sort(key=lambda v: v["views"], reverse=True)

    with cache_lock:
        # A run that mostly failed (e.g. YouTube quota hit partway through)
        # shouldn't wipe out a previous run's good results with a thin one.
        if errors and len(all_videos) < len(CACHE["videos"]):
            print(f"[cache] refresh at {datetime.now().isoformat()} got "
                  f"{len(all_videos)} videos with {len(errors)} errors - "
                  f"keeping previous {len(CACHE['videos'])}-video cache instead")
            return

        CACHE["videos"] = all_videos
        CACHE["errors"] = errors
        CACHE["last_updated"] = datetime.now().isoformat()

    print(f"[cache] refreshed at {CACHE['last_updated']}: "
          f"{len(all_videos)} videos, {len(errors)} errors")


def seconds_until_next_refresh():
    now = datetime.now()
    next_run = now.replace(hour=REFRESH_HOUR, minute=0, second=0, microsecond=0)
    if next_run <= now:
        next_run += timedelta(days=1)
    return (next_run - now).total_seconds()


def scheduler_loop():
    refresh_cache()
    while True:
        time.sleep(seconds_until_next_refresh())
        refresh_cache()


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5000"))
    debug = True

    # Werkzeug's debug reloader re-executes this module in a watcher process
    # before spawning the real worker (marked via WERKZEUG_RUN_MAIN) - only
    # start the background scheduler in the process that actually serves
    # requests, so it doesn't run twice.
    if not debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        threading.Thread(target=scheduler_loop, daemon=True).start()

    app.run(host=host, port=port, debug=debug)
