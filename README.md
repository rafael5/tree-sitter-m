# tree-sitter-m

A [tree-sitter](https://tree-sitter.github.io/) grammar for the
M (MUMPS) programming language.

> **Status:** v0.1 grammar work substantially complete (end of B5).
> Milestones B0–B5 done (B5 partial — coverage tuning landed at
> **99.06% clean on the full 39,330-routine VistA corpus**;
> editor-quality error-recovery tuning waits on B6 bindings).
> 110 passing corpus tests. v1.0 release blocked on B6 (bindings),
> CI workflow, per-tier coverage gate, and at least one editor
> integration. See [`STATUS.md`](STATUS.md) for the v1.0 punch
> list and [`docs/build-log.md`](docs/build-log.md) for the
> per-feature progression history.

## Why this exists

No production-quality tree-sitter grammar for M exists today. M
development tooling — language servers, refactoring tools,
AST-based linters, code search, AI agents — has historically
lacked a shared parsing substrate. `tree-sitter-m` aims to be that
substrate.

The grammar:

- recognises tokens from **all** major M sources (AnnoStd 1995,
  YottaDB, InterSystems IRIS's M layer) — so it can read any real
  M codebase including VistA, OSEHRA, and YDB applications,
- stamps each recognised token with `standard_status` metadata so
  downstream tools can classify portability tier without re-parsing
  (see `lib/stamp.js`),
- is **generated mechanically** from
  [`m-standard`](../m-standard)'s curated data (specifically
  `integrated/grammar-surface.json`) so it stays in sync with the
  source documentation,
- handles M's structural quirks via a small external scanner
  (`src/scanner.c`) — the two-space rule for argumentless commands,
  trailing-whitespace-before-EOL, and `?N` tab-to-column in WRITE
  format-control are all parser-state-aware tokens.

## Scope

tree-sitter-m covers **M and M dialects** — AnnoStd, YottaDB, IRIS's M
layer, plus the de-facto extensions VistA actually uses (case-
insensitive keywords, multi-letter pattern codes `?.ANP`, negated
operators `'?`/`'&`/`'!`, comparison shorthands `>=`/`<=`/`!=`,
numeric local-label calls `D 12(args)`, system globals `^$JOB`,
USE/OPEN parenthesised I/O parameters, and so on).

**Out of scope: InterSystems ObjectScript.** `##class(...)`,
`&sql(...)`, `obj.method()`, `obj.property=val`, `##super` etc.
are ObjectScript — a separate scripting language layered on top
of M's runtime, not a dialect of M. The right home for parsing
those is a sibling `tree-sitter-objectscript` grammar that can
compose with tree-sitter-m when a file mixes both. See
[`docs/spec.md`](docs/spec.md) §2 for the full scope decision.

## What it does NOT do

`tree-sitter-m` is a parser, not a compiler, formatter, or linter.

- **Standards enforcement** (pragmatic / SAC / operational) lives in
  a sibling project (`tree-sitter-m-lint`) that consumes both
  `tree-sitter-m`'s AST and `m-standard`'s tier classifications.
- **Cross-routine resolution**, **type inference**, and **semantic
  analysis** belong in tooling layers above the parser.
- **InterSystems ObjectScript** is permanently out of scope (see
  above).

## Relationship to the project family

```
m-standard      →   integrated/grammar-surface.json   →   tree-sitter-m
   (data)              (versioned data contract)         (this project)

tree-sitter-m   →   bindings: Node / Rust / Python / Go    →   tree-sitter-m-lint
 (this project)     (npm, crates.io, PyPI, go modules)         (sibling project)
                                                           →   editor plugins
                                                           →   AI agents
```

`tree-sitter-m` is a strict downstream consumer of `m-standard` and
contributes nothing back upstream. See [`docs/spec.md`](docs/spec.md)
§17 for the full contract.

## Build

```bash
# regenerate keyword tables from m-standard's grammar-surface.json
npm run build-grammar

# regenerate parser.c from grammar.js
npm run generate

# run the corpus tests
npm test

# real-source smoke gate against the full VistA corpus
node tools/smoke-corpus.js ~/vista-meta/vista/vista-m-host/Packages

# bucket remaining ERROR nodes by syntactic shape (triage tool)
node tools/error-buckets.js ~/vista-meta/vista/vista-m-host/Packages --sample 1000
```

Bindings (Node, Rust, Python, Go) are not yet scaffolded — see
[`STATUS.md`](STATUS.md) for the B6 plan.

## Documentation

| File | What's in it |
|------|---|
| [`STATUS.md`](STATUS.md) | Progression vs spec, v1.0 punch list, prioritised TODOs |
| [`docs/spec.md`](docs/spec.md) | Full design, ADRs (AD-01..06), milestones, success criteria |
| [`docs/build-log.md`](docs/build-log.md) | Chronological per-feature progression (every commit) |
| [`docs/tree-sitter-notes.md`](docs/tree-sitter-notes.md) | Tree-sitter implementation notes — token precedence rules, regex limitations, recurring patterns. **Read before adding grammar rules.** |
| [`CLAUDE.md`](CLAUDE.md) | Hard rules and project conventions |

## License

AGPL-3.0. Matches `m-standard`. See [`LICENSE`](LICENSE).
