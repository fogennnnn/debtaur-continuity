/**
 * Smoke test: every continuity case must evaluate to its expected verdict.
 * Run: node scripts/smoke.mjs (exit 0 = all pass). Zero dependencies.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateAction } from "../src/engine.js";
import { CASES, ROLES, FUZZ_CASES } from "../src/company.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  "expense-signoff": "expense-signoff.json",
  "client-onboarding": "client-onboarding.json",
  "hiring-approval": "hiring-approval.json",
  "vendor-payment": "vendor-payment.json",
  "seat-cover": "seat-cover.json",
  "decision-thaw": "decision-thaw.json",
  "weekly-numbers": "weekly-numbers.json",
  "process-currency": "process-currency.json",
  "client-comms": "client-comms.json",
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
let fuzzSafe = 0;
const fuzzFailures = [];
for (let i = 0; i < FUZZ_CASES.length; i++) {
  const fz = FUZZ_CASES[i];
  try {
    const rules = JSON.parse(fs.readFileSync(path.join(root, "src", "rules", files[fz.policy]), "utf8"));
    const req = { action_id: `FUZZ-${i}`, actor_id: "fuzz", ...structuredClone(fz.request) };
    const r = evaluateAction(req, rules);
    if (r.status === "AUTHORIZED") {
      fuzzFailures.push(`fuzz[${i}] ${fz.policy} AUTHORIZED (must refuse or escalate)`);
    } else {
      fuzzSafe++;
    }
  } catch (e) {
    fuzzFailures.push(`fuzz[${i}] ${fz.policy} threw: ${e?.message ?? e}`);
  }
}
console.log(`${fuzzSafe}/${FUZZ_CASES.length} hostile inputs safely refused or escalated`);
for (const f of fuzzFailures) console.log(`FAIL ${f}`);
process.exit(failures.length + fuzzFailures.length === 0 ? 0 : 1);
