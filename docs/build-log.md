# Build log — m-parser

Chronological notes on milestone deliveries, decisions made during
implementation, and any drift from `spec.md`.

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
