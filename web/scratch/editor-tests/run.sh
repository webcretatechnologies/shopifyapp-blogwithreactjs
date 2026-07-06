#!/bin/bash
# Headless verification suites for the blog builder (see BLOG_BUILDER_ISSUES.md).
#
#   roundtrip  — every custom node survives render -> parse -> render with typed attrs
#   schema     — every toolbar-inserted node type is registered in the editor schema
#   columns    — ColumnLayout set-column-count operations produce valid documents
#   compiler   — EditorContentCompiler output for the new block types
#
# Usage: bash web/scratch/editor-tests/run.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND="$DIR/../../frontend"
WEB="$DIR/../.."

FAIL=0
for entry in roundtrip schema columns; do
  echo "=== $entry ==="
  cd "$FRONTEND"
  cp "$DIR/$entry.entry.jsx" .editor-test.jsx
  ./node_modules/.bin/esbuild .editor-test.jsx --bundle --format=esm --platform=node \
    --external:jsdom --external:fs --outfile=.editor-test.mjs --log-level=error
  node .editor-test.mjs || FAIL=1
  rm -f .editor-test.jsx .editor-test.mjs
done

echo "=== compiler ==="
cd "$WEB"
cp "$DIR/compiler.test.mjs" .editor-compiler-test.mjs
sed -i 's|"../src/services/EditorContentCompiler.js"|"./src/services/EditorContentCompiler.js"|' .editor-compiler-test.mjs
node .editor-compiler-test.mjs || FAIL=1
rm -f .editor-compiler-test.mjs

exit $FAIL
