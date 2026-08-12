// The approvals panel. Only ever rendered for the admin, and even then the
// database is the real gate: an employee who forced this panel open would still
// be refused by the update policy on meeting_requests.

import { t, fmt } from "./i18n.js";
import { state, isAdmin } from "./store.js";
import { minToClock } from "./schedule.js";
import { decide } from "./data.js";
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

function card(req, tr, onDone) {
  const el = document.createElement("div");
  el.className = "req";

  const startsAt = new Date(req.starts_at);
  const mins = Math.round((Date.parse(req.ends_at) - startsAt.getTime()) / 60000);

  const top = document.createElement("div");
  top.className = "req-top";

  const when = document.createElement("span");
  when.className = "req-when";
  when.textContent =
    fmt(startsAt, { weekday: "short", day: "numeric", month: "short" }) + "  " +
    fmt(startsAt, { hour: "2-digit", minute: "2-digit", hour12: false });

  const type = document.createElement("span");
  type.className = "req-type";
  type.textContent = req.type_label + " · " + mins + "m";

  const who = document.createElement("span");
  who.className = "req-who";
  who.textContent = req.attending;

  top.append(when, type, who);
  el.appendChild(top);

  const points = document.createElement("ul");
  points.className = "req-points";
  String(req.points || "").split("\n").forEach((line) => {
    if (!line.trim()) return;
    const li = document.createElement("li");
    li.textContent = line.trim();
    points.appendChild(li);
  });
  el.appendChild(points);

  const acts = document.createElement("div");
  acts.className = "req-acts";

  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "btn";
  yes.textContent = tr.apprApprove;

  const no = document.createElement("button");
  no.type = "button";
  no.className = "btn btn-ghost";
  no.textContent = tr.apprDecline;

  const run = async (status, message) => {
    yes.disabled = no.disabled = true;
    try {
      await decide(req.id, status);
      toast(message);
      await onDone();
    } catch (err) {
      toast(err.taken ? tr.slotGone : tr.apprFailed);
      yes.disabled = no.disabled = false;
    }
  };

  yes.addEventListener("click", () => run("approved", tr.apprDone));
  no.addEventListener("click", () => run("declined", tr.apprDropped));

  acts.append(yes, no);
  el.appendChild(acts);
  return el;
}
