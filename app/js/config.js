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
