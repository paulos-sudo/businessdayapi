#!/usr/bin/env node
/**
 * Generates local holiday snapshots into data/holidays/<CC>.json.
 *
 * Default source: the `date-holidays` npm package (works offline/behind proxies).
 * On infrastructure with open egress (e.g. Railway), run with SOURCE=nager to
 * refresh from the Nager.Date API instead (nightly cron).
 *
 * Snapshot format:
 * {
 *   country: "DE",
 *   source: "date-holidays@<version>" | "nager.date",
 *   generatedAt: ISO timestamp,
 *   years: [2024, ..., 2028],
 *   regions: { "": { "2026-01-01": "Neujahr", ... }, "BY": { ... } }
 * }
 * The "" region holds nationwide public holidays; named regions hold the FULL
 * set for that subdivision (national + regional) for O(1) lookup.
 */
import Holidays from "date-holidays";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "holidays");
const YEARS = [2024, 2025, 2026, 2027, 2028];
const SOURCE = process.env.SOURCE || "date-holidays";

const pkgVersion = JSON.parse(
  readFileSync(join(ROOT, "node_modules", "date-holidays", "package.json"), "utf8"),
).version;

mkdirSync(OUT, { recursive: true });

function publicHolidayMap(hd, years) {
  const map = {};
  for (const year of years) {
    for (const h of hd.getHolidays(year) || []) {
      if (h.type !== "public") continue;
      // h.date: "YYYY-MM-DD HH:mm:ss"; multi-day entries repeat per day
      const date = h.date.slice(0, 10);
      map[date] = h.name;
    }
  }
  return map;
}

async function fromNager(country, years) {
  const regions = { "": {} };
  for (const year of years) {
    const res = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`,
    );
    if (!res.ok) throw new Error(`nager ${country}/${year}: HTTP ${res.status}`);
    for (const h of await res.json()) {
      if (h.global) {
        regions[""][h.date] = h.name;
      }
      for (const county of h.counties || []) {
        const code = county.replace(`${country}-`, "");
        regions[code] ||= {};
        regions[code][h.date] = h.name;
      }
    }
  }
  // named regions must contain the full set (national + regional)
  for (const code of Object.keys(regions)) {
    if (code === "") continue;
    regions[code] = { ...regions[""], ...regions[code] };
  }
  return regions;
}

function fromDateHolidays(country, years) {
  const hd = new Holidays(country);
  const regions = { "": publicHolidayMap(hd, years) };
  const states = Holidays.prototype.getStates
    ? new Holidays().getStates(country) || {}
    : {};
  for (const code of Object.keys(states)) {
    const hdState = new Holidays(country, code);
    regions[code] = publicHolidayMap(hdState, years);
  }
  return regions;
}

const hdRoot = new Holidays();
const countries = Object.keys(hdRoot.getCountries() || {}).sort();
let ok = 0;
const failed = [];

for (const country of countries) {
  try {
    const regions =
      SOURCE === "nager"
        ? await fromNager(country, YEARS)
        : fromDateHolidays(country, YEARS);
    if (!Object.keys(regions[""]).length) {
      failed.push(`${country} (no public holidays found)`);
      continue;
    }
    const snapshot = {
      country,
      source: SOURCE === "nager" ? "nager.date" : `date-holidays@${pkgVersion}`,
      generatedAt: new Date().toISOString(),
      years: YEARS,
      regions,
    };
    writeFileSync(join(OUT, `${country}.json`), JSON.stringify(snapshot));
    ok++;
  } catch (e) {
    failed.push(`${country} (${e.message})`);
  }
}

writeFileSync(
  join(OUT, "_index.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: SOURCE === "nager" ? "nager.date" : `date-holidays@${pkgVersion}`,
      years: YEARS,
      countries: countries.filter((c) => !failed.some((f) => f.startsWith(c + " "))),
    },
    null,
    2,
  ),
);

console.log(`snapshots written: ${ok}/${countries.length}`);
if (failed.length) console.log(`skipped: ${failed.join(", ")}`);
