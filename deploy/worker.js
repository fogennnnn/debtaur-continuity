/**
 * Hosted continuity console (overwrites the testdeps2 slot).
 * Serves the static console plus one read-only JSON endpoint mirroring the
 * local `npm run demo` API shape:
 *   GET /api/company — the company, succession pack, roles, and case queue.
 * Rulesets are static files; browsers run src/engine.js locally. No evaluate
 * endpoint. No Durable Objects, no KV.
 */
import DATA from "./company.json";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/api/company") {
      if (req.method !== "GET") {
        return new Response(JSON.stringify({ error: "method not allowed; use GET" }), { status: 405, headers: JSON_HEADERS });
      }
      return new Response(JSON.stringify(DATA), { headers: JSON_HEADERS });
    }
    return env.ASSETS.fetch(req);
  },
};
