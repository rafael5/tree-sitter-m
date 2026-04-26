# m-parser

A [tree-sitter](https://tree-sitter.github.io/) grammar for the
M (MUMPS) programming language.

> **Status:** v0.1 implementation in progress.
> Milestones B0–B2 done (scaffolding, data-driven keyword tables,
> hand-coded line/expression grammar, 33 passing corpus tests).
> See [`docs/build-log.md`](docs/build-log.md) for the latest
> snapshot and [`docs/spec.md`](docs/spec.md) for the full design.

## Why this exists

No production-quality tree-sitter grammar for M exists today. M
development tooling — language servers, refactoring tools,
AST-based linters, code search, AI agents — has historically
lacked a shared parsing substrate. `m-parser` aims to be that
substrate.

The grammar:

- recognises tokens from **all** major M sources (AnnoStd 1995,
  YottaDB, InterSystems IRIS) — so it can read any real codebase
  including VistA, OSEHRA, and YDB applications,
- stamps each recognised token with `standard_status` metadata so
  downstream tools can classify portability tier without re-parsing,
- is **generated mechanically** from
  [`m-standard`](../m-standard)'s curated data (specifically
  `integrated/grammar-surface.json`) so it stays in sync with the
  source documentation.

## What it does NOT do

`m-parser` is a parser, not a compiler, formatter, or linter.

- **Standards enforcement** (pragmatic / SAC / operational) lives in
  a sibling project (`tree-sitter-m-lint`) that consumes both
  `m-parser`'s AST and `m-standard`'s tier classifications.
- **Cross-routine resolution**, **type inference**, and **semantic
  analysis** belong in tooling layers above the parser.
- **InterSystems class syntax** (`##class(...)`, `&sql(...)`,
  `##super`) is deferred to v0.2.

## Relationship to the project family

```
m-standard      →   integrated/grammar-surface.json   →   m-parser
   (data)              (versioned data contract)         (this project)

m-parser        →   tree-sitter-m npm/crate/pypi      →   tree-sitter-m-lint
                    + bindings (Node/Rust/Python/Go)       (sibling project)
                                                       →   editor plugins
                                                       →   AI agents
```

`m-parser` is a strict downstream consumer of `m-standard` and
contributes nothing back upstream. See [`docs/spec.md`](docs/spec.md)
§17 for the full contract.

## Build (when implemented)

```bash
# regenerate grammar.js from m-standard
node tools/build-grammar.js

# regenerate parser.c from grammar.js
tree-sitter generate

# run the corpus tests
tree-sitter test

# build language bindings
npm run build      # Node
cargo build        # Rust
pip install -e .   # Python
go build           # Go
```

## License

AGPL-3.0. Matches `m-standard`. See [`LICENSE`](LICENSE) when present.
