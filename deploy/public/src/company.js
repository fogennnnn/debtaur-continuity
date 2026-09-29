/**
 * The company, the handover, and the first-week case queue.
 * Browser-safe: no imports, no I/O. All figures are demonstration samples.
 */

export const COMPANY = {
  name: "Beacon Print & Supply",
  people: 14,
  outgoing: { name: "Lena", role: "Founder and owner, 22 years" },
  note: "Lena retires at month's end. The business must keep running profitably on her signed policies.",
  samples:
    "Demonstration figures throughout: thresholds, names, and amounts stand in for a real client's own.",
};

export const SUCCESSION_PACK = {
  id: "SUCCESSION-2026-001",
  title: "Succession pack — Lena's four signed policies pass to the successors",
  signed_by: "Lena (outgoing owner)",
  policies: ["SOP-FIN-01", "SOP-ONB-01", "SOP-HIRE-01", "SOP-PAY-01"],
};

export const ROLES = [
  {
    key: "maya",
    label: "Maya — operations lead, incoming manager",
    actor_id: "maya-ops",
    blurb: "Runs the day-to-day. Holds department-head, approver, hiring-manager and purchase-approver pens.",
  },
  {
    key: "tomas",
    label: "Tomas — finance lead",
    actor_id: "tomas-finance",
    blurb: "Holds the money pens: finance officer, payer, controller. Cannot approve policy — only execute inside it.",
  },
];

export const CASES = [
  {
    id: "EXP-01",
    policy: "expense-signoff",
    title: "Restock paper — $4,200 to Northwind Traders",
    story: "Routine restock. Department head and finance both signed.",
    request: {
      amount: 4200,
      currency: "USD",
      vendor: "Northwind Traders",
      signatures: { dept_head: true, ceo: false, finance: true },
    },
    preset_role: "maya",
    expect: "AUTHORIZED",
  },
  {
    id: "EXP-02",
    policy: "expense-signoff",
    title: "New press deposit — $25,000 to Acme Supplies",
    story: "Big deposit, above Lena's $10,000 line. Finance signed it anyway — nobody asked the owner.",
    request: {
      amount: 25000,
      currency: "USD",
      vendor: "Acme Supplies",
      signatures: { dept_head: true, ceo: false, finance: true },
    },
    preset_role: "tomas",
    expect: "ESCALATED",
  },
  {
    id: "ONB-01",
    policy: "client-onboarding",
    title: "New client intake — Blue Lantern Co.",
    story: "Clean file: identity verified, credit passed, sanctions clear, never seen before. Partner approved.",
    request: {
      client_name: "Blue Lantern Co.",
      identity_status: "verified",
      credit_status: "pass",
      sanctions_status: "clear",
      prior_rejection: false,
      signatures: { approver: true, onboarding: true },
    },
    preset_role: "maya",
    expect: "AUTHORIZED",
  },
  {
    id: "ONB-02",
    policy: "client-onboarding",
    title: "Returning client — Harbor & Grey Ltd",
    story: "They were rejected last year and came back with a partner's fresh approval. The paper checklist would file this as a new intake.",
    request: {
      client_name: "Harbor & Grey Ltd",
      identity_status: "verified",
      credit_status: "pass",
      sanctions_status: "clear",
      prior_rejection: true,
      signatures: { approver: true, onboarding: true },
    },
    preset_role: "maya",
    expect: "ESCALATED",
  },
  {
    id: "HIRE-01",
    policy: "hiring-approval",
    title: "Contractor renewal — Sam Reyes, $60,000",
    story: "Sam's contract is up. The manager and HR signed the renewal — but nobody gave the fresh re-approval a renewal requires.",
    request: {
      candidate_name: "Sam Reyes",
      role_type: "contractor",
      compensation: 60000,
      offer_date: "2026-06-15",
      is_renewal: true,
      signatures: { hiring_manager: true, director: false, reapprover: false, hr: true },
    },
    preset_role: "maya",
    expect: "REFUSED",
  },
  {
    id: "PAY-01",
    policy: "vendor-payment",
    title: "Pay Initech LLC — $8,000",
    story: "Approved months ago. Since then Initech left the active vendor list — but the approval signature is still valid and the payer is ready.",
    request: {
      vendor: "Initech LLC",
      amount: 8000,
      currency: "USD",
      signatures: { approver: true, controller: false, payer: true },
    },
    preset_role: "tomas",
    expect: "ESCALATED",
  },
  {
    id: "EXP-03",
    policy: "expense-signoff",
    title: "Courier invoice — $3,200 to Initech LLC",
    story: "Small invoice, department head signed. Finance never got around to it.",
    request: {
      amount: 3200,
      currency: "USD",
      vendor: "Initech LLC",
      signatures: { dept_head: true, ceo: false, finance: false },
    },
    preset_role: "tomas",
    expect: "REFUSED",
  },
  {
    id: "HIRE-02",
    policy: "hiring-approval",
    title: "New press operator — Jordan Lee, $95,000",
    story: "Permanent hire inside the $150,000 line. Manager and HR signed, start date inside the hiring window.",
    request: {
      candidate_name: "Jordan Lee",
      role_type: "employee",
      compensation: 95000,
      offer_date: "2026-06-15",
      is_renewal: false,
      signatures: { hiring_manager: true, director: false, reapprover: false, hr: true },
    },
    preset_role: "maya",
    expect: "AUTHORIZED",
  },
];
