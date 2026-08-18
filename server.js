/**
 * Business Day & Deadline API — x402-payable Express server.
 *
 * Env:
 *   PAY_TO           receiving wallet (default: Paulos' seller wallet)
 *   NETWORK          eip155:8453 (Base mainnet) | eip155:84532 (Base Sepolia, default)
 *   FACILITATOR_URL  default https://x402.org/facilitator (testnet);
 *                    production: https://api.cdp.coinbase.com/platform/v2/x402
 *   PRICE            default $0.001
 *   PORT             default 4021
 */
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createFacilitatorConfig } from "@coinbase/x402";
import { declareDiscoveryExtension, bazaarResourceServerExtension } from "@x402/extensions/bazaar";
import { check, add, between, next, previous, index, ApiError } from "./core.js";

const PAY_TO = process.env.PAY_TO || "0xE72b85A97A6e19413D8b80633787Eda6d6237A77";
const NETWORK = process.env.NETWORK || "eip155:84532";
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://x402.org/facilitator";
const PRICE = process.env.PRICE || "$0.001";
const PORT = Number(process.env.PORT || 4021);

const DISCLAIMER =
  "Informational only — verify legally binding deadlines with the competent authority. Not legal advice.";

const app = express();

// With CDP credentials set (production/mainnet), use Coinbase's authenticated
// facilitator config; otherwise fall back to the plain URL (testnet).
const facilitatorConfig =
  process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET
    ? createFacilitatorConfig(process.env.CDP_API_KEY_ID, process.env.CDP_API_KEY_SECRET)
    : { url: FACILITATOR_URL };
const facilitator = new HTTPFacilitatorClient(facilitatorConfig);
const resourceServer = new x402ResourceServer(facilitator)
  .register(NETWORK, new ExactEvmScheme());
resourceServer.registerExtension(bazaarResourceServerExtension);

const accepts = { scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO };
const COMMON_PARAMS = {
  country: "ISO 3166-1 alpha-2 country code, e.g. DE, US, JP",
  region: "optional ISO 3166-2 subdivision suffix, e.g. BY (Bavaria), CA (California)",
  weekend: "optional override: sat-sun | fri-sat | custom:THU,FRI",
};

const routes = {
  "GET /v1/check": {
    accepts,
    serviceName: "Business Day API",
    description:
      "Is a given date a business day? Covers ~200 countries incl. subdivisions (states/Bundeslaender) and correct per-country weekend rules (e.g. Fri/Sat in Egypt). Verified, always-current holiday data — every response carries verifiedAt + source.",
    mimeType: "application/json",
    tags: ["data", "calendar", "scheduling", "deadlines", "business-days"],
    extensions: declareDiscoveryExtension({
      method: "GET",
      input: { date: "2026-10-03", country: "DE", region: "BY" },
      inputSchema: {
        properties: {
          date: { type: "string", description: "ISO date YYYY-MM-DD" },
          country: { type: "string", description: COMMON_PARAMS.country },
          region: { type: "string", description: COMMON_PARAMS.region },
          weekend: { type: "string", description: COMMON_PARAMS.weekend },
        },
        required: ["date", "country"],
      },
      output: {
        example: {
          date: "2026-10-03", country: "DE", region: "BY", isBusinessDay: false,
          reason: "weekend", holidayName: "Tag der Deutschen Einheit",
          source: "nager.date", verifiedAt: "2026-08-17T00:00:00Z",
        },
      },
    }),
  },
  "GET /v1/add": {
    accepts,
    serviceName: "Business Day API",
    description:
      "Add or subtract N business days to a date (deadline calculation) for ~200 countries incl. subdivisions and correct weekend rules. Returns the resulting date plus every skipped weekend/holiday.",
    mimeType: "application/json",
    tags: ["data", "calendar", "scheduling", "deadlines", "business-days"],
    extensions: declareDiscoveryExtension({
      method: "GET",
      input: { start: "2026-04-01", days: 3, country: "DE" },
      inputSchema: {
        properties: {
          start: { type: "string", description: "ISO start date YYYY-MM-DD" },
          days: { type: "integer", description: "business days to add (negative = subtract)" },
          country: { type: "string", description: COMMON_PARAMS.country },
          region: { type: "string", description: COMMON_PARAMS.region },
          weekend: { type: "string", description: COMMON_PARAMS.weekend },
        },
        required: ["start", "days", "country"],
      },
      output: {
        example: {
          start: "2026-04-01", days: 3, resultDate: "2026-04-08",
          skipped: [{ date: "2026-04-03", reason: "holiday", holidayName: "Karfreitag" }],
          country: "DE", source: "nager.date", verifiedAt: "2026-08-17T00:00:00Z",
        },
      },
    }),
  },
  "GET /v1/between": {
    accepts,
    serviceName: "Business Day API",
    description:
      "Count business days between two dates (exclusive-from, inclusive-to) for ~200 countries incl. subdivisions; lists the holidays in the range.",
    mimeType: "application/json",
    tags: ["data", "calendar", "scheduling", "deadlines", "business-days"],
    extensions: declareDiscoveryExtension({
      method: "GET",
      input: { from: "2026-04-01", to: "2026-04-08", country: "DE" },
      inputSchema: {
        properties: {
          from: { type: "string" }, to: { type: "string" },
          country: { type: "string", description: COMMON_PARAMS.country },
          region: { type: "string", description: COMMON_PARAMS.region },
          weekend: { type: "string", description: COMMON_PARAMS.weekend },
        },
        required: ["from", "to", "country"],
      },
      output: {
        example: {
          from: "2026-04-01", to: "2026-04-08", businessDays: 3, calendarDays: 7,
          holidays: [{ date: "2026-04-03", holidayName: "Karfreitag" }],
          country: "DE", source: "nager.date", verifiedAt: "2026-08-17T00:00:00Z",
        },
      },
    }),
  },
  "GET /v1/next": {
    accepts,
    serviceName: "Business Day API",
    description: "Next business day after a date, for ~200 countries incl. subdivisions and correct weekend rules.",
    mimeType: "application/json",
    tags: ["data", "calendar", "scheduling", "business-days"],
    extensions: declareDiscoveryExtension({
      method: "GET",
      input: { date: "2026-12-24", country: "DE" },
      inputSchema: {
        properties: {
          date: { type: "string" },
          country: { type: "string", description: COMMON_PARAMS.country },
          region: { type: "string", description: COMMON_PARAMS.region },
          weekend: { type: "string", description: COMMON_PARAMS.weekend },
        },
        required: ["date", "country"],
      },
      output: { example: { date: "2026-12-24", nextBusinessDay: "2026-12-28", country: "DE" } },
    }),
  },
  "GET /v1/previous": {
    accepts,
    serviceName: "Business Day API",
    description: "Previous business day before a date, for ~200 countries incl. subdivisions and correct weekend rules.",
    mimeType: "application/json",
    tags: ["data", "calendar", "scheduling", "business-days"],
    extensions: declareDiscoveryExtension({
      method: "GET",
      input: { date: "2026-04-06", country: "DE" },
      inputSchema: {
        properties: {
          date: { type: "string" },
          country: { type: "string", description: COMMON_PARAMS.country },
          region: { type: "string", description: COMMON_PARAMS.region },
          weekend: { type: "string", description: COMMON_PARAMS.weekend },
        },
        required: ["date", "country"],
      },
      output: { example: { date: "2026-04-06", previousBusinessDay: "2026-04-02", country: "DE" } },
    }),
  },
};

app.use(paymentMiddleware(routes, resourceServer));

const wrap = (fn) => (req, res) => {
  try {
    const result = fn(req.query);
    res.json({ ...result, disclaimer: DISCLAIMER });
  } catch (e) {
    if (e instanceof ApiError) {
      res.status(e.status).json({ error: e.code, message: e.message, hint: e.hint });
    } else {
      res.status(500).json({ error: "internal", message: "Unexpected error." });
    }
  }
};

app.get("/v1/check", wrap(check));
app.get("/v1/add", wrap(add));
app.get("/v1/between", wrap(between));
app.get("/v1/next", wrap(next));
app.get("/v1/previous", wrap(previous));

// ---- free endpoints ----
app.get("/health", (_req, res) =>
  res.json({ status: "ok", dataGeneratedAt: index.generatedAt, source: index.source, years: index.years }),
);

app.get("/v1/schema", (_req, res) => {
  res.json({
    openapi: "3.1.0",
    info: {
      title: "Business Day & Deadline API",
      version: "0.1.0",
      description:
        "Verified, always-current business-day arithmetic for ~200 countries incl. subdivisions and correct per-country weekend rules. Paid via x402 (" +
        PRICE + "/query, USDC on " + NETWORK + "). " + DISCLAIMER,
    },
    "x-payment": { protocol: "x402", scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO },
    "x-data": { source: index.source, verifiedAt: index.generatedAt, years: index.years },
    "x-supported-countries": index.countries,
    paths: Object.fromEntries(
      Object.entries(routes).map(([key, cfg]) => {
        const [, path] = key.split(" ");
        return [path, { get: { summary: cfg.description, "x-price": PRICE } }];
      }),
    ),
  });
});

app.listen(PORT, () => {
  console.log(
    `businessdayapi listening on :${PORT} — network=${NETWORK} facilitator=${FACILITATOR_URL} payTo=${PAY_TO}`,
  );
});
