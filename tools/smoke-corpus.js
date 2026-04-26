#!/usr/bin/env node
// Real-source smoke gate: walks a directory tree of .m files, parses
// each with the bundled tree-sitter grammar (via a Node child process
// running `tree-sitter parse --quiet --stat`), and reports aggregate
// stats: total files, files with no ERROR nodes, total ERROR node count,
// per-package breakdown, and parse throughput.
//
// Used as the B4 progress metric: as features land (indirection,
// FOR ranges, pattern matching, dot-blocks, two-space rule), the
// no-ERROR file count should rise and the total ERROR count should fall.
//
// Usage:
//   node tools/smoke-corpus.js <root-dir>                 # full corpus
//   node tools/smoke-corpus.js <root-dir> --sample 500    # random sample
//   node tools/smoke-corpus.js <root-dir> --by-package    # per-package breakdown
//   node tools/smoke-corpus.js <root-dir> --top-errors 20 # most-errored files

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith('--')) {
  console.error('Usage: node tools/smoke-corpus.js <root-dir> [--sample N] [--by-package] [--top-errors N]');
  process.exit(2);
}
const ROOT = path.resolve(args[0]);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const SAMPLE = flag('--sample') ? parseInt(flag('--sample'), 10) : null;
const BY_PACKAGE = args.includes('--by-package');
const TOP_ERRORS = flag('--top-errors') ? parseInt(flag('--top-errors'), 10) : 0;

if (!fs.existsSync(ROOT)) {
  console.error(`Root not found: ${ROOT}`);
  process.exit(1);
}

const TS = path.resolve(__dirname, '..', 'node_modules', '.bin', 'tree-sitter');
if (!fs.existsSync(TS)) {
  console.error(`tree-sitter CLI not found at ${TS} — run \`npm install\` first.`);
  process.exit(1);
}

// Walk the tree collecting *.m files.
const files = [];
walk(ROOT);
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.m')) files.push(full);
  }
}

let chosen = files;
if (SAMPLE && SAMPLE < files.length) {
  // Deterministic sample — sort then pick every Nth so reruns are stable.
  chosen = files.sort();
  const stride = Math.floor(files.length / SAMPLE);
  chosen = chosen.filter((_, i) => i % stride === 0).slice(0, SAMPLE);
}

console.log(`tree-sitter-m smoke gate`);
console.log(`  root:     ${ROOT}`);
console.log(`  files:    ${files.length} total${chosen !== files ? `, ${chosen.length} sampled` : ''}`);
console.log('');

let totalBytes = 0;
let cleanFiles = 0;
let totalErrors = 0;
let totalParseFailures = 0;
const byPackage = new Map();   // package name -> { files, clean, errors }
const errorRanking = [];       // [{file, errors}]
const startWall = Date.now();

// Batch into chunks small enough for argv. ~500 files per call is safe.
const BATCH = 500;
for (let i = 0; i < chosen.length; i += BATCH) {
  const batch = chosen.slice(i, i + BATCH);
  const r = spawnSync(TS, ['parse', '--quiet', batch].flat(), {
    encoding: 'utf-8',
    maxBuffer: 256 * 1024 * 1024,
  });
  // tree-sitter prints to stdout one line per file when ERROR nodes
  // exist (the form: "<path> (ERROR ...)"), and exits non-zero if any
  // file had errors. With --quiet, output is suppressed for clean
  // parses. We instead need per-file ERROR counts — re-parse the
  // failing files individually to count their ERROR nodes.
  // Simpler: invoke without --stat (which only summarises last batch)
  // and instead count "(ERROR" tokens in the output.
  const out = (r.stdout || '') + (r.stderr || '');
  // Each file that errors prints its path then s-expression slice with
  // (ERROR ...). Map back via path prefix matching.
  for (const file of batch) {
    const sz = fs.statSync(file).size;
    totalBytes += sz;
    const pkg = packageOf(file);
    if (!byPackage.has(pkg)) byPackage.set(pkg, { files: 0, clean: 0, errors: 0 });
    byPackage.get(pkg).files++;
  }
  // Count per-file failures by searching the output. Each file's output
  // starts with its path; tree-sitter prints either `(ERROR ...)` or
  // `(MISSING ...)` for problematic files (both indicate the file did
  // NOT parse cleanly). A file is "clean" only if its path is absent
  // from the output entirely. Earlier this code only counted `(ERROR`
  // and silently treated MISSING-only files as clean — which inflated
  // the cleanliness metric and made colon-chain regression analysis
  // unreliable.
  for (const file of batch) {
    const idx = out.indexOf(file);
    if (idx === -1) {
      cleanFiles++;
      byPackage.get(packageOf(file)).clean++;
      continue;
    }
    const nextStart = batch
      .map(f => out.indexOf(f, idx + file.length))
      .filter(j => j > idx)
      .reduce((a, b) => Math.min(a, b), out.length);
    const slice = out.slice(idx, nextStart);
    const errors = (slice.match(/\(ERROR/g) || []).length;
    const missings = (slice.match(/\(MISSING/g) || []).length;
    const issues = errors + missings;
    if (issues === 0) {
      cleanFiles++;
      byPackage.get(packageOf(file)).clean++;
    } else {
      totalErrors += issues;
      byPackage.get(packageOf(file)).errors += issues;
      if (TOP_ERRORS) errorRanking.push({ file, errors: issues });
    }
  }
  if (i % (BATCH * 10) === 0 && i > 0) {
    process.stderr.write(`  ... ${i}/${chosen.length}\n`);
  }
}

const wallSec = (Date.now() - startWall) / 1000;
const cleanPct = ((cleanFiles / chosen.length) * 100).toFixed(2);
console.log(`Results:`);
console.log(`  parsed:        ${chosen.length} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB total`);
console.log(`  clean (no ERROR nodes):  ${cleanFiles}  (${cleanPct}%)`);
console.log(`  with errors:             ${chosen.length - cleanFiles}`);
console.log(`  total ERROR nodes:       ${totalErrors}`);
console.log(`  wall time:               ${wallSec.toFixed(1)}s`);
console.log(`  throughput:              ${(totalBytes / 1024 / 1024 / wallSec).toFixed(1)} MB/s`);

if (BY_PACKAGE) {
  console.log('\nPer-package breakdown (sorted by clean%):');
  const rows = [...byPackage.entries()].map(([pkg, s]) => ({
    pkg,
    files: s.files,
    clean: s.clean,
    errors: s.errors,
    cleanPct: (s.clean / s.files) * 100,
  })).sort((a, b) => b.cleanPct - a.cleanPct || b.files - a.files);
  console.log('  clean%   files  errors  package');
  for (const r of rows) {
    console.log(
      `  ${r.cleanPct.toFixed(1).padStart(5)}%   ${String(r.files).padStart(5)}  ${String(r.errors).padStart(6)}  ${r.pkg}`
    );
  }
}

if (TOP_ERRORS && errorRanking.length) {
  console.log(`\nTop ${TOP_ERRORS} files by ERROR node count:`);
  errorRanking.sort((a, b) => b.errors - a.errors);
  for (const r of errorRanking.slice(0, TOP_ERRORS)) {
    console.log(`  ${String(r.errors).padStart(6)}  ${r.file}`);
  }
}

function packageOf(file) {
  // .../Packages/<Package Name>/Routines/<file>.m
  const m = file.match(/\/Packages\/([^\/]+)\/Routines\//);
  return m ? m[1] : '<unknown>';
}
