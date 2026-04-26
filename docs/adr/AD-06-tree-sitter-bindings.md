# AD-06: Provide language bindings via tree-sitter's standard scaffold

**Status:** accepted (B0, 2026-04); scaffolded + locally verified (B6,
2026-04-26); publish pending
**Decided by:** Rafael Richards
**Supersedes:** —
**Superseded by:** —

## Context

Downstream consumers reach `tree-sitter-m` through several channels:

- **Editors** — Neovim's nvim-treesitter, VS Code tree-sitter
  extensions, Helix's `languages.toml`, Emacs's tree-sitter modes.
- **Code-search** — GitHub's tree-sitter-backed search.
- **Programmatic** — language servers, AI agents, formatters,
  refactor tools, the sibling `tree-sitter-m-lint`.

Each ecosystem already knows how to consume tree-sitter parsers via
the standard binding shapes: `tree-sitter-<lang>` on npm,
`tree-sitter-<lang>` on crates.io, `tree-sitter-<lang>` on PyPI,
`github.com/<org>/tree-sitter-<lang>` Go module.

Two reasonable approaches:

1. **Bespoke bindings** with a custom API — tempting if the parser
   has features beyond standard tree-sitter. Rejected: nothing about
   M's parse tree is non-standard, so a bespoke API would just be
   undifferentiated friction for consumers.
2. **Standard tree-sitter scaffold** — `tree-sitter init` generates
   per-language binding directories and the consumer reaches the
   parser exactly the way they reach `tree-sitter-javascript` or
   `tree-sitter-python`.

## Decision

Ship Node, Rust, Python, and Go bindings using `tree-sitter`'s
standard generators (`tree-sitter init --update`). No bespoke binding
code. The four directories under [`bindings/`](../../bindings/) plus
their build manifests ([`Cargo.toml`](../../Cargo.toml),
[`pyproject.toml`](../../pyproject.toml), [`setup.py`](../../setup.py),
[`go.mod`](../../go.mod), [`binding.gyp`](../../binding.gyp)) are all
the binding code that exists.

## Consequences

**Positive:**

- Consumers use `tree-sitter-m` via every tree-sitter-aware tool
  without `tree-sitter-m`-specific glue.
- `tree-sitter init --update` regenerates the scaffolds when
  tree-sitter-cli releases a new version; we inherit improvements
  without per-binding maintenance.
- The CI matrix (Linux/macOS/Windows × node/rust/go/python) catches
  per-platform breakage early.

**Negative:**

- Per-binding stamping helpers (per [AD-03](AD-03-standard-status-on-nodes.md))
  do need bespoke per-language code. That layer is small (a few dozen
  lines per binding) and lives alongside the scaffold rather than
  replacing it.
- Tree-sitter's binding scaffolds occasionally lag the latest tooling
  (e.g. `tree-sitter@0.25.0` JS runtime doesn't compile on Node 24
  yet). Documenting the supported Node version in the README absorbs
  this without requiring our own fork.

## Status as of 2026-04-26

All four bindings scaffolded and parsing a sample M routine on local
toolchains (Rust 1.94, Go 1.26 with `go-tree-sitter` v0.25, Python
3.12, Node 22.22 LTS). CI matrix runs them on Linux/macOS/Windows.
Publishing to npm / crates.io / PyPI / Go module tag is the remaining
B6 item — not started.
