# tree-sitter-m

A [tree-sitter](https://tree-sitter.github.io/) grammar for the
M (MUMPS) programming language.

> **Status:** v0.1 ready for first publish. Grammar at **99.06%
> clean on the full 39,330-routine VistA corpus**; 110 passing
> corpus tests; per-tier coverage gate green at 347/347; 10k-line
> synthetic routine parses in 78.6ms (under the 100ms spec budget);
> all four bindings (Node, Rust, Python, Go) scaffolded and passing
> on the Linux/macOS/Windows CI matrix. v1.0 blocked on first
> publish (#7) and at least one editor integration (#8 — VS Code
> targeted). See [`STATUS.md`](STATUS.md) for the v1.0 punch list,
> [`RELEASE.md`](RELEASE.md) for publish steps, and
> [`docs/build-log.md`](docs/build-log.md) for the per-feature
> progression history.

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

## Bindings

Once published (see [`RELEASE.md`](RELEASE.md)), `tree-sitter-m`
will be installable from the four standard tree-sitter ecosystems:

```bash
npm install tree-sitter-m tree-sitter            # Node
cargo add tree-sitter-m tree-sitter              # Rust
pip install tree-sitter-m tree-sitter            # Python
go get github.com/rafael5/tree-sitter-m          # Go
```

**Node version requirement.** The Node binding requires
**Node 22 LTS**. Upstream `tree-sitter@0.25.0` (the JS runtime)
fails to compile against Node 24's V8 headers — install on Node 24
errors during `npm install` with a `node_object_wrap.h` /
`v8-weak-callback-info.h` complaint about an incomplete type. Use
`nvm install 22 && nvm use 22` until upstream tree-sitter ships a
Node 24-compatible release. Other bindings (Rust, Python, Go) have
no equivalent host-version constraint.

**Prebuilt binaries.** First-time consumers on a platform without a
prebuild fall back to `node-gyp` build at install time (works,
requires a C toolchain). Prebuilt binary distribution via
`prebuildify` is wired into `package.json` but not yet running in
CI; see [`RELEASE.md`](RELEASE.md) §3 for the rollout plan.

## Documentation

| File | What's in it |
|------|---|
| [`STATUS.md`](STATUS.md) | Progression vs spec, v1.0 punch list, prioritised TODOs |
| [`RELEASE.md`](RELEASE.md) | Step-by-step publish checklist (npm / crates.io / PyPI / Go / GitHub) |
| [`docs/spec.md`](docs/spec.md) | Full design, milestones, success criteria |
| [`docs/adr/`](docs/adr/) | Architectural decisions (AD-01..06) — one file per decision |
| [`docs/build-log.md`](docs/build-log.md) | Chronological per-feature progression (every commit) |
| [`docs/tree-sitter-notes.md`](docs/tree-sitter-notes.md) | Tree-sitter implementation notes — token precedence rules, regex limitations, recurring patterns. **Read before adding grammar rules.** |
| [`CLAUDE.md`](CLAUDE.md) | Hard rules and project conventions |

## License

AGPL-3.0. Matches `m-standard`. See [`LICENSE`](LICENSE).
