/**
 * Handover console: the successor team runs Lena's signed policies live.
 * Imports the proven engine + ledger modules unchanged; all demo content
 * comes from /api/company and the rulesets. Zero dependencies.
 */
import { evaluateAction, nextIssueId } from "./engine.js";
import { appendDecision, verifyChain, getEntries, sha256Hex, importEntries, clearLedger } from "./ledger.js";
import { canonicalRulesetContent } from "./integrity.js";
import { FUZZ_CASES } from "./company.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = (n) => `$${Number(n ?? 0).toLocaleString("en-US")}`;
const short = (h) => { const s = String(h ?? ""); return s.length > 18 ? s.slice(0, 10) + "…" + s.slice(-6) : s; };
const stampClass = (st) => st === "AUTHORIZED" ? "allow" : st === "ESCALATED" ? "owner" : st === "REFUSED" ? "stop" : "note";
const stampWord = (st) => st === "AUTHORIZED" ? "Approved" : st === "ESCALATED" ? "Owner review" : st === "REFUSED" ? "Stopped" : st;

const S = {
  company: null, succession: null, roles: [], cases: [],
  rulesets: {}, tab: "first", roleKey: "maya", signed: false, decisions: {},
};

async function load() {
  try {
    const res = await fetch("/api/company");
    if (!res.ok) throw new Error("company service returned " + res.status);
    const data = await res.json();
    S.company = data.company; S.succession = data.succession;
    S.roles = data.roles; S.cases = data.cases;
    const files = ["client-comms.json", "client-onboarding.json", "decision-thaw.json", "expense-signoff.json", "hiring-approval.json", "process-currency.json", "seat-cover.json", "vendor-payment.json", "weekly-numbers.json"];
    for (const f of files) {
      const r = await fetch(`/src/rules/${f}`);
      if (!r.ok) throw new Error(`missing ruleset ${f}`);
      const rules = await r.json();
      S.rulesets[rules.sop_id] = rules;
    }
    if (refuseUntrustedRulesets()) return;
    const snapState = restoreSnapshot();
    if (snapState === "broken" || snapState === "corrupt") {
      $("panel").innerHTML = `<div class="err"><strong>Saved record failed its own check.</strong><br>The record stored in this browser no longer verifies - it may have been edited outside the console. The console starts fresh so every new answer stays trustworthy.</div>`;
      try { localStorage.removeItem(SNAP_KEY); } catch (e) {}
      clearLedger();
      S.decisions = {}; S.versions = null; S.signed = false;
      renderAll();
      return;
    }
    renderAll();
  } catch (e) {
    $("panel").innerHTML = `<div class="err"><strong>The console could not load.</strong><br>${esc(e?.message ?? e)}<br><br>Run <span class="hash">npm run demo</span>, then open the printed URL.</div>`;
  }
}

function refuseUntrustedRulesets() {
  for (const rules of Object.values(S.rulesets)) {
    const recomputed = `sha256:${sha256Hex(canonicalRulesetContent(rules))}`;
    const stored = String(rules?.version?.version_hash ?? "");
    if (stored === recomputed) continue;
    const issueId = nextIssueId(rules?.issue_prefix ?? "ISS-2026");
    const reason = `Edited ruleset refused at load: stored ${stored} does not match recomputed ${recomputed}. Only a fresh signature from the owner changes the policy.`;
    const entry = appendDecision({
      status: "REFUSED",
      sop_id: rules.sop_id,
      policy_title: rules.title,
      action_id: "RULESET-LOAD",
      actor_id: "system",
      rule_version_hash: stored || "(missing)",
      timestamp: new Date().toISOString(),
      derivation: [reason],
      refusal_details: {
        missing_premise_id: "RULESET_INTEGRITY",
        reason,
        policy_issue: { id: issueId, title: `Edited policy refused — ${rules.title}`, missing_premise: "RULESET_INTEGRITY", context: { stored, recomputed } },
      },
    });
    $("panel").innerHTML = `<div class="err"><strong>This console refused to start.</strong><br>${esc(reason)}<br><br><span class="hash">stored: ${esc(stored)}<br>recomputed: ${esc(recomputed)}</span><br><br>Follow-up card ${esc(issueId)} · recorded as entry #${entry.seq}.</div>`;
    return true;
  }
  return false;
}

const role = () => S.roles.find((r) => r.key === S.roleKey) ?? S.roles[0];
const rulesFor = (c) => Object.values(S.rulesets).find((r) => r.sop_id === policyOf(c)) ?? null;
const policyOf = (c) => ({ "expense-signoff": "SOP-FIN-01", "client-onboarding": "SOP-ONB-01", "hiring-approval": "SOP-HIRE-01", "vendor-payment": "SOP-PAY-01", "seat-cover": "SOP-SEAT-01", "decision-thaw": "SOP-THAW-01", "weekly-numbers": "SOP-NUM-01", "process-currency": "SOP-DOC-01", "client-comms": "SOP-COM-01" }[c.policy]);
const decided = () => S.cases.filter((c) => S.decisions[c.id]);

function renderAll() {
  renderHandover(); renderRoles(); renderTabs(); renderPanel();
  $("footer").textContent = "Demonstration figures throughout — thresholds, names, and amounts stand in for a real client's own. " + (S.company?.samples ?? "");
}

function renderHandover() {
  const box = $("handoverBox");
  if (S.signed) {
    box.className = "handover signed";
    box.innerHTML = `<strong>Lena signed the succession pack.</strong> ${esc(S.succession.policies.length)} signed policies now answer to Maya and Tomas — Lena keeps an override she has never needed. The queue below is their first week.`;
    return;
  }
  box.className = "handover";
  box.innerHTML = `<strong>${esc(S.company.name)} is a ${esc(S.company.people)}-person print shop.</strong><br>
    Founder ${esc(S.company.outgoing.name)} retires at month's end after 22 years. Her signed policies must keep running the business without her.<br>
    <button id="signBtn">Lena signs the succession pack →</button>`;
  $("signBtn").onclick = signHandover;
}

function signHandover() {
  const pack = S.succession;
  for (const sopId of pack.policies) {
    const rules = Object.values(S.rulesets).find((r) => r.sop_id === sopId);
    appendDecision({
      status: "SIGNED",
      sop_id: sopId,
      policy_title: rules?.title ?? sopId,
      action_id: `${pack.id}-${sopId}`,
      actor_id: "lena-outgoing-owner",
      rule_version_hash: rules?.version?.version_hash ?? "unknown",
      timestamp: new Date().toISOString(),
      derivation: [`${pack.title}: ${sopId} signed over to successor authority by ${pack.signed_by}.`],
    });
  }
  S.signed = true;
  renderAll();
}

function renderRoles() {
  const bar = $("roleBar");
  bar.innerHTML = "";
  for (const r of S.roles) {
    const b = document.createElement("button");
    b.className = "role" + (r.key === S.roleKey ? " active" : "");
    b.innerHTML = `<b>${esc(r.label)}</b><span>${esc(r.blurb)}</span>`;
    b.onclick = () => { S.roleKey = r.key; renderAll(); };
    bar.appendChild(b);
  }
}

function renderTabs() {
  document.querySelectorAll(".tab").forEach((t) => {
    const active = t.dataset.tab === S.tab;
    t.setAttribute("aria-selected", active ? "true" : "false");
    t.onclick = () => { S.tab = t.dataset.tab; renderTabs(); renderPanel(); };
  });
}

const SNAP_KEY = "debtaur-continuity-v1";

function persistSnapshot() {
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify({
      ledger: getEntries(), decisions: S.decisions, versions: S.versions ?? null, signed: S.signed,
      rulesets: S.rulesets, encoded: S.encoded ?? null, feed: S.feed ?? null,
    }));
  } catch (e) { /* private mode: session-only record */ }
}

function restoreSnapshot() {
  let snap = null;
  try { snap = JSON.parse(localStorage.getItem(SNAP_KEY) ?? "null"); } catch (e) { snap = null; }
  if (!snap || !Array.isArray(snap.ledger)) return "fresh";
  try { importEntries(snap.ledger); } catch (e) { return "corrupt"; }
  if (!verifyChain().ok) return "broken";
  S.decisions = snap.decisions && typeof snap.decisions === "object" ? snap.decisions : {};
  S.versions = snap.versions ?? null;
  S.signed = snap.signed === true;
  if (snap.encoded) S.encoded = snap.encoded;
  if (snap.feed) S.feed = snap.feed;
  if (snap.rulesets && typeof snap.rulesets === "object") {
    for (const rules of Object.values(snap.rulesets)) {
      const recomputed = `sha256:${sha256Hex(canonicalRulesetContent(rules))}`;
      if (String(rules?.version?.version_hash ?? "") !== recomputed) return "corrupt";
    }
    for (const [sopId, rules] of Object.entries(snap.rulesets)) S.rulesets[sopId] = rules;
  }
  return "restored";
}

function renderPanel() {
  persistSnapshot();
  if (S.tab === "first") renderFirst();
  else if (S.tab === "queue") renderQueue();
  else if (S.tab === "dash") renderDash();
  else if (S.tab === "book") renderBook();
  else if (S.tab === "new") renderNewCase();
  else if (S.tab === "encode") renderEncode();
  else if (S.tab === "cont") renderCont();
  else if (S.tab === "guard") renderGuard();
  else if (S.tab === "play") renderPlaybook();
  else if (S.tab === "sell") renderSell();
  else renderLedger();
}

function factsLine(c) {
  const q = c.request;
  const bits = [];
  if (q.amount !== undefined) bits.push(money(q.amount));
  if (q.compensation !== undefined) bits.push(money(q.compensation));
  if (q.client_name) bits.push(q.client_name);
  if (q.candidate_name) bits.push(`${q.candidate_name} (${q.role_type ?? ""}${q.is_renewal ? ", renewal" : ""})`);
  if (q.vendor) bits.push(q.vendor);
  if (q.currency) bits.push(q.currency);
  return bits.join(" · ");
}

const TRACKS = [
  { key: "spend", title: "Spend — money out the door", ids: ["EXP-01", "EXP-02", "EXP-03", "PAY-01"] },
  { key: "onboarding", title: "Clients — who the shop takes on", ids: ["ONB-01", "ONB-02"] },
  { key: "hiring", title: "Hiring — who joins the shop", ids: ["HIRE-02", "HIRE-01"] },
];

const CLOSE_LINES = [
  "Every decision carries a signed record of the human who authorised it.",
  "An uncovered case is refused and named rather than guessed.",
  "Nobody can quietly widen the policy after the founder steps back.",
];

function thresholdNote(rules, signerKey) {
  for (const p of rules?.premises ?? []) {
    const pm = p?.params ?? {};
    if (pm.override_signer === signerKey) {
      const th = rules?.[pm.threshold_field] ?? pm.threshold;
      if (typeof th === "number") return `override above $${Number(th).toLocaleString("en-US")}`;
      return "override pen";
    }
  }
  return "";
}

const OWNER_ONLY = ["ceo", "director", "controller", "owner"];

function pensOf(roleKey) {
  const r = S.roles.find((x) => x.key === roleKey);
  return Array.isArray(r?.pens) ? r.pens : [];
}

function penHolder(key) {
  for (const r of S.roles) {
    if (Array.isArray(r.pens) && r.pens.includes(key)) return roleName(r.key);
  }
  return "owner";
}

function roleName(key) {
  return key === "tomas" ? "Tomas" : "Maya";
}

function prepBanner(done) {
  if (!done || done.result || !done.stagedBy || done.stagedBy === role().key) return "";
  return `<p style="font-size:13px">Prepared by ${roleName(done.stagedBy)} - countersign as ${roleName(role().key)}.</p>`;
}

function caseCard(c) {
  const rules = rulesFor(c);
  const done = S.decisions[c.id];
  const sigs = done ? done.sigs : { ...c.request.signatures };
  const boxes = (rules?.signers ?? []).map((s) => {
    const on = sigs[s.key] === true ? "checked" : "";
    const dis = S.signed && !done ? "" : "disabled";
    const note = thresholdNote(rules, s.key);
    const holder = penHolder(s.key);
    const who = holder === "owner" ? "owner only" : `held by ${holder}`;
    return `<label><input type="checkbox" data-case="${c.id}" data-sig="${s.key}" ${on} ${dis}> ${esc(s.label)}${note ? ` <small>(${esc(note)})</small>` : ""} <small>(${who})</small></label>`;
  }).join("");
  const verdict = !done ? "" : verdictHTML(done.result, done.entry, rules, c.id);
  const btn = S.signed && !done
    ? `<button class="decide" data-decide="${c.id}">Decide as ${esc(role().label.split(" — ")[0])} →</button>`
    : !S.signed ? `<p style="font-size:13px;color:var(--ink2)">Lena signs the pack first — then this queue opens.</p>` : "";
  return `<div class="case"><h4>${c.id} · ${esc(c.title)}</h4>
    <p class="story">${esc(c.story)}</p>
    <p class="facts">${esc(factsLine(c))}</p>
    <div class="reqs"><strong>The policy will check:</strong><ul>${(rules?.premises ?? []).map((pr) => `<li>${esc(pr.description ?? pr.id)}</li>`).join("")}</ul></div>
    <div class="sigs">${boxes}</div>${prepBanner(done)}${btn}${verdict}</div>`;
}

function tamperCardHTML() {
  const done = S.decisions["DRAFT-01"];
  if (!S.signed) {
    return `<div class="case"><h4>Policy desk — an edited draft arrives</h4>
      <p style="font-size:13px;color:var(--ink2)">Lena signs the pack first — then this desk opens.</p></div>`;
  }
  if (!done) {
    return `<div class="case"><h4>Policy desk — an edited draft arrives</h4>
      <p class="story">A copy of the spend policy arrived claiming a $999,999 limit. Load it and watch what happens.</p>
      <button class="decide" id="draftBtn">Load the edited draft →</button></div>`;
  }
  const rules = S.rulesets["SOP-FIN-01"];
  return `<div class="case"><h4>Policy desk — an edited draft arrives</h4>
    <p class="story">A copy of the spend policy arrived claiming a $999,999 limit. It was loaded and refused.</p>
    ${verdictHTML(done.result, done.entry, rules)}</div>`;
}

function tryTamperedDraft() {
  const rules = S.rulesets["SOP-FIN-01"];
  if (!rules) return;
  const altered = JSON.parse(JSON.stringify(rules));
  altered.threshold = 999999;
  const recomputed = "sha256:" + sha256Hex(canonicalRulesetContent(altered));
  const stored = String(altered.version?.version_hash ?? "");
  const issueId = nextIssueId(rules?.issue_prefix ?? "ISS-2026");
  const reason = `Edited draft refused: stored ${stored} does not match recomputed ${recomputed}. Only a fresh signature from the owner changes the policy.`;
  const result = {
    status: "REFUSED",
    sop_id: rules.sop_id,
    policy_title: rules.title,
    action_id: "DRAFT-01",
    actor_id: role().actor_id,
    rule_version_hash: stored,
    timestamp: new Date().toISOString(),
    derivation: [reason],
    refusal_details: {
      missing_premise_id: "RULESET_INTEGRITY",
      reason,
      policy_issue: { id: issueId, title: `Edited draft refused — ${rules.title}`, missing_premise: "RULESET_INTEGRITY", context: { stored, recomputed } },
    },
  };
  const entry = appendDecision(result);
  S.decisions["DRAFT-01"] = { sigs: {}, result, entry };
  renderPanel();
}

const FIRST_STEPS = [
  { caseId: "EXP-01", note: "First, something ordinary. Restock paper, both signatures present. Watch a routine approval go through on its own." },
  { caseId: "EXP-03", note: "Now a small invoice with a missing signature. The amount does not matter - a missing name stops it cold." },
  { caseId: "ONB-02", note: "Last one. A returning client with a fresh approval. The paper checklist would file this as new. Watch what the policy does instead." },
];

const FIRST_INTRO = "Maya's first morning without Lena. Three cases arrive before lunch. Watch what the policies do with each one.";
const FIRST_CLOSE = "Three moments, zero calls to Lena. That is the whole product: the shop runs on what she signed, not on her being there. Now open the queue and run the week yourself.";

function renderFirst() {
  const p = $("panel");
  S.first = S.first ?? { idx: 0 };
  const signedNote = S.signed ? `<div class="guide"><p>Pack signed - this tour replays the morning. The live queue is yours.</p></div>` : "";
  const head = `<h3>First day - Maya's first morning without Lena</h3>
    <div class="guide"><p>${esc(FIRST_INTRO)}</p></div>${signedNote}`;
  if (S.first.idx >= FIRST_STEPS.length) {
    p.innerHTML = head + `<div class="guide"><p>${esc(FIRST_CLOSE)}</p></div>
      <p><button class="decide" id="firstQueue">Open the case queue -></button> <button class="decide" id="firstReplay" style="background:transparent;color:var(--ink);border:2px solid var(--ink)">Replay the morning</button></p>
      <p style="font-size:13px">Prefer to watch first? The <a href="https://dem.oooooooooo.se/" target="_blank" rel="noopener">four-moment guided run</a> plays the same idea end to end.</p>`;
    $("firstQueue").onclick = () => { S.tab = "queue"; renderTabs(); renderPanel(); };
    $("firstReplay").onclick = () => { S.first.idx = 0; renderPanel(); };
    return;
  }
  const step = FIRST_STEPS[S.first.idx];
  const c = S.cases.find((x) => x.id === step.caseId);
  p.innerHTML = head + `<div class="guide"><p><strong>Moment ${S.first.idx + 1} of ${FIRST_STEPS.length}.</strong> ${esc(step.note)}</p></div>` +
    (c ? caseCard(c) : "<p>Case files missing - reload the console.</p>") +
    `<p><button class="decide" id="firstNext">${S.first.idx === FIRST_STEPS.length - 1 ? "Finish the morning" : "Next moment"} -></button></p>`;
  wireCases(p);
  $("firstNext").onclick = () => { S.first.idx += 1; renderPanel(); };
}

function renderQueue() {
  const p = $("panel");
  const head = `<h3>First week without Lena — the case queue</h3>
    <p>Each case arrives the way work really arrives. You are the reviewer: ticking a box asserts that person signed. The engine checks your claim against the signed policy — it takes nothing on trust. Tick, then Decide.</p>`;
  const tracks = TRACKS.map((t) => {
    const cards = t.ids.map((id) => {
      const c = S.cases.find((x) => x.id === id);
      return c ? caseCard(c) : "";
    }).join("");
    return `<h4 style="font-family:var(--serif);margin:20px 0 10px">${esc(t.title)}</h4>${cards}`;
  }).join("");
  const close = `<div class="case"><h4>Closing the week</h4>${CLOSE_LINES.map((l) => `<p style="margin:6px 0">${esc(l)}</p>`).join("")}</div>`;
  p.innerHTML = head + tracks + tamperCardHTML() + close;
  p.querySelectorAll("input[type=checkbox]").forEach((box) => {
    box.onchange = () => {
      const c = S.cases.find((x) => x.id === box.dataset.case);
      S.decisions[c.id] = S.decisions[c.id] ?? { sigs: { ...c.request.signatures } };
      S.decisions[c.id].sigs[box.dataset.sig] = box.checked;
    };
  });
  p.querySelectorAll("[data-decide]").forEach((btn) => {
    btn.onclick = () => decide(btn.dataset.decide);
  });
  const draft = p.querySelector("#draftBtn");
  if (draft) draft.onclick = () => { if (S.signed) tryTamperedDraft(); };
}
function penViolation(rules, staged, held, actorId, actionId) {
  const bad = Object.keys(held).find((k) => held[k] === true && staged[k] && staged[k] !== "lena" && !pensOf(staged[k]).includes(k));
  if (!bad) return null;
  const claimer = staged[bad];
  const holder = penHolder(bad);
  const who = roleName(claimer);
  const reason = `${who} does not hold the ${bad} pen. It belongs to ${holder === "owner" ? "the owner" : holder} - tick only pens ${who} holds.`;
  const issueId = nextIssueId(rules?.issue_prefix ?? "ISS-2026");
  return {
    status: "REFUSED",
    sop_id: rules.sop_id,
    policy_title: rules.title,
    action_id: actionId,
    actor_id: actorId,
    rule_version_hash: rules?.version?.version_hash ?? "unknown",
    timestamp: new Date().toISOString(),
    derivation: [`ROLE refusal at claim time: ${reason}`],
    refusal_details: {
      missing_premise_id: "ROLE_AUTHORITY",
      reason,
      policy_issue: { id: issueId, title: `Refused pen claim - ${rules.title}`, missing_premise: "ROLE_AUTHORITY", context: { pen: bad, claimer, holder } },
    },
  };
}

function decide(caseId, extraLines = []) {
  const c = S.cases.find((x) => x.id === caseId);
  const rules = rulesFor(c);
  if (!rules) return;
  const held = S.decisions[caseId]?.sigs ?? { ...c.request.signatures };
  const req = { ...c.request, signatures: held, action_id: `${caseId}-${role().actor_id}`, actor_id: role().actor_id };
  const pv = penViolation(rules, S.decisions[caseId]?.staged ?? {}, held, req.actor_id, req.action_id);
  if (pv) {
    const entry = appendDecision(pv, req);
    S.decisions[caseId] = { sigs: held, staged: S.decisions[caseId]?.staged ?? {}, result: pv, entry, overridden: S.decisions[caseId]?.overridden ?? false };
    persistSnapshot();
    renderPanel();
    return;
  }
  const result = evaluateAction(req, rules);
  if (extraLines.length > 0) {
    result.derivation.splice(-1, 0, ...extraLines);
    result.derivation_chain.splice(-1, 0, ...extraLines);
  }
  const entry = appendDecision(result, req);
  S.decisions[caseId] = { sigs: held, result, entry, overridden: S.decisions[caseId]?.overridden ?? false };
  renderPanel();
}

function premiseById(rules, id) {
  return (rules?.premises ?? []).find((p) => p?.id === id) ?? null;
}

function signerLabel(rules, key) {
  const found = (rules?.signers ?? []).find((s) => s?.key === key);
  return found?.label ?? key;
}

function clearingFor(premiseId, rules) {
  if (premiseId === "RULESET_INTEGRITY") {
    return "To clear this: a fresh signature from the owner on a re-signed policy. Only the owner holds that pen.";
  }
  const p = premiseById(rules, premiseId);
  const pm = p?.params ?? {};
  const key = pm.override_signer ?? pm.signer ?? null;
  if (key) {
    const label = pm.override_label ?? signerLabel(rules, key);
    const kind = pm.override_signer ? "owner override signature" : "signature";
    return `To clear this: ${label} ${kind}. Only ${label} holds that pen.`;
  }
  return "To clear this: meet the requirement above, then run the case again.";
}

function verdictHTML(result, entry, rules, ov) {
  const st = result.status;
  const premise = result.refusal_details?.missing_premise_id ?? result.escalation_details?.unsatisfied_premise_id ?? null;
  const reason = result.refusal_details?.reason ?? result.escalation_details?.reason ?? "All requirements met — the business moves on.";
  const issue = result.refusal_details?.policy_issue ?? result.escalation_details?.policy_issue ?? null;
  const gov = premise && rules ? premiseById(rules, premise) : null;
  const govLine = gov ? `<p class="verdict">Governing rule: ${esc(gov.description)}</p>` : "";
  const clearLine = (st === "REFUSED" || st === "ESCALATED") && premise
    ? `<p class="verdict">${esc(clearingFor(premise, rules))}</p>` : "";
  const armed = ov === "new" ? S.newCase?.armed === true : S.decisions[ov]?.armed === true;
  const ovBtn = (st === "ESCALATED" && ov)
    ? (armed
      ? `<p><button class="decide" data-override="${ov}">Confirm countersign - Lena clears it</button><br><span style="font-size:12px">Second click executes. The countersign itself goes into the record as a simulated owner act.</span></p>`
      : `<p><button class="decide" data-override="${ov}">Owner countersign (clear escalation)</button><br><span style="font-size:12px">Only the owner holds this pen. Clicking arms an explicit, simulated countersign - nothing hidden.</span></p>`) : "";
  return `<div class="stamp ${stampClass(st)}">${stampWord(st)}</div>
    <p class="verdict">${esc(reason)}${premise ? ` <span class="hash">Gap: ${esc(premise)}</span>` : ""}</p>
    ${govLine}${clearLine}
    ${ovBtn}
    ${issue ? `<div class="issue"><h5>Follow-up card · ${esc(issue.id)}</h5><div><strong>${esc(issue.title)}</strong></div></div>` : ""}
    <p class="hash" style="font-size:12px">Recorded as entry #${entry.seq} · ${esc(short(entry.hash))}</p>`;
}
function caseAmount(c) {
  const d = S.decisions[c.id];
  if (!d) return 0;
  const q = c.request;
  return Number(q.amount ?? q.compensation ?? 0) || 0;
}

function policyArea(key) {
  if (key === "expense-signoff" || key === "vendor-payment") return "Spend";
  if (key === "client-onboarding") return "Clients";
  if (key === "hiring-approval") return "Hiring";
  return "Continuity";
}

function leakageMath() {
  let leak = 0;
  const risks = [];
  const areas = {};
  for (const c of S.cases) {
    const rules = rulesFor(c);
    if (!rules) continue;
    const req = { ...c.request, signatures: { ...c.request.signatures }, action_id: "LEAK-" + c.id, actor_id: "leak-check" };
    let r;
    try { r = evaluateAction(req, rules); } catch (e) { continue; }
    if (r.status !== "AUTHORIZED") {
      const amt = Number(c.request.amount ?? c.request.compensation ?? 0) || 0;
      const area = policyArea(c.policy);
      areas[area] = areas[area] ?? { leak: 0, n: 0 };
      areas[area].n += 1;
      if (amt > 0) { leak += amt; areas[area].leak += amt; }
      else risks.push(c.id);
    }
  }
  return { leak, risks, areas };
}

function dependencyBand() {
  const done = decided();
  const ow = done.filter((c) => S.decisions[c.id].result.status === "ESCALATED");
  if (done.length === 0) return { band: "Unknown", line: "No decisions run yet - key-person load unknown." };
  if (ow.length === 0) return { band: "Low", line: `All ${done.length} decisions ran with zero owner calls. The shop is running without Lena.` };
  return { band: "Watch", line: `${ow.length} decision${ow.length === 1 ? "" : "s"} waiting on an owner call - each one named above. The shop runs, but Lena is still needed here.` };
}

function renderDash() {
  const done = decided();
  const auth = done.filter((c) => S.decisions[c.id].result.status === "AUTHORIZED");
  const stopped = done.filter((c) => S.decisions[c.id].result.status !== "AUTHORIZED");
  const esc = done.filter((c) => S.decisions[c.id].result.status === "ESCALATED");
  const moved = auth.reduce((s, c) => s + caseAmount(c), 0);
  const held = stopped.reduce((s, c) => s + caseAmount(c), 0);
  const leak = leakageMath();
  const dep = dependencyBand();
  $("panel").innerHTML = `<h3>Business pulse — the week Lena was gone</h3>
    <div class="dash">
      <div class="stat"><div class="k">Decisions run</div><div class="v">${done.length} / ${S.cases.length}</div></div>
      <div class="stat"><div class="k">Money moved correctly</div><div class="v">${money(moved)}</div></div>
      <div class="stat"><div class="k">Money stopped</div><div class="v">${money(held)}</div></div>
      <div class="stat"><div class="k">Owner calls needed</div><div class="v">${esc.length}</div></div>
      <div class="stat"><div class="k">Blind week leaks</div><div class="v">${money(leak.leak)}</div></div>
      <div class="stat"><div class="k">Key-person load</div><div class="v">${dep.band}</div></div>
    </div>
    <p style="margin-top:14px;max-width:64ch">Same cases, no policies: <strong>${money(leak.leak)} leaks</strong>${leak.risks.length > 0 ? ` plus ${leak.risks.join(", ")} decided blind` : ""} (${Object.entries(leak.areas).map(([a, s]) => `${a} ${money(s.leak)}`).join(" | ")}). ${esc(dep.line)}</p>
    <p style="margin-top:14px;max-width:64ch">The business ran ${done.length} decisions without Lena. ${esc.length === 0 ? "Nothing needed her override." : `${esc.length} case${esc.length === 1 ? "" : "s"} wait${esc.length === 1 ? "s" : ""} on an owner decision — each one named, none of them silent.`} That is what a sellable business looks like: profitable, documented, and no longer dependent on any one person.</p>`;
}

function currentVersion(sopId) {
  const v = S.versions?.[sopId];
  return v ?? { n: "1.0.0", note: "original signed version" };
}

function thresholdFieldFor(rules) {
  if (typeof rules?.threshold === "number") return "threshold";
  if (typeof rules?.offer_threshold === "number") return "offer_threshold";
  if (typeof rules?.payment_threshold === "number") return "payment_threshold";
  return null;
}

function bumpVersion(id) {
  const m = String(id).match(/v(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return `${id}-v2`;
  return id.replace(/v\d+\.\d+\.\d+$/, `v${m[1]}.${Number(m[2]) + 1}.0`);
}

function doAmend(sopId) {
  const rules = S.rulesets[sopId];
  if (!rules) return;
  const tf = thresholdFieldFor(rules);
  const numEl = document.getElementById(`am-th-${sopId}`);
  const okEl = document.getElementById(`am-ok-${sopId}`);
  const flag = document.getElementById(`amflag-${sopId}`);
  const getNum = () => (tf && numEl ? Number(numEl.value) : NaN);
  const n = getNum();
  if (!okEl || !okEl.checked) {
    if (flag) flag.textContent = "Amendments need the owner countersignature - tick the box and try again.";
    return;
  }
  if (tf && !(typeof n === "number" && Number.isFinite(n) && n > 0)) {
    if (flag) flag.textContent = "Enter a positive number for the new limit.";
    return;
  }
  const next = JSON.parse(JSON.stringify(rules));
  if (tf) next[tf] = n;
  next.version = {
    ...next.version,
    id: bumpVersion(next.version?.id ?? "v1.0.0"),
    effective_date: todayStr(),
    signed_by: `owner countersignature via ${role().actor_id}`,
  };
  next.version.version_hash = `sha256:${sha256Hex(canonicalRulesetContent(next))}`;
  const stamp = new Date().toISOString();
  appendDecision({
    status: "SUPERSEDED", sop_id: sopId, policy_title: rules.title,
    action_id: `AMEND-${sopId}`, actor_id: role().actor_id,
    rule_version_hash: rules.version?.version_hash ?? "unknown", timestamp: stamp,
    derivation: [`Version ${rules.version?.id} superseded by owner-countersigned amendment.`],
  });
  appendDecision({
    status: "SIGNED", sop_id: sopId, policy_title: next.title,
    action_id: `AMEND-${sopId}-NEW`, actor_id: role().actor_id,
    rule_version_hash: next.version.version_hash, timestamp: stamp,
    derivation: [`Version ${next.version.id} signed into force; cases from here run under it.`],
  });
  S.rulesets[sopId] = next;
  S.versions = S.versions ?? {};
  S.versions[sopId] = { n: next.version.id, note: tf ? `limit now $${Number(n).toLocaleString("en-US")}` : "renewed signature, rules unchanged" };
  renderPanel();
}

function policyControls(rules) {
  const parts = [];
  const money = (k, label) => { if (typeof rules?.[k] === "number") parts.push(`${label} $${Number(rules[k]).toLocaleString("en-US")}`); };
  money("threshold", "spend limit");
  money("payment_threshold", "payout limit");
  money("offer_threshold", "offer line");
  money("elevated_limit", "elevated limit");
  if (typeof rules?.discount_line === "number") parts.push(`discount line ${rules.discount_line}%`);
  for (const p of rules?.premises ?? []) {
    if (p?.evaluator_key === "minimum-floor" && typeof p?.params?.floor === "number") {
      parts.push(`${p.params.field} floor ${p.params.floor}`);
    }
  }
  return parts.length > 0 ? parts.join(" | ") : "no numeric controls";
}

function renderBook() {
  const cards = Object.values(S.rulesets).map((r) => {
    const ver = currentVersion(r.sop_id);
    const tf = thresholdFieldFor(r);
    const cur = tf ? r[tf] : null;
    const amend = tf
      ? `<div style="margin-top:10px;font-size:13px;border-top:1px solid var(--line);padding-top:10px">
        <strong>Amend this policy</strong> (owner countersignature required)<br>
        <label>New limit $ <input id="am-th-${r.sop_id}" type="number" min="1" step="any" value="${cur}" style="width:130px"></label>
        <label style="margin-left:10px"><input id="am-ok-${r.sop_id}" type="checkbox"> Owner countersigns</label>
        <button class="decide" id="am-go-${r.sop_id}" style="margin-left:10px">Sign new version</button>
        <span id="amflag-${r.sop_id}" style="margin-left:10px"></span></div>`
      : `<div style="margin-top:10px;font-size:13px;border-top:1px solid var(--line);padding-top:10px">
        <strong>Renew this policy</strong> (owner countersignature required)<br>
        <label><input id="am-ok-${r.sop_id}" type="checkbox"> Owner countersigns a fresh signature, rules unchanged</label>
        <button class="decide" id="am-go-${r.sop_id}" style="margin-left:10px">Sign new version</button>
        <span id="amflag-${r.sop_id}" style="margin-left:10px"></span></div>`;
    return `<div class="policy">
      <h4>${esc(r.title)}</h4>
      <p style="font-size:13.5px;color:var(--ink2);margin:4px 0">${esc(r.demo_story ?? "")}</p>
      <p class="meta">running version ${esc(ver.n)} (${esc(ver.note)}) · signed: ${esc(r.version?.signed_by ?? "?")} · effective ${esc(r.version?.effective_date ?? "?")} · fingerprint ${esc(short(r.version?.version_hash))} · ${(r.premises ?? []).length} requirements · signers: ${esc((r.signers ?? []).map((s) => s.label).join(" | "))}</p>
      ${amend}
      <p class="meta">controls: ${esc(policyControls(r))}</p>
      <p class="meta">pens: ${(r.signers ?? []).map((s) => { const h = penHolder(s.key); return `${s.label} (${h === "owner" ? "owner only" : `held by ${h}`})`; }).join(" | ")}</p>
      <details><summary>Read the live premises</summary><ul>${(r.premises ?? []).map((p) => `<li>${esc(p.description ?? p.id)}</li>`).join("")}</ul></details></div>`;
  }).join("");
  $("panel").innerHTML = `<h3>Policy book - what Lena left behind, and what changed since</h3>
    <p>Signed policies. Every case in the queue answers to the running version. Amendments need the owner countersignature and are written into the record.</p>${cards}`;
  for (const r of Object.values(S.rulesets)) {
    const btn = document.getElementById(`am-go-${r.sop_id}`);
    if (btn) btn.onclick = () => doAmend(r.sop_id);
  }
  renderFeedCard();
}

function registryVendors() {
  const names = [];
  for (const r of Object.values(S.rulesets)) {
    for (const v of r.active_vendors ?? []) {
      if (!names.includes(v)) names.push(v);
    }
  }
  return names;
}

function vendorIn(sopId, name) {
  return (S.rulesets[sopId]?.active_vendors ?? []).includes(name);
}

function renderFeedCard() {
  const rows = registryVendors().map((v) => {
    const exp = vendorIn("SOP-FIN-01", v) ? "active" : "removed";
    const pay = vendorIn("SOP-PAY-01", v) ? "active" : "removed";
    const gone = exp === "removed" && pay === "removed";
    const action = gone ? "removed - see record book"
      : `<button class="decide" data-rmvendor="${esc(v)}">Apply registry removal</button>`;
    return `<tr><td><strong>${esc(v)}</strong></td><td>${exp}</td><td>${pay}</td><td>${action}</td></tr>`;
  }).join("");
  const synced = S.feed?.syncedAt ? S.feed.syncedAt.slice(0, 16).replace("T", " ") : "never";
  const d = document.createElement("div");
  d.className = "case";
  d.innerHTML = `<h4>Vendor registry - simulated county feed</h4>
    <p class="story">Last synced ${esc(synced)} (UTC). When the registry changes, the change lands as a signed policy version - never as a quiet edit.</p>
    <table class="ledger"><thead><tr><th>Vendor</th><th>Spend policy</th><th>Payout policy</th><th>Registry action</th></tr></thead><tbody>${rows}</tbody></table>
    <p style="margin-top:10px"><label><input id="feedOk" type="checkbox"> Owner countersigns registry changes</label> <span id="feedFlag" style="margin-left:10px;font-size:13px"></span></p>
    <p style="margin-top:10px"><button class="decide" id="syncBtn">Sync registry now</button></p>`;
  $("panel").appendChild(d);
  const s = document.getElementById("syncBtn");
  if (s) s.onclick = () => syncRegistry();
  const fok = document.getElementById("feedOk");
  if (fok) { fok.checked = S.feed?.ok === true; fok.onchange = () => { S.feed = S.feed ?? {}; S.feed.ok = fok.checked; persistSnapshot(); }; }
  d.querySelectorAll("[data-rmvendor]").forEach((b) => { b.onclick = () => doVendorUpdate(b.dataset.rmvendor); });
}

function syncRegistry() {
  S.feed = S.feed ?? {};
  S.feed.syncedAt = new Date().toISOString();
  appendDecision({
    status: "NOTE", sop_id: "REGISTRY", policy_title: "Vendor registry sync",
    action_id: "REGISTRY-SYNC", actor_id: role().actor_id,
    rule_version_hash: "registry", timestamp: S.feed.syncedAt,
    derivation: [`Registry sync at ${S.feed.syncedAt}: vendor list re-verified against the signed policies.`],
  });
  persistSnapshot();
  renderPanel();
}

function doVendorUpdate(vendor) {
  const targets = Object.values(S.rulesets).filter((r) => Array.isArray(r.active_vendors) && r.active_vendors.includes(vendor));
  if (targets.length === 0) return;
  if (!(S.feed?.ok === true)) {
    const flag = document.getElementById("feedFlag");
    if (flag) flag.textContent = "Registry changes need the owner countersignature - tick the box and try again.";
    appendDecision({
      status: "REFUSED", sop_id: "REGISTRY", policy_title: "Vendor registry change",
      action_id: `REGISTRY-${vendor}`, actor_id: role().actor_id,
      rule_version_hash: "registry", timestamp: new Date().toISOString(),
      derivation: [`Registry removal of ${vendor} refused: no owner countersignature.`],
      refusal_details: { missing_premise_id: "OWNER_COUNTERSIGN", reason: `Registry change for ${vendor} needs the owner countersignature.`,
        policy_issue: { id: nextIssueId("ISS-REG-2026"), title: `Registry change refused - ${vendor}`, missing_premise: "OWNER_COUNTERSIGN", context: { vendor } } },
    });
    persistSnapshot();
    return;
  }
  const stamp = new Date().toISOString();
  for (const rules of targets) {
    const next = JSON.parse(JSON.stringify(rules));
    next.active_vendors = next.active_vendors.filter((v) => v !== vendor);
    next.version = {
      ...next.version,
      id: bumpVersion(next.version?.id ?? "v1.0.0"),
      effective_date: todayStr(),
      signed_by: `registry update via ${role().actor_id}`,
    };
    next.version.version_hash = `sha256:${sha256Hex(canonicalRulesetContent(next))}`;
    appendDecision({
      status: "SUPERSEDED", sop_id: rules.sop_id, policy_title: rules.title,
      action_id: `REGISTRY-${rules.sop_id}`, actor_id: role().actor_id,
      rule_version_hash: rules.version?.version_hash ?? "unknown", timestamp: stamp,
      derivation: [`Registry update removed ${vendor}; version ${rules.version?.id} superseded.`],
    });
    appendDecision({
      status: "SIGNED", sop_id: rules.sop_id, policy_title: next.title,
      action_id: `REGISTRY-${rules.sop_id}-NEW`, actor_id: role().actor_id,
      rule_version_hash: next.version.version_hash, timestamp: stamp,
      derivation: [`Version ${next.version.id} signed into force without ${vendor}.`],
    });
    S.rulesets[rules.sop_id] = next;
    S.versions = S.versions ?? {};
    S.versions[rules.sop_id] = { n: next.version.id, note: `${vendor} removed by registry update` };
  }
  persistSnapshot();
  renderPanel();
}
function ledgerToolsHTML() {
  return `<p><button class="decide" id="expBtn">Export record</button> <button class="decide" id="packBtn">Download buyer pack</button> <button class="decide" id="diligBtn">Diligence summary</button> <label class="decide" style="cursor:pointer">Import record<input id="impFile" type="file" accept="application/json" style="display:none"></label> <span id="impFlag" style="margin-left:10px;font-size:13px"></span></p>`;
}
function exportRecord() {
  const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), ledger: getEntries(), decisions: S.decisions, versions: S.versions ?? null, signed: S.signed }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "handover-record.json";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function importRecordFile(file) {
  const flag = () => document.getElementById("impFlag");
  const say = (t) => { const f = flag(); if (f) f.textContent = t; };
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const snap = JSON.parse(String(rd.result ?? ""));
      const entries = Array.isArray(snap) ? snap : snap.ledger;
      if (!Array.isArray(entries)) throw new Error("badfile");
      importEntries(entries);
      if (!verifyChain().ok) throw new Error("chain");
      if (snap && !Array.isArray(snap)) {
        if (snap.decisions && typeof snap.decisions === "object") S.decisions = snap.decisions;
        if (snap.signed === true) S.signed = true;
        S.versions = snap.versions ?? S.versions ?? null;
        if (snap.rulesets && typeof snap.rulesets === "object") {
          for (const rules of Object.values(snap.rulesets)) {
            const recomputed = `sha256:${sha256Hex(canonicalRulesetContent(rules))}`;
            if (String(rules?.version?.version_hash ?? "") !== recomputed) throw new Error("rules");
          }
          for (const [sopId, rules] of Object.entries(snap.rulesets)) S.rulesets[sopId] = rules;
        }
        if (snap.encoded) S.encoded = snap.encoded;
      }
      persistSnapshot();
      renderPanel();
      wireLedgerTools();
      say(`Imported ${entries.length} entries - chain verified.`);
    } catch (e) {
      say("Import refused: file is not a verifiable record.");
    }
  };
  rd.readAsText(file);
}
function downloadBuyerPack() {
  const entries = getEntries();
  const v = verifyChain();
  const done = decided();
  const pack = {
    exported: new Date().toISOString(),
    business: S.company?.name ?? "Beacon Print & Supply",
    note: "Diligence bundle: every decision below carries the human who authorised it.",
    policies: Object.values(S.rulesets),
    ledger: entries,
    verification: { chain_ok: v.ok, entries: entries.length, decisions: done.length },
  };
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "buyer-pack.json";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function diligenceText() {
  const entries = getEntries();
  const v = verifyChain();
  const done = decided();
  const L = [];
  L.push("DILIGENCE SUMMARY - " + (S.company?.name ?? "Beacon Print & Supply"));
  L.push("Exported: " + new Date().toISOString());
  L.push("Figures are demonstration samples standing in for a real client's own.");
  L.push("");
  const auth = done.filter((c) => S.decisions[c.id].result.status === "AUTHORIZED");
  const stopped = done.filter((c) => S.decisions[c.id].result.status !== "AUTHORIZED");
  const moved = auth.reduce((s, c) => s + caseAmount(c), 0);
  const held = stopped.reduce((s, c) => s + caseAmount(c), 0);
  L.push(`Decisions run: ${done.length} of ${S.cases.length}`);
  L.push(`Money moved correctly: $${moved.toLocaleString("en-US")}`);
  L.push(`Money stopped: $${held.toLocaleString("en-US")}`);
  L.push("");
  L.push("Escalations and how they were resolved:");
  const escs = done.filter((c) => S.decisions[c.id].result.status === "ESCALATED");
  if (escs.length === 0) L.push("- none waiting on the owner");
  for (const c of escs) {
    const d = S.decisions[c.id];
    const premise = d.result.escalation_details?.unsatisfied_premise_id ?? "?";
    const state = d.overridden ? "RELEASED by owner override" : "still frozen, waiting on owner";
    L.push(`- ${c.id} ${c.title}: ${state} (${premise}) [${String(d.entry?.hash ?? "?").slice(0, 12)}]`);
  }
  L.push("");
  L.push("Policies in force:");
  for (const r of Object.values(S.rulesets)) {
    L.push(`- ${r.title} [${r.sop_id}] version ${r.version?.id} fingerprint ${r.version?.version_hash}`);
  }
  L.push("");
  L.push("Integrity attacks attempted and refused:");
  const integ = entries.filter((e) => e.refusal_details?.missing_premise_id === "RULESET_INTEGRITY");
  if (integ.length === 0) L.push("- none attempted");
  for (const e of integ) L.push(`- ${e.action_id} seq ${e.seq} hash ${String(e.hash).slice(0, 16)}`);
  const ovs = entries.filter((e) => String(e.action_id ?? "").startsWith("OVERRIDE-"));
  if (ovs.length > 0) {
    L.push("Owner overrides signed:");
    for (const e of ovs) L.push(`- ${e.action_id} seq ${e.seq}`);
  }
  L.push("");
  L.push(`Record: ${v.ok ? `verified, ${entries.length} entries chained` : "CHECK FAILED"}`);
  return L.join("\n");
}

function downloadDiligence() {
  const blob = new Blob([diligenceText()], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "diligence-summary.txt";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

async function copyDiligence() {
  try {
    await navigator.clipboard.writeText(diligenceText());
    return true;
  } catch (e) {
    return false;
  }
}

function wireLedgerTools() {
  const ex = document.getElementById("expBtn");
  if (ex) ex.onclick = () => exportRecord();
  const pk = document.getElementById("packBtn");
  if (pk) pk.onclick = () => downloadBuyerPack();
  const dg = document.getElementById("diligBtn");
  if (dg) dg.onclick = () => downloadDiligence();
  const im = document.getElementById("impFile");
  if (im) im.onchange = () => { if (im.files && im.files[0]) importRecordFile(im.files[0]); };
}
function newCaseState() {
  if (!S.newCase) S.newCase = { sop_id: null, values: {}, sigs: {}, result: null, entry: null };
  return S.newCase;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fieldHTML(f, val) {
  const lab = `<label>${esc(f.label)} `;
  if (f.type === "choice") {
    const opts = (f.choices ?? []).map((c) => `<option${String(c) === String(val ?? "") ? " selected" : ""}>${esc(c)}</option>`).join("");
    return `<p>${lab}<select data-nfield="${f.key}">${opts}</select></label></p>`;
  }
  if (f.type === "yesno") {
    const yes = val === true || val === "yes";
    return `<p>${lab}<select data-nfield="${f.key}"><option value="no"${yes ? "" : " selected"}>No</option><option value="yes"${yes ? " selected" : ""}>Yes</option></select></label></p>`;
  }
  if (f.type === "amount") {
    return `<p>${lab}<input data-nfield="${f.key}" type="number" min="0" step="any" value="${esc(val ?? "")}"></label></p>`;
  }
  if (f.type === "date") {
    const d = !val || val === "today" ? todayStr() : val;
    return `<p>${lab}<input data-nfield="${f.key}" type="date" value="${esc(d)}"></label></p>`;
  }
  const init = val ?? (f.default !== undefined && f.default !== "today" ? f.default : "");
  return `<p>${lab}<input data-nfield="${f.key}" type="text" value="${esc(init)}"></label></p>`;
}

function readField(f, el) {
  if (f.type === "yesno") return el.value === "yes";
  if (f.type === "amount") return el.value === "" ? undefined : Number(el.value);
  return el.value;
}

function shortName() {
  return role().key === "tomas" ? "Tomas" : "Maya";
}

function defaultAmount(rules, f) {
  if (f.key === "discount_pct") return 0;
  const th = rules?.threshold ?? rules?.payment_threshold ?? rules?.offer_threshold;
  if (typeof th === "number") return Math.floor(th / 2);
  if (f.key === "cash_weeks") return 10;
  if (f.key === "margin_pct") return 18;
  if (f.key === "red_weeks") return 0;
  if (f.key === "response_days") return 1;
  return undefined;
}

function renderNewCase() {
  const p = $("panel");
  const policies = Object.values(S.rulesets);
  if (!S.signed || policies.length === 0) {
    p.innerHTML = `<h3>New case: write it yourself</h3><p>Lena signs the pack first - then this desk opens.</p>`;
    return;
  }
  const st = newCaseState();
  if (!policies.find((r) => r.sop_id === st.sop_id)) {
    st.sop_id = policies[0].sop_id; st.values = {}; st.sigs = {}; st.result = null; st.entry = null;
  }
  const rules = policies.find((r) => r.sop_id === st.sop_id);
  for (const f of rules.input_fields ?? []) {
    if (st.values[f.key] !== undefined) continue;
    if (f.type === "choice" && Array.isArray(f.choices) && f.choices.length > 0) st.values[f.key] = f.choices[0];
    else if (f.type === "yesno") st.values[f.key] = false;
    else if (f.type === "date") st.values[f.key] = todayStr();
    else if (f.type === "amount") { const dflt = defaultAmount(rules, f); if (dflt !== undefined) st.values[f.key] = dflt; }
  }
  const opts = policies.map((r) => `<option value="${r.sop_id}"${r.sop_id === st.sop_id ? " selected" : ""}>${esc(r.title)}</option>`).join("");
  const fields = (rules.input_fields ?? []).map((f) => fieldHTML(f, st.values[f.key])).join("");
  const boxes = (rules.signers ?? []).map((s) => {
    const note = thresholdNote(rules, s.key);
    const holder = penHolder(s.key);
    const who = holder === "owner" ? "owner only" : `held by ${holder}`;
    return `<label><input type="checkbox" data-nsig="${s.key}"${st.sigs[s.key] === true ? " checked" : ""}> ${esc(s.label)}${note ? ` <small>(${esc(note)})</small>` : ""} <small>(${who})</small></label>`;
  }).join("");
  const verdict = st.result ? verdictHTML(st.result, st.entry, rules, "new") : "";
  p.innerHTML = `<h3>New case: write it yourself</h3>
    <p>Pick a policy, fill the facts, tick who signed. Blank or uncovered values are refused, not guessed.</p>
    <p><label>Policy <select id="ncPolicy">${opts}</select></label></p>
    ${fields}
    <div class="sigs">${boxes}</div>
    <button class="decide" id="ncGo">Decide as ${esc(shortName())} -></button>
    <div id="ncVerdict">${verdict}</div>`;
  $("ncPolicy").onchange = (e) => { st.sop_id = e.target.value; st.values = {}; st.sigs = {}; st.result = null; st.entry = null; renderPanel(); };
  p.querySelectorAll("[data-nfield]").forEach((el) => {
    el.onchange = () => {
      const f = (rules.input_fields ?? []).find((x) => x.key === el.dataset.nfield);
      if (f) { st.values[f.key] = readField(f, el); st.result = null; st.entry = null; }
    };
  });
  p.querySelectorAll("[data-nsig]").forEach((box) => {
    box.onchange = () => { st.sigs[box.dataset.nsig] = box.checked; st.result = null; st.entry = null; };
  });
  $("ncGo").onclick = () => decideNewCase(rules, st);
}

function decideNewCase(rules, st, extraLines = []) {
  const req = { action_id: `NEW-${role().actor_id}-${Date.now()}`, actor_id: role().actor_id };
  for (const f of rules.input_fields ?? []) {
    let v = st.values[f.key];
    if (v === undefined && f.default !== undefined && f.default !== "today") v = f.default;
    if (f.type === "date" && (v === undefined || v === "today")) v = todayStr();
    if (v !== undefined) req[f.key] = v;
  }
  req.signatures = { ...st.sigs };
  const npv = penViolation(rules, st.staged ?? {}, req.signatures, req.actor_id, req.action_id);
  if (npv) {
    const entry = appendDecision(npv, req);
    st.result = npv; st.entry = entry;
    persistSnapshot();
    renderPanel();
    return;
  }
  const result = evaluateAction(req, rules);
  if (extraLines.length > 0) {
    result.derivation.splice(-1, 0, ...extraLines);
    result.derivation_chain.splice(-1, 0, ...extraLines);
  }
  const entry = appendDecision(result, req);
  st.result = result; st.entry = entry;
  renderPanel();
}

const CONT_POLICIES = ["SOP-SEAT-01", "SOP-THAW-01", "SOP-NUM-01", "SOP-DOC-01", "SOP-COM-01"];

const CONT_CASES = {
  "SOP-SEAT-01": ["SEAT-01"],
  "SOP-THAW-01": ["THAW-02"],
  "SOP-NUM-01": ["NUM-01", "NUM-02"],
  "SOP-DOC-01": ["DOC-02"],
  "SOP-COM-01": ["COM-01"],
};

function wireCases(root) {
  root.querySelectorAll("input[type=checkbox]").forEach((box) => {
    box.onchange = () => {
      const c = S.cases.find((x) => x.id === box.dataset.case);
      if (!c) return;
      S.decisions[c.id] = S.decisions[c.id] ?? { sigs: { ...c.request.signatures } };
      S.decisions[c.id].sigs[box.dataset.sig] = box.checked;
    };
  });
  root.querySelectorAll("[data-decide]").forEach((btn) => {
    btn.onclick = () => decide(btn.dataset.decide);
  });
}

function renderCont() {
  const p = $("panel");
  const head = `<h3>Continuity policies - running without Lena</h3>
    <p>Five signed policies cover seats, speed, numbers, write-ups, and relationships. Each case below runs live against its policy.</p>`;
  const blocks = CONT_POLICIES.map((sopId) => {
    const r = S.rulesets[sopId];
    if (!r) return "";
    const cards = (CONT_CASES[sopId] ?? []).map((id) => {
      const c = S.cases.find((x) => x.id === id);
      return c ? caseCard(c) : "";
    }).join("");
    return `<div class="policy"><h4>${esc(r.title)}</h4>
      <p style="font-size:13.5px;color:var(--ink2);margin:4px 0">${esc(r.demo_story ?? "")}</p>
      <p class="meta">signed: ${esc(r.version?.signed_by ?? "?")} · fingerprint ${esc(short(r.version?.version_hash))} · signers: ${esc((r.signers ?? []).map((s) => s.label).join(" | "))}</p></div>${cards}`;
  }).join("");
  const extra = Object.values(S.rulesets)
    .filter((r) => r?.sop_id?.indexOf("SOP-CUSTOM-") === 0)
    .map((r) => `<div class="policy"><h4>${esc(r.title)}</h4>
      <p style="font-size:13.5px;color:var(--ink2);margin:4px 0">Encoded live during this demo - runs cases in the New case desk.</p>
      <p class="meta">signed: ${esc(r.version?.signed_by ?? "?")} · fingerprint ${esc(short(r.version?.version_hash))} · signers: ${esc((r.signers ?? []).map((s) => s.label).join(" | "))}</p></div>`)
    .join("");
  p.innerHTML = head + blocks + extra;
  wireCases(p);
}

const GUARDS = [
  { sop: "SOP-FIN-01", label: "Spend limit", verb: "Try raising it",
    get: (r) => r.threshold, set: (r, v) => { r.threshold = v; },
    fmt: (v) => `$${Number(v).toLocaleString("en-US")}`, attempt: 50000 },
  { sop: "SOP-PAY-01", label: "Payout limit", verb: "Try raising it",
    get: (r) => r.payment_threshold, set: (r, v) => { r.payment_threshold = v; },
    fmt: (v) => `$${Number(v).toLocaleString("en-US")}`, attempt: 100000 },
  { sop: "SOP-HIRE-01", label: "Offer line", verb: "Try raising it",
    get: (r) => r.offer_threshold, set: (r, v) => { r.offer_threshold = v; },
    fmt: (v) => `$${Number(v).toLocaleString("en-US")}`, attempt: 300000 },
  { sop: "SOP-THAW-01", label: "Discount line", verb: "Try raising it",
    get: (r) => r.discount_line, set: (r, v) => { r.discount_line = v; },
    fmt: (v) => `${v}%`, attempt: 25 },
  { sop: "SOP-NUM-01", label: "Cash floor", verb: "Try lowering it",
    get: (r) => premFloor(r, "PREMISE_NUM_01_CASH_FLOOR"), setPrem: ["PREMISE_NUM_01_CASH_FLOOR", 4],
    fmt: (v) => `${v} weeks`, attempt: 4 },
  { sop: "SOP-NUM-01", label: "Margin floor", verb: "Try lowering it",
    get: (r) => premFloor(r, "PREMISE_NUM_02_MARGIN_FLOOR"), setPrem: ["PREMISE_NUM_02_MARGIN_FLOOR", 8],
    fmt: (v) => `${v}%`, attempt: 8 },
];

function premFloor(rules, premiseId) {
  const p = (rules?.premises ?? []).find((x) => x?.id === premiseId);
  const v = p?.params?.floor;
  return typeof v === "number" ? v : null;
}

function tryRaiseGuard(gi) {
  const g = GUARDS[gi];
  const rules = S.rulesets[g.sop];
  if (!rules) return;
  const altered = JSON.parse(JSON.stringify(rules));
  if (g.set) g.set(altered, g.attempt);
  else if (g.setPrem) {
    const p = (altered.premises ?? []).find((x) => x?.id === g.setPrem[0]);
    if (!p) return;
    p.params = { ...(p.params ?? {}), floor: g.setPrem[1] };
  }
  const recomputed = "sha256:" + sha256Hex(canonicalRulesetContent(altered));
  const stored = String(altered.version?.version_hash ?? "");
  const issueId = nextIssueId(rules?.issue_prefix ?? "ISS-2026");
  const reason = `Edited draft refused: stored ${stored} does not match recomputed ${recomputed}. Only a fresh signature from the owner changes the policy.`;
  const result = {
    status: "REFUSED", sop_id: rules.sop_id, policy_title: rules.title,
    action_id: `GUARD-${rules.sop_id}-${gi}`, actor_id: role().actor_id,
    rule_version_hash: stored, timestamp: new Date().toISOString(), derivation: [reason],
    refusal_details: { missing_premise_id: "RULESET_INTEGRITY", reason,
      policy_issue: { id: issueId, title: `Edited draft refused - ${rules.title}`, missing_premise: "RULESET_INTEGRITY", context: { stored, recomputed } } },
  };
  const entry = appendDecision(result);
  S.guard = S.guard ?? {};
  S.guard[`${g.sop}-${g.label}`] = { result, entry };
  persistSnapshot();
  renderPanel();
}

function renderGuard() {
  const p = $("panel");
  const rows = GUARDS.map((g, gi) => {
    const rules = S.rulesets[g.sop];
    if (!rules) return "";
    const cur = g.get(rules);
    const recomputed = "sha256:" + sha256Hex(canonicalRulesetContent(rules));
    const match = String(rules?.version?.version_hash ?? "") === recomputed;
    const done = (S.guard ?? {})[`${g.sop}-${g.label}`];
    const out = !done ? "" : `<p class="verdict">Stopped - edited draft refused, both fingerprints shown in the record book.</p>`;
    return `<div class="case"><h4>${esc(g.label)} - currently ${esc(g.fmt(cur))}</h4>
      <p class="story">${esc(rules.title)} · signed fingerprint ${match ? "matches" : "MISMATCH"}</p>
      <button class="decide" data-guard="${gi}">${esc(g.verb)} (attempt ${esc(g.fmt(g.attempt))})</button>${out}</div>`;
  }).join("");
  const numDecided = (S.decisions["NUM-01"] || S.decisions["NUM-02"])
    ? "A weekly review has been decided - see the case queue."
    : "No weekly review decided yet - run NUM-01 or NUM-02 in the continuity tab.";
  p.innerHTML = `<h3>Profit guardrails - the controls that hold margin</h3>
    <p>Limits and floors live in signed policies. Anyone can attempt to move one; the attempt is refused, both fingerprints shown, and the attempt itself goes into the record. ${esc(numDecided)}</p>` + rows;
  p.querySelectorAll("[data-guard]").forEach((b) => { b.onclick = () => tryRaiseGuard(Number(b.dataset.guard)); });
}

const PLAYBOOKS = [
  { key: "planned", title: "Planned exit - Lena retires on schedule",
    hours4: "Lena signs the succession pack; Maya and Tomas confirm their seats in writing; the signed record opens.",
    hours48: "First cases decided under the inherited policies (EXP-01, ONB-01); weekly numbers reviewed (NUM-01); vendors learn successor names (COM-01).",
    elevated: "Maya decides operations up to $10,000; Tomas moves money inside policy. Neither can raise any limit.",
    full: "Routine restocks, payroll, standard pricing, approved payouts, clean intakes.",
    frozen: "New debt, price changes, hires above the line, discounts above the line - owner signature required.",
    ledger: "Pack signatures, then every decision chained in order. Nothing silent." },
  { key: "sudden", title: "Sudden disappearance - Lena unreachable today",
    hours4: "Declare a 72-hour absence (SEAT-01); Maya covers operations; payouts above $10,000 wait - no override exists to give (see EXP-02).",
    hours48: "Emergency weekly-numbers review (NUM-02); every vendor gets a successor name (COM-01); undocumented processes inventoried (DOC-02).",
    elevated: "Same $10,000 ceiling. Absence changes who decides, never how much anyone may move.",
    full: "Routine work, payroll, in-policy payouts, clean intakes with all checks green.",
    frozen: "Everything the policies mark owner-only stays frozen until a countersigned owner returns.",
    ledger: "Absence declaration, cover acceptance, then every decision chained in order. Nothing silent." },
];

function renderPlaybook() {
  const cards = PLAYBOOKS.map((s) => `<div class="case"><h4>${esc(s.title)}</h4>
    <p class="story"><strong>First 4 hours:</strong> ${esc(s.hours4)}</p>
    <p class="story"><strong>First 48 hours:</strong> ${esc(s.hours48)}</p>
    <p class="story"><strong>Elevated seats:</strong> ${esc(s.elevated)}</p>
    <p class="story"><strong>Full speed:</strong> ${esc(s.full)}</p>
    <p class="story"><strong>Frozen:</strong> ${esc(s.frozen)}</p>
    <p class="story"><strong>Record:</strong> ${esc(s.ledger)}</p></div>`).join("");
  $("panel").innerHTML = `<h3>Absence playbook - two ways Lena can be gone</h3>
    <p>The same policies govern both. The difference is who is missing, never which rules apply.</p>${cards}`;
}

function renderEncode() {
  const p = $("panel");
  if (!S.signed) {
    p.innerHTML = `<h3>Encode a policy - turn spoken rules into signed policy</h3><p>Lena signs the pack first - then this desk opens.</p>`;
    return;
  }
  const done = S.encoded ?? null;
  const result = !done ? "" : `<div class="case"><h4>Signed into force: ${esc(done.title)}</h4>
    <p class="story">Policy ${esc(done.sopId)} now answers cases in the queue, the policy book, and the new-case desk. Trial run: ${esc(done.trialText)}</p>
    ${verdictHTML(done.result, done.entry, S.rulesets[done.sopId])}</div>`;
  p.innerHTML = `<h3>Encode a policy - turn spoken rules into signed policy</h3>
    <p>Answer three questions the way an owner would say them. The console writes the signed policy, fingerprints it, and runs a trial case through it on the spot.</p>
    <p><label>1. What decision does this policy govern? <input id="enc-what" type="text" value="Tool purchases" style="width:260px"></label></p>
    <p><label>2. Above what amount must the owner sign? $ <input id="enc-limit" type="number" min="1" step="any" value="5000" style="width:140px"></label></p>
    <p><label>3a. Who signs day-to-day as requester? <input id="enc-req" type="text" value="Requester" style="width:200px"></label></p>
    <p><label>3b. Who signs day-to-day as executor? <input id="enc-exec" type="text" value="Finance" style="width:200px"></label></p>
    <p><label><input id="enc-ok" type="checkbox"> Owner countersigns this policy</label></p>
    <p><button class="decide" id="encGo">Sign policy into force -></button> <span id="encFlag" style="margin-left:10px;font-size:13px"></span></p>${result}`;
  $("encGo").onclick = () => doEncode();
}

function doEncode() {
  const flag = document.getElementById("encFlag");
  const say = (t) => { if (flag) flag.textContent = t; };
  const what = String(document.getElementById("enc-what")?.value ?? "").trim();
  const limit = Number(document.getElementById("enc-limit")?.value);
  const reqLabel = String(document.getElementById("enc-req")?.value ?? "").trim();
  const execLabel = String(document.getElementById("enc-exec")?.value ?? "").trim();
  const ok = document.getElementById("enc-ok");
  if (what.length === 0) { say("Name the decision first."); return; }
  if (!(typeof limit === "number" && Number.isFinite(limit) && limit > 0)) { say("Enter a positive owner-sign limit."); return; }
  if (reqLabel.length === 0 || execLabel.length === 0) { say("Name both day-to-day signers."); return; }
  if (!ok || !ok.checked) { say("Amendments and new policies need the owner countersignature."); return; }
  const n = Object.keys(S.rulesets).filter((k) => k.indexOf("SOP-CUSTOM-") === 0).length + 1;
  const sopId = `SOP-CUSTOM-${String(n).padStart(2, "0")}`;
  const tag = sopId.replace(/-/g, "_");
  const rules = {
    sop_id: sopId,
    title: `${what} - who may approve it`,
    demo_story: "Encoded live from a three-question interview during the demo.",
    version: {
      id: `${tag.toLowerCase()}_v1.0.0`,
      version_hash: "sha256:PENDING",
      effective_date: todayStr(),
      signed_by: `owner countersignature via ${role().actor_id}`,
    },
    threshold: limit,
    supported_currencies: ["USD"],
    premises: [
      { id: `PREMISE_${tag}_01_PROPOSAL`, description: `Proposal needs the ${reqLabel} signature, a positive amount, and a vendor name.`,
        evaluator_key: "require-all",
        params: { checks: [
          { evaluator_key: "signature-present", params: { signer: "requester", label: reqLabel } },
          { evaluator_key: "positive-amount", params: { field: "amount" } },
          { evaluator_key: "text-present", params: { field: "vendor" } },
        ], success_detail: "proposal complete with amount and vendor." }, escalate_on: [] },
      { id: `PREMISE_${tag}_02_CURRENCY`, description: "Currency must be explicitly supported (USD).",
        evaluator_key: "currency-in-supported-set", params: { field: "currency", list: "supported_currencies" }, escalate_on: ["executor"] },
      { id: `PREMISE_${tag}_03_LIMIT`, description: `Amounts above $${Number(limit).toLocaleString("en-US")} require an explicit owner override signature.`,
        evaluator_key: "amount-over-threshold-needs-override",
        params: { amount_field: "amount", threshold_field: "threshold", override_signer: "owner", override_label: "owner" }, escalate_on: ["executor"] },
      { id: `PREMISE_${tag}_04_EXECUTION`, description: `Doing the work needs the ${execLabel} signature over the approved state.`,
        evaluator_key: "signature-present", params: { signer: "executor", label: execLabel }, escalate_on: [] },
    ],
    signers: [
      { key: "requester", label: reqLabel },
      { key: "executor", label: execLabel },
      { key: "owner", label: "Owner (override)" },
    ],
    input_fields: [
      { key: "amount", label: "Amount ($)", type: "amount" },
      { key: "currency", label: "Currency", type: "text", default: "USD" },
      { key: "vendor", label: "Vendor name", type: "text" },
    ],
  };
  rules.version.version_hash = "sha256:" + sha256Hex(canonicalRulesetContent(rules));
  const stamp = new Date().toISOString();
  appendDecision({
    status: "SIGNED", sop_id: sopId, policy_title: rules.title,
    action_id: `ENCODE-${sopId}`, actor_id: role().actor_id,
    rule_version_hash: rules.version.version_hash, timestamp: stamp,
    derivation: [`${rules.title} encoded from interview and signed into force.`],
  });
  S.rulesets[sopId] = rules;
  S.versions = S.versions ?? {};
  S.versions[sopId] = { n: rules.version.id, note: "encoded live during the demo" };
  const trialAmount = Math.max(1, Math.floor(limit / 2));
  const trialReq = { action_id: `ENCODE-TRIAL-${sopId}`, actor_id: role().actor_id, amount: trialAmount, currency: "USD", vendor: "Northwind Traders", signatures: { requester: true, executor: true, owner: false } };
  const result = evaluateAction(trialReq, rules);
  const entry = appendDecision(result, trialReq);
  S.encoded = { sopId, title: rules.title, result, entry, trialText: `$${Number(trialAmount).toLocaleString("en-US")} with both signatures: ${result.status}` };
  persistSnapshot();
  renderPanel();
}

function renderSell() {
  const done = decided();
  const auth = done.filter((c) => S.decisions[c.id].result.status === "AUTHORIZED");
  const stopped = done.filter((c) => S.decisions[c.id].result.status !== "AUTHORIZED");
  const entries = getEntries();
  const v = verifyChain();
  const dep = dependencyBand();
  const moved = auth.reduce((s, c) => s + caseAmount(c), 0);
  const held = stopped.reduce((s, c) => s + caseAmount(c), 0);
  const policies = Object.keys(S.rulesets).length;
  const cards = [
    ["Decisions on record", `${done.length} run - every one names who authorised it`],
    ["Money", `${money(moved)} moved correctly - ${money(held)} stopped`],
    ["Record", entries.length === 0 ? "empty - decide the first case" : `verified - ${entries.length} ${entries.length === 1 ? "entry" : "entries"} chained${v.ok ? "" : " - CHECK FAILED"}`],
    ["Policies", `${policies} signed policies answer every case`],
  ].map(([k, t]) => `<div class="stat"><div class="k">${esc(k)}</div><div class="v" style="font-size:20px">${esc(t)}</div></div>`).join("");
  const verdict = dep.band === "Unknown"
    ? "Run the week first - then this page is the proof."
    : dep.band === "Low"
    ? "Key-person load is low. This is what a transferable week looks like to a buyer or lender."
    : "An owner call is waiting - named above, none of it silent. Even the exceptions are documented.";
  const fz = S.fuzz ?? null;
  const fzOut = !fz ? "" : `<p class="verdict">${fz.safe}/${fz.total} hostile inputs safely refused or escalated - ${fz.bad.length} problems (${fz.throws} crashes).</p>` + (fz.bad.length > 0 ? `<p class="hash">${esc(fz.bad.join(" | "))}</p>` : "");
  $("panel").innerHTML = `<h3>Why this business is sellable</h3>
    <p>A buyer doing diligence asks one question: does this business run without its owner? Everything below is live evidence from this console - not a slide.</p>
    <div class="dash">${cards}</div>
    <p style="margin-top:14px;max-width:64ch">${esc(verdict)}</p>
    <p style="max-width:64ch">Ask which process breaks first at your next client - then encode it live on the Encode a policy tab.</p>
    <div class="case"><h4>Break it - the attack suite</h4>
    <p class="story">${FUZZ_CASES.length} hostile inputs: blanks, negatives, wrong types, unknown vendors, hostile strings. Every one must refuse or escalate; none may authorize or crash. The engine runs each one live, right here.</p>
    <button class="decide" id="fuzzBtn">Run the attack suite</button>${fzOut}</div>
    ${decided().length > 0 ? `<div class="case"><h4>Take the record with you</h4>
    <p class="story">Counters, fingerprints, and the last ledger entries as plain text. Paste it into an email, a file, a buyer pack.</p>
    <button class="decide" id="copyDilig">Copy diligence summary</button> <span id="copyDiligFlag" style="margin-left:10px;font-size:13px"></span></div>` : ""}`;
  const fb = document.getElementById("fuzzBtn");
  if (fb) fb.onclick = () => runFuzz();
  const cb = document.getElementById("copyDilig");
  if (cb) cb.onclick = async () => {
    const ok = await copyDiligence();
    const f = document.getElementById("copyDiligFlag");
    if (f) f.textContent = ok ? "Copied - paste it anywhere." : "Copy blocked by the browser - use Download buyer pack instead.";
  };
}

function runFuzz() {
  let safe = 0, throws = 0;
  const bad = [];
  for (let i = 0; i < FUZZ_CASES.length; i++) {
    const fz = FUZZ_CASES[i];
    try {
      const rules = rulesFor({ policy: fz.policy });
      if (!rules) { bad.push(`fuzz[${i}] missing ruleset`); continue; }
      const req = { action_id: `FUZZ-${i}`, actor_id: "fuzz", ...structuredClone(fz.request) };
      const r = evaluateAction(req, rules);
      if (r.status === "AUTHORIZED") bad.push(`fuzz[${i}] ${fz.policy} AUTHORIZED`);
      else safe++;
    } catch (e) { throws++; bad.push(`fuzz[${i}] threw`); }
  }
  S.fuzz = { safe, total: FUZZ_CASES.length, bad, throws };
  renderPanel();
}

function renderLedger() {
  const entries = getEntries();
  const v = verifyChain();
  const badge = entries.length === 0 ? "" : (v.ok
    ? `<p><span class="pill allow">record verified · ${entries.length} ${entries.length === 1 ? "entry" : "entries"} · each fingerprint links to the one before</span></p>`
    : `<p><span class="pill stop">RECORD CHECK FAILED — halt the demo and say so</span></p>`);
  const rows = entries.map((e) => `<tr><td><strong>${e.seq}</strong></td>
    <td class="hash">${esc((e.timestamp ?? "").slice(0, 10))}</td>
    <td><span class="pill ${stampClass(e.status)}">${esc(stampWord(e.status))}</span></td>
    <td class="hash">${esc(e.action_id)}</td>
    <td class="hash">${esc(short(e.hash))}</td></tr>`).join("");
  $("panel").innerHTML = `<h3>Record book — every answer, in order</h3>${ledgerToolsHTML()}${badge}
    ${entries.length === 0 ? "<p>Nothing recorded yet — sign the pack and decide the first case.</p>" :
    `<table class="ledger"><thead><tr><th>#</th><th>Date</th><th>Outcome</th><th>Action</th><th>Fingerprint</th></tr></thead><tbody>${rows}</tbody></table>`}`;
  wireLedgerTools();
}

document.addEventListener("change", (e) => {
  const box = e.target?.closest?.("input[type=checkbox][data-case]");
  if (!box) return;
  const id = box.dataset.case;
  if (S.decisions[id] && !S.decisions[id].result) S.decisions[id].stagedBy = role().key;
});

document.addEventListener("change", (e) => {
  const box = e.target?.closest?.("input[type=checkbox][data-case]");
  if (box) {
    const id = box.dataset.case;
    const cur = S.decisions[id] ?? { sigs: {} };
    if (!cur.result) {
      cur.staged = cur.staged ?? {};
      cur.staged[box.dataset.sig] = role().key;
      S.decisions[id] = cur;
    }
    return;
  }
  const nb = e.target?.closest?.("input[type=checkbox][data-nsig]");
  if (nb) {
    const st = newCaseState();
    st.staged = st.staged ?? {};
    st.staged[nb.dataset.nsig] = role().key;
  }
});

const OWNER_PENS = ["ceo", "director", "controller", "owner"];

function overrideCase(ov) {
  const stamp = new Date().toISOString();
  const isArmed = ov === "new" ? S.newCase?.armed === true : S.decisions[ov]?.armed === true;
  if (!isArmed) {
    if (ov === "new") { if (S.newCase) S.newCase.armed = true; }
    else { S.decisions[ov] = S.decisions[ov] ?? {}; S.decisions[ov].armed = true; }
    persistSnapshot();
    renderPanel();
    return;
  }
  let rules;
  if (ov === "new") {
    const st = S.newCase;
    if (!st?.result || st.result.status !== "ESCALATED") return;
    rules = Object.values(S.rulesets).find((r) => r.sop_id === st.sop_id);
    if (!rules) return;
    const premise = st.result.escalation_details?.unsatisfied_premise_id ?? "?";
    st.sigs = st.sigs ?? {};
    st.staged = st.staged ?? {};
    for (const k of OWNER_PENS) { st.sigs[k] = true; st.staged[k] = "lena"; }
    st.overridden = true;
    st.armed = false;
    appendDecision({
      status: "SIGNED", sop_id: rules.sop_id, policy_title: rules.title,
      action_id: `OVERRIDE-${rules.sop_id}`, actor_id: "lena-owner-override (simulated)",
      rule_version_hash: rules?.version?.version_hash ?? "unknown", timestamp: stamp,
      derivation: [`Owner countersign (simulated): cleared ${premise} on ${rules.sop_id}; no owner role exists in this demo, so the countersign is explicit.`],
    });
    decideNewCase(rules, st, [`Owner countersign (Lena) cleared ${premise} before evaluation.`]);
    return;
  }
  const c = S.cases.find((x) => x.id === ov);
  if (!c) return;
  const d = S.decisions[ov] ?? {};
  if (!d.result || d.result.status !== "ESCALATED") return;
  rules = rulesFor(c);
  if (!rules) return;
  const premise = d.result.escalation_details?.unsatisfied_premise_id ?? "?";
  d.sigs = { ...(c.request?.signatures ?? {}), ...(d.sigs ?? {}) };
  d.staged = d.staged ?? {};
  for (const k of OWNER_PENS) { d.sigs[k] = true; d.staged[k] = "lena"; }
  d.overridden = true;
  d.armed = false;
  S.decisions[ov] = d;
  appendDecision({
    status: "SIGNED", sop_id: rules.sop_id, policy_title: rules.title,
    action_id: `OVERRIDE-${ov}`, actor_id: "lena-owner-override (simulated)",
    rule_version_hash: rules?.version?.version_hash ?? "unknown", timestamp: stamp,
    derivation: [`Owner countersign (simulated): cleared ${premise} on ${ov}; no owner role exists in this demo, so the countersign is explicit.`],
  });
  decide(ov, [`Owner countersign (Lena) cleared ${premise} before evaluation.`]);
}

document.addEventListener("click", (e) => {
  const b = e.target?.closest?.("[data-override]");
  if (!b) return;
  overrideCase(b.dataset.override);
});

// Test hooks for headless verification (no UI effect in browsers).
export const __harness = { S, decide, decideNewCase, overrideCase, signHandover, doAmend, renderPanel };

load();