# ManaLog Dispatch

Courier & parcel dispatch for French Polynesia — the first operational module of ManaLog.
UI/UX patterns inspired by [Fleetbase](https://github.com/fleetbase/fleetbase) (dispatcher console with live map, driver app, customer tracking), rebuilt from scratch for the territory. No Fleetbase code is copied.

Runs on **Cloudflare Workers + D1 + R2 (free tier)**. The data model is plain SQL and all logic lives in `src/`, so it can move to AWS (Lambda + DynamoDB/Aurora + S3) later.

## What it does
| Who | Where | What |
|---|---|---|
| Dispatcher (console) | `/console` | Orders board with live map, new order with **live XPF quote**, assign a courier, status updates, **printable 10×15 label with QR code**, **pre-filled CN23 customs declaration** (international), couriers, tariffs |
| Courier (PWA) | `/chauffeur` | Name + PIN login, today's runs, call / directions, **proof of pickup & delivery** (photo + GPS + note), installable on the phone |
| End customer | `/suivi/<code>` | Public tracking timeline (no internal notes, no courier name, no photos) |
| ManaShop.app / partners | `/api/v1/…` | `POST /orders` (idempotent by `source` + `external_ref`), `GET /orders/<code>`, `POST /quote` — Bearer `API_KEY` |

French Polynesia specifics: addresses without street numbers ("PK 12,5 côté mer") + tap-on-map GPS pin, Tahiti communes grouped in pricing zones, Moorea / other islands (drop at boat or air freight), international via OPT with CN23, prices in XPF.

## Local development
```bash
cd dispatch
cp .dev.vars.example .dev.vars          # SESSION_SECRET, CONSOLE_PASSWORD, API_KEY
npx wrangler d1 migrations apply manalog_dispatch_test --local --env test
npx wrangler dev --env test --port 8790
BASE=http://localhost:8790 bash test/smoke.sh   # 35 end-to-end checks
```

## Production (already provisioned)
- D1 `manalog_dispatch` (`ca9a691a-7bba-40b2-aaad-3f9801d8b739`, Oceania) — migration `0001_init.sql` applied.
- R2 `manalog-dispatch-files` (proof-of-delivery photos, private).

To go live: Cloudflare → Workers & Pages → Create → Import a repository → `Heya-56/manalog`, **root directory `dispatch`**, then add the secrets `SESSION_SECRET` (long random string), `CONSOLE_PASSWORD`, `API_KEY`.

## Security notes
- Console: password + HMAC-signed session cookie (HttpOnly, SameSite=Lax, Secure in production); all POSTs must come from the same origin.
- Couriers: PBKDF2 (100 000 iterations) PIN hashes, lock after 5 wrong PINs for 15 minutes.
- Proof photos are served to the console only. Tracking pages never show phone numbers, courier names or photos.
- Tariffs are **provisional defaults** — to be agreed with the courier partner.
