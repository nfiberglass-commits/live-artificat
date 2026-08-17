// Every database call the page makes, and the realtime subscriptions.
//
// Row Level Security decides what comes back, so these queries are written
// plainly: ask for everything, and let Postgres hand over only what this user
// is allowed to see.

import { supabase, isSlotTaken } from "./supabase.js";
import { BUSY_WINDOW_DAYS, AGENDA_URL } from "./config.js";
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
    .select("id, starts_at, ends_at, type_id, type_label, attending, points, location, status, created_at")
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
    .select("id, requester_id, starts_at, ends_at, type_id, type_label, attending, points, location, status, created_at")
    .eq("status", "pending")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at");
  if (error) throw error;
  set({ pending: data || [] });
  return data;
}

// Who asked for each meeting. There is no foreign key to embed through, so the
// names are fetched separately - and only for the admin, whose policy is the one
// that permits reading other people's profiles at all. An employee calling this
// gets their own row back and nothing else.
export async function loadPeople() {
  if (!isAdmin()) { set({ people: {} }); return {}; }
  const { data, error } = await supabase.from("profiles").select("id, full_name");
  if (error) throw error;
  const people = {};
  for (const row of data || []) {
    if (row.full_name) people[row.id] = row.full_name;
  }
  set({ people });
  return people;
}

// Which tabs this person may open. The database resolves the defaults, so the
// page never has to reason about them.
export async function loadMyTabs() {
  const { data, error } = await supabase.rpc("my_tabs");
  if (error) throw error;
  set({ myTabs: data || [] });
  return data;
}

// The catalogue and every stored decision - admin only, and the policy on
// tab_access is what actually enforces that.
export async function loadAccessMatrix() {
  if (!isAdmin()) { set({ allTabs: [], access: {}, roles: {} }); return; }

  const [tabs, grants, profiles] = await Promise.all([
    supabase.from("tabs").select("key, label_en, label_ar, sort, default_on").eq("active", true).order("sort"),
    supabase.from("tab_access").select("user_id, tab_key, allowed"),
    supabase.from("profiles").select("id, role")
  ]);
  if (tabs.error) throw tabs.error;
  if (grants.error) throw grants.error;
  if (profiles.error) throw profiles.error;

  const access = {};
  for (const g of grants.data || []) {
    if (!access[g.user_id]) access[g.user_id] = {};
    access[g.user_id][g.tab_key] = g.allowed;
  }
  const roles = {};
  for (const p of profiles.data || []) roles[p.id] = p.role;

  set({ allTabs: tabs.data || [], access, roles });
}

export async function setTabAccess(userId, tabKey, allowed) {
  const { error } = await supabase
    .from("tab_access")
    .upsert({ user_id: userId, tab_key: tabKey, allowed, granted_by: state.session?.user?.id },
            { onConflict: "user_id,tab_key" });
  if (error) throw error;

  const access = { ...state.access };
  access[userId] = { ...(access[userId] || {}), [tabKey]: allowed };
  set({ access });
}

// Withdraw a request. The policy allows this only for your own row while it is
// still pending, so an approved meeting cannot vanish from Ahmed's calendar
// without him - he declines those, which is a different act with a different
// record.
export async function cancelRequest(id) {
  const { error } = await supabase.from("meeting_requests").delete().eq("id", id);
  if (error) throw error;
}

// Labels for the blocked slots on Ahmed's own screen: calendar titles from
// Google, plus the meetings he has approved here. Nothing is written to
// busy_slots - the label exists only in his browser, for as long as the page is
// open.
export async function loadAgenda() {
  if (!isAdmin()) { set({ agenda: [] }); return []; }

  const agenda = [];

  // Approved meetings are already ours to read, and the requester's name is more
  // use to Ahmed than a calendar title would be.
  const { data: mine } = await supabase
    .from("meeting_requests")
    .select("starts_at, ends_at, requester_id, attending")
    .eq("status", "approved")
    .gte("ends_at", new Date().toISOString());
  for (const r of mine || []) {
    const who = state.people[r.requester_id] || r.attending || "";
    agenda.push({ s: Date.parse(r.starts_at), e: Date.parse(r.ends_at), t: who, own: true });
  }

  // Calendar titles come from n8n, which checks the session before answering.
  try {
    const res = await fetch(AGENDA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: state.session?.access_token || "" })
    });
    const data = await res.json();
    if (data && data.ok) {
      for (const it of data.items || []) {
        agenda.push({ s: Date.parse(it.s), e: Date.parse(it.e), t: it.t, own: false });
      }
    }
  } catch {
    // A missing label is a cosmetic loss; the slot is still correctly blocked.
  }

  set({ agenda });
  return agenda;
}

// Meetings Ahmed has already approved and that have not happened yet. Without
// this they vanish from his screen the moment he approves, and the only way to
// move one is Google Calendar - where this page cannot see it.
export async function loadUpcoming() {
  if (!isAdmin()) { set({ upcoming: [] }); return []; }
  const { data, error } = await supabase
    .from("meeting_requests")
    .select("id, requester_id, starts_at, ends_at, type_id, type_label, attending, points, location, status")
    .eq("status", "approved")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at");
  if (error) throw error;
  set({ upcoming: data || [] });
  return data;
}

// Move an approved meeting, optionally to a new length. Without a length the
// duration is carried over rather than recomputed, so a 20-minute call stays
// 20 minutes wherever it lands. guard_slot_free runs on the update, so a move
// onto an occupied time is refused by the database.
export async function moveMeeting(id, startsAt, minutes) {
  const req = (state.upcoming || []).find((r) => r.id === id);
  if (!req) throw new Error("NOT_FOUND");
  const mins = minutes || Math.round((Date.parse(req.ends_at) - Date.parse(req.starts_at)) / 60000);
  const ends = new Date(startsAt.getTime() + mins * 60000);
  const { error } = await supabase
    .from("meeting_requests")
    .update({ starts_at: startsAt.toISOString(), ends_at: ends.toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// Call off an approved meeting. Marked cancelled rather than deleted so the
// requester can see it was called off instead of silently disappearing, and
// sync_busy_slot frees the time because the status is no longer 'approved'.
export async function cancelMeeting(id) {
  const { error } = await supabase
    .from("meeting_requests")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) throw error;
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

export async function requestMeeting({ startIso, endIso, typeId, typeLabel, attending, points, location }) {
  const { data, error } = await supabase
    .from("meeting_requests")
    .insert({
      // requester_id and status are forced server-side; sending them is pointless
      starts_at: startIso,
      ends_at: endIso,
      type_id: typeId,
      type_label: typeLabel,
      attending,
      points,
      location: location || null
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

// An employee saving their agenda. The database ignores anything else they
// might send, so this only ever moves the points.
export async function savePoints(id, points) {
  const { error } = await supabase
    .from("meeting_requests")
    .update({ points })
    .eq("id", id);
  if (error) throw error;
}

// Ahmed moving a meeting and rewriting its agenda in one save.
// A clash comes back as 409 from the database guard, not from the browser.
export async function saveRequest(id, { startIso, endIso, points, location }) {
  const patch = { points };
  if (location) patch.location = location;
  if (startIso && endIso) {
    patch.starts_at = startIso;
    patch.ends_at = endIso;
  }
  const { error } = await supabase.from("meeting_requests").update(patch).eq("id", id);
  if (error) {
    const err = new Error(isSlotTaken(error) ? "SLOT_TAKEN" : (error.message || "SAVE_FAILED"));
    err.taken = isSlotTaken(error);
    throw err;
  }
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
      // People too: a request can arrive from someone who signed in for the
      // first time after this page loaded, and an unnamed card is useless.
      await Promise.all([loadMyRequests(), loadPending(), loadPeople()]);
      onChange("requests");
    })
    .subscribe();
  return channel;
}

export function stopWatching() {
  if (channel) { supabase.removeChannel(channel); channel = null; }
}
