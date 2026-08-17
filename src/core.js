/**
 * Business-day arithmetic core. Pure functions, in-memory data, no I/O at
 * request time. All dates are ISO "YYYY-MM-DD" strings in the proleptic
 * Gregorian calendar; computation uses UTC to avoid TZ drift.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOLIDAY_DIR = join(ROOT, "data", "holidays");

const weekendTable = JSON.parse(
  readFileSync(join(ROOT, "data", "weekends.json"), "utf8"),
);

const calendars = new Map(); // country -> snapshot
for (const file of readdirSync(HOLIDAY_DIR)) {
  if (!file.endsWith(".json") || file.startsWith("_")) continue;
  const snap = JSON.parse(readFileSync(join(HOLIDAY_DIR, file), "utf8"));
  calendars.set(snap.country, snap);
}
export const index = JSON.parse(
  readFileSync(join(HOLIDAY_DIR, "_index.json"), "utf8"),
);

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export class ApiError extends Error {
  constructor(status, code, message, hint) {
    super(message);
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

export function parseISO(s, field) {
  if (typeof s !== "string" || !ISO_RE.test(s)) {
    throw new ApiError(
      400,
      "invalid_date",
      `${field} must be an ISO date (YYYY-MM-DD), got: ${s}`,
      "Example: 2026-10-03. See /v1/schema.",
    );
  }
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw new ApiError(
      400,
      "invalid_date",
      `${field} is not a real calendar date: ${s}`,
      "Check month/day ranges. Example: 2026-02-28.",
    );
  }
  return d;
}

const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

export function resolveCalendar(country, region) {
  if (typeof country !== "string" || !/^[A-Za-z]{2}$/.test(country)) {
    throw new ApiError(
      400,
      "invalid_country",
      `country must be an ISO 3166-1 alpha-2 code, got: ${country}`,
      "Example: country=DE. GET /v1/schema lists all supported countries.",
    );
  }
  const cc = country.toUpperCase();
  const snap = calendars.get(cc);
  if (!snap) {
    throw new ApiError(
      404,
      "unknown_country",
      `No holiday calendar for country '${cc}'.`,
      "GET /v1/schema lists all supported countries.",
    );
  }
  let regionKey = "";
  if (region !== undefined && region !== "") {
    const rr = String(region).toUpperCase();
    if (!snap.regions[rr]) {
      const known = Object.keys(snap.regions).filter(Boolean);
      throw new ApiError(
        404,
        "unknown_region",
        `Region '${rr}' unknown for ${cc}.`,
        known.length
          ? `Known regions for ${cc}: ${known.join(", ")}. Omit region for the nationwide calendar.`
          : `${cc} has no regional calendars; omit the region parameter.`,
      );
    }
    regionKey = rr;
  }
  return {
    country: cc,
    region: regionKey || null,
    holidays: snap.regions[regionKey],
    weekend: weekendTable.overrides[cc] || weekendTable.default,
    meta: { source: snap.source, verifiedAt: snap.generatedAt, years: snap.years },
  };
}

export function parseWeekendOverride(weekend) {
  if (weekend === undefined || weekend === "") return null;
  const NAMES = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  const presets = { "sat-sun": [6, 0], "fri-sat": [5, 6] };
  if (presets[weekend]) return presets[weekend];
  if (weekend.startsWith("custom:")) {
    const days = weekend
      .slice(7)
      .split(",")
      .map((x) => NAMES[x.trim().toUpperCase()]);
    if (days.length && days.every((d) => d !== undefined)) return days;
  }
  throw new ApiError(
    400,
    "invalid_weekend",
    `weekend must be 'sat-sun', 'fri-sat' or 'custom:FRI,SAT', got: ${weekend}`,
    "Example: weekend=custom:THU,FRI",
  );
}

function guardRange(d, cal, field) {
  const y = d.getUTCFullYear();
  const [min, max] = [Math.min(...cal.meta.years), Math.max(...cal.meta.years)];
  if (y < min || y > max) {
    throw new ApiError(
      422,
      "out_of_range",
      `${field} year ${y} outside covered range ${min}-${max}.`,
      `Holiday data currently covers ${min}-${max}.`,
    );
  }
}

export function classify(d, cal, weekendOverride) {
  const weekend = weekendOverride || cal.weekend;
  const iso = fmt(d);
  const holidayName = cal.holidays[iso];
  if (weekend.includes(d.getUTCDay())) {
    return { isBusinessDay: false, reason: "weekend", holidayName: holidayName ?? null };
  }
  if (holidayName) {
    return { isBusinessDay: false, reason: "holiday", holidayName };
  }
  return { isBusinessDay: true, reason: null, holidayName: null };
}

export function check({ date, country, region, weekend }) {
  const cal = resolveCalendar(country, region);
  const d = parseISO(date, "date");
  guardRange(d, cal, "date");
  const w = parseWeekendOverride(weekend);
  return { date, country: cal.country, region: cal.region, ...classify(d, cal, w), ...cal.meta };
}

export function add({ start, days, country, region, weekend }) {
  const cal = resolveCalendar(country, region);
  let d = parseISO(start, "start");
  guardRange(d, cal, "start");
  const n = Number(days);
  if (!Number.isInteger(n) || Math.abs(n) > 5000) {
    throw new ApiError(
      400,
      "invalid_days",
      `days must be an integer between -5000 and 5000, got: ${days}`,
      "Example: days=14 or days=-3.",
    );
  }
  const w = parseWeekendOverride(weekend);
  const step = n >= 0 ? 1 : -1;
  const skipped = [];
  let remaining = Math.abs(n);
  while (remaining > 0) {
    d = addDays(d, step);
    guardRange(d, cal, "result");
    const c = classify(d, cal, w);
    if (c.isBusinessDay) {
      remaining--;
    } else {
      skipped.push({ date: fmt(d), reason: c.reason, holidayName: c.holidayName });
    }
  }
  return {
    start,
    days: n,
    resultDate: fmt(d),
    skipped,
    country: cal.country,
    region: cal.region,
    ...cal.meta,
  };
}

export function between({ from, to, country, region, weekend }) {
  const cal = resolveCalendar(country, region);
  const a = parseISO(from, "from");
  const b = parseISO(to, "to");
  guardRange(a, cal, "from");
  guardRange(b, cal, "to");
  if (b < a) {
    throw new ApiError(400, "invalid_range", "'to' must be on or after 'from'.",
      "Swap the parameters or check the dates.");
  }
  const w = parseWeekendOverride(weekend);
  let businessDays = 0;
  const holidays = [];
  // Convention: exclusive of 'from', inclusive of 'to' — matches "N business
  // days between order (from) and delivery (to)".
  for (let d = addDays(a, 1); d <= b; d = addDays(d, 1)) {
    const c = classify(d, cal, w);
    if (c.isBusinessDay) businessDays++;
    else if (c.reason === "holiday")
      holidays.push({ date: fmt(d), holidayName: c.holidayName });
  }
  return {
    from,
    to,
    businessDays,
    calendarDays: Math.round((b - a) / 86400000),
    holidays,
    country: cal.country,
    region: cal.region,
    convention: "exclusive-from,inclusive-to",
    ...cal.meta,
  };
}

function roll({ date, country, region, weekend }, step) {
  const cal = resolveCalendar(country, region);
  let d = parseISO(date, "date");
  guardRange(d, cal, "date");
  const w = parseWeekendOverride(weekend);
  do {
    d = addDays(d, step);
    guardRange(d, cal, "result");
  } while (!classify(d, cal, w).isBusinessDay);
  return { date, result: fmt(d), country: cal.country, region: cal.region, ...cal.meta };
}

export const next = (p) => {
  const r = roll(p, 1);
  return { ...r, nextBusinessDay: r.result, result: undefined };
};
export const previous = (p) => {
  const r = roll(p, -1);
  return { ...r, previousBusinessDay: r.result, result: undefined };
};
