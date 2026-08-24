# Watchmark

A tiny website that lists YouTube videos (title, channel, description,
thumbnail, link) grouped into categories and languages, filtered to only
those above a view-count threshold you control.

## How it's organized

```
HitRadar/
├── config.py          ← the only file you need to edit to change categories/languages/threshold
├── app.py              ← Flask server, calls the YouTube Data API
├── .env                ← your YOUTUBE_API_KEY goes here (not committed to git)
├── requirements.txt
├── templates/
│   └── index.html
└── static/
    ├── style.css
    └── script.js
```

## 1. Get a YouTube Data API key (free)

1. Go to https://console.cloud.google.com/
2. Create a project (or pick an existing one)
3. APIs & Services → Library → search "YouTube Data API v3" → Enable
4. APIs & Services → Credentials → Create Credentials → API key
5. Copy the key

## 2. Install & run

```bash
pip install -r requirements.txt
```

Open `.env` in the project root and replace the placeholder with your real
key:

```
YOUTUBE_API_KEY=paste-your-key-here
```

`.env` is already listed in `.gitignore`, so it won't get committed if you
put this project under version control. Then:

```bash
python app.py
```

Open http://127.0.0.1:5000 in your browser.

### Opening it on your phone or another device

By default the server only answers on `127.0.0.1`, which is only reachable
from the same machine — a phone on your Wi-Fi can't see it. To test on a
phone, tablet, or another computer on the same network:

```bash
# macOS / Linux
HOST=0.0.0.0 python app.py

# Windows (PowerShell)
$env:HOST = "0.0.0.0"; python app.py
```

Then find this machine's local IP address (macOS: System Settings → Wi-Fi
→ Details, or run `ipconfig getifaddr en0` in Terminal; Windows: `ipconfig`
and look for "IPv4 Address") and open `http://<that-ip>:5000` on the other
device. Both devices need to be on the same network.

**Security note:** this runs Flask's debug server (`debug=True`), which
includes an interactive in-browser debugger — convenient for local
development, but a real risk if reachable by anyone untrusted, since it can
execute code. Only use `HOST=0.0.0.0` on a trusted home network, never on
public/shared Wi-Fi, and switch back to the default (no `HOST` set, or
`HOST=127.0.0.1`) when you're not actively testing on another device.

## 3. Change the view threshold

The bar is adjustable right on the page — type a number, drag, or scroll it,
no restart needed. `MIN_VIEWS` in `config.py` only sets where the bar sits
when the page first loads:

```python
MIN_VIEWS = 1_000_000
```

Change it to `2_000_000` (or anything else) and restart `python app.py` to
change that starting position.

## 4. Add, remove, or reword categories and languages

Also in `config.py`:

```python
LANGUAGES = {
    "English": {"code": "en", "region": "US"},
    "Turkish": {"code": "tr", "region": "TR"},
    "Dutch": {"code": "nl", "region": "NL"},
}

CATEGORIES = {
    "Music": {
        "en": "official music video",
        "tr": "resmi müzik videosu",
        "nl": "officiële muziekvideo",
    },
    ...
}
```

The server runs one YouTube search per **(category, language)** pair, using
the localized search term and biasing results toward that language via
YouTube's `relevanceLanguage`/`regionCode` params. The site's category and
language filter rows are both rebuilt from these dicts automatically —
filters combine, so you can view e.g. just the Turkish results within
Gaming.

To add a language: add an entry to `LANGUAGES`, then add a matching code
key to every entry in `CATEGORIES`. To add/reword a category: add or edit
an entry in `CATEGORIES` with one search term per language code in
`LANGUAGES`. Restart `python app.py` after editing.

## Notes

- The free YouTube API quota is 10,000 units/day. Each page load costs
  about 100 units *per (category, language) pair* (search) + a few more
  for video details. With the 8 default categories × 3 languages that's
  24 searches, roughly 2,400-2,700 units per load — well under the daily
  cap, but noticeably more than a single-language setup, so keep it in
  mind if you add more categories or languages.
- Descriptions shown on each card are pulled directly from YouTube's video
  description and trimmed to ~160 characters.
- A video can only end up under one (category, language) pair per page
  load — whichever search happened to surface it. If the same video is
  relevant to multiple categories, or matches more than one language's
  search, it'll only appear once, under whichever combination found it
  first.
- `relevanceLanguage` biases YouTube's ranking toward a language, it
  doesn't strictly guarantee every result is in that language — for very
  generic search terms you may occasionally see a stray result in another
  language.
