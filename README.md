# Business Day & Deadline API

**Verified, always-current business-day arithmetic for ~200 countries** — incl.
subdivisions (German Bundesländer, US states, …) and correct per-country weekend
rules (Fri/Sat in Egypt, Sat-only in Nepal, …).

Payable per request via **[x402](https://x402.org)** — $0.001 in USDC on Base.
No account, no API key, no subscription. Agents discover it via the
[x402 Bazaar](https://docs.cdp.coinbase.com/x402/bazaar); every response carries
`verifiedAt` + `source` so downstream decisions are auditable.

## Endpoints

| Endpoint | What it does | Price |
|---|---|---|
| `GET /v1/check?date&country[&region][&weekend]` | Is this date a business day? | $0.001 |
| `GET /v1/add?start&days&country[&region]` | Date ± N business days (deadline calc) | $0.001 |
| `GET /v1/between?from&to&country[&region]` | Count business days in a range | $0.001 |
| `GET /v1/next?date&country[&region]` | Next business day | $0.001 |
| `GET /v1/previous?date&country[&region]` | Previous business day | $0.001 |
| `GET /v1/schema` | OpenAPI + supported countries | free |
| `GET /health` | Status + data freshness | free |

`country` is ISO 3166-1 alpha-2 (`DE`, `US`, `JP`), `region` an ISO 3166-2
suffix (`BY` = Bavaria, `CA` = California). Optional
`weekend=sat-sun|fri-sat|custom:THU,FRI` override.

### Example

```bash
curl -i "https://businessdayapi.com/v1/add?start=2026-04-01&days=3&country=DE"
# → HTTP 402 + PAYMENT-REQUIRED header (price, network, payTo)
# any x402-compatible client pays and retries automatically:
# → {"resultDate":"2026-04-08","skipped":[{"date":"2026-04-03","reason":"holiday",
#     "holidayName":"Karfreitag"},...],"verifiedAt":"...","source":"nager.date"}
```

## Run locally

```bash
npm install
npm run build        # generate data/holidays/*.json (date-holidays source)
npm test            # 16 golden tests (DE/US/EG/JP calendars)
bash scripts/smoke-test.sh   # offline e2e: 402 → pay (mock facilitator) → 200
```

## Deploy (Railway)

1. Push this repo to GitHub, create a Railway service from it.
2. Env vars:
   - `PAY_TO` — your receiving wallet
   - `NETWORK` — `eip155:84532` (Base Sepolia) first, then `eip155:8453` (mainnet)
   - `FACILITATOR_URL` — `https://x402.org/facilitator` (testnet) →
     `https://api.cdp.coinbase.com/platform/v2/x402` (production, CDP keys via
     env per CDP docs)
3. Nightly data refresh: Railway cron `0 3 * * *` →
   `SOURCE=nager node scripts/generate-snapshots.mjs` (redeploy or shared volume).
4. First real mainnet payment triggers Bazaar indexing automatically.

## Data & disclaimers

Holiday data from [Nager.Date](https://date.nager.at) (production) or the
[date-holidays](https://www.npmjs.com/package/date-holidays) package (offline
builds); weekend rules curated from CLDR + national reforms (UAE 2022, KSA 2013).
Coverage window: 2024–2028, refreshed nightly.

Informational only — verify legally binding deadlines with the competent
authority. Not legal advice.
