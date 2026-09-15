#!/usr/bin/env bash
# Verify production API DNS + health (phone login prerequisite).
# Exit 0 only when IPv4 A record exists and /health returns ok.

set -euo pipefail

HOST="${1:-api.vastuarunsharma.com}"

echo "Checking A record for ${HOST}..."
A_RECORDS=$(dig +short A "$HOST" @8.8.8.8 || true)
AAAA_RECORDS=$(dig +short AAAA "$HOST" @8.8.8.8 || true)

echo "  A:    ${A_RECORDS:-NONE}"
echo "  AAAA: ${AAAA_RECORDS:-NONE}"

if [[ -z "$A_RECORDS" ]]; then
  echo "FAIL: No IPv4 A record. Phones on IPv4 networks cannot look up ${HOST}."
  echo "Fix: add A record in GoDaddy (see deploy/DNS.md) then re-run this script."
  exit 1
fi

echo "Checking https://${HOST}/health over IPv4..."
BODY=$(curl -4 -s -m 20 "https://${HOST}/health" || true)
echo "  body: ${BODY}"

BODY="$BODY" python3 - <<'PY'
import json, os, sys
body = os.environ.get("BODY", "")
try:
  data = json.loads(body)
except Exception:
  print("FAIL: /health did not return JSON")
  sys.exit(1)
if data.get("status") != "ok":
  print("FAIL: unexpected health payload", data)
  sys.exit(1)
print("OK: IPv4 DNS + health check passed. Mobile login should work after app network refresh.")
PY
