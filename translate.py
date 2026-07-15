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
            
            # Translate only the string nodes
            for element in soup.find_all(string=True):
                # Skip comments
                if isinstance(element, Comment):
                    continue
                    
                # Skip scripts and styles
                if element.parent.name in ['script', 'style']:
                    continue
                    
                original_text = element.string
                if original_text and original_text.strip():
                    translatable_elements.append(element)
                    texts_to_translate.append(original_text)
                    
            def do_translate(text_chunk):
                try:
                    chunks = split_text(text_chunk)
                    translated_chunks = []
                    translator = GoogleTranslator(source="auto", target=target_lang)
                    for chunk in chunks:
                        res = translator.translate(chunk)
                        translated_chunks.append(res if res is not None else chunk)
                    return " ".join(translated_chunks)
                except Exception:
                    return text_chunk
                    
            from concurrent.futures import ThreadPoolExecutor
            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
                translated_texts = list(executor.map(do_translate, texts_to_translate))
                
            for element, translated in zip(translatable_elements, translated_texts):
                element.replace_with(translated)
            
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
        import sys
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