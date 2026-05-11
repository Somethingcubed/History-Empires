#!/bin/bash
# Double-click this file in Finder (macOS). Keeps Terminal open while the site runs.
cd "$(dirname "$0")"
PORT=8787
echo ""
echo "  Empire Timeline — local server on port ${PORT}"
echo ""
echo "  Open this URL in your browser:"
echo ""
echo "    http://127.0.0.1:${PORT}/"
echo ""
echo "  Leave this window open while browsing. Ctrl+C stops the server."
echo ""
exec python3 -m http.server "${PORT}"
