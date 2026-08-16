// The permissions screen: every person, and what each may open.
//
// Only ever rendered for the admin, but that is presentation. The real gate is
// the policy on tab_access, which refuses a write from anyone else however the
// request is made.

import { t } from "./i18n.js";
import { state, isAdmin } from "./store.js";
import { setTabAccess } from "./data.js";
import { toast } from "./ui.js";

const $ = (id) => document.getElementById(id);

export function renderAccess() {
  const panel = $("access");
  if (!isAdmin()) { panel.hidden = true; return; }

  const tr = t();
  const host = $("accList");
  host.innerHTML = "";

  const people = Object.entries(state.people)
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  if (!people.length) {
    const empty = document.createElement("div");
    empty.className = "approvals-empty";
    empty.textContent = tr.accNobody;
    host.appendChild(empty);
    return;
  }

  for (const person of people) host.appendChild(row(person, tr));
}

function row(person, tr) {
  const el = document.createElement("div");
  el.className = "acc-person";

  const name = document.createElement("div");
  name.className = "acc-name";
  name.textContent = person.name;
  if (state.roles[person.id] === "admin") {
    const tag = document.createElement("span");
    tag.className = "acc-role";
    tag.textContent = tr.roleAdmin;
    name.appendChild(tag);
  }
  el.appendChild(name);

  const tabs = document.createElement("div");
  tabs.className = "acc-tabs";

  for (const tab of state.allTabs) {
    const wrap = document.createElement("label");
    wrap.className = "acc-tab" + (tab.default_on ? " is-default" : "");

    const box = document.createElement("input");
    box.type = "checkbox";
    // No stored decision means the tab's own default applies, so that is what
    // the box must show - otherwise everyone looks locked out of booking.
    const decision = state.access[person.id] && state.access[person.id][tab.key];
    box.checked = decision === undefined ? tab.default_on : decision;

    box.addEventListener("change", async () => {
      box.disabled = true;
      try {
        await setTabAccess(person.id, tab.key, box.checked);
        toast(tr.accSaved);
      } catch (e) {
        box.checked = !box.checked;   // put it back; nothing was saved
        toast(tr.accFailed);
      } finally {
        box.disabled = false;
      }
    });

    const text = document.createElement("span");
    text.textContent = state.lang === "ar" ? tab.label_ar : tab.label_en;

    wrap.append(box, text);
    tabs.appendChild(wrap);
  }

  el.appendChild(tabs);
  return el;
}
