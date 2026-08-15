// Entry point: wires auth, data, realtime and the UI together.

import { state, set, isAdmin } from "./store.js";
import { t } from "./i18n.js";
import { onAuth, sendLink, signInWithPassword, signInWithPin, signOut, tidyUrl } from "./auth.js";
import { loadBusy, loadMyRequests, loadPending, requestMeeting, watch, stopWatching } from "./data.js";
import { renderApprovals } from "./admin.js";
import { renderMine } from "./mine.js";
import {
  applyLang, renderTypes, renderWeek, renderSession, wireChrome,
  jumpToFirstAvailable, tickClock, toast, currentType, requestText, closeBooking
} from "./ui.js";

const $ = (id) => document.getElementById(id);

/* ---------- redraw ---------- */

function redraw() {
  renderWeek();
  renderMine(refreshAll);
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

// Employee code + PIN is the way in for the team; the email route stays for the
// accounts that predate it. Swapping between them clears the note so a stale
// error from one form is never read as a complaint about the other.
function showGate(which) {
  const pin = which === "pin";
  $("gatePinBox").hidden = !pin;
  $("gateEmailBox").hidden = pin;
  $("gateNote").textContent = "";
  (pin ? $("gateCode") : $("gateEmail")).focus();
}

$("gateUseEmail").addEventListener("click", () => showGate("email"));
$("gateUsePin").addEventListener("click", () => showGate("pin"));

$("gatePinIn").addEventListener("click", async () => {
  const tr = t();
  const btn = $("gatePinIn");
  const note = $("gateNote");
  btn.disabled = true;
  note.textContent = "";
  try {
    await signInWithPin($("gateCode").value, $("gatePin").value);
    $("gatePin").value = "";   // don't leave it sitting in the field
  } catch (err) {
    note.textContent =
      err.missing ? tr.gatePinMissing :
      err.badCredentials ? tr.gatePinWrong :
      err.message === "PIN_UNREACHABLE" ? tr.gatePinDown :
      tr.gateSignInFailed;
  } finally {
    btn.disabled = false;
  }
});

// Enter should submit, because this form is two short fields and nobody will
// reach for the mouse.
["gateCode", "gatePin"].forEach((id) => {
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("gatePinIn").click();
  });
});

$("gateSignIn").addEventListener("click", async () => {
  const tr = t();
  const btn = $("gateSignIn");
  const note = $("gateNote");
  btn.disabled = true;
  note.textContent = "";
  try {
    await signInWithPassword($("gateEmail").value, $("gatePass").value);
    $("gatePass").value = "";   // don't leave it sitting in the field
    note.textContent = "";
  } catch (err) {
    note.textContent =
      err.missing ? tr.gateMissing :
      err.badCredentials ? tr.gateWrong :
      err.unconfirmed ? tr.gateUnconfirmed :
      tr.gateSignInFailed;
  } finally {
    btn.disabled = false;
  }
});

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

for (const id of ["gateEmail", "gatePass"]) {
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("gateSignIn").click();
  });
}

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

// Note whether we arrived on a sign-in link BEFORE anything touches the URL.
// The Supabase client reads the code out of the address bar asynchronously, so
// clearing it here would destroy the very thing it needs.
const arrivedOnLink =
  /[?&]code=/.test(window.location.search) ||
  /access_token=|error=/.test(window.location.hash);

applyLang();
renderTypes();
jumpToFirstAvailable();
renderWeek();
renderSession();
tickClock();
window.setInterval(tickClock, 15000);
wireChrome(() => { renderMine(refreshAll); renderApprovals(refreshAll); });

onAuth(async (session) => {
  if (!session) {
    stopWatching();
    set({ loading: false });
    applyLang();
    redraw();
    // Arriving on a link and still having no session means the exchange failed.
    // Say so, instead of silently showing the sign-in card again.
    if (arrivedOnLink) {
      $("gateNote").textContent = t().gateLinkFailed;
      tidyUrl();
    }
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
