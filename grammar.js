// Tree-sitter grammar for the M (MUMPS) programming language.
//
// Hand-coded structural rules + data-driven keyword tables.
// Keyword tables come from m-standard via tools/build-grammar.js.
// Regenerate: `npm run build-grammar` (then `tree-sitter generate`).
//
// Scope of v0.1 (milestone B1+B2):
//   IN  : line shape, labels, formals, comments, strings, numbers,
//         postconditionals on commands, command sequences (single-space
//         separator), commands / intrinsic functions / ISVs / operators
//         drawn from m-standard, parenthesized + binary + unary expressions,
//         local + global variables with subscripts, extrinsic functions.
//   OUT : two-space argumentless rule (B4), dot-block nesting (B4),
//         indirection @expr (B4), pattern-match operator ? (B4),
//         per-argument postconditionals on DO/GOTO (B4),
//         InterSystems class syntax (v0.2), error recovery tuning (B5).
//
// M is whitespace-significant — `extras: []`. Tokens like _sp and _eol
// are explicit.

'use strict';

const K = require('./keywords.generated.js');

module.exports = grammar({
  name: 'm',

  extras: $ => [],

  // External tokens emitted by src/scanner.c. The auto-generated lexer
  // can't distinguish "exactly 1 space" from "2+ spaces" in a way that
  // also lets the parser pick by context — the scanner does.
  // _sp1     = exactly one space (between command keyword and args)
  // _sp2plus = two or more spaces (between argless command and next)
  externals: $ => [
    $._sp1,
    $._sp2plus,
  ],

  conflicts: $ => [
    // After a command, the next ` ` could either separate another
    // command in the sequence or precede the trailing comment. GLR
    // lookahead at the next non-space token resolves it.
    [$.command_sequence],
    // After command_sequence, trailing ` ` could be a comment lead-in
    // or just trailing whitespace before EOL.
    [$._line_body],
  ],

  rules: {
    // Blank lines are absorbed by `_blank` (hidden) so they don't
    // pollute the AST with anonymous (line) nodes.
    source_file: $ => repeat(choice($.line, $._blank)),

    _blank: $ => $._eol,

    // -------- Line shape --------
    //
    // A `line` must have at least one substantive element so it's
    // unambiguously distinct from `_blank`:
    //   - label (optionally followed by formals + body + comment), OR
    //   - leading space followed by body and/or comment, OR
    //   - bare comment at column 0.

    line: $ => seq(
      choice(
        seq($.label, optional($.formals), optional(seq($._sp, optional($._line_body)))),
        seq($._sp, $._line_body),
        $.comment,
      ),
      optional($._sp),  // allow trailing whitespace before EOL
      $._eol,
    ),

    _line_body: $ => choice(
      seq(
        optional($.dot_block_prefix),
        $.command_sequence,
        optional(seq($._sp, $.comment)),
      ),
      seq(optional($.dot_block_prefix), $.comment),
    ),

    // Dot-block continuation: ` . S X=1` is a line inside an argless
    // DO/IF/ELSE block opened on a previous line. The dots count nesting
    // depth — `.` is one level deep, `..` is two, etc. Per spec §5.7
    // the parser records the prefix; structural validation (that the
    // depth matches an enclosing block) is left to a downstream pass
    // since tree-sitter's stateless rules can't track block scope here.
    //
    // Three real-world spellings, all accepted:
    //   ` . S X=1`   — one level, dot then space then command
    //   ` .. S X=1`  — two levels via doubled dots
    //   ` . . S X=1` — two levels via space-separated dots (IRIS-style)
    //   ` .S X=1`    — one level, dot immediately followed by command
    // Pattern: one or more dots, optionally interleaved with spaces, with
    // optional trailing whitespace before the body. Tokenised as a single
    // chunk so it can't collide with decimal number `.5` (number rule
    // wins by length) or pattern repeat counts (those follow `?`).
    dot_block_prefix: $ => token(prec(2, /\.( *\.)*[ \t]*/)),

    label: $ => /[%A-Za-z][%A-Za-z0-9]*/,

    formals: $ => seq(
      '(',
      optional(seq($.identifier, repeat(seq(',', $.identifier)))),
      ')',
    ),

    identifier: $ => /[%A-Za-z][%A-Za-z0-9]*/,

    // _sp accepts either form — used in line-shape positions (leading
    // indent, trailing whitespace, separator before comment) where M
    // doesn't distinguish single vs double space. The two externals
    // come from src/scanner.c.
    _sp: $ => choice($._sp1, $._sp2plus),
    _eol: $ => /\r?\n/,

    // -------- Comments --------

    comment: $ => seq(';', /[^\r\n]*/),

    // -------- Command sequence --------

    // Command_sequence chains commands. The separator is _sp (either
    // 1 or 2+ spaces) — both are legal between commands in M:
    //   1 space:  previous command finished its args (` ` ends the
    //             arg list), the next command follows
    //   2+ spaces: previous command was argless; the extra space is
    //             the explicit "no args" signal
    command_sequence: $ => seq(
      $.command,
      repeat(seq($._sp, $.command)),
    ),

    // Within one command, the keyword-to-args gap is exactly ONE space
    // (_sp1). A keyword followed by 2+ spaces means the command is
    // argless and the next thing is the chain separator (_sp2plus).
    // The external scanner makes the distinction.
    command: $ => prec.right(seq(
      $.command_keyword,
      optional($.postconditional),
      optional(seq($._sp1, $.argument_list)),
    )),

    command_keyword: $ => choice(...K.commands),

    postconditional: $ => seq(':', $._expression),

    argument_list: $ => seq(
      $.argument,
      repeat(seq(',', $.argument)),
    ),

    // Per-argument postconditional: `D LABEL:cond,LABEL2:cond2`. M allows
    // these on DO / GOTO / XECUTE arguments. Per AD-01 the parser accepts
    // them on any argument (the union of all sources); a downstream linter
    // can flag misuse on commands like SET.
    //
    // The same `:expr` syntax is overloaded for FOR-loop ranges:
    // `F I=1:1:10` is a single FOR argument `I=1` followed by `:1:10`
    // (increment, limit). The grammar accepts a chain of `:expr` parts
    // and lets downstream consumers re-interpret by command context.
    argument: $ => prec.right(seq(
      $._expression,
      optional($.argument_postconditional),
    )),

    argument_postconditional: $ => prec.right(seq(
      ':', $._expression,
      repeat(seq(':', $._expression)),
    )),

    // -------- Expressions --------

    _expression: $ => choice(
      $.string,
      $.number,
      $.special_variable,
      $.function_call,
      $.extrinsic_function,
      $.entry_reference,
      $.variable,
      $.parenthesized,
      $.binary_expression,
      $.unary_expression,
      $.indirection,
      $.pattern_match,
      $.format_control,
    ),

    // WRITE format control characters: `!` (newline) and `#` (form
    // feed). M's WRITE allows these to chain without comma separators —
    // `W !!` writes two newlines, `W !,X` writes newline then X.
    // Both characters double as binary operators (logical OR / modulo);
    // GLR explores both via an explicit token with prec 3.
    //
    // `?expr` (tab-to-column) is not handled — it collides with the
    // pattern-match operator. SET-list / KILL-list `(A,B,C)=val` is
    // also deferred — adding it as `tuple` regressed the smoke gate
    // 2pp because of confusion with subscripts and parenthesized
    // expressions. Both wait for B5 disambiguation work.
    format_control: $ => prec(3, repeat1($._format_char)),

    _format_char: $ => token(prec(3, /[!#]/)),

    // Entry reference: `LABEL^ROUTINE`. Used as DO/GOTO/JOB arguments
    // and as the target of $$extrinsic calls. Plain `^ROUTINE` is
    // already covered by global_variable (same syntax — the parser
    // treats both the same; downstream interprets by command context).
    //
    // The `LABEL+offset^ROUTINE` form (offset by N lines) is deferred:
    // adding `+expr` would conflict with binary `+` inside parens, and
    // it's used in only a small fraction of routines.
    entry_reference: $ => prec(1, seq(
      $.identifier,
      '^',
      $.identifier,
      optional($.subscripts),
    )),

    // M pattern matching: `expr ? pattern` where pattern is a sequence
    // of (repeat_count, atom) pairs. The right side of `?` is its own
    // sublanguage — not a normal expression. Pattern codes A/C/E/L/N/P/U
    // come from m-standard's grammar-surface; YDB and IRIS allow custom
    // codes via the patcode table (deferred — accepted as identifiers
    // only). Pattern strings are normal M string literals; pattern
    // alternation is a parenthesized comma-separated list of atoms.
    //
    // Per spec §5.8:
    //   pattern_atom    ::= repeat_count (pattern_code | pattern_string | alternation)
    //   repeat_count    ::= integer | integer "." integer? | "." integer
    pattern_match: $ => prec.left(0, seq(
      $._expression,
      '?',
      $.pattern,
    )),

    pattern: $ => repeat1($.pattern_atom),

    pattern_atom: $ => seq(
      $.pattern_repeat_count,
      choice($.pattern_code, $.pattern_string, $.pattern_alternation),
    ),

    // Repeat counts: "1", "1.4", "1.", ".4", "."
    // Lexed as a single token to avoid ambiguity with decimal numbers.
    pattern_repeat_count: $ => token(choice(
      /\d+\.\d+/,   // n.m
      /\d+\./,      // n.
      /\.\d+/,      // .n
      /\d+/,        // n
      /\./,         // .
    )),

    pattern_code: $ => seq(
      optional("'"),  // apostrophe = NOT
      $.pattern_letter,
    ),

    // The standard 7 codes plus any other ASCII letter (vendor patcode).
    // Per AD-01 the union: accept any letter; downstream linter flags
    // non-standard codes.
    pattern_letter: $ => /[A-Za-z]/,

    pattern_string: $ => $.string,

    pattern_alternation: $ => seq(
      '(',
      $.pattern_atom,
      repeat(seq(',', $.pattern_atom)),
      ')',
    ),

    // M indirection: `@expr` evaluates `expr` at runtime to get a name
    // (variable, label, routine, etc.) and substitutes it. With trailing
    // `@(subs)` the subscripts are applied to the runtime-determined
    // name. The parser records the indirection node — actual resolution
    // is a downstream concern (spec §5.6).
    //
    // The subject is restricted to atoms so `@X+1` parses as
    // `(indirection X) + 1` rather than `@(X+1)`. Nested `@@X` works
    // via the recursive case.
    indirection: $ => prec.right(2, seq(
      '@',
      $._indirection_subject,
      optional($.indirection_subscripts),
    )),

    _indirection_subject: $ => choice(
      $.variable,
      $.string,
      $.parenthesized,
      $.special_variable,
      $.function_call,
      $.extrinsic_function,
      $.indirection,
    ),

    indirection_subscripts: $ => seq(
      '@', '(',
      $._expression,
      repeat(seq(',', $._expression)),
      ')',
    ),

    parenthesized: $ => seq('(', $._expression, ')'),

    // M evaluates left-to-right with no precedence among binary operators
    // (a deliberate choice in the standard). Tree-sitter still wants a
    // precedence direction for left-recursion — declare left-assoc at
    // a single level.
    binary_expression: $ => prec.left(1, seq(
      $._expression,
      $.operator,
      $._expression,
    )),

    // M's only true unary operators are `+`, `-`, `'` (NOT). Other
    // operators in K.operators (`!`, `#`, etc.) are binary-only;
    // restricting unary here prevents them being mis-recognised as
    // unary prefixes (which would shadow format_control for `!`).
    unary_expression: $ => prec(2, seq(
      alias(choice('+', '-', "'"), $.operator),
      $._expression,
    )),

    // M's negated comparison operators: `'` prefix on `=`, `<`, `>`,
    // `[`, `]`, `]]`. Lexically distinct from unary `'` because of the
    // following character; tree-sitter's longest-match resolves
    // `A'=B` to `A` `'=` `B` (2-char op) rather than `A` `'` `=` `B`.
    // m-standard's grammar-surface lists only the base 17 operators
    // because the negation is morphological, but real M lexers treat
    // these as compound tokens.
    operator: $ => choice(
      ...K.operators,
      "'=", "'<", "'>", "'[", "']", "']]",
    ),

    string: $ => seq(
      '"',
      repeat(choice('""', /[^"\r\n]/)),
      '"',
    ),

    number: $ => /(\d+(\.\d*)?|\.\d+)([Ee][+-]?\d+)?/,

    // -------- Variables --------

    variable: $ => choice($.local_variable, $.global_variable),

    local_variable: $ => seq($.identifier, optional($.subscripts)),

    global_variable: $ => seq('^', $.identifier, optional($.subscripts)),

    subscripts: $ => seq(
      '(',
      $._expression,
      repeat(seq(',', $._expression)),
      ')',
    ),

    // -------- Functions / special variables --------
    //
    // Intrinsic functions: $NAME(args)
    // Intrinsic special variables: $NAME (no parens)
    // Same form (e.g. $D) can be both — the parser records the matched
    // form; downstream attribute stamping resolves canonical via the
    // grammar-metadata.json table generated alongside the parser.

    function_call: $ => seq(
      $.intrinsic_function_keyword,
      '(',
      optional($._inner_arglist),
      ')',
    ),

    intrinsic_function_keyword: $ => choice(...K.intrinsic_functions),

    special_variable: $ => $.special_variable_keyword,

    special_variable_keyword: $ => choice(...K.intrinsic_special_variables),

    extrinsic_function: $ => prec.right(seq(
      '$$',
      $.identifier,
      optional(seq('^', $.identifier)),
      optional(seq('(', optional($._inner_arglist), ')')),
    )),

    _inner_arglist: $ => seq(
      $._expression,
      repeat(seq(',', $._expression)),
    ),
  },
});
