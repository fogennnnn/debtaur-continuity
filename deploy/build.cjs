// Build the Cloudflare Worker deploy bundle for the continuity console.
// Copies the page + browser-safe modules + rulesets into deploy/public/ and
// snapshots the company data into deploy/company.json (consumed by
// deploy/worker.js for GET /api/company). Run: node deploy/build.cjs
// Nothing here touches src/, rules, or index.html.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pub = path.join(__dirname, "public");

function copy(srcRel, destRel) {
  const src = path.join(root, srcRel);
  const dest = path.join(pub, destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

fs.rmSync(pub, { recursive: true, force: true });
copy("index.html", "index.html");
for (const f of ["app.js", "engine.js", "ledger.js", "company.js", "integrity.js"]) {
  copy(path.join("src", f), path.join("src", f));
}
for (const f of fs.readdirSync(path.join(root, "src", "rules")).filter((x) => x.endsWith(".json")).sort()) {
  copy(path.join("src", "rules", f), path.join("src", "rules", f));
}

// Guard: every local /src/* module reference inside the bundle must resolve
// to a staged file. Fails the build instead of shipping a page that dies
// on a 404 import at load.
(function verifyBundle() {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|html)$/.test(e.name)) files.push(p);
    }
  })(pub);
  const missing = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    const refs = [...text.matchAll(/(?:from\s+["']|src=["'])(\/src\/[^"'\s]+)/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (!fs.existsSync(path.join(pub, ref.replace(/^\//, "")))) {
        missing.push(`${path.relative(pub, f)} -> ${ref}`);
      }
    }
  }
  if (missing.length > 0) {
    console.error("deploy bundle has unresolvable module references:\n" + missing.join("\n"));
    process.exit(1);
  }
  console.log(`bundle check: ${files.length} files scanned, all local module references resolve.`);
})();

(async () => {
  const mod = await import(pathToFileURL(path.join(root, "src", "company.js")).href);
  const snapshot = { company: mod.COMPANY, succession: mod.SUCCESSION_PACK, roles: mod.ROLES, cases: mod.CASES };
  fs.writeFileSync(path.join(__dirname, "company.json"), JSON.stringify(snapshot, null, 2));
  console.log("continuity deploy bundle staged in deploy/public (+ deploy/company.json).");
})().catch((e) => { console.error(e); process.exit(1); });

function pathToFileURL(p) {
  let resolved = path.resolve(p).replace(/\\/g, "/");
  if (!resolved.startsWith("/")) resolved = `/${resolved}`;
  return new URL(`file://${resolved}`);
}
