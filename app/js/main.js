// Entry point: wires auth, data, realtime and the UI together.

import { state, set, isAdmin } from "./store.js";
import { t } from "./i18n.js";
import { onAuth, sendLink, signOut, tidyUrl } from "./auth.js";
import { loadBusy, loadMyRequests, loadPending, requestMeeting, watch, stopWatching } from "./data.js";
import { renderApprovals } from "./admin.js";
import {
  applyLang, renderTypes, renderWeek, renderSession, wireChrome,
  jumpToFirstAvailable, tickClock, toast, currentType, requestText, closeBooking
} from "./ui.js";

const $ = (id) => document.getElementById(id);

/* ---------- redraw ---------- */

function redraw() {
  renderWeek();
  renderApprovals(refreshAll);
  renderSession();
}

async function refreshAll() {
  await Promise.all([loadBusy(), loadMyRequests(), loadPending()]);
  set({ loading: false });
  applyLang();
  redraw();
}

/* ---------- sign-in gate ---------- */

$("gateSend").addEventListener("click", async () => {
  const tr = t();
  const btn = $("gateSend");
  const note = $("gateNote");
  btn.disabled = true;
  note.textContent = "";
  try {
    await sendLink($("gateEmail").value);
    note.textContent = tr.gateSent;
  } catch (err) {
    note.textContent = err.badEmail ? tr.gateBadEmail : tr.gateFailed;
  } finally {
    btn.disabled = false;
  }
});

$("gateEmail").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("gateSend").click();
});

$("signOut").addEventListener("click", async () => {
  stopWatching();
  await signOut();
  applyLang();
  redraw();
});

/* ---------- requesting a meeting ---------- */

$("send").addEventListener("click", async () => {
  if (!state.selected) return;
  const tr = t();
  const attending = $("fAttend").value.trim();
  const points = $("fTopic").value.trim();

  if (!attending) { toast(tr.needAttend); $("fAttend").focus(); return; }
  if (!points) { toast(tr.needTopic); $("fTopic").focus(); return; }

  const btn = $("send");
  const type = currentType();
  btn.disabled = true;
  toast(tr.sending);

  try {
    const startIso = state.selected.instant.toISOString();
    const endIso = new Date(state.selected.instant.getTime() + type.mins * 60000).toISOString();
    await requestMeeting({
      startIso, endIso,
      typeId: type.id,
      typeLabel: type.en,
      attending, points
    });
    $("fAttend").value = "";
    $("fTopic").value = "";
    closeBooking();
    toast(tr.sent);
    await refreshAll();
  } catch (err) {
    toast(err.taken ? tr.slotGone : tr.sendFailed);
    if (err.taken) await refreshAll();
  } finally {
    btn.disabled = false;
  }
});

$("copy").addEventListener("click", async () => {
  if (!state.selected) return;
  const tr = t();
  const text = requestText();
  try {
    await navigator.clipboard.writeText(text);
    toast(tr.copied);
  } catch {
    toast(tr.copyFail);
  }
});

/* ---------- boot ---------- */

tidyUrl();
applyLang();
renderTypes();
jumpToFirstAvailable();
renderWeek();
renderSession();
tickClock();
window.setInterval(tickClock, 15000);
wireChrome(() => renderApprovals(refreshAll));

onAuth(async (session) => {
  if (!session) {
    stopWatching();
    set({ loading: false });
    applyLang();
    redraw();
    return;
  }
  tidyUrl();
  set({ loading: true });
  applyLang();
  try {
    await refreshAll();
    watch(() => { applyLang(); redraw(); });
  } catch {
    set({ loading: false });
    toast(t().sendFailed);
    applyLang();
    redraw();
  }
});
