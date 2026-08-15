// Sign-in by one-time email link.
//
// No password is ever typed, stored or transmitted by this page, which removes
// a whole class of problem from an internal tool. The admin role is decided by
// a database trigger on sign-up, never by anything the browser sends.

import { supabase } from "./supabase.js";
import { set } from "./store.js";
import { loadProfile } from "./data.js";
import { PIN_LOGIN_URL, USERS_URL } from "./config.js";

// The names shown in the sign-in dropdown. Anything unexpected in the response
// is treated as "no list", so the card falls back to typing a code rather than
// rendering junk.
export async function fetchPeople() {
  const res = await fetch(USERS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("PEOPLE_FAILED");
  const data = await res.json();
  if (!data || !Array.isArray(data.people)) throw new Error("PEOPLE_FAILED");
  return data.people
    .filter((p) => p && String(p.code || "").trim() && String(p.name || "").trim())
    .map((p) => ({ code: String(p.code).trim(), name: String(p.name).trim() }));
}

// Employee code + PIN, the same pair people already use on the HR panels.
//
// The PIN itself proves nothing to Postgres. n8n checks it against
// hr_panel_users and returns a genuine Supabase session, so from here on the
// database is still the thing enforcing every rule - this is a different way in,
// not a way around. Identity is the employee code, never the email column:
// several people share departmental mailboxes.
export async function signInWithPin(code, pin) {
  const c = String(code || "").trim();
  const p = String(pin || "").trim();
  if (!c || !p) {
    const err = new Error("MISSING");
    err.missing = true;
    throw err;
  }

  let res;
  try {
    res = await fetch(PIN_LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: c, pin: p })
    });
  } catch {
    throw new Error("PIN_UNREACHABLE");
  }

  if (res.status === 401) {
    const err = new Error("BAD_PIN");
    err.badCredentials = true;
    throw err;
  }
  if (!res.ok) throw new Error("PIN_LOGIN_FAILED");

  const data = await res.json().catch(() => ({}));
  if (!data.ok || !data.access_token || !data.refresh_token) {
    const err = new Error("BAD_PIN");
    err.badCredentials = true;
    throw err;
  }

  const { error } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token
  });
  if (error) throw error;
}

// Accounts are created by Ahmed in the Supabase dashboard, so the page signs in
// and never signs up. Nobody can create themselves an account from here.
export async function signInWithPassword(email, password) {
  const clean = String(email || "").trim().toLowerCase();
  if (!clean || !password) {
    const err = new Error("MISSING");
    err.missing = true;
    throw err;
  }
  const { error } = await supabase.auth.signInWithPassword({ email: clean, password });
  if (error) {
    const err = new Error(error.message || "SIGNIN_FAILED");
    err.badCredentials = /invalid login credentials/i.test(error.message || "");
    err.unconfirmed = /email not confirmed/i.test(error.message || "");
    throw err;
  }
}

export async function sendLink(email) {
  const clean = String(email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
    const err = new Error("BAD_EMAIL");
    err.badEmail = true;
    throw err;
  }
  const { error } = await supabase.auth.signInWithOtp({
    email: clean,
    options: { emailRedirectTo: window.location.origin + window.location.pathname }
  });
  if (error) throw error;
  return clean;
}

export async function signOut() {
  await supabase.auth.signOut();
  set({ session: null, profile: null, busy: [], myRequests: [], pending: [], selected: null });
}

export async function currentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

// Fires once now and again on every future auth change.
//
// 🚨 The callback runs INSIDE the client's auth lock, and everything below it
// (loadProfile, then the whole refresh) calls Supabase again - which waits for
// that same lock. Awaiting here deadlocks: the session is stored, but
// setSession() never resolves and the gate never closes. So the state is set
// synchronously and the rest is handed to a fresh task, outside the lock.
export function onAuth(handler) {
  supabase.auth.onAuthStateChange((_event, session) => {
    set({ session: session || null });
    setTimeout(async () => {
      if (session?.user) {
        try { await loadProfile(session.user.id); }
        catch { set({ profile: null }); }
      } else {
        set({ profile: null });
      }
      handler(session || null);
    }, 0);
  });
}

// The magic link returns with tokens in the address bar. Once the client has
// consumed them there is no reason to leave them on screen or in history.
export function tidyUrl() {
  if (window.location.hash || window.location.search.includes("code=")) {
    history.replaceState({}, "", window.location.pathname);
  }
}
