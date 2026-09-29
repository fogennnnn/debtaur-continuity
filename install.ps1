#Requires -Version 5.1
<#
  debtaur-continuity local install + smoke test (Windows).
  Usage:  powershell -ExecutionPolicy Bypass -File install.ps1
  Needs:  Node.js 22+ on PATH. Zero npm dependencies.
#>
$ErrorActionPreference = "Stop"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Output "Node.js not found. Install Node 22+ from https://nodejs.org/ then re-run this script."
  exit 1
}
$ver = (node -e "console.log(process.versions.node)").Trim()
$major = [int]($ver.Split(".")[0])
if ($major -lt 22) {
  Write-Output "Node $ver found, but this demo needs Node 22+. Update Node, then re-run."
  exit 1
}
Write-Output "Node $ver OK — zero dependencies to install."

Write-Output "Smoke test: evaluating all 8 continuity cases..."
$out = node scripts/smoke.mjs 2>&1 | Out-String
if ($out -notmatch "8/8 cases as expected") {
  Write-Output "SMOKE TEST FAILED — output was:"
  Write-Output $out
  exit 1
}
Write-Output "Smoke test passed: 8/8 case verdicts as expected."
Write-Output ""
Write-Output "Run the console:  npm run demo   then open http://localhost:8081/"
