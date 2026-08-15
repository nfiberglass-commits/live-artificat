// "Your requests" - what an employee sees of their own bookings.
//
// The agenda is editable; the time is rendered as plain text with no input at
// all, because only Ahmed moves a date. That is a courtesy to the reader, not
// the enforcement: the database reverts a date change from anyone but the admin
// even if this page were rewritten in the browser.

import { t, fmt } from "./i18n.js";
import { state } from "./store.js";
import { savePoints } from "./data.js";
import { toast } from "./ui.js";

const $ = (id) => document.getElementById(id);

export function renderMine(onSaved) {
  const panel = $("mine");
  const signedIn = Boolean(state.session);
  panel.hidden = !signedIn;
  if (!signedIn) return;

  const tr = t();
  const host = $("mineList");
  host.innerHTML = "";

  if (!state.myRequests.length) {
    const empty = document.createElement("div");
    empty.className = "approvals-empty";
    empty.textContent = tr.mineNone;
    host.appendChild(empty);
    return;
  }

  state.myRequests.forEach((req) => host.appendChild(card(req, tr, onSaved)));
}

function card(req, tr, onSaved) {
  const el = document.createElement("div");
  el.className = "req";

  const startsAt = new Date(req.starts_at);
  const mins = Math.round((Date.parse(req.ends_at) - startsAt.getTime()) / 60000);

  const top = document.createElement("div");
  top.className = "req-top";

  const when = document.createElement("span");
  when.className = "req-when-fixed";
  when.textContent =
    fmt(startsAt, { weekday: "short", day: "numeric", month: "short" }) + "  " +
    fmt(startsAt, { hour: "2-digit", minute: "2-digit", hour12: false });
  when.title = tr.lockedDate;

  const type = document.createElement("span");
  type.className = "req-type";
  type.textContent = req.type_label + " · " + mins + "m";

  const status = document.createElement("span");
  status.className = "req-status " + (req.status === "approved" ? "is-approved" : "is-pending");
  status.textContent = req.status === "approved" ? tr.statusApproved : tr.statusPending;

  top.append(when, type, status);
  el.appendChild(top);

  const points = document.createElement("textarea");
  points.className = "req-points-edit";
  points.value = req.points || "";
  points.placeholder = tr.topicPlaceholder;
  el.appendChild(points);

  const acts = document.createElement("div");
  acts.className = "req-acts";

  const save = document.createElement("button");
  save.type = "button";
  save.className = "btn";
  save.textContent = tr.save;
  save.addEventListener("click", async () => {
    const text = points.value.trim();
    if (!text) { toast(tr.needTopic); points.focus(); return; }
    save.disabled = true;
    try {
      await savePoints(req.id, text);
      toast(tr.saved);
      await onSaved();
    } catch {
      toast(tr.saveFailed);
      save.disabled = false;
    }
  });

  acts.appendChild(save);
  el.appendChild(acts);
  return el;
}
