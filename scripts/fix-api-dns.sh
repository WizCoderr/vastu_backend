#!/usr/bin/env bash
# OPTIONAL: Cloudflare DNS (only if nameservers are on Cloudflare).
# Authoritative NS for vastuarunsharma.com are currently GoDaddy
# (ns73/ns74.domaincontrol.com) — prefer scripts/fix-api-dns-godaddy.sh.
#
# Required env:
#   CF_API_TOKEN  — Cloudflare API token with Zone.DNS Edit
#   CF_ZONE_ID    — Zone ID for vastuarunsharma.com
#   ORIGIN_IPV4   — Public IPv4 of the origin server (nginx stack)
#
# Optional:
#   FIX_ADMIN=1   — also create/update admin.vastuarunsharma.com
#   PROXIED=true  — Cloudflare orange-cloud proxy (default true)
#
# Usage:
#   CF_API_TOKEN=... CF_ZONE_ID=... ORIGIN_IPV4=x.x.x.x ./scripts/fix-api-dns.sh

set -euo pipefail

echo "NOTE: vastuarunsharma.com NS are GoDaddy (domaincontrol.com)."
echo "      Use ./scripts/fix-api-dns-godaddy.sh unless you moved NS to Cloudflare."
echo

CF_API_TOKEN="${CF_API_TOKEN:?Set CF_API_TOKEN}"
CF_ZONE_ID="${CF_ZONE_ID:?Set CF_ZONE_ID}"
ORIGIN_IPV4="${ORIGIN_IPV4:?Set ORIGIN_IPV4 to the origin server public IPv4}"
PROXIED="${PROXIED:-true}"
API_BASE="https://api.cloudflare.com/client/v4"

if [[ "$PROXIED" == "true" || "$PROXIED" == "1" ]]; then
  PROXIED_JSON=true
else
  PROXIED_JSON=false
fi

upsert_a_record() {
  local name="$1"
  local fqdn="${name}.vastuarunsharma.com"

  echo "→ Looking up existing A records for ${fqdn}..."
  local list
  list=$(curl -sS -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "${API_BASE}/zones/${CF_ZONE_ID}/dns_records?type=A&name=${fqdn}")

  local record_id
  record_id=$(python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('result') or []; print(r[0]['id'] if r else '')" <<<"$list")

  local payload
  payload=$(NAME="$name" CONTENT="$ORIGIN_IPV4" PROXIED="$PROXIED_JSON" python3 - <<'PY'
import json, os
print(json.dumps({
  "type": "A",
  "name": os.environ["NAME"],
  "content": os.environ["CONTENT"],
  "ttl": 1,
  "proxied": os.environ["PROXIED"] == "true",
}))
PY
)

  if [[ -n "$record_id" ]]; then
    echo "→ Updating A record ${fqdn} → ${ORIGIN_IPV4} (id=${record_id}, proxied=${PROXIED_JSON})"
    curl -sS -X PUT -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "$payload" \
      "${API_BASE}/zones/${CF_ZONE_ID}/dns_records/${record_id}" | python3 -c \
      "import json,sys; d=json.load(sys.stdin); print('OK' if d.get('success') else d); raise SystemExit(0 if d.get('success') else 1)"
  else
    echo "→ Creating A record ${fqdn} → ${ORIGIN_IPV4} (proxied=${PROXIED_JSON})"
    curl -sS -X POST -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "$payload" \
      "${API_BASE}/zones/${CF_ZONE_ID}/dns_records" | python3 -c \
      "import json,sys; d=json.load(sys.stdin); print('OK' if d.get('success') else d); raise SystemExit(0 if d.get('success') else 1)"
  fi
}

echo "Cloudflare DNS fix for vastuarunsharma.com"
echo "Origin IPv4: ${ORIGIN_IPV4}  proxied=${PROXIED_JSON}"
upsert_a_record "api"

if [[ "${FIX_ADMIN:-0}" == "1" ]]; then
  upsert_a_record "admin"
fi

echo
echo "Verify (may take 1–5 minutes):"
echo "  dig +short A api.vastuarunsharma.com @1.1.1.1"
echo "  curl -s https://api.vastuarunsharma.com/health"
