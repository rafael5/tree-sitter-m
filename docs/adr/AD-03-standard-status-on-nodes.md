# AD-03: Stamp `standard_status` as an AST node attribute

**Status:** accepted (B0, 2026-04); partial implementation (B3)
**Decided by:** Rafael Richards
**Supersedes:** —
**Superseded by:** —

## Context

Per [AD-01](AD-01-source-grammar-surface.md) the parser recognises the
union of all M sources. Downstream tooling (linters, formatters,
language servers, AI agents) needs to know *which* tier a given token
belongs to — `ansi`, `ydb-extension`, `iris-extension`, or
`multi-vendor-ext` — so it can apply the right policy:

- A SAC-strict linter should warn on every `ydb-extension`.
- A YDB-only formatter can skip `iris-extension` codepaths entirely.
- An AI agent inferring portability needs the tier without walking
  back to m-standard at every node.

Three implementations are viable:

1. **Per-token AST attribute** in the tree itself (this ADR's choice).
2. **Post-parse lookup** via a sidecar table the consumer joins on
   demand.
3. **Parser variants** — separate parser per profile. Rejected as a
   maintenance multiplier.

## Decision

Every recognised `command_keyword`, `intrinsic_function_keyword`,
`special_variable_keyword`, `operator`, and `pattern_letter` node
carries a `standard_status` attribute drawn from `grammar-surface.json`.
The mechanism is a sidecar metadata file
[`src/grammar-metadata.json`](../../src/grammar-metadata.json) that
maps every form to its `(canonical_name, standard_status, concept)`
triple, plus a thin lookup library
[`lib/stamp.js`](../../lib/stamp.js) that joins parse-tree node text
against the table. Per-binding stamping helpers (so consumers don't
have to import the lookup library themselves) ship with B6 bindings.

## Consequences

**Positive:**

- One join per keyword node — O(1), no re-parsing, no extra grammar
  rules.
- Ambiguous forms (HALT vs HANG via bare `H`; $DATA vs $DEVICE via
  `$D`) preserve both candidates so consumers can disambiguate by
  context (argument presence, etc.). The lookup library exposes both
  `lookupSingle` (throws on ambiguity) and `resolve` (caller predicate).
- Schema is owned by `m-standard` — when m-standard adds a tier, the
  metadata regenerates and downstream consumers read the new value
  without parser changes.

**Negative:**

- The sidecar table doubles the install footprint by a few KB
  (acceptable; the parser is the dominant cost).
- Consumers must explicitly opt into stamping — the parse tree itself
  doesn't carry the attribute. This is the cost of staying within
  tree-sitter's standard tree shape (no custom node-attr API).

## Status as of 2026-04

`lib/stamp.js` exposes `lookup` / `lookupSingle` / `resolve` /
`schemaVersion` against the metadata table; per-tier coverage gate
([`tools/coverage-gate.js`](../../tools/coverage-gate.js)) verifies
every triple is exercised by at least one corpus test (347/347).
Per-binding stamping helpers are deferred to B6 closeout.
