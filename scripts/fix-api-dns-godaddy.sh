#!/usr/bin/env bash
# Create/update GoDaddy A records for api (and optionally admin).
#
# Required:
#   GODADDY_API_KEY
#   GODADDY_API_SECRET
#   ORIGIN_IPV4   — public IPv4 of the nginx/API host
#
# Optional:
#   DOMAIN=vastuarunsharma.com
#   FIX_ADMIN=1
#
# Usage:
#   GODADDY_API_KEY=... GODADDY_API_SECRET=... ORIGIN_IPV4=x.x.x.x ./scripts/fix-api-dns-godaddy.sh

set -euo pipefail

GODADDY_API_KEY="${GODADDY_API_KEY:?Set GODADDY_API_KEY}"
GODADDY_API_SECRET="${GODADDY_API_SECRET:?Set GODADDY_API_SECRET}"
ORIGIN_IPV4="${ORIGIN_IPV4:?Set ORIGIN_IPV4}"
DOMAIN="${DOMAIN:-vastuarunsharma.com}"
API_BASE="https://api.godaddy.com/v1"

put_a_record() {
  local name="$1"
  local payload
  payload=$(CONTENT="$ORIGIN_IPV4" python3 - <<'PY'
import json, os
print(json.dumps([{
  "data": os.environ["CONTENT"],
  "ttl": 600,
}]))
PY
)
  echo "→ PUT A ${name}.${DOMAIN} → ${ORIGIN_IPV4}"
  local code
  code=$(curl -sS -o /tmp/gd_dns_out.json -w "%{http_code}" -X PUT \
    "https://api.godaddy.com/v1/domains/${DOMAIN}/records/A/${name}" \
    -H "Authorization: sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}" \
    -H "Content-Type: application/json" \
    --data "$payload")
  echo "  HTTP ${code}"
  if [[ "$code" != "200" ]]; then
    cat /tmp/gd_dns_out.json
    echo
    return 1
  fi
}

echo "GoDaddy DNS fix for ${DOMAIN}"
put_a_record "api"

if [[ "${FIX_ADMIN:-0}" == "1" ]]; then
  put_a_record "admin"
fi

echo
echo "Verify in 1–5 minutes:"
echo "  dig +short A api.${DOMAIN} @8.8.8.8"
echo "  curl -s https://api.${DOMAIN}/health"
