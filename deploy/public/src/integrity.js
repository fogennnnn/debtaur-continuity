/**
 * Ruleset integrity helpers for the continuity console.
 * Same canonicalisation the signing step uses: whole ruleset EXCEPT the
 * top-level `version` object (which carries the hash), objects with keys
 * sorted recursively, arrays in order. Browser-safe: no imports.
 * Hashing is done by the caller via ledger.js sha256Hex (dual-runtime).
 */

export function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

export function canonicalRulesetContent(rules) {
  const { version, ...rest } = rules ?? {};
  void version;
  return stableStringify(rest);
}
