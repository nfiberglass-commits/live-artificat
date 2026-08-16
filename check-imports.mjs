// Every import must resolve to a real export.
//
// A missing export is invisible until the browser loads the module and the whole
// page dies. Node can answer this for us: importing each module actually runs
// the resolver, so anything unresolved throws here instead of on Ahmed's screen.
//
// ⛔ Written as a FILE, not `node -e`. Regex escaping does not survive the shell,
// and a mangled checker reported all 118 imports broken when none were.

import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";

const dir = resolve("app/js");
const files = readdirSync(dir).filter((f) => f.endsWith(".js"));

// main.js touches the DOM at import time, so give it just enough to load.
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {}, setAttribute() {} }),
  body: { setAttribute() {} },
  addEventListener() {}
};
globalThis.window = { location: { pathname: "/", hash: "", search: "" }, setTimeout, addEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 };
globalThis.history = { replaceState() {} };
// navigator is read-only on modern Node, so define the one property we need.
if (!globalThis.navigator?.clipboard) {
  Object.defineProperty(globalThis.navigator || (globalThis.navigator = {}), "clipboard", {
    value: { writeText: async () => {} }, configurable: true
  });
}

let failures = 0;
for (const f of files) {
  try {
    await import(pathToFileURL(join(dir, f)).href);
    console.log("  ok   " + f);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    // Only unresolved imports matter here; anything else is the module doing its
    // job in an environment that is not a browser.
    if (/does not provide an export|Cannot find module|Failed to resolve/.test(msg)) {
      console.log("  FAIL " + f + "  ->  " + msg.split("\n")[0]);
      failures++;
    } else {
      console.log("  ok   " + f + "   (loaded; runtime noise: " + msg.split("\n")[0].slice(0, 60) + ")");
    }
  }
}

console.log(failures ? "\n" + failures + " module(s) with a broken import" : "\nevery import resolves");
process.exit(failures ? 1 : 0);
