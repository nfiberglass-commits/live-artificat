// Deployment settings.
//
// The publishable key is meant to be public - it identifies the project, it does
// not grant access. Every table is behind Row Level Security, so what a visitor
// can actually read or write is decided by Postgres, not by this file.

export const SUPABASE_URL = "https://ontzivaoxshhsfqglibi.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vXNWj3Gjse1NJE14NxxxSw_u34U2yq-";

// How far ahead the page loads busy times. Matches the 3-week booking horizon
// with a margin so the last visible week is never short of data.
export const BUSY_WINDOW_DAYS = 35;

// Shown on the sign-in card so people know who to chase if they cannot get in.
export const SUPPORT_EMAIL = "a.abbas@nileindustries.com";

// Employee code + PIN are checked against hr_panel_users by n8n, which then hands
// back a real Supabase session. The service key stays on that server and never
// reaches the browser, so this endpoint grants nothing on its own - a wrong PIN
// gets a 401 and Row Level Security still decides what a valid session may read.
export const PIN_LOGIN_URL = "https://n8n.srv1901390.hstgr.cloud/webhook/ni-book-login";

// Names for the sign-in dropdown. Returns employee code and name only - no PIN
// and no other column. ⚠ This does publish the staff list to anyone who opens
// the page; Ahmed weighed that against making people remember a number and chose
// the dropdown, matching the HR panels they already use.
export const USERS_URL = "https://n8n.srv1901390.hstgr.cloud/webhook/ni-book-users";

// The PIN list, for the admin only. n8n verifies the session token with Supabase
// and reads the caller's role with its own key before answering - being signed
// in is not the same as being allowed.
export const PINS_URL = "https://n8n.srv1901390.hstgr.cloud/webhook/ni-access-pins-session";
