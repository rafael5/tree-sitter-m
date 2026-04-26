# AD-02: Hand-code the language structure; data-drive the keyword tables

**Status:** accepted (B0, 2026-04)
**Decided by:** Rafael Richards
**Supersedes:** —
**Superseded by:** —

## Context

A tree-sitter grammar has two kinds of content:

- **Structural rules** — line shape, comments, strings, postconditionals,
  indirection, dot-blocks, argumentless commands, expression precedence.
  These are **invariant across all M sources**: AnnoStd, YDB docs, and
  IRIS docs all describe them in compatible terms.
- **Keyword rules** — which tokens count as commands vs functions vs
  intrinsic special variables, what their abbreviations are. These
  **vary across sources** (vendor `Z*` extensions, IRIS class-syntax
  keywords, etc.).

Two reasonable extremes exist:

1. Hand-write everything (including all 949 prefix forms) — manageable
   in v0.1 but rots fast as `m-standard` adds vendor extensions.
2. Generate everything from data — including the structural rules,
   pushed back to a richer m-standard schema. Rejected: the structural
   rules need tree-sitter-specific tactical decisions (external
   scanner, GLR conflicts, precedence) that aren't grammar-neutral.

## Decision

Hand-write the structural rules in [`grammar.js`](../../grammar.js).
Generate the keyword-table rules from
`m-standard/integrated/grammar-surface.json` via
[`tools/build-grammar.js`](../../tools/build-grammar.js); the generator
emits [`keywords.generated.js`](../../keywords.generated.js) which
`grammar.js` imports.

## Consequences

**Positive:**

- The structural grammar stays small, reviewable, and tree-sitter-aware
  (precedence, conflicts, external scanner are all in one place).
- The keyword tables grow with `m-standard` updates without grammar
  rewrites — additive m-standard releases require only a regen.
- The generator is single-purpose and small (~150 lines), easy to
  audit when m-standard's schema evolves.

**Negative:**

- Two places to think about when modifying the grammar (structural in
  `grammar.js`, keywords in the generator). A junior contributor needs
  to be told which side a given change goes on.
- The build pipeline has an extra step (build-grammar before
  tree-sitter generate) — captured in the
  [`regen` npm script](../../package.json) so contributors don't have
  to remember it.
