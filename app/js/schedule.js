// Pure scheduling logic: Cairo wall-clock maths, working days, slot generation.
//
// Nothing in here touches the DOM, the network or module state, so it can be
// unit tested directly in Node. Lifted unchanged from the original page.

import {
  CAIRO, DAY_START, DAY_END, BREAK_A, BREAK_B, STEP, HORIZON_WEEKS, HOLIDAYS, TYPES
} from "./calendar-config.js";

export { CAIRO, DAY_START, DAY_END, BREAK_A, BREAK_B, STEP, HORIZON_WEEKS, HOLIDAYS, TYPES };

/* ---------- time helpers ---------- */

export function offsetMinutes(instant, zone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, timeZoneName: "longOffset"
  }).formatToParts(instant);
  let name = "";
  for (const p of parts) if (p.type === "timeZoneName") name = p.value;
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
}

// Build the instant for a given Cairo wall-clock date and minute-of-day.
export function cairoInstant(y, mo, d, minutes) {
  const guess = new Date(Date.UTC(y, mo, d, 0, minutes) - 180 * 60000);
  const off = offsetMinutes(guess, CAIRO);
  return new Date(Date.UTC(y, mo, d, 0, minutes) - off * 60000);
}

// Today's civil date in Cairo, as {y, mo, d}.
export function cairoToday() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAIRO, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
  const b = p.split("-");
  return { y: +b[0], mo: +b[1] - 1, d: +b[2] };
}

export function addDays(c, n) {
  const t = new Date(Date.UTC(c.y, c.mo, c.d + n));
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth(), d: t.getUTCDate() };
}

// 0 Sun … 5 Fri … 6 Sat
export function weekdayOf(c) {
  return new Date(Date.UTC(c.y, c.mo, c.d)).getUTCDay();
}

export function isoOf(c) {
  return c.y + "-" + String(c.mo + 1).padStart(2, "0") + "-" + String(c.d).padStart(2, "0");
}

export function pad(n) { return String(n).padStart(2, "0"); }
export function minToClock(m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }

export function compare(a, b) {
  if (a.y !== b.y) return a.y - b.y;
  if (a.mo !== b.mo) return a.mo - b.mo;
  return a.d - b.d;
}

export function typeById(id) {
  return TYPES.find((t) => t.id === id) || TYPES[0];
}

export function isClosed(c) {
  return weekdayOf(c) === 5 || Boolean(HOLIDAYS[isoOf(c)]);
}

/* ---------- availability ---------- */

// Earliest civil date that satisfies the notice, counting working days only.
export function earliestDate(noticeDays) {
  let c = cairoToday();
  let counted = 0;
  while (counted < noticeDays) {
    c = addDays(c, 1);
    if (!isClosed(c)) counted++;
  }
  return c;
}

// Slots for one civil day. `isBusy(instant, mins)` decides what is taken, so
// this stays pure and the caller owns where busy times come from.
export function slotsFor(c, typeId, isBusy) {
  const type = typeById(typeId);
  const out = [];
  const earliest = earliestDate(type.notice);
  if (compare(c, earliest) < 0) return { blocked: "notice", list: out };

  for (let start = DAY_START; start + type.mins <= DAY_END; start += STEP) {
    const end = start + type.mins;
    // never straddle or sit inside the held midday hour
    if (start < BREAK_B && end > BREAK_A) continue;
    const at = cairoInstant(c.y, c.mo, c.d, start);
    out.push({ start, end, instant: at, busy: Boolean(isBusy && isBusy(at, type.mins)) });
  }
  return { blocked: null, list: out };
}

// The Saturday that opens the week containing the earliest bookable date.
export function baseWeekStart(typeId) {
  let c = earliestDate(typeById(typeId).notice);
  while (weekdayOf(c) !== 6) c = addDays(c, -1);
  return c;
}

// Which rendered week contains a given civil date (0 = the week shown at load).
export function weekIndexOf(target, typeId) {
  const base = baseWeekStart(typeId);
  const a = Date.UTC(base.y, base.mo, base.d);
  const b = Date.UTC(target.y, target.mo, target.d);
  return Math.floor((b - a) / (7 * 86400000));
}
