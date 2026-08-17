#!/usr/bin/env bash
# Offline smoke test: mock facilitator + server + curl assertions, one process tree.
set -u
cd "$(dirname "$0")/.."

node scripts/mock-facilitator.mjs > /tmp/mock.log 2>&1 &
MOCK_PID=$!
sleep 1.5

FACILITATOR_URL=http://localhost:4090 node src/server.js > /tmp/server.log 2>&1 &
SRV_PID=$!
sleep 2.5

echo "### server boot log"
head -3 /tmp/server.log

echo
echo "### 1) /health (free)"
curl -s -w "\nHTTP %{http_code}\n" localhost:4021/health

echo
echo "### 2) /v1/schema (free, excerpt)"
curl -s localhost:4021/v1/schema | head -c 400; echo; echo "..."

echo
echo "### 3) unpaid /v1/check → expect HTTP 402 + payment requirements"
curl -s -w "\nHTTP %{http_code}\n" "localhost:4021/v1/check?date=2026-06-04&country=DE&region=BY"

echo
echo "### 4) full x402 flow: 402 → decode → pay → 200 (mock facilitator)"
node scripts/mock-client.mjs "http://localhost:4021/v1/check?date=2026-06-04&country=DE&region=BY"

echo
echo "### 5) error UX: unknown region → expect 402 first (payment gate) — free /health stays open"
curl -s -o /dev/null -w "unknown-region status (pre-payment): HTTP %{http_code}\n" \
  "localhost:4021/v1/check?date=2026-06-04&country=DE&region=BAY"

kill $SRV_PID $MOCK_PID 2>/dev/null
wait 2>/dev/null
echo
echo "smoke test done"
