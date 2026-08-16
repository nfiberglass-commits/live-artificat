// The PIN list, so Ahmed can hand people their sign-in without leaving the page.
//
// The PINs live in n8n's user table, not in Supabase, so this asks n8n for them
// and proves who is asking with the Supabase session. n8n checks that token with
// Supabase and reads the caller's role with its own key: a token proves who you
// are, never what you may do.
//
// ⛔ Nothing is cached. The list is fetched when the tab is opened and dropped
// when it is left, so a walk-past of an idle screen shows no credentials.

import { t } from "./i18n.js";
import { state, isAdmin } from "./store.js";
import { PINS_URL } from "./config.js";
import { toast } from "./ui.js";

const $ = (id) => document.getElementById(id);

export function clearPins() {
  const host = $("pinsList");
  if (host) host.innerHTML = "";
}

export async function renderPins() {
  const panel = $("pins");
  if (!panel) return;
  if (!isAdmin()) { panel.hidden = true; return; }

  const tr = t();
  const host = $("pinsList");
  host.innerHTML = "";

  const loading = document.createElement("div");
  loading.className = "approvals-empty";
  loading.textContent = tr.pinsLoading;
  host.appendChild(loading);

  let people;
  try {
    const res = await fetch(PINS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: state.session?.access_token || "" })
    });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(data && data.error ? data.error : "PINS_FAILED");
    people = data.people || [];
  } catch (e) {
    host.innerHTML = "";
    const failed = document.createElement("div");
    failed.className = "approvals-empty";
    failed.textContent = (e && e.message) || tr.pinsFailed;
    host.appendChild(failed);
    return;
  }

  host.innerHTML = "";
  const table = document.createElement("table");
  table.className = "pins-table";
  table.appendChild(headRow(tr));
  for (const p of people) table.appendChild(personRow(p, tr));
  host.appendChild(table);
}

function headRow(tr) {
  const head = document.createElement("tr");
  for (const label of [tr.pinsCode, tr.pinsName, tr.pinsRole, tr.pinsPin, ""]) {
    const th = document.createElement("th");
    th.textContent = label;
    head.appendChild(th);
  }
  return head;
}

function personRow(p, tr) {
  const row = document.createElement("tr");
  if (p.off) row.className = "is-off";

  const cell = (text, cls) => {
    const td = document.createElement("td");
    if (cls) td.className = cls;
    td.textContent = text;
    return td;
  };

  row.appendChild(cell(p.code, "mono"));
  row.appendChild(cell(p.name + (p.off ? " — " + tr.pinsOff : "")));
  row.appendChild(cell(p.role || ""));
  row.appendChild(cell(p.pin, "mono"));

  const actions = document.createElement("td");
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "btn btn-quiet";
  copy.textContent = tr.pinsCopy;
  copy.addEventListener("click", async () => {
    // One line ready to paste into a message, rather than three separate copies.
    const line = p.name + " — " + tr.pinsCode + ": " + p.code + " — " + tr.pinsPin + ": " + p.pin;
    try {
      await navigator.clipboard.writeText(line);
      copy.textContent = "✓";
      setTimeout(() => { copy.textContent = tr.pinsCopy; }, 1200);
    } catch {
      toast(tr.pinsCopyFailed);
    }
  });
  actions.appendChild(copy);
  row.appendChild(actions);
  return row;
}
