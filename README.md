# Meeting booking page — static site on Supabase

Employees pick an open slot with Ahmed, say who is coming and what needs
deciding. Ahmed approves or declines. Approving is what actually takes the slot.

No framework, no build step, no server. A folder of static files plus Postgres.

---

## Run it locally

```bash
node serve.js
```

Then open <http://localhost:4173>. A server is needed only because ES modules
cannot load over `file://` — the deployed site needs nothing but a static host.

## Deploy it

Upload the contents of **`app/`** to any static host — Netlify, Vercel, Cloudflare
Pages, GitHub Pages, or the existing NI Pages host. There is nothing to build.

One thing must be set on the Supabase side first:

**Authentication → URL Configuration → Redirect URLs** must include the address
the site is served from. The one-time sign-in link refuses to return to an
address that is not on that list.

---

## Files

| | |
|---|---|
| `ni-booking-page.html` | the original single-file page. **Still the source of truth for markup, CSS and the strings.** |
| `build-app.js` | splices that file into `app/index.html` and regenerates the two data modules |
| `app/index.html` | generated — do not edit |
| `app/js/*.js` | the application |
| `test-app.mjs` | unit tests for the scheduling rules |
| `serve.js` | local static server |

Change working hours, meeting types, holidays or wording in
`ni-booking-page.html`, then:

```bash
node build-app.js && node test-app.mjs
```

`app/js/calendar-config.js` and `app/js/i18n-strings.js` are generated from that
file on every build and will lose hand edits.

## Modules

| Module | Holds |
|---|---|
| `config.js` | project URL, publishable key, window size |
| `supabase.js` | the CDN client |
| `schedule.js` | Cairo time, working days, slot generation — **pure, no DOM, no network** |
| `store.js` | all page state, with a change signal |
| `data.js` | every query, and the realtime subscriptions |
| `auth.js` | one-time-link sign-in |
| `i18n.js` | language state, plus strings the hosted app adds |
| `ui.js` | rendering |
| `admin.js` | the approvals panel |
| `main.js` | wiring |

`schedule.js` imports into Node directly, which is why the rules are unit
tested rather than driven through a browser.

---

## How the privacy holds

The same principle as asking a calendar for free/busy instead of for events:
**don't filter sensitive data out, arrange for it not to be there.**

- `meeting_requests` holds the detail — who is coming, what they want to discuss.
  Readable only by its author and the admin.
- `busy_slots` holds `starts_at` and `ends_at` and **has no descriptive column at
  all.** It is what every employee reads to see which times are taken.

A page rendering availability cannot leak a subject or an attendee, because the
table it reads has nowhere to put one.

## How approval works

A request does **not** book the slot. It is stored `pending` and nothing else
happens. Only when the admin approves does a trigger write a `busy_slots` row —
and that is the moment the time disappears for everyone else. Declining deletes
the row and the time reopens.

The double-booking guard is a database trigger, not browser code, so it holds
regardless of who calls the API.

## Roles

`amamousa@hotmail.com` becomes `admin` automatically on first sign-in, matched
case-insensitively by a trigger on `auth.users`. Everyone else is `employee`.
Nobody can promote themselves: a trigger reverts any role change not made by an
admin, and the update policy refuses it anyway.

## Auth

Sign-in is by one-time email link. **No password is ever typed, stored or sent by
this page**, which removes a whole class of risk from an internal tool.

---

## Verification

```bash
node test-app.mjs
```

31 checks on the scheduling rules. The security model was checked separately
against the live database — 15 assertions covering role assignment, cross-user
reads, self-promotion, approval rights, the overlap guard and cascade
behaviour — and from the browser, where every anonymous read, insert and RPC is
refused with `42501`.

## Known gaps

- **Google Calendar is a snapshot.** The 13 rows seeded into `busy_slots` were
  read on 2026-08-12. Nothing syncs them automatically yet; a scheduled job would
  need to refresh that table.
- **`rls_auto_enable()`** in the public schema is flagged by Supabase's linter as
  callable by `anon`. It was not created here and has been left alone.
- **Leaked-password protection is off** in Auth settings. Harmless while sign-in
  is by magic link, but worth enabling if passwords are ever turned on.
