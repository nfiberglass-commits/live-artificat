// The Supabase client, loaded from the CDN as an ES module.
//
// esm.sh serves the browser build with its own dependencies resolved, so no
// bundler is needed and the site stays a folder of static files.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // The magic link comes back as a hash fragment; let the client consume it
    // and then we clean the address bar ourselves.
    detectSessionInUrl: true,
    flowType: "pkce"
  },
  realtime: { params: { eventsPerSecond: 5 } }
});

// A Postgres error we raise deliberately when two people reach for the same slot.
export const SLOT_TAKEN = "SLOT_TAKEN";

export function isSlotTaken(error) {
  if (!error) return false;
  return error.code === "23505" || /SLOT_TAKEN/.test(error.message || "");
}
