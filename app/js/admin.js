// The approvals panel. Only ever rendered for the admin, and even then the
// database is the real gate: an employee who forced this panel open would still
// be refused by the update policy, and any date they sent would be reverted.

import { t, fmt } from "./i18n.js";
import { state, isAdmin } from "./store.js";
import { cairoInstant, CAIRO, typeById } from "./schedule.js";
import { decide, saveRequest, moveMeeting, cancelMeeting } from "./data.js";
import { toast } from "./ui.js";

const $ = (id) => document.getElementById(id);

// Ahmed asked for control over the length: stretch a call that grew an agenda,
// or halve a slot that does not need the hour. Employees still book the type's
// fixed length; only these admin cards carry the selector.
const DUR_CHOICES = [20, 30, 45, 60, 90, 120];

function durSelect(current, title) {
  const sel = document.createElement("select");
  const opts = DUR_CHOICES.includes(current) ? DUR_CHOICES : [current, ...DUR_CHOICES];
  for (const m of opts) {
    const o = document.createElement("option");
    o.value = String(m);
    o.textContent = m + "m";
    if (m === current) o.selected = true;
    sel.appendChild(o);
  }
  sel.title = title;
  return sel;
}

export function renderApprovals(onDone) {
  const panel = $("approvals");
  if (!isAdmin()) { panel.hidden = true; return; }

  const tr = t();
  panel.hidden = false;
  const host = $("apprList");
  host.innerHTML = "";

  if (!state.pending.length) {
    const empty = document.createElement("div");
    empty.className = "approvals-empty";
    empty.textContent = tr.apprNone;
    host.appendChild(empty);
    return;
  }

  state.pending.forEach((req) => host.appendChild(card(req, tr, onDone)));
}

// Meetings already agreed. Approving used to be the end of the story: the
// request left this panel and the only way to move it was Google Calendar, which
// the page cannot see. Now it stays here until it has happened.
export function renderUpcoming(onDone) {
  const panel = $("upcoming");
  if (!panel) return;
  if (!isAdmin()) { panel.hidden = true; return; }

  const tr = t();
  panel.hidden = false;
  const host = $("upcomingList");
  host.innerHTML = "";

  if (!state.upcoming.length) {
    const empty = document.createElement("div");
    empty.className = "approvals-empty";
    empty.textContent = tr.upNone;
    host.appendChild(empty);
    return;
  }

  state.upcoming.forEach((req) => host.appendChild(upcomingCard(req, tr, onDone)));
}

function upcomingCard(req, tr, onDone) {
  const el = document.createElement("div");
  el.className = "req";

  const startsAt = new Date(req.starts_at);
  const mins = Math.round((Date.parse(req.ends_at) - startsAt.getTime()) / 60000);
  const parts = cairoParts(req.starts_at);

  const top = document.createElement("div");
  top.className = "req-top";

  const who = document.createElement("span");
  who.className = "req-who";
  who.textContent = state.people[req.requester_id] || req.attending || tr.apprUnknownWho;

  const type = document.createElement("span");
  type.className = "req-type";
  const known = typeById(req.type_id);
  type.textContent = (known ? (state.lang === "ar" ? known.ar : known.en) : req.type_label) + " · " + mins + "m";

  top.append(who, type);
  el.appendChild(top);

  const move = document.createElement("div");
  move.className = "req-move";
  const dateIn = document.createElement("input");
  dateIn.type = "date";
  dateIn.value = parts.date;
  dateIn.title = tr.apprMove;
  const timeIn = document.createElement("input");
  timeIn.type = "time";
  timeIn.step = "300";
  timeIn.value = parts.time;
  timeIn.title = tr.apprMove;
  const durIn = durSelect(mins, tr.apprDur);
  move.append(dateIn, timeIn, durIn);
  el.appendChild(move);

  if (String(req.points || "").trim()) {
    const points = document.createElement("div");
    points.className = "req-points-read";
    points.textContent = req.points;
    el.appendChild(points);
  }

  const acts = document.createElement("div");
  acts.className = "req-acts";

  const save = document.createElement("button");
  save.type = "button";
  save.className = "btn";
  save.textContent = tr.upMove;
  save.addEventListener("click", async () => {
    const when = readWhen(dateIn.value, timeIn.value);
    if (!when) { toast(tr.upBadTime); return; }
    save.disabled = true;
    try {
      await moveMeeting(req.id, when, Number(durIn.value) || mins);
      toast(tr.upMoved);
      await onDone();
    } catch (e) {
      // The clash guard speaks here: the database refuses a move onto a time
      // that is already taken, whatever this page believes.
      toast(/guard|overlap|busy|conflict/i.test(String(e && e.message)) ? tr.upClash : tr.upMoveFailed);
      save.disabled = false;
    }
  });

  const off = document.createElement("button");
  off.type = "button";
  off.className = "btn btn-quiet";
  off.textContent = tr.upCancel;
  off.addEventListener("click", async () => {
    if (!window.confirm(tr.upCancelConfirm)) return;
    off.disabled = true;
    try {
      await cancelMeeting(req.id);
      toast(tr.upCancelled);
      await onDone();
    } catch {
      toast(tr.upCancelFailed);
      off.disabled = false;
    }
  });

  acts.append(save, off);
  el.appendChild(acts);
  return el;
}

// The two inputs are Cairo wall clock; cairoInstant turns them back into the
// real moment, which is what keeps a summer/winter change from shifting a
// meeting by an hour.
function readWhen(dateStr, timeStr) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  const t2 = /^(\d{2}):(\d{2})$/.exec(String(timeStr || ""));
  if (!d || !t2) return null;
  const mins = Number(t2[1]) * 60 + Number(t2[2]);
  // 🚨 MONTH IS ZERO-BASED. cairoInstant feeds Date.UTC, so August is 7, not 8.
  // Passing the calendar month straight through moved a real meeting from
  // 17 August to 17 September - right time, wrong month, no error anywhere.
  return cairoInstant(Number(d[1]), Number(d[2]) - 1, Number(d[3]), mins);
}

// The stored instant, expressed as Cairo wall clock, for the date and time
// inputs. Reading it back through cairoInstant() is what keeps a summer/winter
// offset change from shifting a meeting by an hour.
function cairoParts(iso) {
  const d = new Date(iso);
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAIRO, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(d);
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: CAIRO, hour: "2-digit", minute: "2-digit", hour12: false
  }).format(d);
  return { date: ymd, time: hm };
}

function card(req, tr, onDone) {
  const el = document.createElement("div");
  el.className = "req";

  const startsAt = new Date(req.starts_at);
  const mins = Math.round((Date.parse(req.ends_at) - startsAt.getTime()) / 60000);
  const parts = cairoParts(req.starts_at);

  const top = document.createElement("div");
  top.className = "req-top";

  // Who asked comes first. "Who is attending" is useful, but the decision is
  // about a person, and reading a card without knowing whose request it is was
  // the first thing that went wrong in real use.
  const who = document.createElement("span");
  who.className = "req-who";
  who.textContent = state.people[req.requester_id] || tr.apprUnknownWho;

  const guests = document.createElement("span");
  guests.className = "req-type";
  guests.textContent = req.attending;

  const type = document.createElement("span");
  type.className = "req-type";
  // Label from the current language, not the English string stored at booking
  // time - otherwise an Arabic page shows "Quick call" forever.
  const known = typeById(req.type_id);
  const label = known ? (state.lang === "ar" ? known.ar : known.en) : req.type_label;
  type.textContent = label + " · " + mins + "m";

  const asked = document.createElement("span");
  asked.className = "req-type";
  asked.textContent = fmt(startsAt, { weekday: "short", day: "numeric", month: "short" }) +
    "  " + fmt(startsAt, { hour: "2-digit", minute: "2-digit", hour12: false });

  top.append(who, guests, type, asked);
  el.appendChild(top);

  // Date and time are editable here and nowhere else.
  const move = document.createElement("div");
  move.className = "req-move";
  const dateIn = document.createElement("input");
  dateIn.type = "date";
  dateIn.value = parts.date;          // always ISO, whatever the display locale
  dateIn.title = tr.apprMove;
  const timeIn = document.createElement("input");
  timeIn.type = "time";
  timeIn.step = "300";
  timeIn.value = parts.time;
  timeIn.title = tr.apprMove;
  const durIn = durSelect(mins, tr.apprDur);
  move.append(dateIn, timeIn, durIn);
  el.appendChild(move);

  const points = document.createElement("textarea");
  points.className = "req-points-edit";
  points.value = req.points || "";
  el.appendChild(points);

  const acts = document.createElement("div");
  acts.className = "req-acts";

  const save = document.createElement("button");
  save.type = "button";
  save.className = "btn btn-ghost";
  save.textContent = tr.save;

  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "btn";
  yes.textContent = tr.apprApprove;

  const no = document.createElement("button");
  no.type = "button";
  no.className = "btn btn-ghost";
  no.textContent = tr.apprDecline;

  const lock = (on) => { save.disabled = yes.disabled = no.disabled = on; };

  function movedTimes() {
    const [y, m, d] = dateIn.value.split("-").map(Number);
    const [hh, mm] = timeIn.value.split(":").map(Number);
    if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
    const start = cairoInstant(y, m - 1, d, hh * 60 + mm);
    const chosen = Number(durIn.value) || mins;
    return { startIso: start.toISOString(), endIso: new Date(start.getTime() + chosen * 60000).toISOString() };
  }

  save.addEventListener("click", async () => {
    const text = points.value.trim();
    if (!text) { toast(tr.needTopic); points.focus(); return; }
    const times = movedTimes();
    lock(true);
    try {
      await saveRequest(req.id, { ...(times || {}), points: text });
      toast(tr.saved);
      await onDone();
    } catch (err) {
      toast(err.taken ? tr.slotGone : tr.saveFailed);
      lock(false);
    }
  });

  const run = async (status, message) => {
    lock(true);
    try {
      // Save any edit first, so approving books the time actually on screen.
      const text = points.value.trim();
      const times = movedTimes();
      if (status === "approved" && text) {
        await saveRequest(req.id, { ...(times || {}), points: text });
      }
      await decide(req.id, status);
      toast(message);
      await onDone();
    } catch (err) {
      toast(err.taken ? tr.slotGone : tr.apprFailed);
      lock(false);
    }
  };

  yes.addEventListener("click", () => run("approved", tr.apprDone));
  no.addEventListener("click", () => run("declined", tr.apprDropped));

  acts.append(save, yes, no);
  el.appendChild(acts);
  return el;
}
