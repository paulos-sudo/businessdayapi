#!/usr/bin/env node
/**
 * Minimal x402 v2 test client for the offline smoke test:
 * GET → 402 → decode PAYMENT-REQUIRED → echo accepts[0] as `accepted` →
 * retry with PAYMENT-SIGNATURE (fake signature; mock facilitator accepts all).
 */
const url = process.argv[2];
if (!url) {
  console.error("usage: mock-client.mjs <url>");
  process.exit(1);
}

const first = await fetch(url);
console.log(`step 1: unpaid request → HTTP ${first.status}`);
const prHeader = first.headers.get("payment-required");
if (first.status !== 402 || !prHeader) {
  console.error("expected 402 with PAYMENT-REQUIRED header");
  process.exit(1);
}
const paymentRequired = JSON.parse(Buffer.from(prHeader, "base64").toString());
const accepted = paymentRequired.accepts[0];
console.log(
  `step 2: decoded requirements → scheme=${accepted.scheme} network=${accepted.network} amount=${accepted.amount} payTo=${accepted.payTo}`,
);

const paymentPayload = {
  x402Version: 2,
  accepted,
  payload: {
    signature: "0x" + "11".repeat(65),
    authorization: {
      from: "0x0000000000000000000000000000000000000001",
      to: accepted.payTo,
      value: accepted.amount,
      validAfter: "0",
      validBefore: String(Math.floor(Date.now() / 1000) + 600),
      nonce: "0x" + "22".repeat(32),
    },
  },
};
const sig = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
const second = await fetch(url, { headers: { "PAYMENT-SIGNATURE": sig } });
const body = await second.text();
console.log(`step 3: paid retry → HTTP ${second.status}`);
console.log(`         PAYMENT-RESPONSE header present: ${!!second.headers.get("payment-response")}`);
console.log(`         body: ${body.slice(0, 300)}`);
process.exit(second.status === 200 ? 0 : 1);
