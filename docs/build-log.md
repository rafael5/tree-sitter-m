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
