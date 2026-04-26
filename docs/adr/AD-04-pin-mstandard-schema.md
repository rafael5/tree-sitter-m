# AD-04: Pin to a specific `m-standard` schema version

**Status:** accepted (B0, 2026-04)
**Decided by:** Rafael Richards
**Supersedes:** —
**Superseded by:** —

## Context

`tree-sitter-m` consumes exactly one file from `m-standard`:
[`integrated/grammar-surface.json`](../../../m-standard/integrated/grammar-surface.json).
Per `m-standard`'s ADR-005 the integrated layer is versioned with a
`schema_version` field and breaking changes bump that version.

Two failure modes need preventing:

1. **Silent drift.** A `m-standard` update changes the schema (renames
   a field, restructures the per-canonical block) but `tree-sitter-m`'s
   build keeps running because the generator silently no-ops on
   unknown fields. Result: parser ships with stale data and nobody
   notices until a downstream consumer files a bug.
2. **Forced upgrade cadence.** `m-standard` ships a breaking schema
   bump on its own timeline. Without a pin, `tree-sitter-m` must
   either upgrade immediately (often inconvenient) or freeze its own
   `m-standard` checkout and accumulate divergence.

## Decision

Pin the consumed `schema_version` in
[`package.json`](../../package.json) under
`m-standard.schema_version` (currently `"1"`).
[`tools/build-grammar.js`](../../tools/build-grammar.js) reads the pin
and aborts the build with a clear message if the consumed file's
`schema_version` doesn't match. Adopting a new schema version is a
deliberate `tree-sitter-m` change: bump the pin, update the generator
for the schema delta, ship a new major version of `tree-sitter-m`.

## Consequences

**Positive:**

- `tree-sitter-m` releases are *decoupled* from `m-standard` releases.
  Additive m-standard updates flow through automatically (same
  schema, more keywords); breaking ones require a deliberate pin
  bump.
- The pin appears in `package.json` next to other version metadata —
  it's discoverable, diffable, reviewable on PR.
- CI fails fast if a contributor updates `m-standard` locally without
  also updating the pin.

**Negative:**

- One more version number to keep in sync. The CI failure mode is
  loud enough that this hasn't bitten in practice.
- A breaking m-standard bump that adds capability `tree-sitter-m`
  wants will take a `tree-sitter-m` major release to flow through.
  That's the cost of stability.
