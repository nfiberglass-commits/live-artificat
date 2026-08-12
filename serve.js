// Minimal static server for local checking. The deployed site needs no server
// of its own - any static host will do - but ES modules cannot load over
// file://, so a real origin is required to try it locally.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "app");
const PORT = Number(process.env.PORT || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
  const file = path.join(ROOT, rel);

  if (!file.startsWith(ROOT)) { res.writeHead(403).end("no"); return; }

  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { "content-type": "text/plain" }).end("not found: " + rel); return; }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(buf);
  });
}).listen(PORT, () => console.log("serving app/ on http://localhost:" + PORT));
