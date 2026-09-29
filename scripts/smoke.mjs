/**
 * Smoke test: every continuity case must evaluate to its expected verdict.
 * Run: node scripts/smoke.mjs (exit 0 = all pass). Zero dependencies.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateAction } from "../src/engine.js";
import { CASES, ROLES } from "../src/company.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  "expense-signoff": "expense-signoff.json",
  "client-onboarding": "client-onboarding.json",
  "hiring-approval": "hiring-approval.json",
  "vendor-payment": "vendor-payment.json",
};

let pass = 0;
const failures = [];
for (const c of CASES) {
  const rules = JSON.parse(fs.readFileSync(path.join(root, "src", "rules", files[c.policy]), "utf8"));
  const role = ROLES.find((r) => r.key === c.preset_role);
  const req = { action_id: `${c.id}-01`, actor_id: role.actor_id, ...JSON.parse(JSON.stringify(c.request)) };
  const r = evaluateAction(req, rules);
  if (r.status === c.expect) {
    pass++;
  } else {
    failures.push(`${c.id}: got=${r.status} want=${c.expect}`);
  }
}
console.log(`${pass}/${CASES.length} cases as expected`);
for (const f of failures) console.log(`FAIL ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
