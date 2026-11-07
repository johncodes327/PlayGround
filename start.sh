#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
PORT="${PORT:-3000}"
OPENCODE_WEB_DIR="${OPENCODE_WEB_DIR:?OPENCODE_WEB_DIR is required for deployment metadata}"

# This project is self-contained HTML/CSS/JavaScript, so its build is a copy
# into a project-local static directory; there are no dependencies to install.
/usr/bin/time -p mkdir -p "$PROJECT_DIR/dist"
/usr/bin/time -p cp "$PROJECT_DIR/index.html" "$PROJECT_DIR/dist/index.html"
/usr/bin/time -p cp "$PROJECT_DIR/style.css" "$PROJECT_DIR/dist/style.css"
/usr/bin/time -p cp "$PROJECT_DIR/game.js" "$PROJECT_DIR/dist/game.js"
/usr/bin/time -p mkdir -p "$OPENCODE_WEB_DIR"
/usr/bin/time -p /usr/bin/printf '{"project":"%s","directory":"%s/dist"}\n' "$PROJECT_DIR" "$PROJECT_DIR" > "$OPENCODE_WEB_DIR/deployment-output.json"

# Keep the server in the foreground so the runtime controller can supervise it.
/usr/bin/time -p python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$PROJECT_DIR/dist"
