/**
 * Zero-dependency static file server (node:http only) for the continuity console.
 * Serves the project root so the page can `import ... from "/src/*.js"`.
 * Minimal demo API (read fresh per request):
 *   GET /api/company — the company, succession pack, roles, and case queue.
 * Rulesets are served as static files under /src/rules/*.json.
 * Run: npm run demo, then open the printed URL (port 8081).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPANY, SUCCESSION_PACK, ROLES, CASES } from "./company.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/api/company") {
      if (req.method !== "GET") {
        res.writeHead(405, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "method not allowed; use GET" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ company: COMPANY, succession: SUCCESSION_PACK, roles: ROLES, cases: CASES }));
      return;
    }
    const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, "");
    const abs = path.join(root, rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("forbidden");
      return;
    }
    if (path.basename(abs).startsWith(".")) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("forbidden");
      return;
    }
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch (_e) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    let target = abs;
    if (stat.isDirectory()) {
      const indexFile = path.join(abs, "index.html");
      try {
        if (fs.statSync(indexFile).isFile()) {
          target = indexFile;
        } else {
          res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          res.end("no index here — request a file path directly");
          return;
        }
      } catch (_e) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("no index here — request a file path directly");
        return;
      }
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
    res.end(fs.readFileSync(target));
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(`server error: ${e?.message ?? e}`);
  }
});

const port = Number(process.env.PORT ?? 8081);
server.listen(port, () => {
  console.log(`continuity console: http://localhost:${port}/`);
});
