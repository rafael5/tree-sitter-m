// AD-03 attribute stamping (tree-sitter-m milestone B3).
//
// Tree-sitter's parse tree records the matched bytes for every keyword
// node (command_keyword, intrinsic_function_keyword,
// special_variable_keyword, operator) but not the canonical name or
// portability tier. Those live in src/grammar-metadata.json, generated
// alongside the parser by tools/build-grammar.js.
//
// This module joins the two: given a keyword node's type and matched
// text, it returns the canonical metadata that downstream consumers
// (linter, formatter, AI agents) need to reason about the token.
//
// Real M abbreviations collide — `H` could be HALT or HANG; `$D` could
// be ISV $DEVICE or function $DATA; `$ST` could be $STACK or $STORAGE.
// The metadata table preserves all candidates per form. `lookup()` returns
// the full candidate list; `resolve()` accepts a context predicate that
// the caller uses to disambiguate (e.g. argument presence for HALT/HANG).

'use strict';

const path = require('path');
const fs = require('fs');

const METADATA_PATH = path.resolve(__dirname, '..', 'src', 'grammar-metadata.json');
let _metadata = null;

function loadMetadata() {
  if (_metadata !== null) return _metadata;
  const raw = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf-8'));
  if (raw.concept !== 'grammar-metadata') {
    throw new Error(`grammar-metadata.json: unexpected concept ${raw.concept}`);
  }
  _metadata = raw;
  return _metadata;
}

// Map tree-sitter node types to the m-standard concept name used as the
// metadata key prefix.
const NODE_TYPE_TO_CONCEPT = Object.freeze({
  command_keyword:               'commands',
  intrinsic_function_keyword:    'intrinsic_functions',
  special_variable_keyword:      'intrinsic_special_variables',
  operator:                      'operators',
  // pattern_code: 'pattern_codes' — added once pattern matching lands (B4)
});

// Returns the candidate list for a (nodeType, matched text) pair, or
// null if the node type isn't a keyword node or the text isn't a known
// form. Each candidate is `{ canonical, standard_status }`.
//
// For unambiguous forms there's exactly one candidate. For the 7 known
// collisions there are 2 — caller decides which applies via context.
function lookup(nodeType, text) {
  const concept = NODE_TYPE_TO_CONCEPT[nodeType];
  if (!concept) return null;
  const md = loadMetadata().metadata;
  // M keywords are case-insensitive (AnnoStd 6.1); the parser accepts
  // both `S` and `s` as command_keyword. The metadata table is keyed
  // by canonical (uppercase) form, so normalise here. Operators and
  // other non-letter forms are unaffected by toUpperCase.
  const entries = md[`${concept}:${text.toUpperCase()}`];
  if (!entries) return null;
  return {
    matched_form: text,
    concept,
    candidates: entries.map(e => ({
      canonical: e.canonical,
      standard_status: e.standard_status,
    })),
    ambiguous: entries.length > 1,
  };
}

// Convenience for unambiguous forms: returns a flat
// `{ matched_form, canonical, standard_status, concept }` or null.
// Throws on ambiguous forms (caller should use `lookup` + own
// disambiguation instead).
function lookupSingle(nodeType, text) {
  const r = lookup(nodeType, text);
  if (!r) return null;
  if (r.ambiguous) {
    throw new Error(
      `lookupSingle called on ambiguous form ${nodeType}/${text} ` +
      `(${r.candidates.length} candidates: ` +
      r.candidates.map(c => c.canonical).join(', ') +
      `). Use lookup() + context-based resolve() instead.`
    );
  }
  return {
    matched_form: text,
    canonical: r.candidates[0].canonical,
    standard_status: r.candidates[0].standard_status,
    concept: r.concept,
  };
}

// Resolve an ambiguous form via a caller-supplied predicate. Returns
// the first candidate where `predicate(candidate)` is truthy, or null
// if none match. Useful for HALT vs HANG disambiguation:
//
//   resolve('command_keyword', 'H', (c) =>
//     c.canonical === 'HANG' ? hasArguments : !hasArguments
//   );
function resolve(nodeType, text, predicate) {
  const r = lookup(nodeType, text);
  if (!r) return null;
  for (const c of r.candidates) {
    if (predicate(c)) {
      return {
        matched_form: text,
        canonical: c.canonical,
        standard_status: c.standard_status,
        concept: r.concept,
      };
    }
  }
  return null;
}

// Returns the metadata schema_version (matches m-standard's
// schema_version, since we generate from it).
function schemaVersion() {
  return loadMetadata().schema_version;
}

module.exports = {
  lookup,
  lookupSingle,
  resolve,
  schemaVersion,
  NODE_TYPE_TO_CONCEPT,
};
