/**
 * Handover console: the successor team runs Lena's signed policies live.
 * Imports the proven engine + ledger modules unchanged; all demo content
 * comes from /api/company and the rulesets. Zero dependencies.
 */
import { evaluateAction } from "/src/engine.js";
import { appendDecision, verifyChain, getEntries } from "/src/ledger.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = (n) => `$${Number(n ?? 0).toLocaleString("en-US")}`;
const short = (h) => { const s = String(h ?? ""); return s.length > 18 ? s.slice(0, 10) + "…" + s.slice(-6) : s; };
const stampClass = (st) => st === "AUTHORIZED" ? "allow" : st === "ESCALATED" ? "owner" : st === "REFUSED" ? "stop" : "note";
const stampWord = (st) => st === "AUTHORIZED" ? "Approved" : st === "ESCALATED" ? "Owner review" : st === "REFUSED" ? "Stopped" : st;

const S = {
  company: null, succession: null, roles: [], cases: [],
  rulesets: {}, tab: "queue", roleKey: "maya", signed: false, decisions: {},
};

async function load() {
  try {
    const res = await fetch("/api/company");
    if (!res.ok) throw new Error("company service returned " + res.status);
    const data = await res.json();
    S.company = data.company; S.succession = data.succession;
    S.roles = data.roles; S.cases = data.cases;
    const files = ["client-onboarding.json", "expense-signoff.json", "hiring-approval.json", "vendor-payment.json"];
    for (const f of files) {
      const r = await fetch(`/src/rules/${f}`);
      if (!r.ok) throw new Error(`missing ruleset ${f}`);
      const rules = await r.json();
      S.rulesets[rules.sop_id] = rules;
    }
    renderAll();
  } catch (e) {
    $("panel").innerHTML = `<div class="err"><strong>The console could not load.</strong><br>${esc(e?.message ?? e)}<br><br>Run <span class="hash">npm run demo</span>, then open the printed URL.</div>`;
  }
}

const role = () => S.roles.find((r) => r.key === S.roleKey) ?? S.roles[0];
const rulesFor = (c) => Object.values(S.rulesets).find((r) => r.sop_id === policyOf(c)) ?? null;
const policyOf = (c) => ({ "expense-signoff": "SOP-FIN-01", "client-onboarding": "SOP-ONB-01", "hiring-approval": "SOP-HIRE-01", "vendor-payment": "SOP-PAY-01" }[c.policy]);
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
  box.innerHTML = `<strong>${esc(S.company.name)} — ${S.company.people} people.</strong> ${esc(S.company.outgoing.name)}, ${esc(S.company.outgoing.role)}. ${esc(S.company.note)}<br>
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

function renderPanel() {
  if (S.tab === "queue") renderQueue();
  else if (S.tab === "dash") renderDash();
  else if (S.tab === "book") renderBook();
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

function renderQueue() {
  const p = $("panel");
  const head = `<h3>First week without Lena — the case queue</h3>
    <p>Each case arrives the way work really arrives. Tick who actually signed, then Decide. The signed policy answers — not Lena.</p>`;
  p.innerHTML = head + S.cases.map((c) => {
    const rules = rulesFor(c);
    const done = S.decisions[c.id];
    const sigs = done ? done.sigs : { ...c.request.signatures };
    const boxes = (rules?.signers ?? []).map((s) => {
      const on = sigs[s.key] === true ? "checked" : "";
      const dis = S.signed && !done ? "" : "disabled";
      return `<label><input type="checkbox" data-case="${c.id}" data-sig="${s.key}" ${on} ${dis}> ${esc(s.label)}</label>`;
    }).join("");
    const verdict = !done ? "" : verdictHTML(done.result, done.entry);
    const btn = S.signed && !done
      ? `<button class="decide" data-decide="${c.id}">Decide as ${esc(role().label.split(" — ")[0])} →</button>`
      : !S.signed ? `<p style="font-size:13px;color:var(--ink2)">Lena signs the pack first — then this queue opens.</p>` : "";
    return `<div class="case"><h4>${c.id} · ${esc(c.title)}</h4>
      <p class="story">${esc(c.story)}</p>
      <p class="facts">${esc(factsLine(c))}</p>
      <div class="sigs">${boxes}</div>${btn}${verdict}</div>`;
  }).join("");
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
}

function decide(caseId) {
  const c = S.cases.find((x) => x.id === caseId);
  const rules = rulesFor(c);
  if (!rules) return;
  const held = S.decisions[caseId]?.sigs ?? { ...c.request.signatures };
  const req = { ...c.request, signatures: held, action_id: `${caseId}-${role().actor_id}`, actor_id: role().actor_id };
  const result = evaluateAction(req, rules);
  const entry = appendDecision(result, req);
  S.decisions[caseId] = { sigs: held, result, entry };
  renderPanel();
}

function verdictHTML(result, entry) {
  const st = result.status;
  const premise = result.refusal_details?.missing_premise_id ?? result.escalation_details?.unsatisfied_premise_id ?? null;
  const reason = result.refusal_details?.reason ?? result.escalation_details?.reason ?? "All requirements met — the business moves on.";
  const issue = result.refusal_details?.policy_issue ?? result.escalation_details?.policy_issue ?? null;
  return `<div class="stamp ${stampClass(st)}">${stampWord(st)}</div>
    <p class="verdict">${esc(reason)}${premise ? ` <span class="hash">Gap: ${esc(premise)}</span>` : ""}</p>
    ${issue ? `<div class="issue"><h5>Follow-up card · ${esc(issue.id)}</h5><div><strong>${esc(issue.title)}</strong></div></div>` : ""}
    <p class="hash" style="font-size:12px">Recorded as entry #${entry.seq} · ${esc(short(entry.hash))}</p>`;
}

function caseAmount(c) {
  const d = S.decisions[c.id];
  if (!d) return 0;
  const q = c.request;
  return Number(q.amount ?? q.compensation ?? 0) || 0;
}

function renderDash() {
  const done = decided();
  const auth = done.filter((c) => S.decisions[c.id].result.status === "AUTHORIZED");
  const stopped = done.filter((c) => S.decisions[c.id].result.status !== "AUTHORIZED");
  const esc = done.filter((c) => S.decisions[c.id].result.status === "ESCALATED");
  const moved = auth.reduce((s, c) => s + caseAmount(c), 0);
  const held = stopped.reduce((s, c) => s + caseAmount(c), 0);
  $("panel").innerHTML = `<h3>Business pulse — the week Lena was gone</h3>
    <div class="dash">
      <div class="stat"><div class="k">Decisions run</div><div class="v">${done.length} / ${S.cases.length}</div></div>
      <div class="stat"><div class="k">Money moved correctly</div><div class="v">${money(moved)}</div></div>
      <div class="stat"><div class="k">Money stopped</div><div class="v">${money(held)}</div></div>
      <div class="stat"><div class="k">Owner calls needed</div><div class="v">${esc.length}</div></div>
    </div>
    <p style="margin-top:14px;max-width:64ch">The business ran ${done.length} decisions without Lena. ${esc.length === 0 ? "Nothing needed her override." : `${esc.length} case${esc.length === 1 ? "" : "s"} wait${esc.length === 1 ? "s" : ""} on an owner decision — each one named, none of them silent.`} That is what a sellable business looks like: profitable, documented, and no longer dependent on any one person.</p>`;
}

function renderBook() {
  $("panel").innerHTML = `<h3>Policy book — what Lena left behind</h3>
    <p>Four signed policies. Every case in the queue answers to one of them.</p>` +
    Object.values(S.rulesets).map((r) => `<div class="policy">
      <h4>${esc(r.title)}</h4>
      <p style="font-size:13.5px;color:var(--ink2);margin:4px 0">${esc(r.demo_story ?? "")}</p>
      <p class="meta">signed: ${esc(r.version?.signed_by ?? "?")} · effective ${esc(r.version?.effective_date ?? "?")} · fingerprint ${esc(short(r.version?.version_hash))} · ${(r.premises ?? []).length} requirements · signers: ${esc((r.signers ?? []).map((s) => s.label).join(" · "))}</p>
    </div>`).join("");
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
  $("panel").innerHTML = `<h3>Record book — every answer, in order</h3>${badge}
    ${entries.length === 0 ? "<p>Nothing recorded yet — sign the pack and decide the first case.</p>" :
    `<table class="ledger"><thead><tr><th>#</th><th>Date</th><th>Outcome</th><th>Action</th><th>Fingerprint</th></tr></thead><tbody>${rows}</tbody></table>`}`;
  $("footer").textContent = "Demonstration figures throughout — thresholds, names, and amounts stand in for a real client's own.";
}

load();
