// Builds app/index.html from the original single-file page.
//
// The markup and CSS are spliced across VERBATIM so the existing UI cannot
// drift. Only three things change:
//   1. the inline <script> is replaced by an ES module entry point
//   2. the hard-coded busy array is dropped (the data now lives in Postgres)
//   3. a sign-in gate and an admin panel are added, both styled from the
//      existing design tokens
//
// Any missing anchor is a hard failure - a silent partial splice would be worse
// than no build at all.
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "ni-booking-page.html");
const OUT_DIR = path.join(__dirname, "app");
const OUT = path.join(OUT_DIR, "index.html");

let html = fs.readFileSync(SRC, "utf8");

function cut(from, to, label) {
  const a = html.indexOf(from);
  if (a === -1) throw new Error("anchor not found: " + label + " (start)");
  const b = html.indexOf(to, a + from.length);
  if (b === -1) throw new Error("anchor not found: " + label + " (end)");
  const removed = html.slice(a, b + to.length);
  html = html.slice(0, a) + html.slice(b + to.length);
  return removed;
}

function insertBefore(anchor, block, label) {
  const i = html.indexOf(anchor);
  if (i === -1) throw new Error("anchor not found: " + label);
  html = html.slice(0, i) + block + html.slice(i);
}

function insertAfter(anchor, block, label) {
  const i = html.indexOf(anchor);
  if (i === -1) throw new Error("anchor not found: " + label);
  html = html.slice(0, i + anchor.length) + block + html.slice(i + anchor.length);
}

// 1. the baked-in calendar snapshot goes; Postgres is the source now
cut('<script id="ni-busy-data">', "</script>", "busy data block");

// 2. the whole inline application script goes
const inline = cut("<script>\n(function () {", "})();\n</script>", "inline script");
if (inline.length < 20000) throw new Error("inline script looked too small: " + inline.length);

// 3. styles for the pieces that did not exist before, built from the same tokens
const EXTRA_CSS = `
  /* ---------- added for the hosted app: sign-in, session bar, approvals ---------- */

  .gate {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--bg);
  }
  .gate[hidden] { display: none; }

  .gate-card {
    width: min(420px, 100%);
    background: var(--surface);
    border: 1px solid var(--line);
    border-top: 3px solid var(--accent);
    border-radius: var(--r);
    padding: 30px 30px 26px;
  }
  .gate-card h2 { margin: 0 0 6px; font-size: 21px; letter-spacing: -0.01em; }
  .gate-card p  { margin: 0 0 20px; font-size: 13.5px; color: var(--ink-2); line-height: 1.65; }
  .gate-card .field { margin-bottom: 14px; }
  .gate-card .btn { width: 100%; }

  /* Secondary route: plain text, so it never competes with Sign in. */
  .linkish {
    display: block;
    width: 100%;
    margin-top: 12px;
    padding: 4px 0;
    background: none;
    border: 0;
    font: inherit;
    font-size: 12.5px;
    color: var(--ink-3);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .linkish:hover { color: var(--accent); }
  .gate-note {
    margin-top: 16px;
    font-family: var(--f-mono);
    font-size: 11px;
    letter-spacing: 0.04em;
    color: var(--ink-3);
    line-height: 1.7;
  }
  body[dir="rtl"] .gate-note { font-family: var(--f-ar); font-size: 12.5px; letter-spacing: 0; }

  .session {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-inline-start: auto;
    font-family: var(--f-mono);
    font-size: 11px;
    letter-spacing: 0.03em;
    color: var(--ink-3);
  }
  body[dir="rtl"] .session { font-family: var(--f-ar); font-size: 12.5px; letter-spacing: 0; }
  .session-who { color: var(--ink-2); }
  .session-role {
    padding: 2px 7px;
    border: 1px solid var(--accent);
    color: var(--accent);
    text-transform: uppercase;
    font-size: 9.5px;
    letter-spacing: 0.1em;
  }
  body[dir="rtl"] .session-role { text-transform: none; font-size: 11px; letter-spacing: 0; }

  .approvals { margin-top: 40px; }
  .approvals[hidden] { display: none; }
  .approvals h2 {
    margin: 0 0 4px;
    font-size: 16px;
    letter-spacing: -0.01em;
  }
  .approvals-sub {
    margin: 0 0 18px;
    font-size: 13px;
    color: var(--ink-2);
  }
  .req {
    border: 1px solid var(--line);
    border-inline-start: 3px solid var(--accent);
    border-radius: var(--r);
    background: var(--surface);
    padding: 16px 18px;
    margin-bottom: 10px;
  }
  .req-top {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 16px;
    margin-bottom: 10px;
  }
  .req-when { font-family: var(--f-mono); font-size: 13px; color: var(--ink); }
  body[dir="rtl"] .req-when { font-family: var(--f-ar); font-size: 14px; }
  .req-type { font-size: 12px; color: var(--ink-3); }
  .req-who  { font-size: 13.5px; color: var(--ink); font-weight: 500; }
  .req-points {
    margin: 0 0 14px;
    padding: 0;
    list-style: none;
    font-size: 13.5px;
    color: var(--ink-2);
    line-height: 1.7;
  }
  .req-points li { padding-inline-start: 14px; position: relative; }
  .req-points li::before {
    content: "";
    position: absolute;
    inset-inline-start: 0;
    top: 0.62em;
    width: 5px;
    height: 1px;
    background: var(--ink-3);
  }
  .req-acts { display: flex; gap: 8px; flex-wrap: wrap; }
  .req-acts .btn { padding: 8px 16px; font-size: 12.5px; }
  .btn-ghost {
    background: transparent;
    color: var(--ink-2);
    border: 1px solid var(--line);
  }
  .btn-ghost:hover { background: var(--surface-2); color: var(--ink); }
  .approvals-empty {
    border: 1px dashed var(--line);
    border-radius: var(--r);
    padding: 22px;
    text-align: center;
    font-size: 13.5px;
    color: var(--ink-3);
  }

  /* Editing a request. The date row is only ever rendered for the admin;
     an employee sees the same time as plain, unselectable text. */
  .req-when-fixed {
    font-family: var(--f-mono);
    font-size: 13px;
    color: var(--ink);
  }
  body[dir="rtl"] .req-when-fixed { font-family: var(--f-ar); font-size: 14px; }

  .req-move {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  .req-move input {
    font-family: var(--f-mono);
    font-size: 13px;
    padding: 7px 9px;
    border: 1px solid var(--line);
    border-radius: var(--r);
    background: var(--surface);
    color: var(--ink);
  }
  .req-move input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }

  .req-points-edit {
    width: 100%;
    min-height: 76px;
    resize: vertical;
    font: inherit;
    font-size: 13.5px;
    line-height: 1.6;
    padding: 9px 10px;
    margin-bottom: 12px;
    border: 1px solid var(--line);
    border-radius: var(--r);
    background: var(--surface);
    color: var(--ink);
  }
  .req-points-edit:focus { outline: 2px solid var(--accent); outline-offset: -1px; }

  .req-status {
    font-family: var(--f-mono);
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 99px;
    border: 1px solid var(--line);
    color: var(--ink-3);
  }
  body[dir="rtl"] .req-status { font-family: var(--f-ar); font-size: 11px; letter-spacing: 0; text-transform: none; }
  .req-status.is-approved { color: var(--open); border-color: var(--open-line); background: var(--open-bg); }
  .req-status.is-pending  { color: var(--accent); border-color: var(--accent); }
`;

insertBefore("</style>", EXTRA_CSS, "style close");

// 4. sign-in gate, session bar and approvals panel
const GATE = `
<div class="gate" id="gate" hidden>
  <div class="gate-card">
    <div class="eyebrow" data-t="eyebrow">Nile Industries · FRP / GRP</div>
    <h2 data-t="gateTitle">Sign in</h2>
    <p data-t="gateSub">Use your work email. We send a one-time link — there is no password to remember.</p>
    <div class="field">
      <label class="lbl" for="gateEmail" data-t="gateEmail">Work email</label>
      <input id="gateEmail" type="email" autocomplete="email" inputmode="email">
    </div>
    <div class="field">
      <label class="lbl" for="gatePass" data-t="gatePass">Password</label>
      <input id="gatePass" type="password" autocomplete="current-password">
    </div>
    <button class="btn" id="gateSignIn" type="button" data-t="gateSignIn">Sign in</button>
    <button class="linkish" id="gateSend" type="button" data-t="gateSend">Email me a one-time link instead</button>
    <div class="gate-note" id="gateNote"></div>
  </div>
</div>
`;

const SESSION = `
    <div class="session" id="session" hidden>
      <span class="session-who" id="sessionWho"></span>
      <span class="session-role" id="sessionRole" hidden></span>
      <button class="navbtn" id="signOut" type="button" data-t="signOut">Sign out</button>
    </div>
`;

const MYREQUESTS = `
  <section class="approvals" id="mine" hidden>
    <h2 data-t="mineTitle">Your requests</h2>
    <p class="approvals-sub" data-t="mineSub">You can add or change the points any time. Only Ahmed can move a date.</p>
    <div id="mineList"></div>
  </section>

`;

const APPROVALS = `
  <section class="approvals" id="approvals" hidden>
    <h2 data-t="apprTitle">Requests waiting on you</h2>
    <p class="approvals-sub" data-t="apprSub">Approving takes the slot off the calendar for everyone else. Declining reopens it.</p>
    <div id="apprList"></div>
  </section>

`;

insertAfter('<div class="wrap">', "\n" + GATE, "wrap open");
insertBefore("    <button class=\"lang\" id=\"lang\" type=\"button\">", SESSION, "lang button");
insertBefore('  <section class="rules">', MYREQUESTS + APPROVALS, "rules section");

// 4b. Lift the data-only declarations straight out of the original script so
// the translations, meeting types and holidays cannot drift during the split.
function extractLiteral(src, decl, label) {
  const at = src.indexOf(decl);
  if (at === -1) throw new Error("declaration not found: " + label);
  let i = src.indexOf("=", at) + 1;
  while (/\s/.test(src[i])) i++;
  const open = src[i];
  const close = open === "{" ? "}" : open === "[" ? "]" : null;
  if (!close) throw new Error("not an object or array literal: " + label);

  let depth = 0, inStr = null, esc = false;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (ch === "\\") esc = true;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  throw new Error("unbalanced literal: " + label);
}

const JS_DIR = path.join(OUT_DIR, "js");
if (!fs.existsSync(JS_DIR)) fs.mkdirSync(JS_DIR, { recursive: true });

const strings = extractLiteral(inline, "var T = ", "translations");
fs.writeFileSync(path.join(JS_DIR, "i18n-strings.js"),
  "// GENERATED by build-app.js from ni-booking-page.html - do not edit by hand.\n" +
  "// Every user-facing string, in both languages.\n\n" +
  "export const STRINGS = " + strings + ";\n", "utf8");

const types = extractLiteral(inline, "var TYPES = ", "meeting types");
const holidays = extractLiteral(inline, "var HOLIDAYS = ", "holidays");
fs.writeFileSync(path.join(JS_DIR, "calendar-config.js"),
  "// GENERATED by build-app.js from ni-booking-page.html - do not edit by hand.\n" +
  "// Working hours, meeting types and closures. Change them in the source page.\n\n" +
  'export const CAIRO = "Africa/Cairo";\n\n' +
  "export const DAY_START = 9 * 60 + 30;   // 09:30 Cairo\n" +
  "export const DAY_END   = 16 * 60 + 30;  // 16:30 Cairo\n" +
  "export const BREAK_A   = 13 * 60;       // midday hold starts\n" +
  "export const BREAK_B   = 14 * 60;       // midday hold ends\n" +
  "export const STEP      = 30;            // slot granularity, minutes\n" +
  "export const HORIZON_WEEKS = 3;\n\n" +
  "export const HOLIDAYS = " + holidays + ";\n\n" +
  "export const TYPES = " + types + ";\n", "utf8");

console.log("generated js/i18n-strings.js and js/calendar-config.js");

// 5. wrap in a real document. The artifact host supplied <html>/<head>/<body>
// for us; a static site has to bring its own.
const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, "Book a meeting"])[1];
html = html.replace(/<title>[\s\S]*?<\/title>\s*/, "");

const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
${html.trimEnd()}
<script type="module" src="./js/main.js"></script>
</body>
</html>
`;

// The <style> and markup were spliced in above; close <head> right after styles.
const withHead = doc.replace("</style>", "</style>\n</head>\n<body>");
if (withHead === doc) throw new Error("could not place </head><body>");

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, withHead, "utf8");

const kb = (n) => (n / 1024).toFixed(1) + " KB";
console.log("app/index.html written: " + kb(withHead.length) + "  (inline script removed: " + kb(inline.length) + ")");
