// External scanner for m-parser.
//
// Solves the deferred items from B4 by emitting context-aware space
// tokens that the auto-generated regex lexer can't produce:
//
//   _sp1     — exactly one space character
//   _sp2plus — two or more space characters
//
// M's two-space rule disambiguates command-with-args from argless-command
// chains. In the grammar, _sp1 is the separator between a command keyword
// and its arguments, while command_sequence accepts either between
// commands. So `F I=1:1:10 W I` parses as `F + _sp1 + args` then
// `_sp1 + W` (FOR with body), and `F  S X=1` parses as `F` (no args
// because `_sp1` won't match 2 spaces) then `_sp2plus + S X=1`.
//
// The scanner is stateless. Both tokens are derived purely from the
// number of consecutive space characters in the input.

#include "tree_sitter/parser.h"

enum TokenType {
  SP1,
  SP2PLUS,
  SP_TRAILING,
  FORMAT_TAB,
};

// Required tree-sitter scanner ABI ---------------------------------------

void *tree_sitter_m_external_scanner_create(void) {
  return NULL;  // no per-instance state
}

void tree_sitter_m_external_scanner_destroy(void *payload) {
  (void)payload;
}

unsigned tree_sitter_m_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload;
  (void)buffer;
  return 0;
}

void tree_sitter_m_external_scanner_deserialize(void *payload,
                                                 const char *buffer,
                                                 unsigned length) {
  (void)payload;
  (void)buffer;
  (void)length;
}

// Main scan ---------------------------------------------------------------

bool tree_sitter_m_external_scanner_scan(void *payload,
                                          TSLexer *lexer,
                                          const bool *valid_symbols) {
  (void)payload;

  // FORMAT_TAB: the `?` in WRITE format-control's tab-to-column atom
  // (e.g. `W ?5`, `W !?DL+1`). Only emit when the parser declares
  // FORMAT_TAB valid — which the grammar arranges to be true exactly
  // at format_control's atom-start positions. In binary pattern-match
  // position (`expr ? pattern`), FORMAT_TAB is NOT in valid_symbols,
  // so this scanner falls through and the auto-lexer matches `?` as
  // the literal pattern operator.
  if (lexer->lookahead == '?' && valid_symbols[FORMAT_TAB]) {
    lexer->advance(lexer, false);
    lexer->result_symbol = FORMAT_TAB;
    return true;
  }

  // Fast path: if the next char isn't a space, this scanner has nothing
  // more to contribute; let the auto-lexer try.
  if (lexer->lookahead != ' ') return false;

  // Neither token is needed in the current parser state — bail so the
  // auto-lexer can match its own tokens (which it won't for ' ', but
  // keeping the early-out makes intent clear).
  if (!valid_symbols[SP1] && !valid_symbols[SP2PLUS] && !valid_symbols[SP_TRAILING]) {
    return false;
  }

  // Consume contiguous spaces and count them.
  int count = 0;
  while (lexer->lookahead == ' ') {
    lexer->advance(lexer, false);
    count++;
    if (count == 2) {
      while (lexer->lookahead == ' ') {
        lexer->advance(lexer, false);
      }
      break;
    }
  }

  // Peek the char after the run. If it's a line break or EOF, this is
  // trailing whitespace with no semantic role (not a separator, not
  // before a comment). Emit SP_TRAILING — a token only the line rule's
  // line-end optional accepts. command_sequence's separator rule
  // accepts SP1/SP2PLUS but NOT SP_TRAILING, so the run cannot be
  // mistakenly absorbed into another iteration.
  int c = lexer->lookahead;
  bool at_line_end = (c == '\n' || c == '\r' || c == 0);

  if (at_line_end && valid_symbols[SP_TRAILING]) {
    lexer->result_symbol = SP_TRAILING;
    return true;
  }

  if (count >= 2) {
    if (valid_symbols[SP2PLUS]) {
      lexer->result_symbol = SP2PLUS;
      return true;
    }
    return false;
  }

  // count == 1
  if (valid_symbols[SP1]) {
    lexer->result_symbol = SP1;
    return true;
  }
  return false;
}
