import sys
import json
from deep_translator import GoogleTranslator
from concurrent.futures import ThreadPoolExecutor

# ---------------------------
# CONFIG
# ---------------------------

MAX_WORKERS = 10
MAX_TEXT_LENGTH = 5000

# ---------------------------
# ARGUMENTS
# ---------------------------

if len(sys.argv) < 2:
    print(
        json.dumps(
            {
                "success": False,
                "message": "Usage: python translate.py target_language < input.json"
            }
        )
    )
    sys.exit(1)

target_lang = sys.argv[1]

# ---------------------------
# LOAD JSON
# ---------------------------

try:
    data = json.load(sys.stdin)
except Exception as e:
    print(
        json.dumps(
            {
                "success": False,
                "message": str(e)
            }
        )
    )
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


def do_translate(text_chunk):
    try:
        chunks = split_text(text_chunk)
        translated_chunks = []
        translator = GoogleTranslator(source="auto", target=target_lang)
        for chunk in chunks:
            res = translator.translate(chunk)
            translated_chunks.append(res if res is not None else chunk)
        return " ".join(translated_chunks)
    except Exception as e:
        # Previously silent — a failed/rate-limited translation request would fall back to the
        # original text with zero indication anywhere that it happened, making a real failure
        # indistinguishable from "this string just didn't need translating." Log it so failures
        # are at least visible in the server's stderr instead of invisibly degrading the output.
        print(f"do_translate failed for chunk (len={len(text_chunk)}): {e}", file=sys.stderr)
        return text_chunk


# Builder blocks are stored as empty <div data-type="..." data-<field>="..."> wrapper divs —
# ALL real user-facing text lives in these attributes, not as visible HTML text nodes (see
# injectBlockIdentity()/_blockToDataHtml() on the JS side, which produce exactly this shape).
# A translator that only walks string-typed HTML nodes therefore finds nothing to translate
# inside them. FLAT_TEXT_ATTRS are known free-form text fields safe to translate directly;
# JSON_TEXT_KEYS are the specific keys worth translating *within* a JSON-encoded attribute
# value (e.g. data-items on a FAQ block, or data-product) — deliberately narrow, since blindly
# translating every string in a JSON blob would corrupt colors, IDs, handles, prices, and URLs.
FLAT_TEXT_ATTRS = {
    "data-text", "data-title", "data-caption", "data-alt", "data-subheading",
    "data-heading", "data-button-text", "data-buttontext", "data-badge",
    "data-description", "data-question", "data-answer", "data-label",
}
# data-content (RichText's own field) holds raw HTML, not plain text — a plain-text translate
# call would mangle or strip its tags. It needs the full recursive translate_text() path (same
# HTML-node-walking logic used for the top-level contentHtml string), not do_translate().
HTML_ATTRS = {"data-content"}
JSON_TEXT_KEYS = {
    "text", "title", "content", "caption", "alt", "subheading", "heading",
    "buttonText", "badge", "description", "question", "answer", "name", "label",
}


def translate_json_value(obj):
    if isinstance(obj, dict):
        result = {}
        for k, v in obj.items():
            if isinstance(v, str) and k in JSON_TEXT_KEYS and v.strip():
                result[k] = translate_text(v)
            elif isinstance(v, (dict, list)):
                result[k] = translate_json_value(v)
            else:
                result[k] = v
        return result
    elif isinstance(obj, list):
        # A bare string inside a list (not a dict) has no key to gate against
        # JSON_TEXT_KEYS — unlike object fields, list-of-strings/list-of-lists shapes in
        # this app (e.g. data-table-data's table rows) are always pure user text with no
        # metadata mixed in, so every string leaf is safe to translate directly.
        return [
            translate_text(item) if isinstance(item, str) and item.strip()
            else translate_json_value(item) if isinstance(item, (dict, list))
            else item
            for item in obj
        ]
    return obj


def translate_text(text):
    if not isinstance(text, str):
        return text

    if not text.strip():
        return text

    try:
        # Check if the string looks like HTML
        if "<" in text and ">" in text:
            from bs4 import BeautifulSoup, Comment
            soup = BeautifulSoup(text, "html.parser")

            translatable_elements = []
            texts_to_translate = []

            # Translate visible string nodes (real prose inside RichText/Callout/etc).
            for element in soup.find_all(string=True):
                if isinstance(element, Comment):
                    continue
                if element.parent.name in ['script', 'style']:
                    continue
                original_text = element.string
                if original_text and original_text.strip():
                    translatable_elements.append(element)
                    texts_to_translate.append(original_text)

            # Translate the builder's own data-* attributes — this is what actually holds
            # Heading/FaqBlock/Image/etc. text, since those divs have no visible child text.
            attr_owners = []  # (tag, attr_name, original_value)
            for tag in soup.find_all(True):
                for attr_name, value in list(tag.attrs.items()):
                    if not isinstance(value, str) or not value.strip():
                        continue
                    if attr_name in HTML_ATTRS:
                        attr_owners.append((tag, attr_name, value, "html"))
                    elif attr_name in FLAT_TEXT_ATTRS:
                        attr_owners.append((tag, attr_name, value, "flat"))
                    elif value.startswith("{") or value.startswith("["):
                        try:
                            parsed = json.loads(value)
                        except Exception:
                            continue
                        attr_owners.append((tag, attr_name, parsed, "json"))

            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
                translated_texts = list(executor.map(do_translate, texts_to_translate))

            for element, translated in zip(translatable_elements, translated_texts):
                element.replace_with(translated)

            for tag, attr_name, value, kind in attr_owners:
                if kind == "flat":
                    tag[attr_name] = do_translate(value)
                elif kind == "html":
                    tag[attr_name] = translate_text(value)
                else:
                    tag[attr_name] = json.dumps(translate_json_value(value), ensure_ascii=False)

            # Return the modified HTML as a string
            return str(soup)

        else:
            # Plain text translation
            chunks = split_text(text)
            translated_chunks = []
            translator = GoogleTranslator(source="auto", target=target_lang)
            for chunk in chunks:
                res = translator.translate(chunk)
                translated_chunks.append(res if res is not None else chunk)
            return " ".join(translated_chunks)

    except Exception as e:
        # sys is already imported at module level (line 1) — a local "import sys" here used
        # to shadow it, which makes Python treat `sys` as a local name for this ENTIRE
        # function (locals are determined at compile time, regardless of whether this line
        # actually runs), so ANY earlier reference to `sys` in this function — including the
        # debug logging added when tracing attribute translation — raised UnboundLocalError
        # before ever reaching this handler, which was itself swallowed by translate_text's
        # own recursive call and silently produced empty/garbled output instead of a real
        # translation.
        print(f"Error translating: {e}", file=sys.stderr)
        return text


# ---------------------------
# COLLECT ALL STRINGS
# ---------------------------

all_strings = []


def collect_strings(obj):
    if isinstance(obj, dict):
        for value in obj.values():
            collect_strings(value)

    elif isinstance(obj, list):
        for item in obj:
            collect_strings(item)

    elif isinstance(obj, str):
        all_strings.append(obj)


collect_strings(data)

# ---------------------------
# TRANSLATE STRINGS
# ---------------------------

with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
    translated_strings = list(
        executor.map(
            translate_text,
            all_strings
        )
    )

translation_map = dict(
    zip(
        all_strings,
        translated_strings
    )
)

# ---------------------------
# REBUILD JSON
# ---------------------------

def replace_strings(obj):
    if isinstance(obj, dict):
        return {
            key: replace_strings(value)
            for key, value in obj.items()
        }

    elif isinstance(obj, list):
        return [
            replace_strings(item)
            for item in obj
        ]

    elif isinstance(obj, str):
        return translation_map.get(obj, obj)

    return obj


translated_json = replace_strings(data)

# ---------------------------
# OUTPUT
# ---------------------------

print(
    json.dumps(
        translated_json,
        ensure_ascii=False,
        indent=2
    )
)