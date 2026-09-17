#!/bin/sh
set -e

if [ "$MODE" = "PRODUCTION" ]; then
    echo "Starting doctor-backend [PRODUCTION] on :${PORT:-8080}"
    exec node App.js
else
    echo "Starting doctor-backend [DEVELOPMENT, nodemon] on :${PORT:-8080}"
    # node_modules comes from the image / named volume; install only if missing
    [ -d node_modules ] || pnpm install
    exec npx nodemon App.js
fi
