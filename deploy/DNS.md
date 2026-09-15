# DNS fix — api.vastuarunsharma.com (GoDaddy)

## Problem

Mobile login fails with:

> Failed host lookup: 'api.vastuarunsharma.com'

**Root cause:** the hostname must publish an **IPv4 A record**. Many phones are on IPv4-only networks.

Domain nameservers (authoritative):

- `ns73.domaincontrol.com`
- `ns74.domaincontrol.com`

→ DNS is managed in **GoDaddy**, not Cloudflare.

As of the last check, `api.vastuarunsharma.com` returned **NXDOMAIN** (no A/AAAA). Until an A record exists, the app cannot log in on any network that cannot resolve the host.

## Required records (GoDaddy → DNS → Records)

Use the public IPv4 of the VPS that runs the nginx/API stack (see SSH host / server panel). Example if the origin is `72.60.100.15`:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `api` | `<ORIGIN_IPV4>` | 600 |
| A | `admin` | `<ORIGIN_IPV4>` | 600 |

Optional: keep apex/`www` as they are today.

After saving, wait 1–5 minutes, then verify:

```bash
dig +short A api.vastuarunsharma.com @8.8.8.8
curl -s https://api.vastuarunsharma.com/health
```

On the phone browser open: `https://api.vastuarunsharma.com/health` — you should see JSON `{"status":"ok",...}`.

## Automated fix (GoDaddy API)

```bash
cd vastu_backend
chmod +x scripts/fix-api-dns-godaddy.sh

export GODADDY_API_KEY='...'
export GODADDY_API_SECRET='...'
export ORIGIN_IPV4='72.60.100.15'   # your real VPS IPv4

./scripts/fix-api-dns-godaddy.sh
FIX_ADMIN=1 ./scripts/fix-api-dns-godaddy.sh
```

Create API keys at: https://developer.godaddy.com/keys (Production).

## Flutter app

The mobile app already uses `BASE_URL=https://api.vastuarunsharma.com`. No URL change is required once DNS A records exist. Rebuild only if you want the clearer offline/DNS error message.
