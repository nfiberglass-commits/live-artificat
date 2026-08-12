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

    // Let the client consume the sign-in link from the address bar. Nothing may
    // clear the URL before this has run, or the code is destroyed unused.
    detectSessionInUrl: true,

    // Deliberately NOT pkce. PKCE keeps its verifier in the localStorage of the
    // browser that asked for the link, so a mail client that opens the link in a
    // different browser - or its own in-app viewer, which Outlook does - can
    // never complete the exchange. For an internal tool opened from whatever
    // mail app someone happens to use, that fails constantly.
    // The implicit flow returns the session in the URL fragment, which never
    // reaches a server and works whichever browser opens it.
    flowType: "implicit"
  },
  realtime: { params: { eventsPerSecond: 5 } }
});

// A Postgres error we raise deliberately when two people reach for the same slot.
export const SLOT_TAKEN = "SLOT_TAKEN";

export function isSlotTaken(error) {
  if (!error) return false;
  return error.code === "23505" || /SLOT_TAKEN/.test(error.message || "");
}
