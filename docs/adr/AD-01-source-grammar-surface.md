# AD-01: Source the keyword tables from `m-standard`'s grammar-surface, not from any single standard

**Status:** accepted (B0, 2026-04)
**Decided by:** Rafael Richards
**Supersedes:** —
**Superseded by:** —

## Context

`tree-sitter-m`'s reason to exist is to read **any real-world M code**:
VistA (IRIS-flavoured), YottaDB applications, OSEHRA's open-source
work, IRIS applications. A parser that recognises only a single
standard rejects valid YDB-only or IRIS-only tokens and can't read the
codebases it's meant to help.

The candidate sources for keyword tables:

- AnnoStd (the annotated 1995 ANSI X11.1) — 81 commands.
- The pragmatic standard distillation — same 81.
- The SAC checker rules — 171 flagged forms.
- `m-standard`'s integrated grammar-surface — **union** of AnnoStd,
  YottaDB, and IRIS, with abbreviation prefix-form expansion already
  done. ~225 canonicals, ~954 prefix forms in v0.2.

The pragmatic / SAC / operational standards are all *subsets* of the
union. They serve different consumers (linters, formatters) than the
parser does.

## Decision

The keyword tables (commands, intrinsic functions, intrinsic special
variables, operators, pattern codes) come from
[`m-standard/integrated/grammar-surface.json`](../../../m-standard/integrated/grammar-surface.json).
Subsetting belongs in downstream linter profiles (e.g.
`tree-sitter-m-lint`), never in the parser.

## Consequences

**Positive:**

- The parser reads any M codebase that uses any combination of
  AnnoStd / YottaDB / IRIS keywords without errors caused by parser
  pickiness.
- Standard-tier classification is data-driven (see [AD-03](AD-03-standard-status-on-nodes.md))
  rather than baked into the grammar; downstream tools enforce
  whichever profile they want without rebuilding the parser.
- One repo per language, one keyword surface — matches the
  tree-sitter ecosystem norm.

**Negative:**

- The parser will accept syntactically valid YDB code in a context
  where the consumer wanted IRIS-only enforcement. That gating moves
  to the linter / consumer, which must be explicit about its profile.
- A new vendor extension landing in `m-standard` flows through to
  `tree-sitter-m` automatically (good, but means the parser is only
  as conservative as m-standard is).

## See also

- [AD-03](AD-03-standard-status-on-nodes.md) — the per-token
  classification mechanism that makes profile-based enforcement
  possible without parser variants.
- [AD-04](AD-04-pin-mstandard-schema.md) — the pin that controls when
  m-standard updates flow through.
