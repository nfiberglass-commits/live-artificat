// Everything the page currently believes, in one place, with a change signal.
//
// Modules never reach into each other's state; they read from here and
// subscribe. That is what keeps the realtime updates from turning into a web of
// cross-module calls.

const listeners = new Set();

export const state = {
  session: null,        // Supabase session, or null when signed out
  profile: null,        // { id, email, full_name, role }
  busy: [],             // [{ s, e }] epoch millis - times only, never detail
  myRequests: [],       // this user's own requests
  pending: [],          // admin only: everyone's pending requests
  people: {},           // admin only: user id -> full name, to label a request
  myTabs: [],           // tabs this person may open, defaults already resolved
  tab: "booking",       // which one is on screen
  allTabs: [],          // admin only: the whole catalogue
  access: {},           // admin only: user id -> { tab key -> allowed }
  roles: {},            // admin only: user id -> role
  // Arabic first - the people booking are the Nile team, and English is the
  // second click rather than the default one.
  lang: "ar",
  typeId: "followup",
  weekOffset: 0,
  selected: null,
  loading: true
};

export function isAdmin() {
  return state.profile?.role === "admin";
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function set(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state);
}

/* ---------- busy times ---------- */

// Rows arrive as {starts_at, ends_at} and are reduced to two numbers each.
// Nothing else is carried, so no caller can accidentally render a detail.
export function setBusyFromRows(rows) {
  const busy = [];
  for (const r of rows || []) {
    const s = Date.parse(r.starts_at);
    const e = Date.parse(r.ends_at);
    if (!Number.isNaN(s) && !Number.isNaN(e) && e > s) busy.push({ s, e });
  }
  busy.sort((a, b) => a.s - b.s);
  set({ busy });
}

export function overlapsBusy(instant, mins) {
  const s = instant.getTime();
  const e = s + mins * 60000;
  return state.busy.some((b) => s < b.e && e > b.s);
}
