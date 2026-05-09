# tree-sitter-m discoveries log

Findings surfaced by real-world use of the parser — gaps in the
upstream `m-standard` grammar surface, parser-side limitations that
are intentional (or can be relaxed only at a cost), and
constructs the grammar accepts liberally that downstream tools
should know about.

Entries follow the same `BL-NNN` style as
[`m-standard/docs/build-log.md`](../../m-standard/docs/build-log.md)
but use the **`DISC-NNN`** prefix to keep the two streams visually
distinct.

| | Discovery | Origin | Upstream | Resolution |
|---|---|---|---|---|
| [DISC-001](#disc-001) | YDB/IRIS list-function abbreviations missing from `grammar-surface.json` | tree-sitter-m-vscode test-routine authoring, 2026-04-26 | m-standard ([BL-014](../../m-standard/docs/build-log.md#bl-014) / [issue #3](https://github.com/m-dev-tools/m-standard/issues/3)) | open — needs sweep across all `$LIST*` canonicals |
| [DISC-002](#disc-002) | Negated compound operators (`'[`, `']`, `']]`) require no whitespace before rhs | tree-sitter-m-vscode test-routine authoring, 2026-04-26 | parser-side; lexer / longest-match | won't fix — real M has no such whitespace; document and move on |
| [DISC-003](#disc-003) | `by_reference` rule rejects `global_variable` (passing `^GBL` by-ref) | tree-sitter-m-vscode test-routine authoring, 2026-04-26 | parser-side; grammar rule | won't fix — globals are already by-name in M; the construct is semantically meaningless |

---

## DISC-001 — YDB/IRIS list-function abbreviations missing from grammar-surface

**Origin:** tree-sitter-m-vscode test-routine authoring, 2026-04-26.
**Phase:** B6 — bindings + extension scaffolding.
**Upstream:** [m-standard BL-014](../../m-standard/docs/build-log.md#bl-014) (open).
**Tracker:** [m-standard#3](https://github.com/m-dev-tools/m-standard/issues/3) (open).

**Statement.** `m-standard/integrated/grammar-surface.json` lists
the YDB/IRIS list-manipulation functions (`$LIST`, `$LISTBUILD`,
`$LISTGET`, `$LISTLENGTH`, etc.) with `abbreviation=""` and
`all_forms=["$LISTBUILD"]` (the canonical form only). The 2-letter
abbreviations that YDB and IRIS implementations both accept —
`$LB` (build), `$LI` (get), `$LL` (length), `$LD` (data), `$LF`
(find), `$LFS` (fromstring), `$LN` (next), `$LS` (same), `$LTS`
(tostring), `$LU` (update), `$LV` (valid) — are not in the data, so
tree-sitter-m doesn't recognise them.

**Evidence.**

```bash
# In ~/projects/tree-sitter-m, with the WASM bundle:
node -e '
const { Parser, Language } = require("web-tree-sitter");
(async () => {
  await Parser.init();
  const lang = await Language.load("./tree-sitter-m.wasm");
  const p = new Parser(); p.setLanguage(lang);
  console.log("$LB(...):       ", p.parse("T\n W $LB(1,2,3)\n Q\n").rootNode.hasError ? "FAIL" : "ok");
  console.log("$LISTBUILD(...):", p.parse("T\n W $LISTBUILD(1,2,3)\n Q\n").rootNode.hasError ? "FAIL" : "ok");
})()'
# → $LB(...):        FAIL
# → $LISTBUILD(...): ok
```

Reading grammar-surface.json directly confirms the gap:

```python
import json
d = json.load(open("integrated/grammar-surface.json"))
for it in d["intrinsic_functions"]:
    if it["canonical"] in ("$LISTBUILD", "$LISTGET", "$LISTLENGTH"):
        print(it["canonical"], it["abbreviation"], it["all_forms"])
# $LISTBUILD  ['$LISTBUILD']
# $LISTGET    ['$LISTGET']
# $LISTLENGTH ['$LISTLENGTH']
```

**Impact.** M code using these abbreviations — common in YDB-style
production code and not unusual in IRIS — won't highlight or analyse
correctly under tree-sitter-m. **Not a tree-sitter-m bug**: the
parser only knows what `m-standard` tells it. Per [AD-04](adr/AD-04-pin-mstandard-schema.md),
additive m-standard updates flow through automatically; we just
need the abbreviations populated upstream.

**Workaround.** Use the canonical full names in code that's expected
to highlight today (`$LISTBUILD(...)` not `$LB(...)`). Real VistA
code uses canonicals because VistA pre-dates the YDB list-function
extensions, so this is unlikely to bite VistA targets.

**Upstream resolution.** m-standard's extractor for YDB and IRIS
intrinsic functions needs to populate `abbreviation` from the
documentation tables (both YDB's `MLAB001.html` and IRIS's
`COSWHATIS_FUNCTIONS` documentation list the 2-letter forms). After
the fix, regenerate grammar-surface.json, bump tree-sitter-m's
keywords.generated.js, and the abbreviations are recognised
end-to-end.

---

## DISC-002 — Negated compound operators require no whitespace before rhs

**Origin:** tree-sitter-m-vscode test-routine authoring, 2026-04-26.
**Phase:** B6.
**Upstream:** parser-side (tree-sitter / lexer behaviour).
**Resolution:** **won't fix** — real M doesn't write this whitespace.

**Statement.** The compound operators `'[`, `']`, `']]` (negated
"contains", "follows", "sorts after") lex as a single multi-char
operator token only when there's no whitespace between the operator
and the right-hand side expression.

**Evidence.**

```
S1'["z"      → ok      (single 2-char operator '[ then string)
S1'[ "z"     → FAIL    (space splits the lexer's longest match)

S1']"z"      → ok
S1'] "z"     → FAIL

S1']]"z"     → ok
S1']] "z"    → FAIL
```

**Impact.** Cosmetic only. Real M is written without spaces around
operators; the parser sees real M without trouble. The corner case
surfaces only in pretty-printed test fixtures or hand-typed examples
where the author inserts whitespace for readability.

**Workaround.** Don't insert whitespace between the negated compound
operator and the rhs. (The non-negated forms `[`, `]`, `]]` have the
same property by virtue of the same longest-match rules.)

**Why not fix.** Relaxing the lexer to accept `'` + whitespace + `[`
as `'[` rather than two separate operators creates ambiguity with
the unary `'` (NOT) prefix on a parenthesised or string literal
expression. The cost is real (more shift-reduce conflicts to chase
in the GLR conflict declarations); the benefit is a corner case that
doesn't appear in any of the 39,330-routine VistA corpus or the
reference YDB/IRIS sample suites.

---

## DISC-003 — by-reference rule rejects global_variable

**Origin:** tree-sitter-m-vscode test-routine authoring, 2026-04-26.
**Phase:** B6.
**Upstream:** parser-side (grammar.js rule definition).
**Resolution:** **won't fix** — semantically meaningless in M.

**Statement.** The `by_reference` grammar rule

```javascript
by_reference: $ => seq(
  '.',
  choice($.identifier, $.indirection),   // ← only these two
  optional($.subscripts),
),
```

accepts only `identifier` or `indirection` after the leading `.`.
Attempting to pass a global by reference (`.^GBL` or
`.^GBL("subs")`) produces a parse ERROR.

**Evidence.**

```
D F(.X)             → ok       (identifier)
D F(.@NAME)         → ok       (indirection)
D F(.^GBL)          → FAIL
D F(.^GBL("a"))     → FAIL
```

**Impact.** None in practice. Globals in M are *already* by-name —
every reference to `^GBL` resolves to the same physical global from
every routine in the system. Passing one "by reference" is
semantically a no-op. Real M code doesn't write this idiom; none of
the 39,330-routine VistA corpus contains it.

**Workaround.** If the calling pattern needs a handle to a global,
pass the global *name* as a string (`D F("^GBL")` then dereference
inside `F` via indirection) rather than trying to fake by-reference
on the global itself.

**Why not fix.** Adding `global_variable` to the by_reference choice
would require resolving shift-reduce conflicts with `^(...)` naked
references and with `LABEL:cond^RTN` per-argument postconditionals
on entry references. The cost is real; the construct is meaningless;
no real-world code triggers it.

---

## How to add a new entry

1. Surface a finding through real use (grammar-rule writing, real-
   source smoke gate, downstream tool authoring, etc.).
2. Pick the next free `DISC-NNN` (look at the table at the top).
3. Fill in: phase, statement, evidence (paste the failing input + the
   parse output), impact, workaround, resolution status.
4. Cross-link both ways: from this file to the corresponding
   m-standard `BL-NNN` (if upstream) or to the spec section / grammar
   rule (if parser-side). From there back here.
5. Update the index table at the top.

Discoveries that resolve get a `**Resolution:**` line with the date
and the commit / m-standard release that closed them.
