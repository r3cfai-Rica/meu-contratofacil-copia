#!/bin/bash
set -e

npm install

# Clear Vite's dependency optimization cache so the dev server
# starts fresh instead of discovering stale hashes mid-flight,
# which causes "Failed to fetch dynamically imported module" crashes.
rm -rf node_modules/.vite
