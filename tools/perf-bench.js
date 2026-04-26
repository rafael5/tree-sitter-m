#!/usr/bin/env node
// Performance benchmark — spec criterion #6 / §10.4: a 10,000-line
// VistA routine must parse in under 100ms on a modern laptop.
//
// Real VistA routines are typically 200–800 lines (largest in the
// shipped corpus is ~1,600), so we synthesise a 10k-line routine by
// concatenating real ones to exercise the spec budget. We also
// report p50 / p95 / max latency over a deterministic sample so the
// "median routine" performance is observable too.
//
// Usage:
//   node tools/perf-bench.js <corpus-root>
//   node tools/perf-bench.js <corpus-root> --sample 50
//   node tools/perf-bench.js <corpus-root> --json
//
// The corpus root defaults to ~/vista-meta/vista/vista-m-host/Packages.
// CI doesn't run this — it requires the local VistA corpus. Run
// locally and record results in docs/build-log.md.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const Parser = require('tree-sitter');
const M = require('..');

const args = process.argv.slice(2);
const positionals = args.filter(a => !a.startsWith('--'));
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args[i + 1] || true);
};

const CORPUS_ROOT = positionals[0] || path.join(os.homedir(), 'vista-meta/vista/vista-m-host/Packages');
const SAMPLE = parseInt(flag('sample') || '50', 10);
const REPEATS = parseInt(flag('repeats') || '5', 10);
const BUDGET_MS = parseFloat(flag('budget-ms') || '100');
const TARGET_LINES = parseInt(flag('target-lines') || '10000', 10);
const asJson = args.includes('--json');

if (!fs.existsSync(CORPUS_ROOT)) {
  console.error(`corpus not found at ${CORPUS_ROOT}`);
  console.error(`usage: node tools/perf-bench.js <corpus-root> [--sample N] [--repeats N]`);
  process.exit(2);
}

// Deterministic linear congruential PRNG (no external deps).
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function findRoutines(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.m')) out.push(full);
    }
  };
  walk(root);
  return out;
}

function pickSample(allFiles, n, rand) {
  // Reservoir-style: shuffle deterministically and take first n.
  const arr = allFiles.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(n, arr.length));
}

function timeParse(parser, src, repeats) {
  // Warmup parse; discard.
  parser.parse(src);
  const samples = new Float64Array(repeats);
  for (let i = 0; i < repeats; i++) {
    const t0 = process.hrtime.bigint();
    parser.parse(src);
    const t1 = process.hrtime.bigint();
    samples[i] = Number(t1 - t0) / 1e6;
  }
  // Median is robust to the warm-cache outlier.
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function quantile(sorted, q) {
  const i = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[i];
}

function findLargest(files) {
  let best = null;
  let bestLines = 0;
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf-8');
    const lines = s.split('\n').length;
    if (lines > bestLines) { bestLines = lines; best = { path: f, lines, bytes: s.length, src: s }; }
  }
  return best;
}

function synth10kSingleRoutine(largest, targetLines) {
  // The spec's "10,000-line VistA routine" target is a single routine,
  // not many concatenated. Replicate the largest real routine's body
  // (everything after the header line) until we hit the target line
  // count. This matches the canonical case the spec budgets.
  const lines = largest.src.split('\n');
  const header = lines.slice(0, 1);
  const body = lines.slice(1);
  if (body.length === 0) return { src: largest.src, lines: lines.length };
  const reps = Math.ceil((targetLines - header.length) / body.length);
  const grown = [];
  for (let i = 0; i < reps; i++) grown.push(...body);
  const all = header.concat(grown.slice(0, targetLines - header.length));
  return { src: all.join('\n'), lines: all.length };
}

function synth10kConcat(files, rand, targetLines) {
  // Concatenated-routines variant — each chunk has its own header_line,
  // creating many label boundaries. This stresses the parser more than
  // a single 10k-line routine; reported alongside the canonical case so
  // multi-routine corpora performance is also visible.
  const chunks = [];
  let lines = 0;
  const shuffled = pickSample(files, files.length, rand);
  let i = 0;
  while (lines < targetLines && i < shuffled.length) {
    const s = fs.readFileSync(shuffled[i], 'utf-8');
    chunks.push(s);
    lines += s.split('\n').length;
    i++;
  }
  return { src: chunks.join('\n'), lines };
}

function main() {
  const allFiles = findRoutines(CORPUS_ROOT);
  if (allFiles.length === 0) {
    console.error(`no .m files under ${CORPUS_ROOT}`);
    process.exit(2);
  }
  const rand = lcg(20260426);

  const parser = new Parser();
  parser.setLanguage(M);

  // --- bench 1: representative sample ---
  const sample = pickSample(allFiles, SAMPLE, rand);
  const sampleResults = [];
  for (const f of sample) {
    const src = fs.readFileSync(f, 'utf-8');
    const ms = timeParse(parser, src, REPEATS);
    sampleResults.push({ path: f, lines: src.split('\n').length, bytes: src.length, ms });
  }
  const sampleSorted = [...sampleResults.map(r => r.ms)].sort((a, b) => a - b);
  const sampleStats = {
    n: sampleResults.length,
    p50_ms: quantile(sampleSorted, 0.50),
    p95_ms: quantile(sampleSorted, 0.95),
    max_ms: sampleSorted[sampleSorted.length - 1],
    total_bytes: sampleResults.reduce((a, r) => a + r.bytes, 0),
  };

  // --- bench 2: largest single routine ---
  const largest = findLargest(allFiles);
  const largestMs = timeParse(parser, largest.src, REPEATS);

  // --- bench 3: synthesised 10k-line single routine (spec budget case) ---
  const single = synth10kSingleRoutine(largest, TARGET_LINES);
  const singleMs = timeParse(parser, single.src, REPEATS);

  // --- bench 4: 10k lines via concatenated routines (informational) ---
  const concat = synth10kConcat(allFiles, rand, TARGET_LINES);
  const concatMs = timeParse(parser, concat.src, REPEATS);

  // Spec criterion #6 measures a single 10k-line routine.
  const overBudget = singleMs > BUDGET_MS;

  if (asJson) {
    process.stdout.write(JSON.stringify({
      corpus_root: CORPUS_ROOT,
      total_files: allFiles.length,
      sample: sampleStats,
      largest_single: { path: largest.path, lines: largest.lines, bytes: largest.bytes, ms: largestMs },
      synth_10k_single: { lines: single.lines, bytes: single.src.length, ms: singleMs },
      synth_10k_concat: { lines: concat.lines, bytes: concat.src.length, ms: concatMs },
      budget_ms: BUDGET_MS,
      pass: !overBudget,
    }, null, 2) + '\n');
  } else {
    console.log(`tree-sitter-m perf bench`);
    console.log(`  corpus: ${CORPUS_ROOT}`);
    console.log(`  total files: ${allFiles.length}`);
    console.log();
    console.log(`Sample (n=${sampleStats.n}, ${REPEATS} repeats per file, median taken):`);
    console.log(`  p50:  ${sampleStats.p50_ms.toFixed(2)} ms`);
    console.log(`  p95:  ${sampleStats.p95_ms.toFixed(2)} ms`);
    console.log(`  max:  ${sampleStats.max_ms.toFixed(2)} ms`);
    console.log(`  total bytes: ${(sampleStats.total_bytes / 1024).toFixed(1)} KiB`);
    console.log();
    console.log(`Largest single real routine: ${path.basename(largest.path)}`);
    console.log(`  ${largest.lines} lines / ${largest.bytes} bytes / ${largestMs.toFixed(2)} ms`);
    console.log();
    console.log(`Synthesised ${TARGET_LINES}-line single routine (spec budget case):`);
    console.log(`  ${single.lines} lines / ${single.src.length} bytes / ${singleMs.toFixed(2)} ms`);
    console.log();
    console.log(`Synthesised ${TARGET_LINES} lines via concatenated routines (informational):`);
    console.log(`  ${concat.lines} lines / ${concat.src.length} bytes / ${concatMs.toFixed(2)} ms`);
    console.log();
    console.log(`Spec budget: ${BUDGET_MS} ms for ${TARGET_LINES}-line single routine`);
    console.log(`  result: ${singleMs.toFixed(2)} ms — ${overBudget ? 'FAIL (over budget)' : 'PASS'}`);
  }

  process.exit(overBudget ? 1 : 0);
}

main();
