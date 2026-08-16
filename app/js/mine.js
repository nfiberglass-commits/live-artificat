// "Your requests" - what an employee sees of their own bookings.
//
// The agenda is editable; the time is rendered as plain text with no input at
// all, because only Ahmed moves a date. That is a courtesy to the reader, not
// the enforcement: the database reverts a date change from anyone but the admin
// even if this page were rewritten in the browser.

import { t, fmt } from "./i18n.js";
import { state } from "./store.js";
import { savePoints, cancelRequest } from "./data.js";
import { typeById } from "./schedule.js";
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
  // Same reason as the approvals card: show the label in the language on screen,
  // not the English one frozen at booking time.
  const known = typeById(req.type_id);
  type.textContent = (known ? (state.lang === "ar" ? known.ar : known.en) : req.type_label) + " · " + mins + "m";

  // 🚨 Three states, not two. Testing as Sara showed a request Ahmed had DECLINED
  // being labelled "waiting" - because the page only ever asked "is it approved?"
  // and called everything else pending. She would have gone on expecting an
  // answer that had already been given.
  const status = document.createElement("span");
  const shown = { approved: "is-approved", declined: "is-declined", cancelled: "is-declined" }[req.status] || "is-pending";
  const label = { approved: tr.statusApproved, declined: tr.statusDeclined, cancelled: tr.statusCancelled }[req.status] || tr.statusPending;
  status.className = "req-status " + shown;
  status.textContent = label;

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

  // Withdrawing is offered only while the request is still pending. Once Ahmed
  // has approved it the time is on his calendar, and taking it back is a
  // conversation rather than a button - the database refuses it either way.
  if (["pending", "declined", "cancelled"].includes(req.status)) {
    const declined = req.status !== "pending";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn-quiet";
    cancel.textContent = declined ? tr.clearReq : tr.cancelReq;
    cancel.addEventListener("click", async () => {
      if (!window.confirm(declined ? tr.clearConfirm : tr.cancelConfirm)) return;
      cancel.disabled = true;
      try {
        await cancelRequest(req.id);
        toast(tr.cancelled);
        await onSaved();
      } catch {
        toast(tr.cancelFailed);
        cancel.disabled = false;
      }
    });
    acts.appendChild(cancel);
  }

  el.appendChild(acts);
  return el;
}
