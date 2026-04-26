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

  conflicts: $ => [
    // After a command, the next ` ` could either separate another
    // command in the sequence or precede the trailing comment. GLR
    // lookahead at the next non-space token resolves it.
    [$.command_sequence],
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
      $._eol,
    ),

    _line_body: $ => choice(
      seq($.command_sequence, optional(seq($._sp, $.comment))),
      $.comment,
    ),

    label: $ => /[%A-Za-z][%A-Za-z0-9]*/,

    formals: $ => seq(
      '(',
      optional(seq($.identifier, repeat(seq(',', $.identifier)))),
      ')',
    ),

    identifier: $ => /[%A-Za-z][%A-Za-z0-9]*/,

    _sp: $ => / +/,
    _eol: $ => /\r?\n/,

    // -------- Comments --------

    comment: $ => seq(';', /[^\r\n]*/),

    // -------- Command sequence --------

    command_sequence: $ => seq(
      $.command,
      repeat(seq($._sp, $.command)),
    ),

    // v0.1 simplification: without the two-space rule (deferred to B4),
    // `D X` is genuinely ambiguous — could be `DO X` or `DO` (argless)
    // followed by `X` as the next command. Bias right so the longest
    // match (consume args if anything follows on the line) wins.
    command: $ => prec.right(seq(
      $.command_keyword,
      optional($.postconditional),
      optional(seq($._sp, $.argument_list)),
    )),

    command_keyword: $ => choice(...K.commands),

    postconditional: $ => seq(':', $._expression),

    argument_list: $ => seq(
      $.argument,
      repeat(seq(',', $.argument)),
    ),

    argument: $ => $._expression,

    // -------- Expressions --------

    _expression: $ => choice(
      $.string,
      $.number,
      $.special_variable,
      $.function_call,
      $.extrinsic_function,
      $.variable,
      $.parenthesized,
      $.binary_expression,
      $.unary_expression,
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

    unary_expression: $ => prec(2, seq(
      $.operator,
      $._expression,
    )),

    operator: $ => choice(...K.operators),

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

    extrinsic_function: $ => seq(
      '$$',
      $.identifier,
      optional(seq('^', $.identifier)),
      optional(seq('(', optional($._inner_arglist), ')')),
    ),

    _inner_arglist: $ => seq(
      $._expression,
      repeat(seq(',', $._expression)),
    ),
  },
});
