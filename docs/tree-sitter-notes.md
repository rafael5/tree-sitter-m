# Tree-sitter implementation notes

Things about tree-sitter's lexer/parser that aren't obvious from the
docs and have bitten us during tree-sitter-m development. Each entry has
the surface symptom, the actual rule, and the implementation patterns
we've adopted to work around it.

This is reference material — when adding a new grammar rule that
involves regex precedence, token disambiguation, or context-sensitive
recognition, read the relevant section first.

---

## 1. Token precedence is dominant, not a tiebreaker

### The mental model that's wrong

A natural assumption (and what most regex-based lexers do) is:

> Longest match wins. If two patterns match the same length, precedence
> breaks the tie.

Under that model, `prec(-1)` on a regex token would mean "use this
only if nothing else matches at the same length." It'd be a "soft
fallback."

### What actually happens

Tree-sitter's lexer applies precedence FIRST and length only within
the same precedence class. A `prec(-1)` token loses to ANY higher-prec
token, even when the higher-prec token would consume fewer characters.

We learned this the hard way. We had:

```js
// Keywords (default prec 0)
intrinsic_function_keyword: $ => choice(...K.intrinsic_functions.map(ci)),
                                   // includes $P → /\$[Pp]/
// Fallback for Kernel's $PD-style local-var idiom
_vendor_dollar_token: $ => token(prec(-1, /\$[A-Za-z][A-Za-z0-9]*/)),
```

For input `$PD`:

- Keyword regex matches `$P` — length 2, prec 0
- Fallback regex matches `$PD` — length 3, prec -1

Expected: fallback wins because it's longer.
Actual: keyword wins because it's higher prec, despite being shorter.
The `D` then can't tokenize and the parse errors out.

### Implications

1. **Precedence is not a soft preference for the lexer.** It's an
   absolute filter. Higher-prec tokens shadow lower-prec ones at
   overlapping positions, regardless of length.

2. **You can't write a "fallback regex" via low precedence.** The
   pattern "use this if no specific rule matches" must be expressed
   somewhere other than the lexer.

3. **Equal-precedence ties** (which include the default-prec common
   case) ARE broken by length. So if you avoid setting prec at all,
   length-based behaviour does work — but the moment one rule has
   different prec, the dominance rule kicks in.

### Workarounds we use

**Pattern A — Push disambiguation into the parser via GLR.** Have the
parser fork on overlapping shapes and let downstream context prune.
Used for the `$PD` fix: `special_variable` accepts either a bare
keyword or `keyword + vendor_sv_extension`. GLR explores both; the
shape with trailing letters survives when there are trailing letters,
the bare shape survives otherwise.

```js
special_variable: $ => choice(
  $.special_variable_keyword,
  seq($.special_variable_keyword, $.vendor_sv_extension,
      optional($.subscripts)),
),
vendor_sv_extension: $ => /[A-Za-z][A-Za-z0-9]*/,
```

This works because the lexer emits the keyword token unchanged
(unaffected by lex-level prec interactions); the parser then decides
whether to consume more. Conflict declared: `[$.special_variable]`.

**Pattern B — External scanner with `valid_symbols` gating.** The
scanner reads `valid_symbols[]` from the parser and emits a token
only when that token is grammatically valid in the current state.
This sidesteps precedence entirely — emission is binary, not
ranked. Used for FORMAT_TAB (`?N` tab-to-column in WRITE) and
SP1/SP2PLUS (the two-space rule).

```c
if (lexer->lookahead == '?' && valid_symbols[FORMAT_TAB]) {
  lexer->advance(lexer, false);
  lexer->result_symbol = FORMAT_TAB;
  return true;
}
```

**Pattern C — Disjoint regexes by structural requirement.** Make
the regexes match disjoint inputs by adding required structure that
distinguishes them. We used this for `io_param_list` vs
`parenthesized`: io_param_list requires `repeat1(seq(':', ...))`
inside the parens, so it never matches `(X)` (single expression) —
only `(X:Y)`, `(X:Y:Z)`, etc.

```js
io_param_list: $ => seq('(', optional($._expression),
                        repeat1(seq(':', optional($._expression))),
                        ')'),
parenthesized: $ => seq('(', $._expression, ')'),
```

When you choose: A is cheapest if the disambiguator is "what comes
next." B is best when an EXTERNAL signal (parser state) tells you
which interpretation to take and you want lexer-level commitment.
C only works when the structural difference is regex-expressible.

---

## 2. The regex engine has no look-around

### What's rejected

Tree-sitter's regex engine (Rust's `regex-syntax` configured for
the parser generator) explicitly rejects:

- **Negative lookahead** `(?!...)` — "don't match if X comes next"
- **Positive lookahead** `(?=...)` — "match only if X comes next"
- **Negative look-behind** `(?<!...)` — "don't match if X came before"
- **Positive look-behind** `(?<=...)` — "match only if X came before"
- **Backreferences** `\1`, `\2` — "match the same thing again"

Generate-time error message:

```
Error processing rule X: Grammar error: Unexpected rule
  Parse("regex parse error:
    \\$[Pp](?![A-Za-z0-9])
          ^^^
  error: look-around, including look-ahead and look-behind, is
         not supported")
```

### Why

Tree-sitter compiles each regex to a finite automaton (NFA/DFA).
Look-around requires either non-finite state or back-tracking, both
of which break the linear-time guarantees tree-sitter promises.
Backreferences similarly require tracking arbitrary captured strings.

### What you CAN do

The supported subset is essentially "Thompson-style" regex:

- Character classes: `[A-Za-z]`, `[^abc]` (negated class),
  `[\d]` etc.
- Alternation: `a|b|c`
- Quantifiers: `*`, `+`, `?`, `{n,m}`
- Grouping: `(?:...)` (non-capturing) — capturing groups work too
  but tree-sitter doesn't expose them
- Anchors: not meaningful in tree-sitter (matches are always
  contextual, not anchored to start/end of string)

That's enough for most lexical tokens but not for "match `$P` only
when not followed by a letter," which is exactly the kind of
discrimination keyword-vs-identifier disambiguation often wants.

### Workarounds we use

**Pattern A — Push to parser GLR alternative** (same as §1A above).
Often the cleanest: let the lexer emit the simple token, let the
parser fork on what comes next. Worked for `$PD` (keyword + optional
extension).

**Pattern B — External scanner with byte-level lookahead.** A C
scanner can `lexer->lookahead` arbitrary characters before deciding
to emit. It can read forward, check against a hash table, decide
whether to commit (`mark_end`) or back out. We haven't yet needed
this for tree-sitter-m but it's the right tool when GLR can't express
the discrimination cleanly. The cost is moving the rule out of
grammar.js into hand-written C.

**Pattern C — Enumerate the exclusion explicitly.** If the set of
"don't match" cases is small and finite, you can express it via
alternation. Example: instead of `\d+(?![Ee])` (digits not followed
by exponent letter), write the rule as `\d+([Ee][+-]?\d+)?` so the
exponent is consumed when present. Reframes "don't match if Y
follows" as "match Y too if it follows."

**Pattern D — Disjoint regexes by required structure** (same as
§1C above). Force the patterns into non-overlapping shapes via
required tokens.

---

## 3. Optional-subscripts shift-reduce shows up everywhere

Not as fundamental as §1 and §2 but worth noting because every
expression-form rule we've added has hit it.

### The pattern

Many M expression forms end with an optional `( ... )` subscript
list:

- `local_variable: IDENT optional(subscripts)`
- `global_variable: '^' IDENT optional(subscripts)`
- `entry_reference: LABEL '^' RTN optional(subscripts)`
- `by_reference: '.' IDENT optional(subscripts)`
- `vendor_dollar_identifier`, `special_variable`, `function_call` ...

After matching `IDENT`, lookahead `(`. Two interpretations:

1. Shift: continue this rule with subscripts.
2. Reduce: end this rule; `(` belongs to a parent rule (e.g. an
   indirection_subscripts, or a parenthesised expression in a
   sequence).

Tree-sitter flags this every time as a shift-reduce conflict. The
right answer is almost always "shift" (greedy subscripts), so just
declare the conflict and let GLR confirm.

### Implementation

Just add the rule name to `conflicts`:

```js
conflicts: $ => [
  // ... existing ...
  [$.local_variable],
  [$.global_variable],
  [$.by_reference],
  [$.entry_reference],
  [$.special_variable],   // ← when adding new opt-subscripts forms
],
```

GLR forks at the ambiguous point; the shift-branch wins because the
reduce-branch typically can't consume the `(` at the parent level
without other failures. This is the default tree-sitter behaviour
once the conflict is declared — you don't need additional
disambiguation logic.

If you add a new rule with `optional($.subscripts)` and the parser
generator complains about a shift-reduce conflict, this is the
likely cause. Add the rule name to `conflicts`.

---

## 4. Case-insensitive keywords need explicit char-class regexes

Tree-sitter's regex engine doesn't support case-insensitive flags
(no `/.../i`). For M's case-insensitive keywords (AnnoStd 6.1) we
generate a regex per keyword string by character-class-wrapping each
letter:

```js
function ci(s) {
  let pattern = '';
  for (const c of s) {
    if (c >= 'A' && c <= 'Z') pattern += `[${c}${c.toLowerCase()}]`;
    else if (c >= 'a' && c <= 'z') pattern += `[${c.toUpperCase()}${c}]`;
    else pattern += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(pattern);
}
```

So `SET` becomes `[Ss][Ee][Tt]`, `$PIECE` becomes
`\$[Pp][Ii][Ee][Cc][Ee]`. Each keyword in K.commands /
K.intrinsic_functions / K.intrinsic_special_variables is mapped
through this.

The DFA bloat is real but bounded — ~954 keyword forms × average 4-5
chars × 2 alternatives per char = a few thousand DFA states. Tree-
sitter handles this fine; parse-time perf is unaffected.

Operators and pattern codes don't need this because `[A-Za-z]` and
similar already accept both cases.

The downstream `lib/stamp.js` lookup normalises via `text.toUpperCase()`
before matching against the metadata table (which is keyed by canonical
upper-case forms).

---

## When to update this document

Add an entry when you discover a tree-sitter constraint or pattern
that:

- Took meaningful debugging time to figure out.
- Is likely to come up again in this codebase.
- Isn't obvious from tree-sitter's official docs.

Keep entries concrete: surface symptom → actual rule → workaround
patterns → which one to pick when. Real code snippets > prose.
