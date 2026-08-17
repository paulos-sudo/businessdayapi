#!/usr/bin/env node
/**
 * Local mock x402 facilitator — FOR OFFLINE SMOKE TESTS ONLY.
 * Implements /supported, /verify, /settle with the wire shapes the
 * HTTPFacilitatorClient expects. Accepts any payment payload as valid.
 * Never deploy this; production uses the CDP facilitator.
 */
import express from "express";

const PORT = Number(process.env.MOCK_PORT || 4090);
const NETWORK = process.env.NETWORK || "eip155:84532";
const app = express();
app.use(express.json());

app.get("/supported", (_req, res) =>
  res.json({
    kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK }],
    extensions: ["bazaar"],
    signers: {},
  }),
);

app.post("/verify", (req, res) => {
  console.log("[mock] /verify", JSON.stringify(req.body).slice(0, 200));
  res.json({ isValid: true, payer: "0x0000000000000000000000000000000000000001" });
});

app.post("/settle", (req, res) => {
  console.log("[mock] /settle", JSON.stringify(req.body).slice(0, 120));
  res.json({
    success: true,
    transaction: "0x" + "ab".repeat(32),
    network: NETWORK,
    payer: "0x0000000000000000000000000000000000000001",
  });
});

app.listen(PORT, () => console.log(`mock facilitator on :${PORT}`));
