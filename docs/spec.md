# tree-sitter-m — Specification v0.1

**Status:** draft for review
**License of this document:** AGPL-3.0 (matches the artifact it specifies)
**Source of grammar data:** [`m-standard`](../../m-standard) v0.2+ —
specifically [`integrated/grammar-surface.json`](../../m-standard/integrated/grammar-surface.json)
**Primary downstream consumers:** language-server tooling for VistA
development, M-source linters (including `m-standard`'s `lint_m`),
syntax highlighting in editors (VS Code, Emacs, Vim via tree-sitter
plugins), code-search and AST-based analysis tools, AI agents
reasoning about M code.

---

## Table of contents

* [1. Project identity](#1-project-identity)
* [2. Scope and non-goals](#2-scope-and-non-goals)
* [3. Architectural decisions](#3-architectural-decisions)
* [4. The grammar source: m-standard's grammar-surface](#4-the-grammar-source-m-standards-grammar-surface)
* [5. Language structure (hand-coded)](#5-language-structure-hand-coded)
* [6. Token recognition (data-driven)](#6-token-recognition-data-driven)
* [7. AST node attributes](#7-ast-node-attributes)
* [8. Output specification](#8-output-specification)
* [9. Build and code-generation pipeline](#9-build-and-code-generation-pipeline)
* [10. Testing methodology](#10-testing-methodology)
* [11. Distribution and bindings](#11-distribution-and-bindings)
* [12. Toolchain and dependencies](#12-toolchain-and-dependencies)
* [13. Repository layout](#13-repository-layout)
* [14. Milestones and roadmap](#14-milestones-and-roadmap)
* [15. Risks and open questions](#15-risks-and-open-questions)
* [16. Success criteria for v1.0](#16-success-criteria-for-v10)
* [17. Relationship to m-standard](#17-relationship-to-m-standard)

---

## 1. Project identity

**Name.** `tree-sitter-m`.

**Purpose.** A [tree-sitter](https://tree-sitter.github.io/) grammar
for the M (MUMPS) programming language. The grammar parses real-world
M source code from any source — VistA routines (IRIS-flavoured),
YottaDB applications, OSEHRA's open-source VistA work, and any other
M codebase — and stamps each recognised token with its provenance
metadata so downstream tools can reason about portability without
re-parsing.

**License.** AGPL-3.0, matching `m-standard` and the rest of the
project family.

**Why this exists.** No production-quality tree-sitter grammar for M
exists today. Existing M parsers (XINDEX itself, Caché's compiler,
YottaDB's compiler, syntax-highlighting modes for editors) are either
implementation-internal or hand-rolled per-tool. A single shared
parser that:

- recognises tokens from all major M sources (so it can read any
  real codebase),
- exposes per-token tier metadata (so downstream tools can enforce
  any standard profile without rebuilding the parser), and
- is generated mechanically from `m-standard`'s curated data (so it
  stays in sync with the source documentation),

…enables a whole tier of tooling — language servers, refactoring
tools, AST-based linters, code search, AI-agent ground truth — that
M development has historically lacked.

**Relationship to the project family.**

```
m-standard      →   integrated/grammar-surface.json   →   tree-sitter-m
   (data)              (versioned data contract)         (consumer)

tree-sitter-m   →   bindings: Node / Rust / Python / Go    →   tree-sitter-m-lint
 (this project)     (npm, crates.io, go modules; Python:        (sibling project)
                     clone-and-install — no PyPI publication)
                                                           →   editor plugins
                                                           →   AI agents
```

`tree-sitter-m` is a downstream consumer of `m-standard`. It does no
extraction, no reconciliation, no policy. Its only job is to take
`m-standard`'s data and produce a fast, embeddable, error-recovering
parser for M.

---

## 2. Scope and non-goals

**In scope for v1.0:**

* Full M language structure: line shape (label, optional formal
  list, leading space, command sequence), comments, string literals,
  numeric literals, postconditionals, indirection (`@expr`,
  `@expr@(subscript)`), dot-block nesting, argumentless commands
  (the "two-space" rule).
* Token recognition for every command, intrinsic function, intrinsic
  special variable, operator, and pattern code in
  `m-standard`'s grammar surface — i.e. the union of AnnoStd, YottaDB,
  and IRIS sources (~225 named tokens after prefix expansion).
* Per-token AST node attributes carrying `standard_status`
  (`ansi` / `ydb-extension` / `iris-extension` / `multi-vendor-ext`).
* Error recovery suitable for editor use: the parser returns a
  partial AST when source contains syntax errors, with `ERROR`
  nodes scoped to the smallest construct that could be skipped.
* Tree-sitter's standard query language for downstream consumers.
* Bindings for Node, Rust, Python, Go (the tree-sitter standard
  bindings set).
* Test corpus drawn from real M sources: synthetic fixtures plus
  routines from VistA Kernel, YottaDB sample apps, and the
  `m-standard` source codebases themselves.

**Deferred to v0.2 or later:**

* **Cross-routine resolution.** The parser does not follow `^ROUTINE`
  invocations into other files. AST nodes mark the reference; a
  separate cross-reference index (sibling project) resolves them.
* **Semantic analysis.** No type inference, no dead-code detection,
  no control-flow graphs. Those belong in tooling layers above the
  parser.
* **Indirection resolution.** When `@expr` appears, the parser
  records the indirection node but does not attempt to evaluate
  `expr` to find the indirected target. A semantic layer can do
  this with runtime data.
* **InterSystems ObjectScript.** `##class(...)`, `&sql(...)`,
  `&js(...)`, `##super`, `##this`, `obj.method()`, `obj.property=val`
  etc. are ObjectScript — a separate scripting language layered on
  top of M's runtime, not part of M itself. Out of scope for any
  version of tree-sitter-m. A separate `tree-sitter-objectscript`
  grammar would be the right home.
* **Pre-ANSI dialects.** DSM-11, MUMPS-11, etc. — historical, not
  relevant to live codebases.

**Non-goals:**

* Compiler / interpreter functionality. `tree-sitter-m` produces a parse
  tree; it does not execute or type-check M.
* Source formatting / reformatting. A formatter (`m-fmt`?) is a
  separate downstream project that *consumes* `tree-sitter-m`.
* Linting / standards enforcement. The pragmatic / SAC / operational
  standards live in `m-standard`'s data; `lint_m` and similar tools
  consume both `tree-sitter-m`'s AST and `m-standard`'s tier classifications.
  The parser stays neutral.

---

## 3. Architectural decisions

Six decisions drive the rest of the spec. Each is documented in its
own ADR file under [`docs/adr/`](adr/) — context, decision,
consequences, status. Downstream sections reference them by number.

| | Decision |
|---|---|
| [AD-01](adr/AD-01-source-grammar-surface.md) | Source the keyword tables from `m-standard`'s grammar-surface, not from any single standard. |
| [AD-02](adr/AD-02-hand-code-language-structure.md) | Hand-code the language structure; data-drive the keyword tables. |
| [AD-03](adr/AD-03-standard-status-on-nodes.md) | Stamp `standard_status` as an AST node attribute. |
| [AD-04](adr/AD-04-pin-mstandard-schema.md) | Pin to a specific `m-standard` schema version. |
| [AD-05](adr/AD-05-real-source-corpus.md) | Test against a corpus of real M code from multiple sources. |
| [AD-06](adr/AD-06-tree-sitter-bindings.md) | Provide language bindings via tree-sitter's standard scaffold. |

---

## 4. The grammar source: m-standard's grammar-surface

`m-standard` publishes [`integrated/grammar-surface.json`](../../m-standard/integrated/grammar-surface.json),
a single-file bundle containing exactly the enumerations a grammar
generator needs:

```json
{
  "schema_version": "1",
  "concept": "grammar-surface",
  "commands": [
    {
      "canonical": "BREAK",
      "abbreviation": "B",
      "all_forms": ["B", "BR", "BRE", "BREA", "BREAK"],
      "standard_status": "ansi"
    },
    ...
  ],
  "intrinsic_functions": [...],
  "intrinsic_special_variables": [...],
  "operators": [...],
  "pattern_codes": [...]
}
```

`tree-sitter-m` consumes this file at build time. The build generator
(`tools/build-grammar.js`, see §9) reads the file and emits the
corresponding `choice(...)` rules into `grammar.js`. Per AD-04
the file's `schema_version` must match the version `tree-sitter-m` is
pinned to.

**Counts in m-standard v0.2:**

| Concept | Token count | Total prefix forms (`all_forms` expanded) |
| --- | ---: | ---: |
| commands | 82 | ~390 |
| intrinsic_functions | 159 | ~370 |
| intrinsic_special_variables | 82 | ~170 |
| operators | 17 | 17 |
| pattern_codes | 7 | 7 |
| **Total** | **347** | **~954** |

These are the keyword sets `tree-sitter-m` recognises in v1.0.

**Why prefix forms matter.** M abbreviations are
prefix-truncations: `BREAK` with abbreviation `B` is recognised
as `B`, `BR`, `BRE`, `BREA`, or `BREAK` — any prefix at least as
long as the abbreviation. `grammar-surface.json` already explodes
this; `tree-sitter-m`'s grammar simply uses every form as an alternative
in a `choice(...)`. Total of ~954 keyword forms.

---

## 5. Language structure (hand-coded)

The following grammar rules are hand-coded in `grammar.js` because
they're invariant across sources and don't fit the keyword-table
model:

### 5.1 Routine structure

```
routine        ::= header_line line+
header_line    ::= label whitespace ";" comment_text
line           ::= label? formals? leading_space command_sequence comment?
label          ::= identifier
formals        ::= "(" identifier ("," identifier)* ")"
leading_space  ::= " "  // exactly one space separates label from body
```

### 5.2 Command sequence

```
command_sequence ::= command (command_sep command)*
command_sep      ::= " "    // single space between commands
                   | "  "+  // two-or-more spaces = argumentless command boundary
command          ::= command_keyword postconditional? argument_list?
postconditional  ::= ":" expression
argument_list    ::= argument ("," argument)*
```

### 5.3 Comments

```
comment      ::= ";" any_chars_to_eol
inline_text  ::= chars_excluding_unquoted_semicolon  // see lexer note below
```

Comments terminate at end-of-line. The lexer must be careful to
distinguish `;` inside string literals (which is a literal char)
from `;` outside strings (which starts a comment).

### 5.4 String literals

```
string         ::= '"' (escaped_quote | non_quote_char)* '"'
escaped_quote  ::= '""'   // doubled quote = literal embedded quote
```

### 5.5 Numeric literals

```
number      ::= sign? digit+ ("." digit+)? exponent?
exponent    ::= ("E" | "e") sign? digit+
sign        ::= "+" | "-"
```

### 5.6 Indirection

```
indirection ::= "@" expression_atom               // name indirection
              | "@" expression_atom "@" "(" expression ("," expression)* ")"  // subscript indirection
```

The parser records indirection as a node; it does not evaluate
the indirected expression. See AD-02 deferred for indirection
resolution.

### 5.7 Dot-block nesting

```
do_block_line ::= "." dots_to_match? command_sequence
dots_to_match ::= "."+
```

Argumentless `DO` opens a block; the next lines start with one
more `.` than the current nesting level. The grammar must track
this lexically to assemble correct block-scoped subtrees.

### 5.8 Pattern matching

```
pattern_atom    ::= repeat_count (pattern_code | pattern_string | alternation)
repeat_count    ::= integer | integer "." integer? | "." integer
pattern_code    ::= ("'")? pattern_letter
pattern_letter  ::= "A" | "C" | "E" | "L" | "N" | "P" | "U" | other_letter  // see grammar-surface
pattern_string  ::= string
alternation     ::= "(" pattern_atom ("," pattern_atom)* ")"
```

---

## 6. Token recognition (data-driven)

The keyword-recognition rules are generated from
`grammar-surface.json` at build time. For each concept:

```javascript
// generated in grammar.js by tools/build-grammar.js:
command_keyword: $ => choice(
  "B", "BR", "BRE", "BREA", "BREAK",         // BREAK + prefix forms
  "C", "CL", "CLO", "CLOS", "CLOSE",         // CLOSE
  "CATCH",                                   // IRIS extension
  "D", "DO",                                 // DO
  // ... ~390 alternatives total ...
)
```

Same shape for `intrinsic_function`, `intrinsic_special_variable`,
`operator`, `pattern_code`.

The build generator emits both the choice rule AND a parallel
metadata table mapping each form back to its `(canonical_name,
standard_status)` pair, so the post-parse step (see §7) can stamp
attributes.

---

## 7. AST node attributes

Every keyword node in the parse tree carries:

```json
{
  "type": "command",
  "canonical_name": "BREAK",
  "matched_form": "B",
  "standard_status": "ansi",
  "range": [...],
  "children": [...]
}
```

Tree-sitter's standard mechanism for this is **field accessors** on
named nodes plus a custom **alias** if needed. Implementation can
use a post-parse pass over the AST that joins matched text against
the build-time metadata table and sets node attributes.

Downstream consumers query attributes via tree-sitter's standard
query language:

```scheme
; Find all uses of YDB-only commands:
(command
  (command_keyword) @cmd
  (#match? @cmd "ydb-extension"))

; Find all multi-vendor extensions:
(command
  (#eq? standard_status "multi-vendor-ext"))
```

---

## 8. Output specification

`tree-sitter-m` produces:

* **`grammar.js`** — generated tree-sitter grammar definition
  (committed to the repo; consumers don't need to regenerate).
* **`src/parser.c`** + **`src/tree_sitter/parser.h`** — generated
  C parser source (committed; this is what compiles into the
  language libraries).
* **`src/grammar-metadata.json`** — generated companion file
  mapping every recognised form to its `(canonical_name,
  standard_status)` pair. Used by post-parse attribute stamping.
* **`bindings/node/`**, **`bindings/rust/`**, **`bindings/python/`**,
  **`bindings/go/`** — language bindings produced by the tree-sitter
  scaffold.
* **npm package** `tree-sitter-m` — the standard tree-sitter
  distribution form (matches `tree-sitter-javascript`,
  `tree-sitter-python`, etc.).
* **crates.io crate** `tree-sitter-m`.
* **Go module** `github.com/m-dev-tools/tree-sitter-m`.
* **Python binding**: clone-and-install from the GitHub repo (no
  PyPI publication planned).

All generated artifacts are committed so consumers don't need
tree-sitter-cli or `m-standard` to install and use the parser. The
build pipeline (§9) regenerates them from `m-standard` data.

---

## 9. Build and code-generation pipeline

```
m-standard/
└── integrated/
    └── grammar-surface.json   ──┐
                                 │
                                 ▼
tree-sitter-m/
├── tools/build-grammar.js     ─►  reads grammar-surface.json
│                                  emits the data-driven half of grammar.js
│                                  emits src/grammar-metadata.json
│                                  validates schema_version pin (AD-04)
├── grammar.js                 ◄──  generated; commit to repo
├── tree-sitter generate       ──►  reads grammar.js
│                                  emits src/parser.c + src/tree_sitter/parser.h
├── src/parser.c               ◄──  generated; commit to repo
├── tree-sitter test           ──►  runs corpus tests (§10)
├── tree-sitter build          ──►  compiles bindings/ for each platform
└── npm publish / cargo publish / etc.
```

Each stage's output is committed so a consumer can `npm install
tree-sitter-m` without any of the upstream tools.

The pipeline runs in CI on every commit to `m-standard` that
changes `grammar-surface.json` (via a webhook or scheduled poll —
implementation detail) AND on every commit to `tree-sitter-m` itself.

---

## 10. Testing methodology

### 10.1 Tree-sitter corpus tests

Tree-sitter's standard test format: pairs of `(M source, expected
S-expression)` in `test/corpus/*.txt`. One file per grammar feature.

```
================================================================================
Simple BREAK command
================================================================================

TEST ;test routine
 BREAK
 QUIT

--------------------------------------------------------------------------------

(routine
  (header_line (label) (comment))
  (line
    (command (command_keyword (BREAK))))
  (line
    (command (command_keyword (QUIT)))))
```

### 10.2 Real-source corpus

Beyond synthetic fixtures, the test suite parses real M routines
from at least:

- `m-standard/sources/sac/routines/XINDEX.m` and the `XINDX*.m`
  family (~17 routines; known SAC-compliant)
- A representative VistA Kernel package (IRIS-style M with class
  syntax deferred to v0.2)
- A YottaDB sample application's routines (YDB-style M with `Z*`
  extensions)
- `m-standard`'s own crawled YottaDB documentation source repo

For each real source file, the test asserts:
1. The parser produces a tree with no `ERROR` nodes (or a
   documented count of expected errors).
2. Every keyword node has `standard_status` set.
3. Re-serialising the AST text matches the source byte-for-byte
   (round-trip fidelity).

### 10.3 Per-tier coverage assertions

For every `(canonical_name, standard_status)` pair in
`grammar-surface.json`, at least one corpus test exercises that
token. CI fails if a token added to `grammar-surface.json` doesn't
have a corresponding test.

### 10.4 Performance budget

`tree-sitter parse` of a 10,000-line VistA routine completes in
under 100ms on a modern laptop. CI tracks regression.

---

## 11. Distribution and bindings

| Binding | Package | Install |
| --- | --- | --- |
| Node | `tree-sitter-m` on npm | `npm install tree-sitter-m` |
| Rust | `tree-sitter-m` on crates.io | `cargo add tree-sitter-m` |
| Python | clone-and-install (no PyPI) | `git clone …/tree-sitter-m && pip install ./tree-sitter-m` |
| Go | `github.com/m-dev-tools/tree-sitter-m` | `go get github.com/m-dev-tools/tree-sitter-m` |

Editor integrations consume the npm package via:

- VS Code: tree-sitter language extension, with `tree-sitter-m` declared
  in the extension's manifest.
- Neovim: nvim-treesitter ships parser configurations; `tree-sitter-m`
  is added as a parser source.
- Emacs: tree-sitter.el's language registration.
- Helix: declared in `languages.toml`.

---

## 12. Toolchain and dependencies

Build-time:
- **Node.js ≥ 20** (tree-sitter-cli runs on Node)
- **tree-sitter-cli** (latest stable, ≥0.21)
- **C compiler** (for the generated parser; gcc/clang/MSVC)

Runtime (per binding):
- Node: tree-sitter ≥ 0.21
- Rust: tree-sitter ≥ 0.22
- Python: tree-sitter ≥ 0.21
- Go: tree-sitter Go binding (third-party)

No m-standard dependency at runtime — tree-sitter-m ships pre-generated
artifacts. The m-standard pin is build-time only.

---

## 13. Repository layout

```
tree-sitter-m/
├── docs/
│   ├── spec.md                    # this document
│   ├── adr/
│   │   ├── 001-source-grammar-surface.md
│   │   ├── 002-hand-code-language-structure.md
│   │   ├── 003-standard-status-on-nodes.md
│   │   ├── 004-pin-mstandard-schema.md
│   │   ├── 005-real-source-corpus.md
│   │   └── 006-tree-sitter-bindings.md
│   ├── consumer-guide.md          # how downstream tools use the parser
│   └── build-log.md
├── tools/
│   └── build-grammar.js           # consumes m-standard/grammar-surface.json
├── grammar.js                     # generated tree-sitter grammar
├── src/
│   ├── parser.c                   # generated by tree-sitter generate
│   ├── grammar-metadata.json      # canonical_name + standard_status table
│   └── tree_sitter/
│       └── parser.h
├── bindings/
│   ├── node/
│   ├── rust/
│   ├── python/
│   └── go/
├── test/
│   └── corpus/
│       ├── commands.txt           # synthetic per-feature tests
│       ├── functions.txt
│       ├── special_variables.txt
│       ├── postconditionals.txt
│       ├── dot_blocks.txt
│       ├── indirection.txt
│       ├── strings_and_numbers.txt
│       └── real_routines/         # real M source files
│           ├── xindex.m            # symlink or copy from m-standard
│           ├── vista_sample.m
│           └── ydb_sample.m
├── .github/
│   └── workflows/
│       ├── ci.yml                 # build, test, lint
│       └── release.yml            # npm/crates.io publish + Go tag
├── package.json                   # npm metadata + m-standard.schema_version pin
├── Cargo.toml                     # crate metadata
├── pyproject.toml                 # python binding
├── go.mod                         # go binding
├── binding.gyp                    # native build config
├── tree-sitter.json               # tree-sitter parser configuration
├── CHANGELOG.md
├── LICENSE                        # AGPL-3.0
└── README.md
```

---

## 14. Milestones and roadmap

| Milestone | Scope | Exit criterion |
| --- | --- | --- |
| **B0** | Repo skeleton, ADRs, CI scaffold, m-standard pin | Repo cloned green; CI builds (no parser yet). |
| **B1** | Hand-coded language structure (lines, comments, strings, numbers, postconditionals). No keyword tables yet — recognition uses placeholder regex. | Synthetic corpus tests for §5 rules pass. |
| **B2** | `tools/build-grammar.js` wired up. Keyword tables generated from `m-standard`'s `grammar-surface.json`. ~954 prefix forms recognised. | All keyword recognition tests pass; per-tier coverage gate green. |
| **B3** | AD-03 attribute stamping. `standard_status` on every keyword node. Query-language examples in docs. | Tree-sitter queries can filter by tier. |
| **B4** | Indirection, dot-blocks, pattern matching. The "weird" syntax. | Real-source corpus parses VistA Kernel + YottaDB samples cleanly. |
| **B5** | Error recovery. Malformed source produces partial AST with `ERROR` nodes scoped tightly. | Editor-quality experience: typing in a partial routine still yields a useful tree. |
| **B6** | Bindings: Node, Rust, Go. CI builds binaries for each. Python binding stays clone-and-install. | `npm install tree-sitter-m` works end-to-end on Linux/macOS/Windows. |
| **B7** | Editor integrations published: VS Code extension, nvim-treesitter PR, Emacs registration. | At least one editor ships syntax highlighting using tree-sitter-m. |
| **v1.0** | Tag and release. | All §16 success criteria met. |

Estimated total: **~3–4 weeks of focused work for v1.0**, dominated
by B4 (indirection / dot-blocks / pattern matching are the gnarly
parts) and B5 (error recovery for editor quality).

---

## 15. Risks and open questions

**Tree-sitter's incremental-parsing assumptions.** Tree-sitter
expects grammars to be context-free with limited lookahead. M's
two-space rule (argumentless commands) and dot-block nesting can
be modelled but require care. The two-space rule is now handled
by `src/scanner.c` (stateless external scanner emitting `_sp1` /
`_sp2plus` tokens — the auto-lexer can't pick between them by
parser context alone). Dot-block depth tracking remains a
context-free prefix in the grammar; depth-vs-enclosing-scope
validation is left to a downstream pass.

**Indirection complexity.** `@expr` can appear almost anywhere a
name can. The parser records the indirection node but doesn't
resolve; downstream tools that need resolution (a language server,
say) need their own resolver. Documenting the boundary is
important to avoid downstream confusion.

**InterSystems ObjectScript.** VistA-on-IRIS and other commercial
M codebases mix in ObjectScript: `##class(...)`, `&sql(...)`,
`&js(...)`, `##super`, `obj.method()`, `obj.property=val`. These
aren't M — they're a separate scripting language that shares M's
runtime. tree-sitter-m is scoped to M and M dialects (AnnoStd, YottaDB,
IRIS's M layer); ObjectScript is permanently out of scope, not
deferred. The right home for it is a sibling grammar
(`tree-sitter-objectscript`) that can compose with tree-sitter-m when a
file mixes both. Routines that use ObjectScript heavily will
produce `ERROR` nodes in tree-sitter-m; that's by design.

**Pattern code namespace.** YottaDB allows new pattern codes via
the patcode table; IRIS allows custom codes via international
character set features. v1.0 only recognises the standard
A/C/E/L/N/P/U set from `grammar-surface.json`. Custom codes will
parse as `ERROR` until a "permissive patcode" mode is added.

**Round-trip fidelity vs canonicalisation.** Tree-sitter parsers
preserve source bytes exactly, but a downstream formatter would
canonicalise (e.g. normalise abbreviation forms). The parser's
tree carries `matched_form` (what the source said) vs
`canonical_name` (the full form) so consumers can choose either.
Important to document; easy to confuse.

**m-standard schema evolution.** When m-standard ships
`schema_version="2"` (per its ADR-005), tree-sitter-m must adopt it
deliberately. The pin in `package.json` and the build-time check
catch accidental drift.

**Performance on 10k+ line routines.** Real VistA routines are
unusually large (single-file routines of 5,000+ lines are common).
The performance budget (§10.4) of <100ms for 10k lines is feasible
but needs verification against the worst-case real-source corpus.

---

## 16. Success criteria for v1.0

The following must all be true for v1.0 release:

1. **Grammar source.** `tools/build-grammar.js` reads
   `m-standard/integrated/grammar-surface.json` (pinned to a
   specific `schema_version`) and emits the keyword tables
   into `grammar.js`. Every keyword in the source file appears in
   the generated grammar.
2. **Hand-coded structure.** All §5 rules implemented and tested.
3. **AST attributes.** Every recognised keyword node carries
   `canonical_name`, `matched_form`, and `standard_status` (per AD-03).
4. **Real-source corpus parses cleanly.** XINDEX routines from
   `m-standard/sources/sac/routines/`, plus at least one VistA
   Kernel sample and one YottaDB sample app, parse with no
   `ERROR` nodes (or with documented + acceptable error counts
   for known-out-of-scope constructs like IRIS class syntax).
5. **Per-tier coverage gate.** Every `(canonical_name,
   standard_status)` pair in `grammar-surface.json` has at least
   one corpus test exercising it. CI fails if a token is added
   without a test.
6. **Performance.** 10k-line routine parses in under 100ms on
   reference hardware (documented in `docs/build-log.md`).
7. **Bindings published.** `npm install tree-sitter-m`,
   `cargo add tree-sitter-m`, and the Go-module tag all work on
   Linux, macOS, Windows. The Python binding is consumed via local
   checkout (no PyPI publication planned).
8. **Editor demonstration.** At least one editor integration
   (VS Code extension or nvim-treesitter PR) ships syntax
   highlighting using tree-sitter-m.
9. **ADR set complete.** AD-01 through AD-06 documented as ADRs.
10. **CI gates.** Build + corpus tests + per-tier coverage gate +
    performance budget all enforced on every PR.
11. **License compliance.** AGPL-3.0 stamped in `LICENSE`.
    Generated grammar files carry the license header.
12. **Schema-pin enforcement.** CI fails if the consumed
    `grammar-surface.json`'s `schema_version` doesn't match
    `package.json`'s pin.

---

## 17. Relationship to m-standard

`tree-sitter-m` is a **strict downstream consumer** of `m-standard`. It
does no extraction, no reconciliation, no policy. The contract is:

- `tree-sitter-m` reads exactly one file from `m-standard`:
  `integrated/grammar-surface.json`.
- That file is consumed at build time, never at runtime.
- The pinned `schema_version` is part of `tree-sitter-m`'s public ABI
  in the sense that downstream consumers know what `standard_status`
  values to expect.
- When `m-standard` ships an additive grammar-surface change (new
  command added to a vendor), `tree-sitter-m` rebuilds and ships an
  additive update without bumping its own major version.
- When `m-standard` ships a breaking schema change (per its
  ADR-005), `tree-sitter-m` performs a deliberate adoption and bumps
  its own major version.

Conversely, `tree-sitter-m` does **not** influence `m-standard`'s
direction. If `tree-sitter-m` discovers a missing token or a parse
ambiguity, the fix lives in `m-standard`'s extractors or sources,
not in `tree-sitter-m`. The data flows in one direction.

The other way to think about it: `m-standard` is the authoritative
data; `tree-sitter-m` is the most prominent consumer. Other consumers
(`tree-sitter-m-lint`, `m-fmt`, AI agents, vista-meta analyzers)
will follow the same pattern.

The pragmatic / SAC / operational standards are also `m-standard`
outputs — but they're consumed by `tree-sitter-m`'s sibling
`tree-sitter-m-lint`, not by `tree-sitter-m` itself. The parser
recognises everything; the linter classifies what it found.
