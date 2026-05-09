# Build log — tree-sitter-m

Chronological notes on milestone deliveries, decisions made during
implementation, and any drift from `spec.md`.

> **Naming note (2026-04-26):** the project was renamed from `m-parser`
> to `tree-sitter-m` to match the standard tree-sitter ecosystem
> convention (`tree-sitter-<lang>`). The repo moved from
> `github.com/m-dev-tools/m-parser` to `github.com/m-dev-tools/tree-sitter-m`
> (GitHub auto-redirects the old URL). Existing entries below
> reference the old name as a matter of historical record; project
> content is unchanged.

---

## 2026-04-26 — Discoveries log seeded (DISC-001..003)

Authoring the seven category-focused test routines in
`tree-sitter-m-vscode/test-routines/` surfaced three findings that
deserve persistent records rather than living only in commit
messages. Created [`docs/discoveries.md`](discoveries.md) as the
canonical log; it follows m-standard's `BL-NNN` convention but uses
the `DISC-NNN` prefix to keep streams visually distinct.

- **DISC-001** — YDB/IRIS list-function abbreviations missing from
  m-standard's `grammar-surface.json`. The canonicals (`$LISTBUILD`,
  `$LISTGET`, `$LISTLENGTH`, etc.) parse fine; the standard 2-letter
  YDB/IRIS forms (`$LB`, `$LI`, `$LL`, ...) don't because the
  upstream extractor populated `abbreviation=""`. **Upstream**:
  cross-linked to [m-standard BL-014](../../m-standard/docs/build-log.md#bl-014).
- **DISC-002** — Compound negated operators `'[`, `']`, `']]` need
  no whitespace before the rhs. Cosmetic only; real M doesn't have
  this whitespace. **Won't fix** — the relaxation creates real
  shift-reduce ambiguity with the unary `'` (NOT) prefix.
- **DISC-003** — `by_reference` rejects `global_variable`. Pass-by-ref
  of a global is semantically meaningless in M (globals are already
  by-name). **Won't fix** — relaxing the rule creates conflicts with
  naked-ref `^(...)` and per-arg postcond `LBL:cond^RTN`.

The log structure documents how to add new entries (next free
DISC-NNN, fill in phase / statement / evidence / impact / workaround
/ resolution status, cross-link both ways). Resolved discoveries
get a `**Resolution:**` line with date + commit/release that closed
them.

---

## 2026-04-26 — Sibling `tree-sitter-m-vscode` Phase 2 (criterion #8 implementation)

Live at `github.com/m-dev-tools/tree-sitter-m-vscode`. Substantively
closes criterion #8 (editor integration); marketplace publish is the
only remaining piece, gated on a VS Code Marketplace PAT.

**Architecture — two-layer highlighting:**

1. **TextMate grammar** (`syntaxes/m.tmLanguage.json`) handles the
   cold-load render via `contributes.grammars`. Regex-based;
   approximate but readable while the parser warms up.
2. **`DocumentSemanticTokensProvider`** parses each document with
   `tree-sitter-m` compiled to WASM (`dist/tree-sitter-m.wasm`,
   392 KB), walks the parse tree, emits VS Code semantic tokens
   overlaying the TextMate base. Lazy-init on first use; subsequent
   calls reuse the cached parser.

**Why WASM not the native Node binding.** VS Code extensions can't
reliably load `.node` addons across user platforms — without
prebuilds, users hit a `node-gyp` install build that needs a C
toolchain. The `web-tree-sitter` runtime loads a single `.wasm`
file that works everywhere VS Code runs (desktop and web).

**Build pipeline.** `dist/tree-sitter-m.wasm` is committed; consumers
never need build tooling. Maintainer rebuild via `npm run build-wasm`
(shells out to `tree-sitter build --wasm --docker`, pulls
`emscripten/emsdk:4.0.4` once and caches it).

**Node-type → semantic-token map.** `command_keyword` → keyword;
`intrinsic_function_keyword` → function (defaultLibrary);
`special_variable_keyword` / `vendor_sv_extension` → variable
(defaultLibrary, readonly); `pattern_letter` → keyword
(defaultLibrary); `operator` / `format_control` / `format_tab` /
`dot_block_prefix` → operator; `global_variable` /
`numeric_label_call` → variable / function. Child-anchored:
`(line (label))` → function (declaration); local_variable →
variable; extrinsic_function / entry_reference children → function;
formals / by_reference → parameter (with declaration on formals).

**Smoke verified:**

- `npm run lint` (tsc -noEmit) clean.
- `npm run compile` clean (out/extension.js — 9 KB).
- `npx vsce package` → 1.27 MB .vsix, 55 files (bundles
  dist/tree-sitter-m.wasm + web-tree-sitter runtime).
- Direct WASM smoke: parses sample routine cleanly (hasError=false);
  expected node counts (6 command_keywords for S/W/I/D/W/Q,
  3 operators for =/+/>, 1 label, 1 extrinsic_function for
  $$RESULT^OTHER).

**Status against spec §16 #8:** ⚠️ implementation done; marketplace
`vsce publish` pending a Personal Access Token from dev.azure.com.
Once that's in place the extension is one command from the
marketplace, end users install via Cmd+Shift+X / Extensions search
"M (MUMPS)".

---

## 2026-04-26 — Pre-publish polish: README, highlight queries, RELEASE.md

**Done in this session (publish-readiness work):**

- **`RELEASE.md`** — step-by-step publish checklist covering
  pre-flight gates, version coordination across the six
  declarations (`package.json`, `tree-sitter.json`, `Cargo.toml`,
  `pyproject.toml`, `CMakeLists.txt`, `Makefile`), credential
  prep, per-ecosystem publish (npm / crates.io / Go module tag /
  GitHub release), post-publish smoke verification, and rollback
  options. The Python binding is consumed via local checkout (no
  PyPI publication planned). First publish stays at **0.1.0**
  intentionally — bump to 1.0 only after editor integration (#8)
  absorbs real usage.
- **README refresh.** Front-matter status block updated to reflect
  end-of-B6 reality (was mid-B5 stale). Added a `Bindings` section
  with per-ecosystem install snippets, a load-bearing **Node 22
  LTS requirement** note (upstream `tree-sitter@0.25.0` JS runtime
  doesn't compile against Node 24's V8 headers), and a paragraph
  on the deferred `prebuildify` rollout.
- **`queries/highlights.scm`** — bundled tree-sitter highlight
  queries for editors (Helix, nvim-treesitter, VS Code's
  tree-sitter API). The file was already declared in
  `package.json` but didn't exist; this fixes the broken reference
  before publish. Maps `command_keyword` → `@keyword`,
  `intrinsic_function_keyword` → `@function.builtin`,
  `special_variable_keyword` / `vendor_sv_extension` →
  `@variable.builtin`, `extrinsic_function` / `entry_reference` /
  `numeric_label_call` → `@function`, plus the usual `@string` /
  `@number` / `@comment` / `@operator` / `@label` /
  `@variable.parameter` / `@punctuation.special` mappings.
- **`lib/queries.test.js`** — smoke test that the queries file
  compiles against the live grammar and matches at least one node
  on a representative routine. Catches the common rot of a node
  type renaming-but-not-updating-the-query. Now 19 lib tests
  (was 18).

**Three calls confirmed by the user:**

1. First publish stays on **0.1.0**, not 1.0.
2. Prebuilt binaries deferred to a later release.
3. No `engines` block on Node 24 — communicated in README instead
   so consumers can still install on Node 24 if they bring their
   own tree-sitter runtime.

**Editor target (#8) chosen: VS Code.** The actual extension
will live in a sibling `tree-sitter-m-vscode` repo. The foundation
work lives here: highlight queries (consumable by VS Code's
experimental tree-sitter API), the npm-published `tree-sitter-m`
package (loadable as a parser .wasm or via the Node binding), and
the AD-03 stamping library.

**Status against spec §16 success criteria:**

- Was: ✅ 1, 2, ⚠️ 3, ✅ 4, 5, 6, ⚠️ 7, ❌ 8, ✅ 9, ⚠️ 10, ⚠️ 11, ✅ 12.
- Now: same — these were prep changes for #7/#8, not status flips.
  But #7 is now actionable (RELEASE.md exists) and #8 has its target
  named.

---

## 2026-04-26 — ADR file split + per-file license headers

**Done (the two low-stakes v1.0 polish items):**

- **ADRs split into per-file form (criterion #9).** Created
  `docs/adr/AD-{01..06}.md` plus a one-page `docs/adr/README.md`
  index. Each ADR uses a `Context / Decision / Consequences / Status`
  layout and links sideways to the others where relevant. Spec §3
  shrunk from ~80 lines of inline ADRs to a 6-row table pointing at
  the per-ADR files. The "See AD-XX" references already scattered
  through `grammar.js`, `tools/build-grammar.js`, `lib/stamp.js`,
  `CLAUDE.md`, and the rest of `docs/spec.md` keep working — they
  reference the AD-XX identifier, not the spec section.
- **SPDX license headers (criterion #11).** Added
  `// SPDX-License-Identifier: AGPL-3.0-only` + copyright line to:
    - `grammar.js` (hand-coded)
    - `src/scanner.c` (hand-coded; also corrected the leftover
      `m-parser` reference in the same edit)
    - `keywords.generated.js` (via the banner template in
      `tools/build-grammar.js`, so regen preserves it)

**Intentionally skipped:**

- **`src/parser.c`** — generated by `tree-sitter generate`; the CLI
  doesn't expose a header-injection hook, so any hand-stamped header
  would be wiped on the next regen. Other tree-sitter grammars
  (tree-sitter-javascript, tree-sitter-python, tree-sitter-rust) all
  ship parser.c with only the tree-sitter `@generated` marker;
  per-file SPDX is uncommon for the generated parser. The repo-root
  `LICENSE` is the canonical declaration.
- **`src/grammar-metadata.json`** — JSON has no comment syntax. A
  `__license__` synthetic field is awkward and not standard practice
  for sidecar data files. Same fallback: `LICENSE` is the canonical
  declaration; `package.json` already carries `"license": "AGPL-3.0"`.

**Status against spec §16 success criteria:**

- Was: ✅ 1, 2, ⚠️ 3, ✅ 4, 5, 6, ⚠️ 7, ❌ 8, ⚠️ 9, ⚠️ 10, ⚠️ 11, ✅ 12.
- Now: ✅ 1, 2, ⚠️ 3, ✅ 4, 5, 6, ⚠️ 7, ❌ 8, ✅ 9, ⚠️ 10, ⚠️ 11
  (down to two opt-out exceptions, both documented), ✅ 12.

Remaining v1.0 must-dos: **publish bindings (#7)** — irreversible name
claims on npm / crates.io / Go module (Python binding stays clone-and-
install) — and **at least one editor integration (#8)**. The remaining
⚠️ on #11 is a documentation choice not a missing piece.

---

## 2026-04-26 — B6 wrap-up: bindings, CI, coverage gate, perf budget

**Done in this session (4 of the must-do v1.0 items):**

- **B6 bindings.** `tree-sitter init --update` scaffolded the four
  bindings (Node already existed from earlier work). `tree-sitter.json`
  flipped `rust`/`python`/`go` to `true`. Each binding gained a real
  `parses_sample_routine` test (load parser, parse a tiny M routine,
  assert no `ERROR` on the root). Verified locally on:
    - Rust 1.94 / `tree-sitter-language` 0.1 / `tree-sitter` 0.25.10
    - Go 1.26 / `go-tree-sitter` v0.25.0 (bumped from v0.24 — needed
      for ABI 15)
    - Python 3.12 (uv-managed; system Python 3.12.3 lacks `Python.h`)
    - Node 22.22 LTS (Node 24 fails — upstream `tree-sitter@0.25.0`
      JS runtime doesn't compile against Node 24's V8 headers)
- **CI workflow.** `.github/workflows/ci.yml` — five jobs on push/PR
  to `main`, with concurrency cancellation:
    - `grammar` (Ubuntu) — `tree-sitter test` (110 corpus), lib tests
      (18 stamp), per-tier coverage gate (347/347), parser-regen-clean
      (`tree-sitter generate` → `git diff --exit-code` on
      `src/parser.c` / `src/grammar.json` / `src/node-types.json`).
    - `node` / `rust` / `go` / `python` matrices across
      Linux/macOS/Windows. Python additionally fans out across
      3.10/3.11/3.12.
- **Per-tier coverage gate (criterion #5).** `tools/coverage-gate.js`
  walks `test/corpus/*.txt` plus `test/coverage/*.m`, parses each
  block, joins keyword nodes via `lib/stamp.js`, and asserts every
  `(concept, canonical, standard_status)` triple in
  `src/grammar-metadata.json` is exercised. Auto-generator
  `tools/build-coverage-corpus.js` emits a deterministic
  `test/coverage/keywords.m` from the metadata, so adding a keyword
  to m-standard's grammar-surface only requires regenerating one file.
  **347/347 triples covered.**
- **Perf budget (criterion #6 / spec §10.4).** `tools/perf-bench.js`
  measures three buckets on the local VistA corpus (39,330 routines):
    - **Sample (n=50, 5-repeat median per file):** p50 0.83 ms,
      p95 2.30 ms, max 2.68 ms.
    - **Largest real routine** (`SCANTYPEDEFS.m`, 1,597 lines /
      77 KB): 12.20 ms.
    - **Synthesised 10k-line single routine** (largest routine's
      body replicated to 10,000 lines / 480 KB) — the spec's
      canonical case: **78.63 ms** (5-run range 78–83 ms).
    - **Synthesised 10k via concatenated routines** (50+ separate
      header_lines, ~454 KB) — informational stress case: 104–108 ms.
  Spec criterion #6 is **PASS at 78.63 ms** with ~20% margin. The
  concat case is ~5% over budget but isn't the spec's case (and
  doesn't represent any real M routine — VistA's largest is 1,597
  lines). Hardware: Linux 6.17, Node 22.22 LTS, single-thread C
  parser via tree-sitter Node binding. Bench is local-only (CI lacks
  the corpus); run `npm run bench` to reproduce.

**Status against spec §16 success criteria:**

- Was: ✅ 1, 2, ⚠️ 3, ✅ 4, ❌ 5, ❓ 6, ❌ 7, ❌ 8, ⚠️ 9, ❌ 10,
  ⚠️ 11, ✅ 12.
- Now: ✅ 1, 2, ⚠️ 3, ✅ 4, ✅ 5, ✅ 6, ⚠️ 7 (scaffolds green;
  not yet published), ❌ 8, ⚠️ 9, ⚠️ 10 (perf budget not in CI yet;
  needs the corpus), ⚠️ 11, ✅ 12.

Remaining v1.0 must-dos: publish (npm / crates.io / Go module tag;
Python binding stays clone-and-install), at least one editor
integration. Polish: split spec §3 into per-ADR files (#9), license
headers on generated artifacts (#11).

---

## 2026-04-25 — B0+B1+B2 scaffold

**Done:**

- `package.json` with `tree-sitter-cli ^0.25.0` dev dep and the
  `m-standard.schema_version="1"` pin (AD-04).
- `tree-sitter.json` with grammar metadata, language scope `source.m`,
  file extensions `.m / .mac / .int`. Bindings disabled — deferred to B6.
- `tools/build-grammar.js` consumes
  `~/projects/m-standard/integrated/grammar-surface.json`, validates
  the schema_version pin, and emits two artifacts:
    - `keywords.generated.js` — keyword arrays for grammar.js
      (commands 274, intrinsic_functions 354,
      intrinsic_special_variables 297, operators 17, pattern_codes 7
      = **949 unique forms**).
    - `src/grammar-metadata.json` — `concept:form -> [{canonical,
      standard_status, concept}, ...]` lookup table for downstream
      attribute stamping (AD-03).
- 7 forms collide within their concept (`H`, `HA` for HALT/HANG;
  `$ZCO`, `$ZDAT`, `$ZF`, `$ST`, `$ZST` for various functions / ISVs).
  Metadata stores all candidates per form; downstream consumers
  disambiguate by context (e.g. argument presence for HALT vs HANG).
- `grammar.js` hand-codes the §5 structural rules:
    - line shape (label, formals, leading-space body, trailing comment)
    - blank lines hidden via `_blank` rule (no anonymous `(line)` nodes)
    - command_sequence with single-space separator
    - postconditionals on commands (per-arg postconds deferred to B4)
    - strings (with `""` escape), integer/decimal/exponent numbers
    - local + global variables with subscripts
    - intrinsic + extrinsic function calls
    - left-associative binary expressions, prefix unary
    - `command_keyword`, `intrinsic_function_keyword`,
      `special_variable_keyword`, `operator` rules drawn from
      `keywords.generated.js`
- `tree-sitter generate` produces `src/parser.c` (759 KB) cleanly
  with one declared conflict (`[$.command_sequence]` for the
  command-separator vs comment-leading-space ambiguity).
- 33 corpus tests across 6 files (`test/corpus/{lines, commands,
  postconditionals, expressions, functions, special_variables}.txt`)
  pass at 100%.

**Deferred (intentional, per spec):**

- **Two-space rule** for argumentless commands chained on one line —
  `D ^FOO  Q` (call FOO, then quit). v0.1 biases right (consume args
  if anything follows), so `D X` always parses as `DO X` not bare
  `DO` followed by `X`. [B4]
- **Indirection** `@expr` and `@expr@(subscript)`. [B4]
- **Pattern-match operator** `?` and pattern atoms. [B4]
- **Dot-block nesting** for argumentless `DO`. [B4]
- **FOR-loop range syntax** `F I=start:incr:end`. The `:` here
  conflicts with postconditional `:` and needs context-sensitive
  handling. [B4]
- **Per-argument postconditionals** on DO/GOTO (`D ARG:cond,ARG2:cond2`). [B4]
- **AD-03 attribute stamping** at parse time. The metadata table
  exists (`src/grammar-metadata.json`); downstream consumers join
  AST tokens against it. A parse-time stamping helper can be added
  later. [B3 polish]
- **Case-insensitive keywords**. Real M code is virtually always
  uppercase; lowercase `break`/`Break` is not recognised in v0.1.
  [B4 polish]
- **Bindings** (Node, Rust, Python, Go) — `bindings: {}` in
  `tree-sitter.json` keeps the C parser only for now. [B6]
- **Error recovery tuning** for editor quality. [B5]

**Real-source smoke check:**

`tree-sitter parse m-standard/sources/sac/routines/XINDEX.m` parses
in ~10 ms (600 bytes/ms) with **112 ERROR nodes across 144 lines**.
The errors trace to deferred features above (FOR-loop ranges,
indirection, pattern matching, two-space chains, dot-blocks). The
parser recovers cleanly at each error and continues — the right v0.1
behavior. Real-source corpus assertions wait until B4 lands.

**Toolchain at this snapshot:**

- Node v24.14.1
- npm 11.11.0
- tree-sitter 0.25.10
- gcc 13.3.0 (Ubuntu 24.04)

**Ambient context:** the parent `m-standard` repo is at v1.0.0
(2026-04-25 tag) with `schema_version="1"`. Two-source integration
(AnnoStd + YottaDB); IRIS is in-progress for v2.0 but not yet in
the consumed `grammar-surface.json`.

---

## 2026-04-25 (later) — B3 + partial B4

**Done:**

- **B3** (AD-03 attribute stamping): `lib/stamp.js` exposes
  `lookup` / `lookupSingle` / `resolve` / `schemaVersion` for
  joining parser output against `src/grammar-metadata.json`. Surfaces
  the 7 known M abbreviation collisions (H → HALT/HANG, $D →
  $DEVICE/$DATA, $ST → $STACK/$STORAGE, $ZCO/$ZDAT/$ZF/$ZST in
  function/ISV namespaces) as multi-candidate results; callers
  disambiguate by context. 18 lib tests pass via `npm test`.
- **B4 (additive grammar parts):**
    - per-argument postconditionals on DO/GOTO arguments
      (`D LABEL:cond,LABEL2:cond2`)
    - FOR-loop range syntax (`F I=1:1:10`) via generalised
      `argument_postconditional` chain
    - indirection (`@X`, `@"Y"`, `@^G@(N)`, `@@X` nested)
    - pattern matching (`X?1A.E`, `X?1(1A,1N)`, `X?1'A`,
      `X?1"ABC"`) — all 7 standard codes plus any letter per AD-01
    - entry references (`LABEL^ROUTINE`, with optional subscripts)
    - WRITE format control (`!`, `#`, chains like `W !!`)
    - dot-block prefix recognition (` . S X=1`, ` .. cmd`)
    - trailing whitespace before EOL
    - `unary_expression` restricted to actual M unaries (`+ - '`)
- **Smoke gate**: VistA real-source corpus
  (`~/vista-meta/vista/vista-m-host/Packages` — 39,330 routines
  across 176 packages). Deterministic 1000-routine sample; ran after
  every feature land. **5.3% baseline → 21.3% clean (4x improvement).**
- **Coverage**: 66 corpus tests across 11 files
  (`test/corpus/{lines, commands, postconditionals, expressions,
  functions, special_variables, per_arg_postconds, for_ranges,
  indirection, pattern_match, entry_references, format_control,
  dot_blocks}.txt`) — 100% pass via `npm test:corpus`.

**Deferred to B5:**

The remaining 78.7% of failing files cluster around four issues that
need either an external scanner (`src/scanner.c`) or context-sensitive
disambiguation:

1. **Two-space rule** (`F  S X=1`, `D  Q`, `Q  ;comment`) — M's
   "two spaces after a command means it's argless; one space means
   args follow". Tried implementing via `_single_sp` / `_double_sp`
   tokens; works at the lexer level but conflicts with FOR's body
   syntax (`F I=1:1:10 W I` uses single space). Needs an external
   scanner that knows command type. Reverted; grammar uses a single
   `_sp` token with `prec.right` greedy-args bias.
2. **FOR body command** — same root cause as #1. Currently the body
   on the same line fails when the FOR has args.
3. **SET / KILL / MERGE list targets** (`S (A,B,C)=val`, `K (A,B)`)
   — tried adding a `tuple` rule; regressed smoke gate 2pp because
   of confusion with `parenthesized` / `subscripts`. Needs a
   command-context-aware approach.
4. **`?N` tab-to-column** in WRITE — collides with the
   pattern-match operator. Tried restricting RHS to number/parens;
   regressed smoke gate.

**Other deferred items (per spec):**

- AD-03 attribute stamping integration into a real Tree object
  (waits on B6 Node binding so the parser is loadable in JS)
- B5 error-recovery tuning for editor quality
- B6 bindings (Node, Rust, Python, Go) — scaffold-only without
  cross-platform CI verification
- B7 editor integrations — need explicit user direction (publishing
  to marketplaces / external PRs)

**Smoke-gate progression (1000-routine sample):**

| Milestone | Clean | Δ | Notes |
|-----------|------:|--:|-------|
| B0+B1+B2 baseline | 53 (5.3%) | — | structural grammar + keyword tables only |
| + per-arg postconds | 119 (11.9%) | +6.6pp | |
| + FOR ranges | 119 (11.9%) | +0.0pp | gated by other deferred features |
| + indirection + pattern match | 132 (13.2%) | +1.3pp | |
| + entry_reference + trailing sp | 183 (18.3%) | +5.1pp | big WRITE/DO unlock |
| + format_control | 216 (21.6%) | +3.3pp | |
| + dot-block prefix + unary restrict | 213 (21.3%) | -0.3pp | net stable |
| + two-space rule (external scanner) | 381 (38.1%) | +16.8pp | argless commands now disambiguated |
| + dot-block compact + spaced forms | 457 (45.7%) | +7.6pp | `.I X=1` and `. . N X` accepted |
| + negated comparison operators (`'=` etc.) | 532 (53.2%) | +7.5pp | `'=` `'<` `'>` `'[` `']` `']]` as binops |
| + multi-target SET/KILL/NEW lists | 569 (56.9%) | +3.7pp | `S (A,B,C)=v`, `K (A,B)`, `N (X,Y)` |
| + trailing-space-before-EOL via SP_TRAILING | 579 (57.9%) | +1.0pp | scanner emits SP_TRAILING for `Q ` + EOL pattern |
| **smoke-gate counter fix** (count MISSING, not just ERROR) | 363 (36.3%) | — | numbers above were inflated; this is the true corrected baseline |
| + by-reference parameter `.VAR` in arglists | n/a in old metric | n/a | landed pre-fix; reflected below |
| + `$S(cond:val,...)` colon-chain in function args | 551 (55.1%) | +18.8pp | from the corrected 36.3% baseline; biggest single fix in the project |

---

## 2026-04-26 — B5 sub: two-space rule via external scanner

**Done:**

- `src/scanner.c` — stateless external scanner emitting two tokens:
  `_sp1` (exactly one space) and `_sp2plus` (two or more spaces).
  Counts contiguous space chars; stops counting at 2 once over the
  threshold. Both required scanner-ABI hooks present
  (`create`/`destroy`/`serialize`/`deserialize`).
- `grammar.js` declares `externals: [_sp1, _sp2plus]`. The
  command-keyword-to-args gap is now `_sp1` (strict one space);
  `command_sequence` uses `_sp` = `choice(_sp1, _sp2plus)` (either
  separator). Net effect: an argless command followed by 2+ spaces
  parses as command-then-separator, while a command-with-args takes
  exactly one space before its arg list.
- 4 new corpus tests in `commands.txt` pin the rule:
  argless+command, argless+comment, FOR-with-body single-space,
  mixed argless-in-the-middle.
- Smoke gate jumped **21.3% → 38.1% clean (+16.8pp)** — the largest
  single feature win in the project so far. Confirms the two-space
  rule was the dominant blocker for B4.

**Why it works.** Tree-sitter's auto-generated lexer can't pick
between two regex tokens by parser context alone (longest-match wins
unconditionally). An external scanner can, because tree-sitter
passes `valid_symbols[]` per-state — so `_sp1` only fires where the
grammar declares it valid (the keyword-to-args slot), and `_sp2plus`
fires elsewhere. The grammar then naturally rejects 2+ spaces after
an argless-eligible keyword, forcing it to be the chain separator.

**Remaining post-two-space failures (619/1000, mostly 1 ERROR each):**

1. Multi-value FOR: `F II=2,5,10,101 ...` — comma-separated FOR
   iteration values (not the same as range form `start:incr:limit`).
2. Trailing-space-then-EOL after argless command: ` Q ` (single
   trailing space). Boundary case where _sp_ optional-trailing
   conflicts with command-keyword-to-args.
3. Space-separated dot-block prefix: ` . . N RCCARCD` (IRIS-style
   indent, two levels via dot-space-dot rather than `..`).
4. Long opaque chains using indirection in argument positions.

These are next-turn work; none required the scanner.

---

## 2026-04-26 (later) — B5 sub: dot-block prefix relaxation

**Done:**

- `tools/error-buckets.js` — categoriser that walks the smoke-gate
  sample and groups ERROR nodes by syntactic shape so we can pick
  the next high-yield grammar fix instead of guessing. First run
  showed the `other` bucket at 16,661 nodes — a single classifier
  miss because `.I X=1` (dot-immediately-followed-by-command) was
  matching no specific pattern. Inspection of examples revealed
  the actual root cause.
- `dot_block_prefix` regex relaxed from `/\.+ +/` to
  `/\.( *\.)*[ \t]*/` — accepts:
    - `. S X=1` (one dot, space, command)
    - `.. S X=1` (two dots, doubled)
    - `. . S X=1` (two dots, space-separated, IRIS style)
    - `.S X=1` (dot, no space, command directly)
  The trailing space is now optional and the inter-dot space too.
  The `.5` decimal case is unaffected because the `number` rule's
  match (`.5` = 2 chars) outscores `dot_block_prefix`'s match
  (`.` = 1 char) by length.
- 2 new corpus tests in `dot_blocks.txt` pin the compact form
  (`.S X=1`) and the space-separated form (`. . S Y=2`).
- Smoke gate **38.1% → 45.7% clean (+7.6pp)**. Second-largest
  feature win after the two-space rule.

**Tried and reverted:**

- Colon-chain in function-call args (`$S(cond:val,cond:val)`) —
  modified `_inner_arglist` to allow `expr (':' expr)*` per arg.
  Reverted twice (once before negated-ops, once after). Both
  attempts regressed the smoke gate -11.9pp and -12.7pp respectively;
  the regression survives the `'op` fix, so it is NOT entangled with
  negated operators (earlier hypothesis was wrong). Real cause is
  unidentified — corpus tests pass, real-world files break. Likely a
  GLR conflict-resolution shift that interacts badly with another
  unhandled construct (naked global refs `^(0)`, by-reference params
  `.VAR`, multi-target SET `S (A,B)=v`). Deferred until after those
  land — at which point colon-chain may "just work" or the regression
  may localise to a smaller set worth investigating.

---

## 2026-04-26 (later still) — B5 sub: negated comparison operators

**Done:**

- Added `'=` `'<` `'>` `'[` `']` `']]` to the `operator` rule. M
  allows prefix-`'` to negate comparison operators; m-standard's
  grammar-surface lists only the 17 base operators because the
  negation is morphological, but real M lexers produce these as
  compound tokens.
- Tree-sitter's longest-match resolves `A'=B` to `A` `'=` `B` (2-char
  op) rather than `A` `'` `=` `B`. Unary `'X` still works because
  the `'` followed by a non-operator char gets matched as the 1-char
  unary form.
- 1 new corpus test in `expressions.txt` exercises `'=`, `'<`, `']]`.
- Smoke gate **45.7% → 53.2% clean (+7.5pp)**.

---

## 2026-04-26 (later still) — B5 sub: SET/KILL/NEW list targets

**Done:**

- New `set_target_list` rule: `( expr (, expr)+ ) optional( = expr )`.
  Requires ≥2 elements (one comma minimum) so it doesn't shadow
  `parenthesized` for single-element `(A)=B` (which is a normal
  binary expression). `=` is optional because KILL and NEW use the
  list without an RHS: `K (A,B)`, `N (X,Y)`.
- `argument` rule now choices between the existing
  `expr [+ argument_postconditional]` and `set_target_list`. With
  static prec(3) on the list rule and LALR conflict resolution by
  required commas, no explicit conflict declaration was needed.
- 2 new corpus tests in `expressions.txt`: SET with 3-element list,
  KILL with 3-element list (no RHS).
- Smoke gate **53.2% → 56.9% clean (+3.7pp)**. Set-kill-list bucket
  dropped from 452 ERROR nodes to 29 (residual is nested in
  larger expressions).

**Re-tried colon-chain in function args, regressed again.**
Same -12pp regression even with negated-ops + set-kill in place,
confirming the regression isn't entanglement with those. The dirty
files I sampled were already broken pre-colon-chain (e.g. `?(expr)`
tab-to-column in WRITE, naked global refs `^(0)`). My theory: the
colon-chain change shifts LALR error recovery so files that
previously had a *contained* error now produce an error chain that
poisons the rest of the line. Worth investigating with
`tree-sitter parse --debug` later. Deferred.

---

## 2026-04-26 (later still still) — B5 sub: trailing-space + line shape

**Done:**

- New external token `SP_TRAILING` in `src/scanner.c`. After consuming
  spaces, the scanner peeks one char ahead. If that char is `\n`,
  `\r`, or 0 (EOF) AND the parser has `SP_TRAILING` in its valid
  symbols, emit `SP_TRAILING` instead of `SP1`/`SP2PLUS`.
- New `_sp_trailing` external in grammar.js, used ONLY in the line
  rule's pre-EOL slot: `optional($._sp_trailing), $._eol`.
  command_sequence's separator still uses `_sp` (SP1/SP2PLUS) so
  trailing whitespace can't be mistakenly absorbed into another
  command_sequence iteration.
- Restructured `line` and `_line_body` to hoist trailing-comment
  handling to line level (`optional($.comment)` between trailing-sp
  slots). The previous `optional(seq($._sp, $.comment))` inside
  `_line_body` was the LR-trap: the parser committed `_sp` into the
  optional, failed to find a comment, and couldn't unwind across an
  atomic `optional`. Hoisting gives `_sp` and `comment` independent
  optional slots.
- `_line_body` now has two branches: command_sequence (with optional
  dot-block prefix), or dot_block_prefix alone (for ` . ;text`
  patterns where the dot prefix has no command, just a trailing
  comment). Bare `;text` lines are matched by line-level
  `optional($.comment)` with no body.
- 4 new corpus tests in `lines.txt`: trailing-space after argless
  command, trailing-space after command-with-args, trailing-space
  after argless chain, dot-prefix-then-comment.
- Smoke gate **56.9% → 57.9% clean (+1.0pp)**. Modest jump because
  the trailing-space-eol bucket was only 59 errors, but it's a
  correctness fix more than a coverage one.

**Tried and reverted:**

- Extending `format_control` to accept `?N` (tab-to-column) and
  `*N` (ASCII char) in WRITE. With `_format_rhs = number`, the smoke
  gate dropped 57.9% → 56.6% — the GLR explored too many parses for
  `?` (which also opens pattern-match) and `*` (which is binary
  multiplication). The pattern-numeric error bucket dropped from
  1796 to 919 (real wins on simple `W !?5` cases) but the parser's
  exploration cost regressed neighbouring parses. Reverted; needs
  a tighter discriminator (e.g. only allow `?N`/`*N` immediately
  after `!` or `#` or at the start of a WRITE arg).

---

## 2026-04-26 (later still still still) — counter fix + by-reference + colon-chain

**Smoke-gate counter bug uncovered.** While debugging why colon-chain
in function args kept regressing the smoke gate, a per-file vs batch
diff showed the smoke-corpus tool was over-counting clean files by
~30pp. Root cause: `tools/smoke-corpus.js` counted `(ERROR` matches
in tree-sitter's `--quiet` output, but tree-sitter emits BOTH
`(ERROR ...)` and `(MISSING ...)` for failures. Files that produced
only `(MISSING ")"` (incomplete parse, e.g. unbalanced parens from
$S colon-chain failures) were silently counted as clean. Fixed to
count both — true clean rate dropped from 70.0% to 36.3% under the
same grammar. **All progression numbers above 36.3% in this log are
wrong** by varying amounts. Numbers from 2026-04-26 onwards are the
corrected ones.

**Done (real wins this turn, all confirmed under the fixed counter):**

- `by_reference` expression: `.VAR` (or `.VAR(subs)`) as an
  expression form. M's pass-by-reference parameter syntax — used
  pervasively in DO/JOB/$$ calls (`D LABEL(A,.B,C)`,
  `S X=$$F(.A,B)`). The dot is unambiguous against decimal numbers
  (`.5`) because the number rule's match wins by length when the
  next char is a digit; by_reference requires an identifier (letter
  or `%`) after the dot.
- `_inner_arglist` colon-chain: function-call arguments now accept
  `expr (':' expr)*` per arg, enabling `$S(cond:val,cond:val)` and
  similar patterns. Hidden via `_inner_arg` so colons appear as
  anonymous tokens in the AST. **+18.8pp on the corrected smoke gate
  (36.3% → 55.1%) — the largest single fix in the project.**
  Earlier attempts looked like -12pp regressions only because of the
  counter bug.
- 3 new corpus tests: `.VAR` in DO arglist, `.VAR` in extrinsic call,
  $S with colon-paired args.

**Re-tried + reverted format_control extension** (`?N`/`*N`). Even
under the corrected counter, real -2.4pp. The extension still has
the GLR-over-exploration problem. Needs a tighter discriminator;
deferred again.

---

## 2026-04-26 (later × 7) — naked refs + empty args + numeric labels

**Done:**

- Naked global ref `^(...)` — global_variable now accepts either
  `IDENT (subs?)` (named) or `subs` (naked, last-used global). Common
  in VistA. **+14.3pp** (55.1% → 69.4%).
- Empty/omitted argument slots in `subscripts` and `_inner_arglist`.
  `D UPDATE^DIE(,"X","Y")` (entry-ref skips first param) and
  `$$F(,"X")` (extrinsic skips first). subscripts uses
  `optional($._expression)`; `_inner_arglist` uses a two-branch
  choice (starts-with-arg vs starts-with-comma) so tree-sitter's
  empty-rule prohibition doesn't fire. **+6.2pp combined**.
- Numeric labels `5 S X=1`. M allows pure-numeric labels ("line
  number" labels), used in VistA. The label rule now accepts either
  identifier-style or `\d+`. The numeric branch is wrapped in
  `token(prec(-1, ...))` so a numeric literal in expression
  position (`S X=5`) wins over treating `5` as a label — labels are
  only valid in line's first choice branch where the LR state
  specifically asks for a label. **+3.4pp** (75.6% → 79.0%).
- 3 new corpus tests: omitted-first-arg, naked global, numeric label.

**Tried again and reverted (third time):** format_control extension
to accept `?N`/`*N`. Restricted RHS to number / local_variable /
parenthesised; still regressed -4.5pp. The fundamental issue is GLR
over-exploration: `?` and `*` both have multiple parser-state
interpretations and adding a new one widens the state space enough
to mis-recover on neighbouring tokens. Likely needs a new external
scanner state ("inside WRITE arg") to gate emission.

**Smoke-gate progression (corrected counter, 1000-routine sample):**

| Milestone | Clean | Δ |
|-----------|------:|--:|
| Counter fix baseline (was 70.0% inflated) | 363 (36.3%) | — |
| + `$S(cond:val,...)` colon-chain + by-ref | 551 (55.1%) | +18.8pp |
| + naked global ref `^(...)` | 694 (69.4%) | +14.3pp |
| + empty-arg slots (subscripts + arglist) | 756 (75.6%) | +6.2pp |
| + numeric labels (`5 S X=1`) | 790 (79.0%) | +3.4pp |

---

## 2026-04-26 (later × 8) — format-tab + negated pattern match + multi-letter pattern code

**Done (single commit, three related fixes):**

- **`?expr` tab-to-column in WRITE** via external-scanner-gated
  FORMAT_TAB token. Three earlier pure-grammar attempts regressed
  by -2.4pp to -4.5pp because `?` literal also opens pattern_match,
  so a second grammar-level interpretation widened the GLR state
  space and mis-recovered neighbouring tokens. The fix: scanner
  emits FORMAT_TAB only when valid_symbols declares it (i.e. at the
  start of a `format_atom` inside `format_control`); pattern_match's
  binary `?` reaches the auto-lexer untouched because FORMAT_TAB is
  not valid in expression-after position. New `format_tab` rule:
  `seq($._format_tab, $._expression)`. Conflict declared
  `[$.format_tab, $.pattern_match]` — at runtime only the
  format-atom branch can consume FORMAT_TAB so the pattern_match
  fork dies cleanly. **+9.5pp (79.0% → 88.5%).**
- **Negated pattern match `'?`** as a 2-char compound operator,
  mirroring `'=`/`'<`/etc. for comparisons. VistA's input
  validators are full of `STR'?pattern`. Added as a `choice('?',
  "'?")` in `pattern_match`. Longest-match resolves `X'?p` to `X`
  `'?` `p` rather than `X` `'` `?` `p` (which would require unary
  `'` after an expression — invalid). **+4.8pp (88.5% → 93.3%).**
- **Multi-letter pattern codes** `?.ANP` for "any of A, N, or P
  chars". M's standard is one letter per atom, but YDB and IRIS
  de-facto allow concatenated letters as a character class, and
  VistA uses this pervasively. `pattern_code` now uses
  `repeat1($.pattern_letter)` — each letter stays its own
  pattern_letter node so AD-03 stamping can resolve standard_status
  per letter. **+2.7pp (93.3% → 96.0%).**
- Combined session delta: **79.0% → 96.0% (+17.0pp).** The
  remaining ~4% is dominated by IRIS object-method syntax
  (`OBJ.Method()`, `OBJ.Property=val`) — out of scope until
  m-standard ships v2.0 with IRIS data.
- 7 new corpus tests across `format_control.txt` (5) and
  `pattern_match.txt` (2). 92 corpus tests total, 100% pass.

**Smoke-gate progression (this session):**

| Milestone | Clean | Δ |
|-----------|------:|--:|
| (start of session) | 790 (79.0%) | — |
| + `?expr` tab-to-column via FORMAT_TAB external | 885 (88.5%) | +9.5pp |
| + negated pattern match `'?` | 933 (93.3%) | +4.8pp |
| + multi-letter pattern code `?.ANP` | 960 (96.0%) | +2.7pp |

---

## 2026-04-26 (later × 9) — pure-M residual sweep

**Context.** After bucket-checking the 40 residual failing files, only
3 actually used Caché ObjectScript markers (`##class`, `OBJ.Method()`,
`$Z*`). The other 37 were pure standard M failing for fixable reasons
— previous "deferred" framing was wrong. Earlier memory claim that
"VistA is overwhelmingly Caché/IRIS dialect" was inaccurate; >95% of
VistA is pure standard M.

**Done (single session, six related fixes — pattern dominated by
"add to existing union, declare conflicts as needed"):**

- **Numeric label entry-reference** (`D 2^FBAAUTL1`, `G 1^DIE17`).
  Older VistA routines use integer line-number labels exclusively.
  `entry_reference` now accepts `choice($.identifier, $.number)` for
  the label part. `2.5^X` is malformed but syntactically benign per
  AD-01.
- **Star-prefixed READ argument** (`R *VAR` reads a single character
  code into VAR). Added `*` to unary operators alongside `+`/`-`/`'`.
  Binary `*` (multiplication) still works because expression-after
  position never expects unary. Side-benefit: WRITE's `*N` (output
  ASCII char) now also parses as unary star + number, so the
  long-deferred `*N` format atom is implicitly handled.
- **LOCK with prefix on parenthesised list** (`L -(A,B)` releases
  multi-target lock, `L +(A,B)` acquires incrementally). `argument`
  rule's set_target_list branch now accepts an optional `+`/`-`
  prefix.
- **Case-insensitive keywords** (`s X=1`, `Quit`, `$g(Y)`). M's
  standard says keywords are case-insensitive (AnnoStd 6.1) and real
  routines mix cases. Each keyword string maps to a regex like
  `[Ss][Ee][Tt]` via a `ci()` helper in grammar.js; operators and
  pattern codes already accept both cases via existing regexes.
  `lib/stamp.js` normalises form via `text.toUpperCase()` before
  metadata lookup.
- **`$$^routine` and `$$@expr` extrinsic forms** (no label /
  indirection-as-label). `$$^FOO()` is common in single-entry
  libraries; `$$@TAG^FOO` shows up in dispatch tables.
- **Indirection in entry_reference, by_reference, and pattern**:
  `D @LBL^RTN`, `.@VAR` (by-ref of indirected var), `X?@P` (pattern
  computed at runtime). Three ambiguity-class additions; tree-sitter
  required conflict declarations for the optional-subscripts
  shift-reduce on local_variable / global_variable / by_reference /
  entry_reference, plus the function/SV shared-token conflict that
  case-insensitive lex made visible.
- 8 new corpus tests (numeric label, indirection-label,
  `$$^FOO`, `$$@STAG`, multi-atom pattern alt-branch, lowercase
  command, mixed-case command, lowercase intrinsic). 100 corpus
  tests total, 100% pass.
- Combined session delta: **79.0% → 99.0% (+20.0pp).** The 10
  remaining residual ERROR nodes are: 1 ObjectScript object-method
  (out of scope — ObjectScript is a separate scripting language on
  top of M and gets its own sibling grammar, not coverage here),
  3-4 vendor commands/functions not in m-standard yet (`ZW`
  abbreviation, `$ZU`, `$ZCALL`), and 3 `D ;...` argless-DO-with-
  comment shift-reduce edge cases.

**Smoke-gate progression (cont'd):**

| Milestone | Clean | Δ |
|-----------|------:|--:|
| + numeric label entry-ref + `*var` unary + LOCK prefix | 978 (97.8%) | +1.8pp |
| + case-insensitive keywords + `$$^routine` | 983 (98.3%) | +0.5pp |
| + entry-ref/by-ref/pattern indirection + alt-branch seq | 990 (99.0%) | +0.7pp |

---

## 2026-04-26 (final) — full-corpus baseline + Kernel bucket triage

**Full-corpus run** (all 39,330 VistA routines, 162 MB, 36.8s wall,
4.4 MB/s with `tree-sitter parse --quiet` per-batch):

```
clean (no ERROR nodes):  38,697  (98.39%)
with errors:                633
```

The 1000-routine sample overstated coverage by **0.6pp** (99.0% →
98.39%). Not catastrophic; the deterministic stride-sample isn't
badly skewed but does miss some Kernel-heavy patterns.

**Per-package concentration.** Top 6 packages account for 51% of
failing files: Kernel (112 files), Uncategorized (105), Scheduling
(42), Registration (22), Capacity Management (21), Integrated
Billing (20). ~100 packages — every clinical package — are 100%
clean. The grammar handles standard clinical VistA M without
exception.

**Kernel bucket triage** (871 raw ERROR nodes across 112 files):

| Nodes | Bucket | Disposition |
|---:|---|---|
| 535 | "other" — dominated by `$PD`/`$PT`/`$PX` greedy lex | Kernel-specific local-var convention; not standard M |
| 137 | Vendor `$Z*` functions (`$ZBITOR`, `$ZGETSYI`, `$ZC`) | m-standard data, not parser |
| 84+62 | ObjectScript (`OBJ.Method()`, `##class`, `&sql`) | Out of scope per scope-lock |
| 28+6 | `U`/`O` with `:(param:list)` I/O parameters | **Real M, parser-fixable** |
| 11 | `ZW` abbreviation of ZWRITE | m-standard data |
| 5 | Complex indirection `@TAG+1^@RTN` | Label+offset deferred per spec |

**Key finding: the residual is overwhelmingly NOT parser bugs.**
- ObjectScript (~146 nodes) — out of scope, will never be in scope
- Vendor `$Z*` / `ZW` (~148 nodes) — needs m-standard data updates
- `$PD`-style Kernel idioms (~535 nodes) — non-standard M; either
  Kernel patches or treat as known-residual
- USE/OPEN parameters (~34 nodes) — the only sizeable parser-side
  fix worth pursuing

**Recommendation for v1.0:** ship at 98.39%. The full-corpus number
is the documented baseline. The USE/OPEN I/O parameter fix is the
one pure-grammar opportunity left and could go in either v1.0 or a
v1.1 patch. Everything else is upstream (m-standard) or out of
scope (ObjectScript) or non-standard M (Kernel `$PD` idiom).

---

## 2026-04-26 (later × 10) — vendor SV extension + USE/OPEN I/O params

**Done (two related grammar fixes):**

- **Kernel `$PD`/`$PT`/`$PM`-style vendor SV extension.** The lexer
  was eating `$P` as the keyword and choking on the trailing letter.
  First attempt — adding a `vendor_dollar_identifier` regex token
  with `prec(-1)` — failed because tree-sitter's lexer applies
  precedence DOMINANT over length, so a low-prec longer match still
  loses. (Confirmed empirically: `prec(-1)` made vendor lose to
  `$P` keyword on every input.) Negative lookahead `(?!...)` would
  have worked but tree-sitter's regex engine explicitly rejects
  look-around. Final approach: parser-rule-level fix — extend
  `special_variable` to optionally accept a trailing
  `vendor_sv_extension` (`/[A-Za-z][A-Za-z0-9]*/`) after the
  keyword. GLR explores both shapes; the vendor branch wins when
  trailing letters follow a keyword (`$PD` parses as `$P` keyword
  + `D` extension), the canonical branch wins otherwise.
  **+0.04pp file-clean rate** (smaller than predicted because each
  `$PD`-using file usually has many other Kernel idioms too).
- **USE/OPEN with parenthesised I/O parameters** (`U $I:(NOLINE:ESCAPE)`,
  `O DEV:(::0)`, `U $I:(VT=1:ESCAPE=1)`). New `io_param_list` rule
  in the `argument_postconditional` colon-chain. Requires ≥1 colon
  inside parens to distinguish from a regular `parenthesized`
  expression. Slots may be empty (`(::0)` is "skip param 1, skip
  param 2, value 0").
- 4 new corpus tests (1 vendor SV extension, 3 I/O parameter
  variants). 104 corpus tests total, all pass.
- Combined: **98.39% → 98.49% (+0.10pp)** on the full 39,330-routine
  VistA corpus. 633 → 594 failing files.

**Lessons learned about tree-sitter regex / token-level prec.**
Both lessons (and the patterns we used to work around them) are
written up in `docs/tree-sitter-notes.md` as durable reference for
future grammar work — read that before adding any rule that involves
overlapping regex tokens, keyword vs identifier disambiguation, or
context-sensitive recognition. Short version:

- **Token precedence DOMINATES length-based tiebreaking** — opposite
  of parser rule precedence. A `prec(-1)` lexer regex loses to any
  higher-prec token regardless of which one is longer. Empirically
  confirmed: `vendor_dollar_identifier` with `prec(-1)` lost to the
  shorter `$P` keyword on every input. The mental model "longest
  wins, prec breaks ties" is wrong; the actual rule is "highest
  prec wins, length breaks ties WITHIN equal-prec." Implication:
  precedence is not a soft preference — it's an absolute filter,
  and "fallback regex via low prec" doesn't work. Push fallback
  disambiguation into parser-rule alternatives (GLR) instead.
- **Look-around is rejected at generate time** — `(?!...)`,
  `(?=...)`, `(?<...)`, `(?<=...)`, and backreferences all error
  out with an explicit message. Tree-sitter's regex compiles to
  finite automata; look-around requires non-finite state or
  back-tracking, breaking the linear-time guarantee. Workaround
  patterns: push to parser GLR alternative, use an external
  scanner with byte-level lookahead, or restructure regexes to be
  disjoint by required structure. The `special_variable +
  optional vendor_sv_extension` pattern from this commit is the
  GLR-alternative approach; `io_param_list` requiring `repeat1` of
  colons is the disjoint-by-structure approach.

---

## 2026-04-26 (later × 11) — pure-grammar residual cleanup

After bucketing the 584 ERROR nodes that remained at 98.49%, four
distinct pure-grammar patterns were fixable without scope changes:

- **Empty-slot postconditional** (`::N` in `J EN^FOO::5`,
  `O IO::1`, `U IO::"TCP"`). The `argument_postconditional` rule
  required an expression after each `:`. Real M permits empty
  slots — `::N` is "skip param 1, use N as param 2" for JOB
  timeouts and inline OPEN/USE positional params. Made every chain
  slot `optional()`. **+24 files clean.**
- **Comparison shorthands** `>=`, `<=`, `!=`, plus negated logical
  ops `'&` / `'!`. m-standard's grammar-surface still ships only
  the base comparison set (`<`, `>`, `=`, ...) and the negated
  morphological compounds (`'<`, `'>`, `'=`, `'[`, `']`, `']]`),
  but real VistA / YDB / IRIS code uses `>=`/`<=`/`!=` heavily.
  Added explicit choices in the `operator` rule alongside the
  negated forms. **+105 files clean — biggest single win this
  round.**
- **Numeric local-label call** `D 12(arg1,arg2)` and **numeric
  extrinsic** `$$509(N,RX)`. Older VistA routines use integer
  line-number labels exclusively. Added `numeric_label_call` rule
  (`number subscripts`) to `_expression`, and a `number` choice in
  `extrinsic_function`. **+20 files clean.**
- **System globals + indirected globals** `^$JOB(X)`,
  `^$ROUTINE(R)`, `^@expr(...)`. The system-global form is a
  YDB/IRIS extension; indirected globals (`^@G`) appear in dispatch
  tables. Added two more choices to `global_variable`'s post-`^`
  branch. Also: extended `entry_reference`'s routine slot to
  accept `indirection` so `@TAG^@RTN` parses cleanly (real M
  pattern in indirection-heavy dispatch code). **+16 files clean.**

Combined: **98.49% → 99.06% (+0.57pp; 165 files cleaned).** 6 new
corpus tests, 110 corpus tests total, all pass.

**Smoke-gate progression (cont'd):**

| Milestone | Clean | Δ |
|-----------|------:|--:|
| (vendor SV extension + USE/OPEN params) | 38,736 (98.49%) | — |
| + empty-slot `::N` postconditional | 38,760 (98.55%) | +0.06pp |
| + `>=`/`<=`/`!=`/`'!`/`'&` operators | 38,865 (98.82%) | +0.27pp |
| + numeric label-calls + system globals + ^@expr | 38,901 (98.91%) | +0.09pp |
| + indirection in entry-ref routine + `$$NUM` extrinsic | 38,959 (99.06%) | +0.15pp |

**Remaining residual (~371 files / ~370 ERROR nodes), by class:**

- ~150-200 ObjectScript (`OBJ.method()`, `##class`, `&sql`,
  `.code`-style property access). **Out of scope** per the
  scope-lock decision (separate `tree-sitter-objectscript` grammar
  is the right home).
- ~80 vendor `$Z*` functions (`$ZBITOR`, `$ZGETSYI`, `$ZC`, `$ZU`,
  `$ZCALL`) plus `ZW` command. **Upstream** — m-standard's
  grammar-surface needs these added.
- ~50 odd patterns (malformed `F  FHDEL=0:0`, complex nested
  indirections, `&(...)` ampersand-paren extension, various
  WRITE format-control edge cases like `?I#2*40`). Some
  fixable in principle but each is one-off; diminishing returns.

99.06% is the natural plateau for the parser's actual scope.

---

## B5 retrospective — phase-level lessons (end of B5)

**Phase outcome:** 5.3% (B0+B1+B2 baseline) → **99.06%** clean on
the full 39,330-routine VistA corpus. ~93pp gain over the B5 phase.
v1.0 grammar work is substantively complete; B6 (bindings) and B7
(editor integration) are the remaining critical-path items for
release.

Cross-cutting lessons worth carrying forward into B6 / future
grammar work / future tree-sitter projects:

### Workflow — bucket then fix

`tools/error-buckets.js` was the most valuable tool this phase. It
walks the smoke-gate residual, groups ERROR nodes by syntactic
shape, and reports counts. Given a pile of failing files, the
intuitive thing is to pick one and start fixing — but you'll spend
time on a one-off when there's a 100-node pattern next door.
Bucketing first turned every fix into "this addresses the largest
class of remaining failures." Repeated cycle: smoke-gate → bucket
→ pick the highest-yield class → fix → re-smoke → re-bucket.

The categoriser regexes need tightening as the residual shifts. As
the obvious patterns get fixed, the remaining "other" bucket needs
sub-classification. Don't be afraid to throw away the categoriser
rules and rewrite them once the previous cycle's top buckets are
gone.

### Workflow — measurement integrity matters more than fix speed

The `(MISSING ...)` counter bug (smoke gate counted only `(ERROR ...)`
nodes, not `(MISSING ...)`) made several "regressions" appear that
were actually fixes. Investigating phantom regressions with the
wrong measurement tool wasted real time. After the fix the apparent
70% became a true 36.3% — and the colon-chain change that "kept
regressing" turned out to be the largest single feature win in the
project (+18.8pp).

`feedback_verify_metric_first.md` captures this as a durable rule.
When a change has a smaller-than-plausible impact or appears to
regress in a way that contradicts the plausible effect, suspect
the measurement before reverting.

### Workflow — sample for iteration, full corpus for milestone calls

The 1000-routine deterministic stride sample runs in ~1 second and
is great for tight iteration. The full 39,330-routine corpus runs
in ~34 seconds and is the source of truth for milestone numbers.

The sample slightly overstates coverage because the stride skews
away from idiom-heavy packages (Kernel was the biggest offender).
At end-of-B5 we measured 99.0% on the sample but 98.49% on the
full corpus — 0.6pp gap. Not catastrophic but worth knowing before
declaring a milestone hit.

Rule: iterate on the sample, gate on the full corpus.

### Architecture — AD-01 (the parser recognises the union) held up

The hard rule from the spec — accept everything M's data sources
include, defer subsetting to the linter — turned out to be exactly
right. Every time the grammar tried to be clever about distinguishing
"valid" vs "invalid" M, it created shift-reduce conflicts and missed
real-world patterns. Examples:
- `5.5^X` is a malformed numeric label (decimals can't be labels)
  but allowing `number` in entry_reference's label slot is benign;
  the linter rejects.
- `'?` (negated pattern match) isn't in m-standard's operator list
  because the negation is morphological, but the parser treats it
  as a compound token and the linter never has to know.
- `>=` / `<=` / `!=` aren't in standard M's operator table but
  show up in 100+ VistA routines; the parser accepts and the
  linter flags them as YDB/IRIS extensions.

**Generalisation:** when in doubt about whether a syntactic shape
should parse, parse it. The parse tree captures structure; the
linter applies policy.

### Architecture — when grammar can't disambiguate, push to the parser via GLR

Tree-sitter's lexer applies token precedence DOMINANT over length
(see `docs/tree-sitter-notes.md` §1) and rejects regex look-around
(§2). The result: many natural "match X unless Y comes next"
disambiguations can't be expressed at the lexer level.

Pattern that worked repeatedly: define a shorter "canonical" rule
and a longer "vendor extension" rule that share a common prefix,
let GLR fork at the ambiguous point, declare the conflict, and
let downstream context prune the wrong branch. Used for:
- `special_variable` + optional `vendor_sv_extension` (Kernel `$PD`)
- `format_tab` vs `pattern_match` at `?` (the `[$.format_tab,
  $.pattern_match]` conflict)
- Optional-subscripts on every expression-form rule
  (local_variable, global_variable, by_reference, entry_reference,
  special_variable, vendor_dollar_identifier all need this)

### Architecture — external scanner with `valid_symbols` is more powerful than it looks

The external scanner sees `valid_symbols[]` from the parser and
can choose whether to emit a token based on parser state. This
sidesteps the lexer-precedence problem entirely — emission is
binary, not ranked. Used for three problems where pure-grammar
solutions failed:
- Two-space rule (`SP1` / `SP2PLUS` for argless commands)
- Trailing whitespace before EOL (`SP_TRAILING`)
- `?expr` as WRITE tab-to-column vs binary pattern-match operator
  (`FORMAT_TAB`)

Each of these had multiple regressing pure-grammar attempts before
the scanner approach landed. Lesson: when an ambiguity is parser-
state-dependent and your three grammar-only attempts have all
regressed, stop trying grammar tweaks and write a 20-line external
scanner case.

### Architecture — vendor extensions and idioms

The cleanest bright line for "in scope" turned out to be: if real
M code on YottaDB or IRIS's M layer compiles and runs, the parser
should recognise the syntactic shape. This includes:
- Case-insensitive keywords (`s X=1`)
- Multi-letter pattern codes (`?.ANP`)
- Compound comparison operators (`>=`, `<=`, `!=`)
- Vendor `$P`-prefixed pseudo-ISVs (`$PD`, `$PT` Kernel idiom)
- Numeric local labels (`D 12(args)`)
- System globals (`^$JOB`, `^$ROUTINE`)
- USE/OPEN parenthesised parameters (`U $I:(NOLINE:ESCAPE)`)
- Empty-slot postconditional chains (`O IO::1`)

Not in scope (after the 2026-04-26 scope-lock):
- Anything that requires understanding ObjectScript's class system
  (`##class`, `obj.method()`, `obj.property=val`, `&sql`).

Borderline cases that ended up in scope: `'?` (negated pattern
match), `'!` / `'&` (negated logical OR / AND). Borderline cases
deferred: `LABEL+offset^ROUTINE` (label-with-offset entry refs —
small bucket, GLR conflicts with binary `+` inside parens).

### What's left for B5 (deferred to post-B6)

Per spec §14, B5 also includes "error recovery tuning for editor
quality." Coverage tuning naturally improves error recovery
(tighter ERROR-node scoping when more constructs parse cleanly),
but the **editor-typing experience** — type a half-line in a real
editor, see the partial tree, verify the surrounding context isn't
corrupted — hasn't been profiled. That work depends on B6: a Node
binding embedded in a real editor extension or REPL where
interactive typing is testable. Will return to this after B6.

### What's queued for upstream (m-standard)

The m-parser project found these gaps in m-standard's
grammar-surface during B5. Worth filing tracking notes upstream:

- `ZW` (ZWRITE 2-char abbreviation) — present in YDB/IRIS, missing
  from current export.
- `>=`, `<=`, `!=` comparison shorthands — present in YDB/IRIS,
  missing from current operator export.
- `'!`, `'&` negated logical operators — same.
- `$ZBITOR`, `$ZGETSYI`, `$ZC`, `$ZU`, `$ZCALL` — vendor `$Z*`
  functions used in Kernel routines, missing from current export.

m-parser added the comparison/logical extensions explicitly in
`grammar.js`'s `operator` rule because they show up in 100+
routines, but they should ultimately come from the data table.
The `$Z*` functions stay as ERROR nodes until m-standard ships a
fix.

---

## 2026-04-26 (later × 12) — repo + project rename: m-parser → tree-sitter-m

**Done:**

- Renamed GitHub repo from `m-parser` to `tree-sitter-m` via
  `gh repo rename tree-sitter-m`. GitHub auto-redirects the old URL,
  so existing clone refs (which used `m-parser`) keep working until
  rotated.
- Renamed local working directory `~/projects/m-parser` →
  `~/projects/tree-sitter-m`.
- Updated git remote URL to `git@github.com:m-dev-tools/tree-sitter-m.git`,
  renamed remote from `m-parser` to `origin` (standard convention).
- Renamed local branch `master` → `main` to match the GitHub remote
  default and the broader ecosystem standard (every modern
  `tree-sitter-<lang>` repo uses `main`).
- Created auto-memory symlink at the new path
  (`~/.claude/projects/-home-rafael-projects-tree-sitter-m/memory →
  ~/claude/memory`) to keep the persistent-memory mechanism working
  for the renamed dir.
- Rewrote all in-repo references from `m-parser` to `tree-sitter-m`
  in: `README.md`, `CLAUDE.md`, `STATUS.md`, `docs/spec.md`,
  `docs/tree-sitter-notes.md`, `tree-sitter.json`, `Makefile`,
  `lib/stamp.js`, `tools/build-grammar.js`, `tools/smoke-corpus.js`.
  Tightened a few prose redundancies that the mechanical rewrite
  introduced (e.g. the `m-standard → m-parser → tree-sitter-m npm
  package` diagram became `m-standard → tree-sitter-m → bindings`).
- Existing build-log entries above this one keep the historical
  `m-parser` name as a matter of record; the front-matter note added
  in this commit explains why.

**Why now (industry alignment):**

The standard tree-sitter ecosystem convention is one repo per
grammar named `tree-sitter-<lang>`: `tree-sitter-javascript`,
`tree-sitter-python`, `tree-sitter-rust`, etc. The published package
name (`tree-sitter-m` in `package.json`) was already correct; only
the repo name and the local directory diverged from convention. With
B6 bindings imminent (npm publication will start putting the package
in front of consumers), this is the cleanest moment to align —
discovery flow becomes "google tree-sitter m grammar → npm
`tree-sitter-m` → `github.com/m-dev-tools/tree-sitter-m`" with no name
mismatch.

**Memory updated:**

- `~/claude/memory/project_m_parser.md` →
  `~/claude/memory/project_tree_sitter_m.md` (renamed file +
  in-content references updated).
- `~/claude/memory/project_m_parser_vista_corpus.md` →
  `~/claude/memory/project_tree_sitter_m_vista_corpus.md` (same).
- `~/claude/memory/MEMORY.md` index entry updated.

**No grammar / parser changes** — this is purely a naming refactor.
Smoke gate still 99.06% on the full 39,330-routine VistA corpus.
110 corpus tests still pass.
