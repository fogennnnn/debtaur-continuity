# Handover — policy continuity console (demonstration)

Beacon Print & Supply, 14 people. Owner Lena retires after 22 years. Her four signed
policies pass to Maya and Tomas — and the business keeps running profitably without her.

A zero-dependency, deterministic demo: signed JSON policies, a pure evaluator with
allow/refuse/escalate outcomes, and an append-only hash-chained record book.
All figures are demonstration samples; in a live engagement the client's own
thresholds, names, and amounts replace them.

## Quickstart (anyone, local, 2 minutes)

Prerequisite: Node.js 22+ and nothing else (zero npm dependencies).

```sh
git clone <this-repo> debtaur-continuity
cd debtaur-continuity
sh install.sh        # Windows: install.ps1 — checks Node, runs the smoke test
npm run demo         # browser console: open http://localhost:8081/
```

Watch Lena sign the succession pack, then work the first-week case queue as Maya or
Tomas. The Business pulse tab shows money moved correctly, money stopped, and how
many owner decisions the week needed.
