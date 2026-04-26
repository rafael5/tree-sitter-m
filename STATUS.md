# tree-sitter-m status

Snapshot of where the project sits against `docs/spec.md`. Updated
on commit; the live progression history lives in `docs/build-log.md`.

**Headline.** Real-source coverage at **99.06% clean on the full
39,330-routine VistA corpus**. All grammar work for v1.0 scope is
effectively complete; remaining work is delivery (bindings, CI,
editor integration) plus a few small fit-and-finish items.

**Residual analysis** (371 failing files): the bulk is **out of
scope** (ObjectScript: `OBJ.method()`, `##class`, `&sql`) or
**upstream** (vendor `$Z*` functions and `ZW` abbreviation missing
from m-standard's grammar-surface). 100% of clinical packages parse
cleanly. The grammar opportunities flagged at the 98.39% baseline
have all landed: Kernel `$PD`-style vendor SV extension, USE/OPEN
`:(param:list)`, empty-slot postcond `::N`, comparison shorthands
`>=`/`<=`/`!=`/`'!`/`'&`, numeric local-label calls `D 12(args)`,
`$$NUM` extrinsic, system globals `^$JOB`/`^$ROUTINE`, indirection
in entry_reference's routine slot.

---

## Milestone status (spec §14)

| | Milestone | Status | Notes |
|---|---|---|---|
| B0 | Repo skeleton, ADRs, m-standard pin | ✅ done | AD-01..06 written into `docs/spec.md §3`; not yet split into per-ADR files (see TODO). |
| B1 | Hand-coded language structure | ✅ done | Line shape, label/formals, comments, strings, numbers, postconditionals all covered. |
| B2 | `tools/build-grammar.js` + keyword tables | ✅ done | 949 forms generated from `m-standard/integrated/grammar-surface.json` (`schema_version="1"` pin). |
| B3 | AD-03 attribute stamping | ⚠️ partial | `lib/stamp.js` exposes `lookup` / `lookupSingle` / `resolve` / `schemaVersion` against `src/grammar-metadata.json`. Stamping is **post-parse** (consumer joins the AST against the metadata table); it is **not** materialised onto the parse tree itself. Per-binding integration waits on B6. |
| B4 | Indirection, dot-blocks, pattern matching | ✅ done | `@expr` / `@expr@(subs)` / `@@x` nesting; dot-block prefix accepts `.`/`..`/`. .`/`.S X=1`; pattern matching with multi-letter codes, alternation with multi-atom branches, `'?` negation, and `?@expr` runtime indirection. |
| B5 | Real-source coverage + error recovery | ⚠️ partial | Coverage tuning landed (5.3% → 99.0% on the VistA smoke gate). Error-recovery *tuning* (the editor-quality experience for partial-source typing) hasn't been explicitly tuned beyond tree-sitter defaults. |
| B6 | Bindings (Node, Rust, Python, Go) | ❌ not started | `tree-sitter.json` has all bindings disabled except `c`; no `bindings/` directory yet. |
| B7 | Editor integrations | ❌ not started | Depends on B6 + a published npm package. |
| v1.0 | Tag and release | ❌ blocked on B6 + B7 + CI | See success-criteria checklist below. |

---

## Spec §5 (language structure) coverage

| §5 rule | Status | Implementation |
|---|---|---|
| 5.1 Routine structure | ✅ | `line` / `label` / `formals` / leading-space body, line-level trailing comment via SP_TRAILING external |
| 5.2 Command sequence | ✅ | `command_sequence`, two-space rule via external scanner (`_sp1` / `_sp2plus`) |
| 5.3 Comments | ✅ | `comment` (`;...`), bare line-start comments, doubled-semicolon docs |
| 5.4 String literals | ✅ | `string` with `""` escape |
| 5.5 Numeric literals | ✅ | integer / decimal / leading-dot / exponent |
| 5.6 Indirection | ✅ | `@expr`, `@expr@(subs)`, nested `@@`, indirection-as-label / -in-by-ref / -in-pattern |
| 5.7 Dot-block nesting | ✅ | structural prefix only — depth-vs-enclosing-scope validation deferred to a downstream pass (per spec) |
| 5.8 Pattern matching | ✅ | repeat counts, codes (multi-letter), strings, alternation (multi-atom branches), `'` negation per atom, `'?` negated match, `?@expr` indirection |

Plus dialect-spread features that aren't called out as their own
§5 subsection but matter in real M: per-argument postconditionals
(DO/GOTO `LABEL:cond`), FOR-loop range syntax (`F I=1:1:N`),
entry references (with identifier, numeric, or indirection labels),
extrinsic `$$` in all forms (`$$LABEL`, `$$LABEL^RTN`, `$$^RTN`,
`$$@expr[^RTN]`), WRITE format control (`!`, `#`, `?expr`,
`*expr`), READ `*var`, LOCK `+/-(targets)`, SET/KILL/NEW
multi-target lists, by-reference parameters (`.VAR` / `.@VAR`),
naked global refs (`^(...)`), case-insensitive keywords.

---

## v1.0 success criteria (spec §16)

| # | Criterion | Status |
|---|---|---|
| 1 | Grammar source from `m-standard` (`schema_version` pinned, every keyword present) | ✅ |
| 2 | All §5 hand-coded rules implemented and tested | ✅ |
| 3 | Every recognised keyword node carries `canonical_name`, `matched_form`, `standard_status` | ⚠️ post-parse via `lib/stamp.js`; not materialised on the tree |
| 4 | Real-source corpus parses cleanly (XINDEX, VistA Kernel, YottaDB sample) | ✅ at 99.0% on 1000 VistA routines; XINDEX-only assertion not yet a CI gate |
| 5 | Per-tier coverage gate (every `(canonical_name, standard_status)` pair has a corpus test) | ❌ not implemented |
| 6 | Performance: 10k-line routine under 100ms | ❓ unmeasured (smoke gate parses 4 MB / 1000 files in ~0.8s, so likely fine, but not asserted) |
| 7 | Bindings published (`npm install tree-sitter-m`, etc.) | ❌ |
| 8 | Editor demonstration (VS Code extension or nvim-treesitter PR) | ❌ |
| 9 | ADR set complete (AD-01..06 documented) | ⚠️ described in `docs/spec.md §3`; not split into per-ADR files |
| 10 | CI gates (build + corpus + coverage + perf budget on every PR) | ❌ no `.github/workflows/` |
| 11 | License compliance (AGPL-3.0 in `LICENSE`, license header on generated files) | ⚠️ `LICENSE` exists; per-file headers not stamped |
| 12 | Schema-pin enforcement | ✅ `tools/build-grammar.js` validates and CI would fail on mismatch |

---

## Test inventory

- **Corpus tests:** 100 across 14 files in `test/corpus/`. 100% pass.
- **Lib tests:** 18 in `lib/*.test.js` (stamp.js metadata join). 100% pass.
- **Real-source smoke gate:** `tools/smoke-corpus.js`. Full corpus
  39,330 routines / 162 MB at **99.06% clean** (34s wall, 4.7 MB/s).
  Run full: `node tools/smoke-corpus.js ~/vista-meta/vista/vista-m-host/Packages --by-package`.
- **Error bucket triage:** `tools/error-buckets.js` categorises
  remaining ERROR nodes by syntactic shape.

---

## TODOs to ship v1.0

Ordered roughly by what blocks the release.

### Must-do (block v1.0)

1. **B6 — bindings.** Scaffold `bindings/{node,rust,python,go}/`
   using tree-sitter's standard generator. Flip the four flags in
   `tree-sitter.json` and run `tree-sitter generate`. Verify
   `npm install` / `cargo add` / `pip install` round-trips.
2. **CI workflow.** Add `.github/workflows/ci.yml`: install Node ≥
   20, run `tree-sitter generate` (verify clean), `npm test`,
   `node tools/smoke-corpus.js`, and a per-tier coverage check
   (see #3). Cross-platform matrix (Linux / macOS / Windows) for
   the binding builds.
3. **Per-tier coverage gate** (criterion #5). Walk
   `src/grammar-metadata.json`, walk all corpus tests' parsed
   trees, assert every `(canonical, standard_status)` pair has at
   least one test. Fail CI if a token is added without a test.
4. **Performance benchmark** (criterion #6). One real
   10k+-line VistA routine; assert parse time under 100ms; record
   in `docs/build-log.md`.
5. **AD-03 stamping integration.** The Node binding should expose
   a `stamp(tree)` helper that walks the parse tree and returns
   keyword nodes annotated with the `lib/stamp.js` lookup result,
   so consumers don't have to re-implement the join.
6. **B7 — at least one editor integration** (criterion #8). Either
   a VS Code extension that ships in the marketplace or a
   nvim-treesitter PR. Goal: prove the parser works in an editor's
   incremental-parse loop.

### Should-do (polish)

7. **ADR files.** Split `docs/spec.md §3` into
   `docs/adr/AD-{01..06}.md` so each decision has its own
   provenance, "context / decision / consequences" structure, and
   can be linked individually. Spec §3 then becomes a one-line-each
   index.
8. **License headers** on `grammar.js`, `src/parser.c`,
   `src/scanner.c`, `keywords.generated.js`,
   `src/grammar-metadata.json`. AGPL-3.0 SPDX line.
9. **Argless-DO followed by single-space-then-comment** — three
    shift-reduce residuals in the smoke gate (e.g.
    `D ;W !,IEN ;Q:...`). Either an extension to the line shape
    that lets `_sp1 + comment` close an argless command without
    needing two spaces, or a scanner-level heuristic that emits
    SP2PLUS at command-end-followed-by-comment.
10. **Vendor symbols missing in m-standard.** Tracking note
    upstream for `ZW` abbreviation (ZWRITE), `$ZBITOR`, `$ZGETSYI`,
    `$ZC`, `$ZCALL`, `$ZU` (some forms). ~148 ERROR nodes
    in the Kernel residual trace to these. Fixed in
    `m-standard`'s extractors, not here.

### Nice-to-have

11. **Editor-quality error recovery** (B5 milestone description).
    Tree-sitter's defaults are good enough for the smoke gate but
    the editor-typing-half-a-routine experience hasn't been
    explicitly profiled. Worth doing once a binding is live so
    real interactive testing is possible.
12. **Full-corpus runs.** Smoke gate uses a 1000-file deterministic
    sample. A `--full` mode that walks all 39,330 VistA routines
    would catch tail-distribution edge cases that don't appear in
    the stride sample.
13. **Round-trip fidelity test.** Take an arbitrary M routine,
    parse it, walk the tree, reconstruct source byte-for-byte from
    node spans. Asserts the parser doesn't drop characters (per
    spec §15 risk note).

---

## Out of scope (not in any TODO list)

- **InterSystems ObjectScript.** `##class()`, `&sql(...)`,
  `obj.method()`, `obj.property=val`, `##super`, etc. ObjectScript
  is a separate scripting language layered on top of M's runtime —
  the right home is a sibling `tree-sitter-objectscript` grammar
  that can compose with tree-sitter-m when a file mixes both. See
  `CLAUDE.md` "What this is NOT" and `docs/spec.md §2`.
- **Cross-routine resolution / semantic analysis / indirection
  resolution / pre-ANSI dialects.** All explicitly deferred or
  excluded in spec §2.
