// The approvals panel. Only ever rendered for the admin, and even then the
// database is the real gate: an employee who forced this panel open would still
// be refused by the update policy, and any date they sent would be reverted.

import { t, fmt } from "./i18n.js";
import { state, isAdmin } from "./store.js";
import { cairoInstant, CAIRO } from "./schedule.js";
import { decide, saveRequest } from "./data.js";
import { toast } from "./ui.js";

const $ = (id) => document.getElementById(id);

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

  const who = document.createElement("span");
  who.className = "req-who";
  who.textContent = req.attending;

  const type = document.createElement("span");
  type.className = "req-type";
  type.textContent = req.type_label + " · " + mins + "m";

  const asked = document.createElement("span");
  asked.className = "req-type";
  asked.textContent = fmt(startsAt, { weekday: "short", day: "numeric", month: "short" }) +
    "  " + fmt(startsAt, { hour: "2-digit", minute: "2-digit", hour12: false });

  top.append(who, type, asked);
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
  move.append(dateIn, timeIn);
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
    return { startIso: start.toISOString(), endIso: new Date(start.getTime() + mins * 60000).toISOString() };
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
