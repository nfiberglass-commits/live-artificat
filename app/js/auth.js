// Sign-in by one-time email link.
//
// No password is ever typed, stored or transmitted by this page, which removes
// a whole class of problem from an internal tool. The admin role is decided by
// a database trigger on sign-up, never by anything the browser sends.

import { supabase } from "./supabase.js";
import { set } from "./store.js";
import { loadProfile } from "./data.js";

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
export function onAuth(handler) {
  supabase.auth.onAuthStateChange(async (_event, session) => {
    set({ session: session || null });
    if (session?.user) {
      try { await loadProfile(session.user.id); }
      catch { set({ profile: null }); }
    } else {
      set({ profile: null });
    }
    handler(session || null);
  });
}

// The magic link returns with tokens in the address bar. Once the client has
// consumed them there is no reason to leave them on screen or in history.
export function tidyUrl() {
  if (window.location.hash || window.location.search.includes("code=")) {
    history.replaceState({}, "", window.location.pathname);
  }
}
