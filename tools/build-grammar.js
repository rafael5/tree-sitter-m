#!/usr/bin/env node
// AUTO-GENERATOR for the data-driven half of grammar.js.
//
// Reads m-standard's integrated/grammar-surface.json and emits:
//   - keywords.generated.js   — keyword arrays consumed by grammar.js
//   - src/grammar-metadata.json — form -> {canonical, status, concept} table
//                                 used by downstream attribute stampers (AD-03)
//
// The schema_version of the consumed file MUST match the pin in
// package.json's "m-standard.schema_version" field (AD-04). CI fails the
// build on mismatch so additive m-standard updates flow through but
// breaking changes require deliberate adoption.

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PKG = require(path.join(PROJECT_ROOT, 'package.json'));
const PIN = PKG['m-standard'];
if (!PIN || !PIN.schema_version || !PIN.source) {
  fail('package.json must declare "m-standard": { "schema_version": "...", "source": "..." }');
}
const PINNED_SCHEMA = String(PIN.schema_version);
const SOURCE_PATH = path.resolve(PROJECT_ROOT, PIN.source);

log(`reading ${SOURCE_PATH}`);
if (!fs.existsSync(SOURCE_PATH)) {
  fail(`grammar-surface.json not found at ${SOURCE_PATH}\n` +
       `  Expected layout: ../m-standard/integrated/grammar-surface.json relative to m-parser/`);
}
const surface = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf-8'));

const consumedSchema = String(surface.schema_version);
if (consumedSchema !== PINNED_SCHEMA) {
  fail(
    `schema_version mismatch (AD-04):\n` +
    `  pinned   (package.json m-standard.schema_version): ${PINNED_SCHEMA}\n` +
    `  consumed (${SOURCE_PATH}): ${consumedSchema}\n` +
    `  m-parser must opt into m-standard schema changes deliberately.\n` +
    `  Either bump the pin (and m-parser major version) or check out\n` +
    `  the matching m-standard revision.`
  );
}
log(`schema_version=${consumedSchema} (matches pin)`);

if (surface.concept !== 'grammar-surface') {
  fail(`expected concept="grammar-surface", got ${JSON.stringify(surface.concept)}`);
}

// Extraction rules per concept. The shape of each item differs slightly
// between concepts (commands/functions/ISVs use all_forms+canonical;
// operators use symbol; pattern_codes use code) so the table below
// tells the extractor where to find the form list and the canonical name.
const CONCEPTS = {
  commands:                    { formsOf: item => item.all_forms,    canonicalOf: item => item.canonical },
  intrinsic_functions:         { formsOf: item => item.all_forms,    canonicalOf: item => item.canonical },
  intrinsic_special_variables: { formsOf: item => item.all_forms,    canonicalOf: item => item.canonical },
  operators:                   { formsOf: item => [item.symbol],     canonicalOf: item => item.symbol },
  pattern_codes:               { formsOf: item => [item.code],       canonicalOf: item => item.code },
};

const keywords = {};   // concept -> sorted unique forms
const metadata = {};   // "concept:form" -> [{ canonical, standard_status, concept }, ...]
                       // Array because real M abbreviations collide:
                       //   H/HA -> HALT or HANG (disambiguated by arg presence)
                       //   $ST  -> $STACK or $STORAGE
                       //   $ZF  -> $ZF or $ZFIND, etc.
                       // Downstream attribute stampers handle context-sensitive
                       // disambiguation; the parser just records the matched form.
let ambiguousCount = 0;

for (const concept of Object.keys(CONCEPTS)) {
  const items = surface[concept];
  if (!Array.isArray(items)) {
    fail(`grammar-surface.json missing array '${concept}'`);
  }
  const forms = new Set();
  const { formsOf, canonicalOf } = CONCEPTS[concept];
  for (const item of items) {
    const allForms = formsOf(item);
    if (!Array.isArray(allForms) || allForms.length === 0) {
      fail(`${concept}: item missing forms — ${JSON.stringify(item)}`);
    }
    if (!item.standard_status) {
      fail(`${concept}: item missing standard_status — ${JSON.stringify(item)}`);
    }
    const canonical = canonicalOf(item);
    for (const form of allForms) {
      if (typeof form !== 'string' || form.length === 0) {
        fail(`${concept}: invalid form ${JSON.stringify(form)} in ${JSON.stringify(item)}`);
      }
      forms.add(form);
      const key = `${concept}:${form}`;
      const entry = { canonical, standard_status: item.standard_status, concept };
      if (metadata[key]) {
        const exists = metadata[key].some(e =>
          e.canonical === entry.canonical && e.standard_status === entry.standard_status
        );
        if (!exists) {
          metadata[key].push(entry);
          ambiguousCount++;
        }
      } else {
        metadata[key] = [entry];
      }
    }
  }
  // Sort longest-first so the human-readable output is stable; tree-sitter
  // applies max-munch internally regardless of choice() order.
  keywords[concept] = Array.from(forms).sort((a, b) => b.length - a.length || a.localeCompare(b));
}
log(`ambiguous forms (multiple canonicals): ${ambiguousCount}`);

// Sanity counts (cross-checked against spec.md §4 v0.2 numbers).
log('keyword counts:');
for (const k of Object.keys(keywords)) {
  log(`  ${k.padEnd(32)} ${keywords[k].length} forms`);
}

// Emit keywords.generated.js (consumed by grammar.js).
const keywordsOut = path.join(PROJECT_ROOT, 'keywords.generated.js');
const banner =
  `// AUTO-GENERATED by tools/build-grammar.js — do not edit by hand.\n` +
  `// Source: ${path.relative(PROJECT_ROOT, SOURCE_PATH)} (schema_version=${consumedSchema}).\n` +
  `// Regenerate with: npm run build-grammar\n\n`;
const body =
  `'use strict';\n\n` +
  `module.exports = {\n` +
  `  schema_version: ${JSON.stringify(consumedSchema)},\n` +
  Object.keys(keywords).map(k =>
    `  ${k}: ${JSON.stringify(keywords[k])},`
  ).join('\n') + `\n};\n`;
fs.writeFileSync(keywordsOut, banner + body);
log(`wrote ${path.relative(PROJECT_ROOT, keywordsOut)}`);

// Emit src/grammar-metadata.json (consumed by downstream attribute stampers per AD-03).
const srcDir = path.join(PROJECT_ROOT, 'src');
fs.mkdirSync(srcDir, { recursive: true });
const metadataOut = path.join(srcDir, 'grammar-metadata.json');
fs.writeFileSync(metadataOut, JSON.stringify({
  schema_version: consumedSchema,
  concept: 'grammar-metadata',
  generator: 'tools/build-grammar.js',
  source: path.relative(PROJECT_ROOT, SOURCE_PATH),
  generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  metadata,
}, null, 2) + '\n');
log(`wrote ${path.relative(PROJECT_ROOT, metadataOut)} (${Object.keys(metadata).length} entries)`);
log('done');

function log(msg) {
  process.stderr.write(`[build-grammar] ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`[build-grammar] FATAL: ${msg}\n`);
  process.exit(1);
}
