// Unit tests for the extracted scheduling module.
//
// schedule.js is pure, so it imports straight into Node - no DOM stub needed.
// These assert the same rules the original single-file page was tested against.

import {
  DAY_START, DAY_END, BREAK_A, BREAK_B, HOLIDAYS, TYPES,
  cairoToday, cairoInstant, addDays, weekdayOf, isoOf, compare,
  minToClock, slotsFor, typeById, earliestDate, isClosed, offsetMinutes, baseWeekStart
} from "./app/js/schedule.js";
import { STRINGS } from "./app/js/i18n-strings.js";

let bad = 0;
const check = (name, ok, extra) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (extra ? "  ->  " + extra : ""));
  if (!ok) bad++;
};

console.log("\n== constants survived the split ==");
check("working day is 09:30-16:30", DAY_START === 570 && DAY_END === 990, DAY_START + "-" + DAY_END);
check("midday hold is 13:00-14:00", BREAK_A === 780 && BREAK_B === 840);
// 🚨 Regression guard. A date input reads "2026-08-17", but cairoInstant feeds
// Date.UTC where months are zero-based. Passing 8 instead of 7 moved a real
// meeting from 17 August to 17 September, silently. Never again.
{
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec("2026-08-17");
  const instant = cairoInstant(Number(d[1]), Number(d[2]) - 1, Number(d[3]), 12 * 60);
  const shown = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(instant);
  check("a date input round-trips to the same Cairo day", shown === "2026-08-17", shown);
}

check("six meeting types", TYPES.length === 6, TYPES.map(t => t.id).join(","));
// The first entry is what the page pre-selects, so this is Ahmed's default.
check("follow-up is the default and runs 60m",
  TYPES[0].id === "followup" && TYPES[0].mins === 60, TYPES[0].mins + "m");
// Zero notice everywhere is Ahmed's decision (17-08): a slot is only a request,
// so the gate is his approval, not a waiting period.
check("factory visit is 90m with zero notice",
  typeById("visit").mins === 90 && typeById("visit").notice === 0);
check("every type carries zero notice", TYPES.every(t => t.notice === 0),
  TYPES.map(t => t.id + ":" + t.notice).join(","));
check("Mawlid is still a closure", Boolean(HOLIDAYS["2026-08-25"]));
check("both languages present", Boolean(STRINGS.en && STRINGS.ar));
check("Arabic strings are actually Arabic", /[؀-ۿ]/.test(STRINGS.ar.h1), STRINGS.ar.h1);

console.log("\n== Cairo time ==");
check("Cairo is GMT+3 in August 2026",
  offsetMinutes(new Date("2026-08-15T09:00:00Z"), "Africa/Cairo") === 180);
const inst = cairoInstant(2026, 7, 17, 570);   // 17 Aug 2026, 09:30 Cairo
check("09:30 Cairo maps to 06:30 UTC", inst.toISOString() === "2026-08-17T06:30:00.000Z", inst.toISOString());

console.log("\n== closures ==");
check("Friday is closed", isClosed({ y: 2026, mo: 7, d: 14 }), "14 Aug 2026 is a Friday");
check("Saturday is open", !isClosed({ y: 2026, mo: 7, d: 15 }));
check("Mawlid is closed", isClosed({ y: 2026, mo: 7, d: 25 }));
check("weekdayOf agrees with the calendar", weekdayOf({ y: 2026, mo: 7, d: 14 }) === 5);
check("isoOf pads correctly", isoOf({ y: 2026, mo: 0, d: 3 }) === "2026-01-03", isoOf({ y: 2026, mo: 0, d: 3 }));

console.log("\n== notice counts working days only ==");
const oneDay = earliestDate(1);
check("one day's notice never lands on a Friday or holiday", !isClosed(oneDay), isoOf(oneDay));
check("one day's notice is after today", compare(oneDay, cairoToday()) > 0, isoOf(oneDay));
const threeDay = earliestDate(3);
check("three days' notice is later than one", compare(threeDay, oneDay) > 0, isoOf(threeDay));
check("three days' notice skips closures too", !isClosed(threeDay), isoOf(threeDay));

console.log("\n== slot generation ==");
const day = addDays(earliestDate(1), 0);
const quick = slotsFor(day, "call", null);
const starts = quick.list.map(s => minToClock(s.start));
check("slots exist on the earliest bookable day", quick.list.length > 0, starts.join(" "));
check("nothing before 09:30", quick.list.every(s => s.start >= 570));
check("nothing ends after 16:30", quick.list.every(s => s.end <= 990));
check("nothing inside the midday hold",
  quick.list.every(s => !(s.start < BREAK_B && s.end > BREAK_A)),
  starts.join(" "));
check("the extended hours are reachable", starts.includes("16:00"), starts.join(" "));

const visitDay = earliestDate(typeById("visit").notice);
const visit = slotsFor(visitDay, "visit", null);
check("90m slots never overrun 16:30", visit.list.every(s => s.end <= 990),
  visit.list.map(s => minToClock(s.start)).join(" "));
check("a 90m slot can start at 15:00",
  visit.list.some(s => s.start === 900), visit.list.map(s => minToClock(s.start)).join(" "));

console.log("\n== zero notice opens today ==");
const sameDay = slotsFor(cairoToday(), "call", null);
check("today is not blocked by notice", sameDay.blocked === null, String(sameDay.blocked));
check("today generates slots", sameDay.list.length > 0, String(sameDay.list.length));

console.log("\n== busy predicate is honoured ==");
const target = cairoInstant(visitDay.y, visitDay.mo, visitDay.d, 600); // 10:00
const withBusy = slotsFor(visitDay, "call", (at) => at.getTime() === target.getTime());
const taken = withBusy.list.filter(s => s.busy).map(s => minToClock(s.start));
check("the injected busy predicate marks exactly one slot", taken.length === 1, taken.join(","));
check("10:00 is the slot marked busy", taken[0] === "10:00", taken.join(","));

console.log("\n== week anchoring ==");
const base = baseWeekStart("call");
check("the grid always opens on a Saturday", weekdayOf(base) === 6, isoOf(base));

console.log("\n" + (bad ? "FAILURES: " + bad : "ALL CHECKS PASSED"));
process.exit(bad ? 1 : 0);
