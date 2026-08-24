# config.py
# --------------------------------------------------------------------------
# All the settings you're likely to tweak live here, so you never have to
# touch app.py just to change a number, a category, or a language.
# --------------------------------------------------------------------------

# Starting position of the views bar in the UI. All fetched videos are sent
# to the browser regardless of view count — visitors can move the bar
# themselves (type a number, drag, or scroll) to filter live, no restart
# needed. This only sets where the bar sits when the page first loads.
MIN_VIEWS = 500_000

# Languages the site searches and filters by. The dict key is the label
# shown in the UI; "code" is the ISO language code sent to YouTube as
# relevanceLanguage, and "region" is the ISO country code sent as
# regionCode to further bias results toward that language's audience.
LANGUAGES = {
    "English": {"code": "en", "region": "US"},
    "Turkish": {"code": "tr", "region": "TR"},
    "Dutch": {"code": "nl", "region": "NL"},
}

# Categories shown on the site. Each category maps a language code (must
# match a "code" value in LANGUAGES above) to the YouTube search term used
# for that category in that language. The server runs one search per
# category *per language*, so every category needs an entry for every
# language in LANGUAGES — add, remove, or reword entries freely, the site
# rebuilds its filters from this automatically.
CATEGORIES = {
    "FedEx": {
        "en": "FedEx speech",
        "tr": "FedEx konuşması",
        "nl": "FedEx toespraak",
    },
    "Music": {
        "en": "official music video",
        "tr": "resmi müzik videosu",
        "nl": "officiële muziekvideo",
    },
    "Sport": {
        "en": "sports highlights",
        "tr": "spor özetleri",
        "nl": "sporthoogtepunten",
    },
    "Gaming": {
        "en": "gaming",
        "tr": "oyun videosu",
        "nl": "gaming",
    },
    "Technology": {
        "en": "tech review",
        "tr": "teknoloji incelemesi",
        "nl": "technologie review",
    },
    "News": {
        "en": "news today",
        "tr": "bugünkü haberler",
        "nl": "nieuws vandaag",
    },
    "Movies": {
        "en": "movie trailer",
        "tr": "film fragmanı",
        "nl": "filmtrailer",
    },
    "Comedy": {
        "en": "stand up comedy",
        "tr": "stand up komedi",
        "nl": "stand-up comedy",
    },
    "Education": {
        "en": "educational documentary",
        "tr": "eğitim belgeseli",
        "nl": "educatieve documentaire",
    },
}

# How many search results to pull per category *per language* from
# YouTube before filtering by views. (YouTube's API caps this at 50 per
# request.) Note: total search calls per page load = categories ×
# languages — see README.md for quota details.
MAX_RESULTS = 25
