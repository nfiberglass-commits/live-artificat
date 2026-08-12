// Runs the REAL page script under a minimal DOM stub and asserts the availability logic.
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, process.argv[2] || "ni-booking-page.html");
const html = fs.readFileSync(file, "utf8");

// --- pull the ids and data-t keys that genuinely exist in the markup ---
const realIds = new Set();
for (const m of html.matchAll(/\bid="([^"]+)"/g)) realIds.add(m[1]);
const dataTKeys = [];
for (const m of html.matchAll(/\bdata-t="([^"]+)"/g)) dataTKeys.push(m[1]);

const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
if (!scriptMatch) throw new Error("no <script> found");
const code = scriptMatch[1];

// --- minimal DOM ---
const missingIds = [];
const listeners = new Map();

function makeEl(tag) {
  const el = {
    tagName: tag,
    children: [],
    style: {},
    _attrs: {},
    _text: "",
    className: "",
    hidden: false,
    disabled: false,
    value: "",
    placeholder: "",
    type: "",
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); this.children.length = 0; },
    set innerHTML(v) { this.children.length = 0; this._text = ""; },
    get innerHTML() { return ""; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(ev, fn) {
      if (!listeners.has(this)) listeners.set(this, {});
      listeners.get(this)[ev] = fn;
    },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    scrollIntoView() {},
    focus() {},
    select() {},
    removeChild() {}
  };
  return el;
}

const byId = new Map();
for (const id of realIds) byId.set(id, makeEl("div"));

const dataTEls = dataTKeys.map(k => {
  const el = makeEl("span");
  el._attrs["data-t"] = k;
  return el;
});

const body = makeEl("body");

global.document = {
  getElementById(id) {
    if (!byId.has(id)) { missingIds.push(id); byId.set(id, makeEl("div")); }
    return byId.get(id);
  },
  createElement: makeEl,
  querySelectorAll(sel) { return sel === "[data-t]" ? dataTEls : []; },
  body,
  title: "",
  execCommand() { return true; }
};

// Simulate what the n8n host injects: FreeBusy start/end pairs, nothing else.
// Block 10:00-11:00 Cairo (= 07:00-08:00 UTC) on the first Sunday at/after today.
function nextSundayIso(hourUtc) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
}
const BUSY_START = nextSundayIso(7);   // 10:00 Cairo
const BUSY_END = nextSundayIso(8);     // 11:00 Cairo

global.window = {
  setTimeout() {}, setInterval() {}, location: { href: "" },
  NI_BUSY: [{ start: BUSY_START, end: BUSY_END }]
};
// Node 21+ ships a read-only `navigator` global, so a plain assignment is
// silently ignored. Define over it instead.
let copiedText = null;
Object.defineProperty(globalThis, "navigator", {
  value: { clipboard: { writeText(t) { copiedText = t; return Promise.resolve(); } } },
  configurable: true,
  writable: true
});
global.Intl = Intl;

// --- run the page script ---
eval(code);

// --- assertions ---
let failures = [];
function check(name, cond, detail) {
  if (cond) console.log("  PASS  " + name);
  else { console.log("  FAIL  " + name + (detail ? "  -> " + detail : "")); failures.push(name); }
}

console.log("\n== DOM wiring ==");
check("every getElementById matches a real id in the markup", missingIds.length === 0, missingIds.join(", "));
check("data-t nodes found in markup", dataTKeys.length > 0, String(dataTKeys.length));

console.log("\n== Intl / Cairo ==");
const offParts = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", timeZoneName: "longOffset" })
  .formatToParts(new Date("2026-08-12T09:00:00Z"));
const offName = offParts.find(p => p.type === "timeZoneName").value;
check("longOffset supported for Africa/Cairo", /GMT[+-]\d/.test(offName), offName);
check("Cairo is GMT+03:00 in August 2026", offName === "GMT+03:00", offName);
const arFmt = new Intl.DateTimeFormat("ar-EG", { timeZone: "Africa/Cairo", weekday: "short" }).format(new Date());
check("Arabic locale renders a weekday", arFmt.length > 0, arFmt);

console.log("\n== week grid ==");
const week = byId.get("week");
check("week renders exactly 7 day columns", week.children.length === 7, String(week.children.length));

// first column must be a Saturday in Cairo
const firstHead = week.children[0].children[0];
const firstName = firstHead.children[0]._text;
check("first column is Saturday", /^Sat/i.test(firstName), firstName);

// find the Friday column (index 6 when the week starts Saturday)
const friCol = week.children[6];
const friName = friCol.children[0].children[0]._text;
check("seventh column is Friday", /^Fri/i.test(friName), friName);
const friBody = friCol.children[1];
check("Friday column is closed (hatched band, no slots)", friBody.className === "closed", friBody.className);
check("Friday band says weekend", /weekend/i.test(friBody.children[0]._text), friBody.children[0]._text);

console.log("\n== slot rules (default type = Quick call, 20m) ==");
// gather all slot start labels across the week
function slotLabels(col) {
  const b = col.children[1];
  if (!b || b.className !== "slots") return [];
  return b.children.map(s => s.children[0]._text);
}
let allSlots = [];
for (const col of week.children) allSlots = allSlots.concat(slotLabels(col));
check("some bookable slots were generated", allSlots.length > 0, String(allSlots.length));

const toMin = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
check("no slot starts before 09:30", allSlots.every(s => toMin(s) >= 570), allSlots.filter(s => toMin(s) < 570).join(","));
check("no 20m slot ends after 16:30", allSlots.every(s => toMin(s) + 20 <= 990), allSlots.filter(s => toMin(s) + 20 > 990).join(","));
check("the extended hours are used (a slot starts at or after 16:00)",
  allSlots.some(s => toMin(s) >= 960), allSlots.join(","));
const inBreak = allSlots.filter(s => { const m = toMin(s); return m >= 780 && m < 840; });
check("no slot starts inside the held 13:00-14:00 hour", inBreak.length === 0, inBreak.join(","));

const uniq = [...new Set(allSlots)].sort((a, b) => toMin(a) - toMin(b));
console.log("       distinct start times: " + uniq.join(" "));

console.log("\n== notice rule ==");
// today's column should be blocked for a 1-working-day notice
const todayCol = week.children.find(c => (c.className || "").includes("today"));
if (todayCol) {
  const bodyEl = todayCol.children[1];
  check("today is not bookable (needs one working day's notice)",
    bodyEl.className === "closed" && /notice/i.test(bodyEl.children[0]._text),
    bodyEl.className + " / " + (bodyEl.children[0] ? bodyEl.children[0]._text : ""));
} else {
  console.log("  SKIP  today is outside the rendered week");
}

console.log("\n== factory visit (90m, 3 working days) ==");
// click the "Factory visit" type button and re-check
const typesHost = byId.get("types");
const visitBtn = typesHost.children.find(b => /Factory visit/.test(b.children[0]._text));
check("factory visit type button exists", !!visitBtn);
if (visitBtn) {
  const weekLabelBefore = byId.get("weekLabel")._text;
  listeners.get(visitBtn).click();
  const weekLabelAfter = byId.get("weekLabel")._text;
  let visitSlots = [];
  for (const col of byId.get("week").children) visitSlots = visitSlots.concat(slotLabels(col));
  check("selecting a 3-day-notice meeting lands on a week that has slots", visitSlots.length > 0,
    "week moved " + weekLabelBefore + " -> " + weekLabelAfter + ", slots=" + visitSlots.length);
  console.log("       week jumped: " + weekLabelBefore + "  ->  " + weekLabelAfter);
  const bad = visitSlots.filter(s => toMin(s) + 90 > 990);
  check("no 90m slot overruns 16:30", bad.length === 0, bad.join(","));
  const straddle = visitSlots.filter(s => toMin(s) < 840 && toMin(s) + 90 > 780);
  check("no 90m slot straddles the held midday hour", straddle.length === 0, straddle.join(","));
  const uniqV = [...new Set(visitSlots)].sort((a, b) => toMin(a) - toMin(b));
  console.log("       visit start times: " + (uniqV.join(" ") || "(none)"));
}

console.log("\n== busy blocks from Google Calendar ==");
// back to the 20m quick call and the earliest week, then find the injected busy day
const callBtn = typesHost.children.find(b => /Quick call/.test(b.children[0]._text));
listeners.get(callBtn).click();
listeners.get(byId.get("today")).click();

function allSlotNodes() {
  const out = [];
  for (const col of byId.get("week").children) {
    const b = col.children[1];
    if (b && b.className === "slots") for (const s of b.children) out.push(s);
  }
  return out;
}
let nodes = allSlotNodes();
let hops = 0;
while (!nodes.some(s => s.className === "slot taken") && hops < 3) {
  listeners.get(byId.get("next")).click();
  nodes = allSlotNodes();
  hops++;
}
const takenNodes = nodes.filter(s => s.className === "slot taken");
check("busy times render as taken slots", takenNodes.length > 0, "found " + takenNodes.length);
if (takenNodes.length) {
  const times = takenNodes.map(s => s.children[0]._text).sort();
  console.log("       taken: " + times.join(" "));
  check("a 20m call is blocked at 10:00 and 10:30, not 11:00",
    times.includes("10:00") && times.includes("10:30") && !times.includes("11:00"),
    times.join(","));
  check("taken slots are disabled", takenNodes.every(s => s.disabled === true));
  check("taken slots carry no aria-pressed (not selectable)",
    takenNodes.every(s => s.getAttribute("aria-pressed") === null));
  check("taken slots expose only a time and the word Booked",
    takenNodes.every(s => s.children.length === 2 && /^\d\d:\d\d$/.test(s.children[0]._text) && s.children[1]._text === "Booked"),
    JSON.stringify(takenNodes[0].children.map(c => c._text)));
  check("no taken slot has a click handler", takenNodes.every(s => !listeners.has(s)));
}
const freeNodes = nodes.filter(s => s.className === "slot");
check("free slots still exist alongside busy ones", freeNodes.length > 0, String(freeNodes.length));

console.log("\n== language toggle ==");
const langBtn = byId.get("lang");
listeners.get(langBtn).click();
check("body switches to RTL", body._attrs.dir === "rtl", body._attrs.dir);
check("lang button now offers English", langBtn._text === "English", langBtn._text);
const weekAr = byId.get("week");
check("week still renders 7 columns in Arabic", weekAr.children.length === 7, String(weekAr.children.length));
const arDay = weekAr.children[0].children[0].children[0]._text;
check("Arabic weekday label is non-empty", arDay.length > 0, arDay);
listeners.get(langBtn).click(); // back to EN
check("body returns to LTR", body._attrs.dir === "ltr", body._attrs.dir);

console.log("\n== holiday ==");
// jump forward to the week containing 25 Aug 2026 (Mawlid)
const next = byId.get("next");
let foundHoliday = false;
for (let i = 0; i < 3; i++) {
  listeners.get(next).click();
  for (const col of byId.get("week").children) {
    const b = col.children[1];
    if (b && b.className === "closed" && /Mawlid/i.test(b.children[0]._text || "")) foundHoliday = true;
  }
  if (foundHoliday) break;
}
check("Mawlid 25-Aug-2026 renders as a closed day", foundHoliday);

console.log("\n== the form asks employees for two things only ==");
const inputIds = [...html.matchAll(/<(?:input|textarea|select)[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
check("exactly two fields on the form", inputIds.length === 2, inputIds.join(","));
check("they are who-is-coming and the points",
  inputIds.sort().join(",") === "fAttend,fTopic", inputIds.join(","));
check("no name / company / email / phone field remains",
  !/\bid="f(Name|Company|Email|Phone)"/.test(html));
check("no timezone picker remains", !/\bid="tz"/.test(html));

// Pick a real free slot, fill the form, and inspect exactly what gets sent.
const freeSlot = allSlotNodes().find(s => s.className === "slot");
check("a free slot is available to select", !!freeSlot);
if (freeSlot) {
  listeners.get(freeSlot).click();
  check("clicking a slot opens the booking panel", byId.get("booking").hidden === false,
    "hidden=" + byId.get("booking").hidden);
  check("the panel shows the Cairo time", !!byId.get("bhCairo")._text, byId.get("bhCairo")._text);
  byId.get("fAttend").value = "Magdy, Sara";
  byId.get("fTopic").value = "SO3437 delivery date\nSafaga install crew";
  listeners.get(byId.get("copy")).click();

  check("the request was produced", !!copiedText, String(copiedText).slice(0, 60));
  if (copiedText) {
    check("it names who is coming", /Attending: Magdy, Sara/.test(copiedText));
    check("each point becomes its own line",
      /- SO3437 delivery date/.test(copiedText) && /- Safaga install crew/.test(copiedText));
    check("it carries the time and the meeting length",
      /Requested time:/.test(copiedText) && /\(20 min\)/.test(copiedText));
    check("it asks for no company, email or phone",
      !/Company|Email|Phone/i.test(copiedText), copiedText.slice(0, 80));
    console.log("       --- what Ahmed receives ---");
    copiedText.split("\n").forEach(l => console.log("       " + l));
  }
}

console.log("\n== injected calendar data ==");
const dataMatch = html.match(/<script id="ni-busy-data">([\s\S]*?)<\/script>/);
check("the calendar data block exists", !!dataMatch);
if (dataMatch) {
  const sandbox = { window: {} };
  let parsed = true;
  try { new (require("vm").Script)(dataMatch[1]).runInNewContext(sandbox); }
  catch (e) { parsed = false; check("data block parses", false, e.message); }
  if (parsed) {
    const rows = sandbox.window.NI_BUSY || [];
    check("data block parses and holds entries", rows.length > 0, String(rows.length));
    const keys = new Set();
    rows.forEach(r => Object.keys(r).forEach(k => keys.add(k)));
    check("every entry has ONLY start and end",
      [...keys].sort().join(",") === "end,start", [...keys].join(","));
    // Test the DATA, not the comment above it.
    const serialised = JSON.stringify(rows);
    check("no entry carries a title, guest or note",
      !/summary|title|attendee|description|guest|location|creator|organizer/i.test(serialised),
      serialised.slice(0, 120));
    check("nothing Arabic or descriptive leaked into the data",
      !/[؀-ۿ]/.test(serialised) && /^[\[\]{}",:\w+\-.: ]*$/.test(serialised),
      serialised.slice(0, 80));
    check("every entry is a valid interval",
      rows.every(r => !isNaN(Date.parse(r.start)) && !isNaN(Date.parse(r.end)) && Date.parse(r.end) > Date.parse(r.start)));
    check("a sync date is stamped", !!sandbox.window.NI_SYNCED, String(sandbox.window.NI_SYNCED));

    // How many of these actually land inside the bookable window?
    const inWindow = rows.filter(r => {
      const h = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hour12: false });
      const s = h.format(new Date(r.start)), e = h.format(new Date(r.end));
      const m = (t) => { const [hh, mm] = t.split(":").map(Number); return hh * 60 + mm; };
      return m(e) > 570 && m(s) < 990;   // overlaps 09:30-16:30
    });
    console.log("       " + rows.length + " busy blocks, " + inWindow.length + " inside bookable hours:");
    inWindow.forEach(r => {
      const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
      console.log("         " + f.format(new Date(r.start)) + " -> " + new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(r.end)));
    });
  }
}

console.log("\n" + (failures.length ? "FAILURES: " + failures.length + " -> " + failures.join(" | ") : "ALL CHECKS PASSED"));
process.exit(failures.length ? 1 : 0);
