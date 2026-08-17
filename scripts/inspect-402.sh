#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/.."
node scripts/mock-facilitator.mjs > /tmp/mock.log 2>&1 &
M=$!
FACILITATOR_URL=http://localhost:4090 node src/server.js > /tmp/server.log 2>&1 &
S=$!
sleep 2.5
echo "=== 402 response with headers ==="
curl -si "localhost:4021/v1/check?date=2026-06-04&country=DE" | head -30
kill $S $M 2>/dev/null
wait 2>/dev/null
