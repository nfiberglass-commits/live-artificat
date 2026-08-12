// Every database call the page makes, and the realtime subscriptions.
//
// Row Level Security decides what comes back, so these queries are written
// plainly: ask for everything, and let Postgres hand over only what this user
// is allowed to see.

import { supabase, isSlotTaken } from "./supabase.js";
import { BUSY_WINDOW_DAYS } from "./config.js";
import { state, set, setBusyFromRows, isAdmin } from "./store.js";

function windowBounds() {
  const from = new Date();
  const to = new Date(Date.now() + BUSY_WINDOW_DAYS * 86400000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/* ---------- reads ---------- */

export async function loadBusy() {
  const { from, to } = windowBounds();
  const { data, error } = await supabase
    .from("busy_slots")
    .select("starts_at, ends_at")   // the table has nothing else worth asking for
    .lt("starts_at", to)
    .gt("ends_at", from)
    .order("starts_at");
  if (error) throw error;
  setBusyFromRows(data);
  return data;
}

export async function loadMyRequests() {
  const { data, error } = await supabase
    .from("meeting_requests")
    .select("id, starts_at, ends_at, type_label, attending, points, status, created_at")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at");
  if (error) throw error;
  set({ myRequests: data || [] });
  return data;
}

export async function loadPending() {
  if (!isAdmin()) { set({ pending: [] }); return []; }
  const { data, error } = await supabase
    .from("meeting_requests")
    .select("id, requester_id, starts_at, ends_at, type_label, attending, points, status, created_at")
    .eq("status", "pending")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at");
  if (error) throw error;
  set({ pending: data || [] });
  return data;
}

export async function loadProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  set({ profile: data || null });
  return data;
}

/* ---------- writes ---------- */

export async function requestMeeting({ startIso, endIso, typeId, typeLabel, attending, points }) {
  const { data, error } = await supabase
    .from("meeting_requests")
    .insert({
      // requester_id and status are forced server-side; sending them is pointless
      starts_at: startIso,
      ends_at: endIso,
      type_id: typeId,
      type_label: typeLabel,
      attending,
      points
    })
    .select("id, starts_at, ends_at, status")
    .single();

  if (error) {
    const err = new Error(isSlotTaken(error) ? "SLOT_TAKEN" : (error.message || "REQUEST_FAILED"));
    err.taken = isSlotTaken(error);
    throw err;
  }
  return data;
}

export async function decide(id, status) {
  const { error } = await supabase
    .from("meeting_requests")
    .update({ status })
    .eq("id", id);
  if (error) {
    const err = new Error(isSlotTaken(error) ? "SLOT_TAKEN" : (error.message || "DECIDE_FAILED"));
    err.taken = isSlotTaken(error);
    throw err;
  }
}

export async function withdraw(id) {
  const { error } = await supabase.from("meeting_requests").delete().eq("id", id);
  if (error) throw error;
}

/* ---------- realtime ---------- */

let channel = null;

// Busy slots move for everyone; request rows arrive filtered by RLS, so an
// employee is only ever told about their own.
export function watch(onChange) {
  stopWatching();
  channel = supabase
    .channel("booking")
    .on("postgres_changes", { event: "*", schema: "public", table: "busy_slots" }, async () => {
      await loadBusy();
      onChange("busy");
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "meeting_requests" }, async () => {
      await Promise.all([loadMyRequests(), loadPending()]);
      onChange("requests");
    })
    .subscribe();
  return channel;
}

export function stopWatching() {
  if (channel) { supabase.removeChannel(channel); channel = null; }
}
