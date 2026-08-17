import { test } from "node:test";
import assert from "node:assert/strict";
import { check, add, between, next, previous, ApiError } from "../src/core.js";

// ---------- Germany: national vs. Bundesland ----------
test("DE: Tag der Deutschen Einheit is a holiday nationwide (Sat in 2026)", () => {
  const r = check({ date: "2026-10-03", country: "DE" });
  assert.equal(r.isBusinessDay, false);
  // 2026-10-03 is a Saturday -> weekend takes precedence as reason, holiday still noted
  assert.equal(r.reason, "weekend");
  assert.ok(r.holidayName);
});

test("DE: Fronleichnam 2026-06-04 is holiday in BY, business day in BE", () => {
  const by = check({ date: "2026-06-04", country: "DE", region: "BY" });
  assert.equal(by.isBusinessDay, false);
  assert.equal(by.reason, "holiday");
  const be = check({ date: "2026-06-04", country: "DE", region: "BE" });
  assert.equal(be.isBusinessDay, true);
});

test("DE: add 3 business days over Easter 2026 (Karfreitag 04-03, Ostermontag 04-06)", () => {
  // Wed 2026-04-01 + 3 business days: Thu 04-02(1), Fri=Karfreitag skip,
  // Sat/Sun skip, Mon=Ostermontag skip, Tue 04-07(2), Wed 04-08(3)
  const r = add({ start: "2026-04-01", days: 3, country: "DE" });
  assert.equal(r.resultDate, "2026-04-08");
  const skippedDates = r.skipped.map((s) => s.date);
  assert.ok(skippedDates.includes("2026-04-03"));
  assert.ok(skippedDates.includes("2026-04-06"));
});

test("DE: negative days go backwards", () => {
  // Tue 2026-04-07 - 1 business day: Mon=Ostermontag skip, Sun/Sat skip, Fri=Karfreitag skip, Thu 04-02
  const r = add({ start: "2026-04-07", days: -1, country: "DE" });
  assert.equal(r.resultDate, "2026-04-02");
});

// ---------- USA: federal holidays ----------
test("US: Independence Day observed — 2026-07-03 (Fri) is holiday, 07-04 is Sat", () => {
  const fri = check({ date: "2026-07-03", country: "US" });
  assert.equal(fri.isBusinessDay, false);
  assert.equal(fri.reason, "holiday");
});

test("US: Thanksgiving 2026-11-26 is a holiday", () => {
  const r = check({ date: "2026-11-26", country: "US" });
  assert.equal(r.isBusinessDay, false);
  assert.equal(r.reason, "holiday");
});

// ---------- Egypt: Fri/Sat weekend ----------
test("EG: Friday is weekend, Sunday is a business day", () => {
  // 2026-08-21 is a Friday, 2026-08-23 is a Sunday
  const fri = check({ date: "2026-08-21", country: "EG" });
  assert.equal(fri.isBusinessDay, false);
  assert.equal(fri.reason, "weekend");
  const sun = check({ date: "2026-08-23", country: "EG" });
  assert.equal(sun.isBusinessDay, true);
});

// ---------- Japan ----------
test("JP: Culture Day 2026-11-03 is a holiday", () => {
  const r = check({ date: "2026-11-03", country: "JP" });
  assert.equal(r.isBusinessDay, false);
  assert.equal(r.reason, "holiday");
});

// ---------- between ----------
test("DE: business days in calendar week over Easter 2026", () => {
  // from Wed 04-01 (exclusive) to Wed 04-08 (inclusive): 04-02, 04-07, 04-08 = 3
  const r = between({ from: "2026-04-01", to: "2026-04-08", country: "DE" });
  assert.equal(r.businessDays, 3);
  assert.equal(r.calendarDays, 7);
  assert.equal(r.holidays.length, 2);
});

// ---------- next / previous ----------
test("DE: next business day after Christmas 2026", () => {
  // 2026-12-24 Thu; 25th Fri holiday, 26th Sat, 27th Sun -> Mon 28th
  const r = next({ date: "2026-12-24", country: "DE" });
  assert.equal(r.nextBusinessDay, "2026-12-28");
});

test("DE: previous business day before Ostermontag", () => {
  const r = previous({ date: "2026-04-06", country: "DE" });
  assert.equal(r.previousBusinessDay, "2026-04-02");
});

// ---------- weekend override ----------
test("weekend override custom:THU,FRI", () => {
  // 2026-08-20 is a Thursday
  const r = check({ date: "2026-08-20", country: "DE", weekend: "custom:THU,FRI" });
  assert.equal(r.isBusinessDay, false);
  assert.equal(r.reason, "weekend");
});

// ---------- metadata / agent contract ----------
test("responses carry verifiedAt and source", () => {
  const r = check({ date: "2026-06-04", country: "DE", region: "BY" });
  assert.ok(r.verifiedAt);
  assert.ok(r.source);
});

// ---------- errors with hints ----------
test("unknown region yields 404 with hint listing known regions", () => {
  try {
    check({ date: "2026-06-04", country: "DE", region: "BAY" });
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof ApiError);
    assert.equal(e.status, 404);
    assert.match(e.hint, /BY/);
  }
});

test("invalid date yields 400 with example hint", () => {
  try {
    check({ date: "2026-13-99", country: "DE" });
    assert.fail("should throw");
  } catch (e) {
    assert.equal(e.status, 400);
    assert.ok(e.hint);
  }
});

test("year outside snapshot range yields 422", () => {
  try {
    check({ date: "2031-01-01", country: "DE" });
    assert.fail("should throw");
  } catch (e) {
    assert.equal(e.status, 422);
  }
});
