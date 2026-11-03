#!/bin/sh
# serve the repo at /mountain-quest/ like GitHub Pages does
mkdir -p /tmp/mqsite && rm -f /tmp/mqsite/mountain-quest && ln -s "$(pwd)" /tmp/mqsite/mountain-quest
cd /tmp/mqsite && exec python3 -m http.server ${PORT:-8765} --bind 127.0.0.1
