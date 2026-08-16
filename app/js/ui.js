// All DOM rendering. The markup and classes are exactly those of the original
// page, so the look is unchanged; only where the data comes from has moved.

import { t, fmt, hhmm, toggleLang } from "./i18n.js";
import { state, set, isAdmin, overlapsBusy, labelFor } from "./store.js";
import {
  CAIRO, HORIZON_WEEKS, HOLIDAYS, TYPES,
  cairoToday, cairoInstant, addDays, weekdayOf, isoOf, compare,
  minToClock, slotsFor, typeById, baseWeekStart, weekIndexOf, earliestDate
} from "./schedule.js";

const $ = (id) => document.getElementById(id);

export function currentType() { return typeById(state.typeId); }

export function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  window.setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 4000);
}

export function jumpToFirstAvailable() {
  const idx = weekIndexOf(earliestDate(currentType().notice), state.typeId);
  if (idx > state.weekOffset) state.weekOffset = Math.min(idx, HORIZON_WEEKS);
}

function weekStart() {
  return addDays(baseWeekStart(state.typeId), state.weekOffset * 7);
}

/* ---------- meeting types ---------- */

export function renderTypes() {
  const host = $("types");
  host.innerHTML = "";
  TYPES.forEach((type) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "type";
    b.setAttribute("aria-pressed", String(type.id === state.typeId));

    const span = document.createElement("span");
    span.textContent = type[state.lang];
    const mins = document.createElement("span");
    mins.className = "mins";
    mins.textContent = type.mins + "m";
    b.appendChild(span);
    b.appendChild(mins);

    b.addEventListener("click", () => {
      set({ typeId: type.id, selected: null });
      $("booking").hidden = true;
      jumpToFirstAvailable();
      renderTypes();
      renderWeek();
    });
    host.appendChild(b);
  });
}

/* ---------- the week grid ---------- */

export function renderWeek() {
  const host = $("week");
  host.innerHTML = "";
  const start = weekStart();
  const today = cairoToday();
  const tr = t();

  const first = cairoInstant(start.y, start.mo, start.d, 12);
  const lastC = addDays(start, 6);
  const last = cairoInstant(lastC.y, lastC.mo, lastC.d, 12);
  $("weekLabel").textContent =
    fmt(first, { day: "numeric", month: "short" }) + " – " +
    fmt(last, { day: "numeric", month: "short", year: "numeric" });

  $("prev").disabled = state.weekOffset <= 0;
  $("next").disabled = state.weekOffset >= HORIZON_WEEKS;

  for (let i = 0; i < 7; i++) {
    const c = addDays(start, i);
    const col = document.createElement("div");
    col.className = "day";
    if (compare(c, today) === 0) col.className += " today";

    const noon = cairoInstant(c.y, c.mo, c.d, 12);
    const head = document.createElement("div");
    head.className = "day-head";
    const nm = document.createElement("div");
    nm.className = "day-name";
    nm.textContent = fmt(noon, { weekday: "short" });
    const dt = document.createElement("div");
    dt.className = "day-date";
    dt.textContent = fmt(noon, { day: "2-digit", month: "2-digit" });
    head.appendChild(nm);
    head.appendChild(dt);
    col.appendChild(head);

    const holiday = HOLIDAYS[isoOf(c)];

    if (weekdayOf(c) === 5 || holiday) {
      col.appendChild(closedBlock(holiday ? holiday[state.lang] : tr.friday, true));
    } else if (compare(c, today) < 0) {
      col.appendChild(closedBlock(tr.past));
    } else {
      const res = slotsFor(c, state.typeId, overlapsBusy);
      if (res.blocked === "notice") {
        col.appendChild(closedBlock(tr.notice));
      } else if (!res.list.length) {
        const no = document.createElement("div");
        no.className = "none";
        no.textContent = tr.noSlots;
        col.appendChild(no);
      } else {
        col.appendChild(slotBox(res.list, tr));
      }
    }
    host.appendChild(col);
  }
}

function closedBlock(text, preLine) {
  const el = document.createElement("div");
  el.className = "closed";
  const s = document.createElement("span");
  if (preLine) s.style.whiteSpace = "pre-line";
  s.textContent = text;
  el.appendChild(s);
  return el;
}

function slotBox(list, tr) {
  const box = document.createElement("div");
  box.className = "slots";
  list.forEach((sl) => {
    const b = document.createElement("button");
    b.type = "button";

    const top = document.createElement("span");
    top.textContent = minToClock(sl.start);
    b.appendChild(top);

    if (sl.busy) {
      b.className = "slot taken";
      b.disabled = true;
      const tk = document.createElement("span");
      tk.className = "local";
      // Ahmed sees WHAT is in the slot; everyone else sees only that it is
      // taken. labelFor returns nothing unless the reader is the admin, so this
      // one line cannot leak a subject by accident.
      const label = labelFor(sl.instant, typeById(state.typeId).mins);
      if (label) {
        tk.textContent = label;
        tk.title = label;
        b.classList.add("taken-named");
      } else {
        tk.textContent = tr.taken;
      }
      b.appendChild(tk);
      box.appendChild(b);
      return;
    }

    b.className = "slot";
    b.setAttribute("aria-pressed",
      String(!!state.selected && state.selected.instant.getTime() === sl.instant.getTime()));

    b.addEventListener("click", () => {
      set({ selected: sl });
      renderWeek();
      openBooking();
    });
    box.appendChild(b);
  });
  return box;
}

/* ---------- the booking panel ---------- */

export function openBooking() {
  if (!state.selected) return;
  const type = currentType();
  const box = $("booking");
  box.hidden = false;

  $("bhCairo").textContent =
    fmt(state.selected.instant, { weekday: "short", day: "numeric", month: "short" }) +
    "  " + minToClock(state.selected.start);
  $("bhType").textContent = type[state.lang] + " · " + type.mins + "m";
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

export function closeBooking() {
  set({ selected: null });
  $("booking").hidden = true;
}

export function requestText() {
  const tr = t();
  const type = currentType();
  const v = (id) => $(id).value.trim();
  const lines = [tr.reqTitle, ""];
  lines.push(tr.rWhen + ": " +
    fmt(state.selected.instant, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) +
    " — " + minToClock(state.selected.start));
  lines.push(tr.rType + ": " + type[state.lang] + " (" + type.mins + " min)");
  lines.push(tr.rAttend + ": " + v("fAttend"));
  lines.push("");
  lines.push(tr.rTopic + ":");
  v("fTopic").split("\n").forEach((line) => {
    if (line.trim()) lines.push("  - " + line.trim());
  });
  lines.push("", "— " + tr.rSentFrom);
  return lines.join("\n");
}

/* ---------- language and chrome ---------- */

export function applyLang() {
  const tr = t();
  document.body.setAttribute("dir", state.lang === "ar" ? "rtl" : "ltr");
  document.body.setAttribute("lang", state.lang === "ar" ? "ar" : "en");

  document.querySelectorAll("[data-t]").forEach((node) => {
    const key = node.getAttribute("data-t");
    if (tr[key]) node.textContent = tr[key];
  });

  $("synced").textContent = state.loading
    ? tr.loading
    : (state.busy.length ? tr.live : "");

  $("send").textContent = tr.btnBook;
  $("lang").textContent = tr.lang;
  $("clockLabel").textContent = tr.clockLabel;
  $("fTopic").placeholder = tr.topicPlaceholder;
  $("fAttend").placeholder = tr.attendPlaceholder;
  document.title = state.lang === "ar"
    ? "احجز اجتماعاً — أحمد عباس، نايل إندستريز"
    : "Book a meeting — Ahmed Abbas, Nile Industries";
}

// Ahmed is the person these meetings are WITH, so the booking form makes no
// sense for him - it would invite him to request time from himself. He gets the
// other side of the same screen: his week, and what is waiting on him.
//
// This is driven by who is signed in, not by a second "administrator" account.
// One person, one identity; two accounts would split his approvals across them
// and Headcount would grant admin to both anyway.
export function applyAdminView() {
  const admin = isAdmin();
  document.body.classList.toggle("is-owner", admin);

  const h1 = document.querySelector('[data-t="h1"]');
  const sub = document.querySelector('[data-t="sub"]');
  const tr = t();
  if (h1) h1.textContent = admin ? tr.h1Owner : tr.h1;
  if (sub) sub.textContent = admin ? tr.subOwner : tr.sub;
}

export function renderSession() {
  const tr = t();
  const bar = $("session");
  const signedIn = Boolean(state.session);
  bar.hidden = !signedIn;
  $("gate").hidden = signedIn;
  if (!signedIn) return;

  // Show the person, not the plumbing. Signing in by employee code produces an
  // address like emp-18@staff.nileindustries.local, which is an identifier the
  // system needs and the reader never should. The name is what they recognise.
  $("sessionWho").textContent =
    state.profile?.full_name ||
    state.session.user?.user_metadata?.full_name ||
    state.profile?.email ||
    state.session.user?.email ||
    "";
  const role = $("sessionRole");
  role.hidden = !isAdmin();
  role.textContent = tr.roleAdmin;
}

export function tickClock() {
  $("clock").textContent = hhmm(new Date());
}

export function wireChrome(onRefresh) {
  $("prev").addEventListener("click", () => {
    if (state.weekOffset > 0) { state.weekOffset--; closeBooking(); renderWeek(); }
  });
  $("next").addEventListener("click", () => {
    if (state.weekOffset < HORIZON_WEEKS) { state.weekOffset++; closeBooking(); renderWeek(); }
  });
  $("today").addEventListener("click", () => {
    state.weekOffset = 0;
    jumpToFirstAvailable();
    closeBooking();
    renderWeek();
  });
  $("lang").addEventListener("click", () => {
    toggleLang();
    applyLang();
    renderTypes();
    renderWeek();
    renderSession();
    onRefresh();
    if (state.selected) openBooking();
  });
}
