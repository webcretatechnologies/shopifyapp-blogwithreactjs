import os
import re
import sys
import json
import time
import threading
import requests
from deep_translator import GoogleTranslator
from deep_translator.constants import MY_MEMORY_LANGUAGES_TO_CODES
from concurrent.futures import ThreadPoolExecutor

# ---------------------------
# CONFIG
# ---------------------------

# translate.google.com (the free, unofficial endpoint deep_translator scrapes) rate-limits
# by IP under concurrent load. At MAX_WORKERS=10 a single post's ~20+ fields hammered it hard
# enough that it started returning its own HTML error page ("Error 500 ... That's an error")
# instead of a translation for some chunks — and deep_translator doesn't validate the response,
# so that error page was returned as if it were the real translated text. Lower concurrency
# plus the retry/validation below fixes both the trigger and the symptom.
MAX_WORKERS = 3
MAX_TEXT_LENGTH = 5000
HTTP_TIMEOUT_SECONDS = 15
# Transient failures (timeout, connection error, HTTP 5xx/429) are retried a couple of times
# with a short, growing backoff before moving on to the next provider — enough to ride out a
# blip without stalling every string in a long article behind a struggling provider.
TRANSIENT_RETRIES = 2
TRANSIENT_RETRY_DELAY = 1.0

# deep_translator calls requests.get() with no timeout at all, so one stalled connection hangs
# its worker thread forever (and with it the whole run, until the Node route's hard kill).
# Its modules look up requests.get at call time, so defaulting a timeout here covers them.
_original_requests_get = requests.get
_original_requests_post = requests.post


def _with_timeout(fn):
    def wrapped(*args, **kwargs):
        kwargs.setdefault("timeout", HTTP_TIMEOUT_SECONDS)
        return fn(*args, **kwargs)
    return wrapped


requests.get = _with_timeout(_original_requests_get)
requests.post = _with_timeout(_original_requests_post)


def _env_flag(name, default=True):
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in ("0", "false", "no", "off", "")


# Shared state touched from several worker threads — every mutation goes through _lock.
# Output lines in particular must be written under it: print() writes the text and the newline
# separately, so two threads printing at once can interleave and corrupt the NDJSON stream.
_lock = threading.Lock()

# Every chunk that fails on every provider (and so is left as the original English) increments
# this. It is reported back so a partly untranslated post isn't shown as a full success.
_failed_translations = 0
_progress_count = 0


def _emit(obj):
    line = json.dumps(obj, ensure_ascii=False)
    with _lock:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


def _emit_progress(label, original, translated, cached, succeeded=True, provider=None):
    """One NDJSON line per finished string, flushed immediately. `original`/`translated` let the
    Node route persist the cache line by line (so an interrupted run keeps everything done so far)
    and let the browser fill each field in as soon as its text arrives. `succeeded=False` marks a
    failed-provider passthrough (translated == original) that must not be cached or shown as a
    translation. `provider` (additive, may be None) names whichever provider actually produced
    the translation — useful for the merchant-facing progress feed, never required downstream."""
    global _progress_count
    with _lock:
        _progress_count += 1
        count = _progress_count
    _emit({
        "type": "progress", "count": count, "label": label, "provider": provider,
        "original": original, "translated": translated, "cached": cached, "succeeded": succeeded,
    })


def _count_failure():
    global _failed_translations
    with _lock:
        _failed_translations += 1


# ---------------------------
# TRANSLATION PROVIDERS
# ---------------------------
# Chain: Google -> DeepL -> LibreTranslate -> MyMemory -> failed. Each provider is tried in turn
# for a given chunk; the first one to return a usable translation wins, and later providers in
# the list are never called. A provider that is disabled (missing config) or doesn't support the
# target language is skipped without being attempted. A provider that hits a run-wide failure
# (bad auth, quota exhausted, the target language isn't supported, the service is unreachable)
# disables itself for the rest of THIS run so later strings don't keep retrying something that's
# already known to be broken — matching the existing Google/MyMemory behavior this replaces.


class TransientProviderError(Exception):
    """Retry-worthy: timeout, connection error, HTTP 5xx, 429."""


class PermanentProviderError(Exception):
    """Not retry-worthy for this string, and usually not for the rest of the run either
    (bad API key, unsupported language, malformed request)."""


# A provider stuck in a systemic failure (IP-wide rate limit, an outage) fails the same way for
# every string in the article — without this, each new string retries it from zero, paying the
# full per-string retry+backoff cost again and again for a result already known for the rest of
# the run. This is what the old Google/MyMemory-specific "rate limited, skip to next provider for
# the rest of this run" flags did; auto-disable generalizes it to every provider in the chain.
CONSECUTIVE_FAILURES_BEFORE_AUTO_DISABLE = 3


class TranslationProvider:
    name = "provider"

    def __init__(self, enabled=True, disabled_reason=None):
        self.enabled = enabled
        self._disabled_reason = disabled_reason
        self._consecutive_transient_failures = 0
        if disabled_reason:
            print(f"[Translation] {self.name} disabled: {disabled_reason}", file=sys.stderr)

    def is_available(self):
        return self.enabled and self._disabled_reason is None

    def disable(self, reason):
        with _lock:
            if self._disabled_reason is None:
                self._disabled_reason = reason
                print(f"[Translation] {self.name} disabled for the rest of this run: {reason}", file=sys.stderr)

    def note_success(self):
        self._consecutive_transient_failures = 0

    def note_transient_failure(self):
        with _lock:
            self._consecutive_transient_failures += 1
            count = self._consecutive_transient_failures
        if count >= CONSECUTIVE_FAILURES_BEFORE_AUTO_DISABLE:
            self.disable(f"{count} strings in a row failed transiently (likely rate-limited or unreachable)")

    def supports_language(self, source, target):
        return True

    def translate(self, text, source, target):
        """Return translated text, or raise TransientProviderError / PermanentProviderError."""
        raise NotImplementedError


# Google's error page for this endpoint always contains this literal text, no matter what was
# being translated — a real translation into any language cannot legitimately contain it.
# Matched against ASCII-only markers with the apostrophe stripped, since Google's page uses a
# curly apostrophe (’) that a plain "'" substring check silently fails to match.
_GOOGLE_ERROR_PAGE_MARKERS = ("thats an error", "thats all we know", "error 500 (server error)")


def _looks_like_google_error_page(text):
    if not isinstance(text, str):
        return False
    normalized = text.replace("’", "").replace("'", "").lower()
    return any(m in normalized for m in _GOOGLE_ERROR_PAGE_MARKERS)


# Matches an HTML/XML-style tag: <g id="1">, </g>, <b>, <br/>, etc. Deliberately broad (any
# tag name) rather than special-cased to "<g>" specifically, since the point is "this plain-text
# request should never come back with ANY markup in it" — narrowing it to just DeepL's own known
# artifact would miss the same class of corruption from a different provider.
_MARKUP_TAG_RE = re.compile(r"</?[a-zA-Z][a-zA-Z0-9]*(?:\s[^<>]*)?/?>")


def _looks_like_leaked_markup(original, translated):
    """True when `translated` contains tag-like markup that wasn't in `original` — every chunk
    reaching a provider through do_translate() is plain text (translate_text() strips HTML down
    to individual text nodes/attributes before anything is sent out), so any `<...>` fragment
    appearing in the response is provider-side corruption, never a legitimate translation."""
    if not isinstance(translated, str) or not translated:
        return False
    if _MARKUP_TAG_RE.search(original or ""):
        return False  # original itself had markup-like text — not this function's problem to judge
    return bool(_MARKUP_TAG_RE.search(translated))


class GoogleProvider(TranslationProvider):
    name = "google"

    def translate(self, text, source, target):
        try:
            result = GoogleTranslator(source=source, target=target).translate(text)
        except Exception as e:
            message = str(e).lower()
            if "too many requests" in message or "429" in message or type(e).__name__ == "TooManyRequests":
                raise TransientProviderError(str(e)) from e
            # deep_translator's actual wording for this (verified live) is "no support for the
            # provided language" — "not supported" alone never matched it, so an unsupported
            # target language was wastefully retried as transient instead of failing fast.
            if "no support" in message or "not supported" in message or ("invalid" in message and "language" in message):
                raise PermanentProviderError(str(e)) from e
            raise TransientProviderError(str(e)) from e
        if not result or _looks_like_google_error_page(result):
            raise TransientProviderError("empty or rate-limit response")
        return result


class DeepLProvider(TranslationProvider):
    name = "deepl"

    # DeepL's officially supported target codes (source is always left as "EN"). Region-specific
    # variants are pinned to DeepL's own preferred default (e.g. bare "pt"/"zh" below) so a
    # locale like "en" still resolves instead of being treated as unsupported.
    _TARGETS = {
        "bg": "BG", "cs": "CS", "da": "DA", "de": "DE", "el": "EL", "en": "EN-US",
        "en-us": "EN-US", "en-gb": "EN-GB", "es": "ES", "et": "ET", "fi": "FI", "fr": "FR",
        "hu": "HU", "id": "ID", "it": "IT", "ja": "JA", "ko": "KO", "lt": "LT", "lv": "LV",
        "nb": "NB", "nl": "NL", "pl": "PL", "pt": "PT-PT", "pt-pt": "PT-PT", "pt-br": "PT-BR",
        "ro": "RO", "ru": "RU", "sk": "SK", "sl": "SL", "sv": "SV", "tr": "TR", "uk": "UK",
        "zh": "ZH-HANS", "zh-cn": "ZH-HANS", "zh-hans": "ZH-HANS", "zh-tw": "ZH-HANT", "zh-hant": "ZH-HANT",
        "ar": "AR",
    }

    def __init__(self):
        api_key = os.environ.get("DEEPL_API_KEY", "").strip()
        enabled = _env_flag("TRANSLATION_DEEPL_ENABLED", True) and bool(api_key)
        reason = None if enabled else ("missing DEEPL_API_KEY" if _env_flag("TRANSLATION_DEEPL_ENABLED", True) else "disabled via TRANSLATION_DEEPL_ENABLED")
        super().__init__(enabled=enabled, disabled_reason=reason)
        self.api_key = api_key
        # DeepL's convention: free-tier keys end in ":fx" and must hit the separate free API host.
        self.base_url = "https://api-free.deepl.com/v2/translate" if api_key.endswith(":fx") else "https://api.deepl.com/v2/translate"

    def supports_language(self, source, target):
        return self._resolve(target) is not None

    def _resolve(self, target):
        key = (target or "").strip().lower().replace("_", "-")
        if key in self._TARGETS:
            return self._TARGETS[key]
        base = key.split("-")[0]
        return self._TARGETS.get(base)

    def translate(self, text, source, target):
        target_code = self._resolve(target)
        if not target_code:
            raise PermanentProviderError(f"unsupported target language '{target}'")
        try:
            response = requests.post(
                self.base_url,
                headers={"Authorization": f"DeepL-Auth-Key {self.api_key}"},
                data={"text": text, "target_lang": target_code, "source_lang": "EN"},
            )
        except requests.exceptions.RequestException as e:
            raise TransientProviderError(str(e)) from e

        if response.status_code == 403:
            raise PermanentProviderError("authentication failed (check DEEPL_API_KEY)")
        if response.status_code == 456:
            raise PermanentProviderError("quota exceeded")
        if response.status_code == 429:
            raise TransientProviderError("HTTP 429 (rate limited)")
        if response.status_code >= 500:
            raise TransientProviderError(f"HTTP {response.status_code}")
        if response.status_code != 200:
            raise PermanentProviderError(f"HTTP {response.status_code}: {response.text[:200]}")

        translations = (response.json() or {}).get("translations") or []
        result = (translations[0].get("text") if translations else "") or ""
        if not result.strip():
            raise TransientProviderError("empty response")
        return result


class LibreTranslateProvider(TranslationProvider):
    name = "libretranslate"

    # A handful of Shopify-style locale codes have no exact or base-code match against
    # LibreTranslate/Argos Translate's own codes — verified live against a running instance
    # (LT_LOAD_ONLY=...,zh loads as "zh-Hans", but Shopify's Chinese locale is "zh"/"zh-CN").
    # Without this, that language is silently treated as unsupported and skipped even though
    # the model is loaded and working. Only overrides the cases known to mismatch; anything
    # else still resolves generically in _resolve() below.
    _ALIASES = {
        "zh": "zh-hans", "zh-cn": "zh-hans", "zh-hans": "zh-hans",
        "zh-tw": "zh-hant", "zh-hant": "zh-hant",
        "pt-br": "pt", "pt-pt": "pt",
        # Shopify's actual locale code for Norwegian is "no"; Argos Translate/LibreTranslate
        # only has a package for "nb" (Bokmål) — verified live against the running instance's
        # package index (2026-09-24), no generic "no" package exists at all. Without this, a
        # store with Norwegian published would see LibreTranslate silently report "unsupported"
        # despite the model being loaded and working.
        "no": "nb",
    }

    def __init__(self):
        url = os.environ.get("LIBRETRANSLATE_URL", "").strip().rstrip("/")
        enabled = _env_flag("TRANSLATION_LIBRETRANSLATE_ENABLED", True) and bool(url)
        reason = None if enabled else ("LIBRETRANSLATE_URL not set" if _env_flag("TRANSLATION_LIBRETRANSLATE_ENABLED", True) else "disabled via TRANSLATION_LIBRETRANSLATE_ENABLED")
        super().__init__(enabled=enabled, disabled_reason=reason)
        self.url = url
        self.api_key = os.environ.get("LIBRETRANSLATE_API_KEY", "").strip()
        self._languages = None  # fetched once, lazily — see supports_language

    def _fetch_languages(self):
        if self._languages is not None:
            return self._languages
        try:
            response = requests.get(f"{self.url}/languages")
            response.raise_for_status()
            self._languages = {row.get("code", "").lower() for row in response.json() or []}
        except Exception as e:
            # The instance this env var points at isn't reachable at all (e.g. the optional
            # docker-compose service isn't running) — that's a run-wide problem, not a
            # per-string one, so stop trying it instead of failing every remaining string.
            self.disable(f"unreachable ({e})")
            self._languages = set()
        return self._languages

    def _resolve(self, target):
        key = (target or "").strip().lower().replace("_", "-")
        languages = self._fetch_languages()
        if key in languages:
            return key
        alias = self._ALIASES.get(key)
        if alias and alias in languages:
            return alias
        base = key.split("-")[0]
        if base in languages:
            return base
        return None

    def supports_language(self, source, target):
        return self._resolve(target) is not None

    def translate(self, text, source, target):
        target_code = self._resolve(target)
        if not target_code:
            raise PermanentProviderError(f"unsupported target language '{target}'")
        payload = {"q": text, "source": "en", "target": target_code, "format": "text"}
        if self.api_key:
            payload["api_key"] = self.api_key
        try:
            response = requests.post(f"{self.url}/translate", json=payload)
        except requests.exceptions.RequestException as e:
            raise TransientProviderError(str(e)) from e

        if response.status_code == 429:
            raise TransientProviderError("HTTP 429 (rate limited)")
        if response.status_code >= 500:
            raise TransientProviderError(f"HTTP {response.status_code}")
        if response.status_code != 200:
            raise PermanentProviderError(f"HTTP {response.status_code}: {response.text[:200]}")

        result = ((response.json() or {}).get("translatedText") or "").strip()
        if not result:
            raise TransientProviderError("empty response")
        return result


class _MyMemoryQuotaExhausted(PermanentProviderError):
    pass


class MyMemoryProvider(TranslationProvider):
    name = "mymemory"

    _URL = "https://api.mymemory.translated.net/get"
    # Each individual MyMemory query is capped at 500 bytes, far below MAX_TEXT_LENGTH, so
    # translate() re-chunks internally — from the chain's point of view it's just one string in,
    # one string out, same as every other provider.
    _MAX_CHUNK = 450
    _SOURCE = "en-GB"  # this app's content is always authored in English; MyMemory has no "auto"

    # MyMemory only accepts full "xx-XX" codes, and guessing them is wrong surprisingly often
    # ("gu" -> "gu-GU" is invalid; the real code is "gu-IN"). Codes are resolved against
    # MyMemory's own published language table (shipped with deep_translator); this map only
    # pins the preferred regional variant for base codes where that table's first alphabetical
    # match isn't the obvious one (e.g. "fr" would otherwise resolve to Belgian French).
    _PREFERRED_CODES = {
        "en": "en-GB", "fr": "fr-FR", "de": "de-DE", "es": "es-ES", "it": "it-IT",
        "pt": "pt-PT", "nl": "nl-NL", "sv": "sv-SE", "no": "nb-NO", "nb": "nb-NO",
        "zh": "zh-CN", "zh-hans": "zh-CN", "zh-hant": "zh-TW", "ar": "ar-SA",
        "sr": "sr-Cyrl-RS", "ms": "ms-MY", "ta": "ta-IN", "fil": "fil-PH", "tl": "tl-PH",
    }
    _CODES = list(dict.fromkeys(MY_MEMORY_LANGUAGES_TO_CODES.values()))

    def __init__(self):
        enabled = _env_flag("TRANSLATION_MYMEMORY_ENABLED", True)
        reason = None if enabled else "disabled via TRANSLATION_MYMEMORY_ENABLED"
        super().__init__(enabled=enabled, disabled_reason=reason)
        # Anonymous MyMemory use is capped at ~5,000 chars/day per IP; a contact email
        # (MyMemory's "de" parameter) raises that to ~50,000/day.
        self.email = os.environ.get("MYMEMORY_EMAIL", "").strip()

    def _resolve(self, target):
        key = (target or "").strip().lower().replace("_", "-")
        if not key:
            return None
        if key in self._PREFERRED_CODES:
            return self._PREFERRED_CODES[key]
        for code in self._CODES:
            if code.lower() == key:
                return code
        base = key.split("-")[0]
        if base in self._PREFERRED_CODES:
            return self._PREFERRED_CODES[base]
        for code in self._CODES:
            if code.lower().split("-")[0] == base:
                return code
        return None

    def supports_language(self, source, target):
        return self._resolve(target) is not None

    def _request(self, chunk, target_code):
        params = {"q": chunk, "langpair": f"{self._SOURCE}|{target_code}"}
        if self.email:
            params["de"] = self.email
        try:
            response = requests.get(self._URL, params=params)
        except requests.exceptions.RequestException as e:
            raise TransientProviderError(str(e)) from e
        if response.status_code == 429:
            raise TransientProviderError("HTTP 429 (rate limited)")
        if response.status_code >= 500:
            raise TransientProviderError(f"HTTP {response.status_code}")
        if response.status_code != 200:
            raise PermanentProviderError(f"HTTP {response.status_code}")
        data = response.json()
        text = ((data.get("responseData") or {}).get("translatedText") or "").strip()
        try:
            status = int(data.get("responseStatus") or 200)
        except (TypeError, ValueError):
            status = 200
        if data.get("quotaFinished") or "MYMEMORY WARNING" in text.upper():
            raise _MyMemoryQuotaExhausted("the free daily translation limit has been reached")
        if status != 200 or not text:
            raise TransientProviderError(f"responseStatus {status}: {text or data.get('responseDetails')}")
        return text

    def translate(self, text, source, target):
        target_code = self._resolve(target)
        if not target_code:
            raise PermanentProviderError(f"unsupported target language '{target}'")
        parts = []
        for chunk in split_text(text, max_length=self._MAX_CHUNK):
            parts.append(self._request(chunk, target_code))
        return " ".join(parts)


# Order defines the fallback chain: the first available, language-supporting provider to
# succeed for a given chunk wins, and providers after it in this list are never called for
# that chunk. Google is always first; MyMemory is always last, matching the existing behavior
# this replaces. The app keeps working with only Google + MyMemory configured — DeepL and
# LibreTranslate quietly disable themselves (see each __init__) when their config is absent.
PROVIDERS = [
    GoogleProvider(enabled=_env_flag("TRANSLATION_GOOGLE_ENABLED", True)),
    DeepLProvider(),
    LibreTranslateProvider(),
    MyMemoryProvider(),
]


# ---------------------------
# ARGUMENTS / INPUT
# ---------------------------

if len(sys.argv) < 2:
    _emit({"success": False, "message": "Usage: python translate.py target_language < input.json"})
    sys.exit(1)

target_lang = sys.argv[1]
SOURCE_LANG = "auto"

# Input shape: { "sourceData": {...title/excerpt/contentHtml/etc...}, "existingTranslations":
# {originalString: translatedString, ...} }. existingTranslations is the cache a previous,
# possibly-interrupted run built up (see the Node route) — reusing it is what lets a run
# resume from where it broke instead of re-translating (and re-spending rate-limit budget on)
# strings already done.
try:
    payload = json.load(sys.stdin)
    data = payload.get("sourceData", {})
    existing_translations = payload.get("existingTranslations") or {}
except Exception as e:
    _emit({"success": False, "message": str(e)})
    sys.exit(1)

# ---------------------------
# HELPERS
# ---------------------------

def split_text(text, max_length=MAX_TEXT_LENGTH):
    chunks = []

    while len(text) > max_length:
        split_index = text[:max_length].rfind(" ")

        if split_index == -1:
            split_index = max_length

        chunks.append(text[:split_index])
        text = text[split_index:].strip()

    if text:
        chunks.append(text)

    return chunks


def _try_provider(provider, chunk):
    """Attempt one provider for one chunk, retrying transient failures a couple of times.
    Returns the translated text on success, or None (try the next provider) on failure."""
    if not provider.is_available():
        # Set by note_transient_failure() below, possibly by another thread since the last
        # check in _translate_one_chunk — re-check right before spending a request on it.
        return None
    for attempt in range(1, TRANSIENT_RETRIES + 1):
        try:
            result = provider.translate(chunk, SOURCE_LANG, target_lang)
            if _looks_like_leaked_markup(chunk, result):
                # Real, observed failure mode: DeepL (and possibly others) can return internal
                # tag-reinsertion artifacts like `<g id="1">...</g>` even for a plain-text
                # request with no markup in it at all — verified against a real cached
                # translation ("Gir National Park" -> "ગીર રાષ્ટ્રીય ઉ<g id=\"1\">દ્યા</g>ન").
                # do_translate's chunks reaching here are always plain text (HTML content is
                # walked node-by-node before it gets here), so ANY tag-like fragment in the
                # output that wasn't in the input is corruption, not a legitimate translation —
                # treat it as a failed attempt rather than caching/returning broken text.
                print(f"[Translation] {provider.name} returned markup-corrupted text for a plain-text request (attempt {attempt}/{TRANSIENT_RETRIES}) — discarding", file=sys.stderr)
                if attempt < TRANSIENT_RETRIES:
                    time.sleep(TRANSIENT_RETRY_DELAY * attempt)
                continue
            provider.note_success()
            return result
        except PermanentProviderError as e:
            # Not worth retrying this string, and — since target_lang is fixed for the whole
            # run — usually not worth trying again for any later string either.
            provider.disable(str(e))
            print(f"[Translation] {provider.name} failed permanently: {e}", file=sys.stderr)
            return None
        except TransientProviderError as e:
            print(f"[Translation] {provider.name} failed (attempt {attempt}/{TRANSIENT_RETRIES}): {e}", file=sys.stderr)
            if attempt < TRANSIENT_RETRIES:
                time.sleep(TRANSIENT_RETRY_DELAY * attempt)
        except Exception as e:
            # A provider that raises something other than the two typed errors above is a bug
            # in that provider, not a signal to crash the whole translation run over one string.
            print(f"[Translation] {provider.name} raised an unexpected error: {e}", file=sys.stderr)
            return None
    # Every retry for this string was transient — count it toward this run's systemic-failure
    # tally (see note_transient_failure) so a provider that's rate-limited/down for the whole
    # run gets skipped for later strings instead of paying this same retry cost every time.
    provider.note_transient_failure()
    return None


def _translate_one_chunk(chunk):
    """Try each available, language-supporting provider in the PROVIDERS chain in order; the
    first to succeed wins and later providers are not called. Returns (result, succeeded,
    provider_name)."""
    for provider in PROVIDERS:
        if not provider.is_available():
            continue
        if not provider.supports_language(SOURCE_LANG, target_lang):
            print(f"[Translation] {provider.name} doesn't support '{target_lang}' — skipping", file=sys.stderr)
            continue
        result = _try_provider(provider, chunk)
        if result:
            print(f"[Translation] {provider.name} succeeded", file=sys.stderr)
            return result, True, provider.name
    print(f"[Translation] all providers failed for string: {chunk[:80]!r}", file=sys.stderr)
    _count_failure()
    return chunk, False, None


# Strings that came from a previous run's cache (vs. ones translated earlier in THIS run), so
# progress can say "reused from a previous run" only when that's actually true.
_preexisting_keys = set(existing_translations.keys())

# The same string often appears several times in one post (the title doubles as the meta title
# and the hero heading, headings reappear in the table of contents, ...) and those copies are
# frequently translated at the same moment on different threads. With the free providers' tight
# daily quotas, every duplicate request is budget wasted — so a string already being translated
# makes later requests for it wait for that result instead of calling the API again.
_inflight = {}


def do_translate(text_chunk, label="Content"):
    """The single funnel every plain-text string in the document passes through — top-level
    fields and every node/attribute inside contentHtml bottom out here — so progress streaming,
    resumable caching and duplicate suppression all live in this one place."""
    with _lock:
        cached = existing_translations.get(text_chunk)
        in_flight = _inflight.get(text_chunk) if cached is None else None
        is_owner = cached is None and in_flight is None
        if is_owner:
            in_flight = threading.Event()
            _inflight[text_chunk] = in_flight

    if in_flight is not None and not is_owner:
        in_flight.wait()
        with _lock:
            cached = existing_translations.get(text_chunk)
        if cached is None:
            # The request we waited on failed; don't spend more quota retrying the same string
            # this run — the next Auto-Translate click will retry it. Returning the English
            # original here (instead of "") would silently show untranslated English as if it
            # were the translation — the merchant must see blank, matching the failed path below.
            _count_failure()
            _emit_progress(label, text_chunk, "", cached=False, succeeded=False)
            return ""

    if cached is not None and cached != text_chunk:
        _emit_progress(label, text_chunk, cached, cached=text_chunk in _preexisting_keys, provider="cache")
        return cached

    try:
        results = []
        all_succeeded = True
        providers_used = []
        for chunk in split_text(text_chunk):
            result, succeeded, provider_name = _translate_one_chunk(chunk)
            results.append(result)
            all_succeeded = all_succeeded and succeeded
            if provider_name and provider_name not in providers_used:
                providers_used.append(provider_name)
        provider_label = "+".join(providers_used) if providers_used else None

        # A provider failure must never surface as the untranslated English original — that's
        # indistinguishable from a real translation and is exactly how a merchant ends up with
        # English text sitting in a translated field with no indication anything went wrong.
        # When every provider failed, the merchant sees blank (see translate.jsx/posts.js, which
        # both already treat an empty value + succeeded=false as "not translated" rather than
        # falling back to source) — never the source text standing in for a translation.
        translated = " ".join(results) if all_succeeded else ""

        # Only cache a translation we're confident is real — caching a failed passthrough would
        # make the failure permanent, since a resumed run would treat it as "already done".
        if all_succeeded:
            with _lock:
                existing_translations[text_chunk] = translated
    finally:
        if is_owner:
            with _lock:
                _inflight.pop(text_chunk, None)
            in_flight.set()

    _emit_progress(label, text_chunk, translated, cached=False, succeeded=all_succeeded, provider=provider_label)
    return translated


# Builder blocks are stored as empty <div data-type="..." data-<field>="..."> wrapper divs —
# ALL real user-facing text lives in these attributes, not as visible HTML text nodes (see
# injectBlockIdentity()/_blockToDataHtml() on the JS side, which produce exactly this shape).
# FLAT_TEXT_ATTRS are known free-form text fields safe to translate directly; JSON_TEXT_KEYS are
# the specific keys worth translating *within* a JSON-encoded attribute value (e.g. data-items on
# a FAQ block) — deliberately narrow, since blindly translating every string in a JSON blob would
# corrupt colors, IDs, handles, prices, and URLs.
# NOTE: translate.jsx mirrors these three sets (and the walk in translate_text) to fill fields in
# live as strings arrive — keep both sides in sync.
FLAT_TEXT_ATTRS = {
    "data-text", "data-title", "data-caption", "data-alt", "data-subheading",
    "data-heading", "data-button-text", "data-buttontext", "data-badge",
    "data-description", "data-question", "data-answer", "data-label",
    # HeroSection's CTA button label (settings.ctaText) — verified missing via a full audit of
    # every text-bearing setting key against this set (2026-09-24): it's the only genuine text
    # field BlockRegistry defines that wasn't covered here, which is why a HeroSection's button
    # label silently stayed English — its real rendered <a> text node WAS translated, but
    # extractBlocksFromPost() reconstructs block settings from data-* attributes, not the
    # rendered markup, so the untranslated attribute is what the merchant actually saw.
    "data-cta-text",
}
# data-content (RichText's own field) holds raw HTML, not plain text — it needs the full
# recursive translate_text() path, not do_translate().
HTML_ATTRS = {"data-content"}
JSON_TEXT_KEYS = {
    "text", "title", "content", "caption", "alt", "subheading", "heading",
    "buttonText", "badge", "description", "question", "answer", "name", "label",
}
ATTR_LABELS = {"data-alt": "alt text", "data-button-text": "button text", "data-buttontext": "button text", "data-cta-text": "button text"}


def _humanize_block_type(block_type):
    spaced = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", block_type or "")
    return spaced[:1].upper() + spaced[1:].lower() if spaced else "Content"


def _attr_label(attr_name):
    return ATTR_LABELS.get(attr_name, attr_name.replace("data-", "").replace("-", " "))


def _looks_like_html(text):
    return "<" in text and ">" in text


def _translatable_text_nodes(soup):
    from bs4 import Comment
    nodes = []
    for element in soup.find_all(string=True):
        if isinstance(element, Comment) or element.parent.name in ("script", "style"):
            continue
        if element.string and element.string.strip():
            nodes.append(element)
    return nodes


def _translatable_attrs(soup):
    """(tag, attr_name, value, kind, block_label) for every attribute translate_text rewrites."""
    owners = []
    for tag in soup.find_all(True):
        block_label = _humanize_block_type(tag.attrs.get("data-type")) if tag.attrs.get("data-type") else "Content"
        for attr_name, value in list(tag.attrs.items()):
            if not isinstance(value, str) or not value.strip():
                continue
            if attr_name in HTML_ATTRS:
                owners.append((tag, attr_name, value, "html", block_label))
            elif attr_name in FLAT_TEXT_ATTRS:
                owners.append((tag, attr_name, value, "flat", block_label))
            elif value.startswith("{") or value.startswith("["):
                try:
                    parsed = json.loads(value)
                except Exception:
                    continue
                owners.append((tag, attr_name, parsed, "json", block_label))
    return owners


def translate_json_value(obj, block_label="Content"):
    if isinstance(obj, dict):
        result = {}
        for k, v in obj.items():
            if isinstance(v, str) and k in JSON_TEXT_KEYS and v.strip():
                result[k] = translate_text(v, label=f"{block_label} · {k}")
            elif isinstance(v, (dict, list)):
                result[k] = translate_json_value(v, block_label)
            else:
                result[k] = v
        return result
    elif isinstance(obj, list):
        # A bare string inside a list has no key to gate against JSON_TEXT_KEYS — list-of-strings
        # shapes in this app (e.g. table rows) are always pure user text, so each is translated.
        return [
            translate_text(item, label=block_label) if isinstance(item, str) and item.strip()
            else translate_json_value(item, block_label) if isinstance(item, (dict, list))
            else item
            for item in obj
        ]
    return obj


def translate_text(text, label="Content"):
    if not isinstance(text, str) or not text.strip():
        return text

    # Bound to whatever BeautifulSoup instance exists at the point of failure (see except below)
    # so a bug partway through a large document degrades to "whatever was already translated,
    # structure intact" instead of either the full English original OR a blanked-out article.
    soup = None
    try:
        if _looks_like_html(text):
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(text, "html.parser")

            text_nodes = _translatable_text_nodes(soup)
            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
                translated_texts = list(executor.map(lambda node: do_translate(node.string, label=label), text_nodes))
            for node, translated in zip(text_nodes, translated_texts):
                node.replace_with(translated)

            for tag, attr_name, value, kind, block_label in _translatable_attrs(soup):
                if kind == "flat":
                    tag[attr_name] = do_translate(value, label=f"{block_label} · {_attr_label(attr_name)}")
                elif kind == "html":
                    tag[attr_name] = translate_text(value, label=block_label)
                else:
                    tag[attr_name] = json.dumps(translate_json_value(value, block_label), ensure_ascii=False)

            return str(soup)

        return do_translate(text, label=label)

    except Exception as e:
        # A code-level bug here (not a provider failure — those are already handled inside
        # do_translate and never raise) must still never surface as "the English original,
        # silently standing in for a translation." But for an HTML document, blanking the
        # WHOLE thing is its own failure mode the task explicitly warns against — an unrelated
        # bug three paragraphs in would otherwise wipe an entire, mostly-fine translated
        # article. `soup` is mutated in place as each node/attribute is translated above, so
        # returning its current state (structure intact, whatever finished before the
        # exception already replaced) is the safest available degradation. Only when there was
        # no HTML structure to begin with (a bug on the plain-text path, or the parse itself
        # failing) is there nothing safe to return but blank.
        print(f"Error translating: {e}", file=sys.stderr)
        _count_failure()
        return str(soup) if soup is not None else ""


# Same walk as translate_text, counting the do_translate() calls it will make, so the browser
# can show "N of total" instead of an open-ended counter.
def _count_json_units(obj):
    if isinstance(obj, dict):
        return sum(
            _count_units(v) if isinstance(v, str) and k in JSON_TEXT_KEYS and v.strip()
            else _count_json_units(v) if isinstance(v, (dict, list)) else 0
            for k, v in obj.items()
        )
    if isinstance(obj, list):
        return sum(
            _count_units(item) if isinstance(item, str) and item.strip()
            else _count_json_units(item) if isinstance(item, (dict, list)) else 0
            for item in obj
        )
    return 0


def _count_units(text):
    if not isinstance(text, str) or not text.strip():
        return 0
    if not _looks_like_html(text):
        return 1
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(text, "html.parser")
    except Exception:
        return 1
    total = len(_translatable_text_nodes(soup))
    for _tag, _attr_name, value, kind, _block_label in _translatable_attrs(soup):
        if kind == "flat":
            total += 1
        elif kind == "html":
            total += _count_units(value)
        else:
            total += _count_json_units(value)
    return total


# ---------------------------
# TRANSLATE
# ---------------------------

FIELD_LABELS = {"title": "Title", "excerpt": "Excerpt", "contentHtml": "Content", "metaTitle": "Meta title", "metaDescription": "Meta description"}

# sourceData (see posts.js) is always a flat {title, excerpt, contentHtml, metaTitle,
# metaDescription} dict of plain strings, so each key is translated directly with its own label.
field_keys = [k for k, v in data.items() if isinstance(v, str) and v.strip()]

_emit({"type": "plan", "total": sum(_count_units(data[k]) for k in field_keys)})

with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
    translated_field_values = list(
        executor.map(lambda k: translate_text(data[k], label=FIELD_LABELS.get(k, k)), field_keys)
    )

translated_json = dict(data)
for key, value in zip(field_keys, translated_field_values):
    translated_json[key] = value

# Surfaced as a warning to the merchant when at least one provider was tried and lost — e.g.
# "deepl: quota exceeded", "libretranslate: unreachable (...)". Only reported once providers
# actually ran (some strings failed); a clean run with everything succeeding reports nothing.
_disabled_notices = [f"{p.name}: {p._disabled_reason}" for p in PROVIDERS if p._disabled_reason and p.enabled]

# Final NDJSON line — everything before this was "plan"/"progress". The Node route reads the
# stream until it sees "type": "done", persists this, and closes the response to the browser.
_emit({
    "type": "done",
    "translatedJson": translated_json,
    "failures": _failed_translations,
    "notice": "; ".join(_disabled_notices) if _failed_translations and _disabled_notices else None,
    "cache": existing_translations,
})
