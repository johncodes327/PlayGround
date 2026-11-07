#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${CAPTURE_URL:?Set CAPTURE_URL to the exact preview URL}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to the evidence output directory}"
: "${RUNTIME_DIR:?RUNTIME_DIR is required for the managed browser runtime}"

# Evidence belongs outside the source tree, never in the app or its build output.
project_real="$(/usr/bin/time -p realpath "$PROJECT_DIR")"
capture_real="$(/usr/bin/time -p realpath -m "$CAPTURE_DIR")"
case "$capture_real/" in
  "$project_real/"*) echo "CAPTURE_DIR must be outside the project: $capture_real" >&2; exit 1 ;;
esac

# The managed capture runner classifies browser/navigation infrastructure errors
# as 75 and page/script/rendering defects as 1, and always closes its browser.
/usr/bin/time -p env CAPTURE_STRICT=1 CAPTURE_START_SELECTOR='#startButton' node "$RUNTIME_DIR/scripts/default-capture.mjs"
