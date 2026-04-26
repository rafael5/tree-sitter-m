# AD-05: Test against a corpus of real M code from multiple sources

**Status:** accepted (B0, 2026-04); validated end of B5 (99.06% on full
VistA corpus)
**Decided by:** Rafael Richards
**Supersedes:** —
**Superseded by:** —

## Context

Synthetic fixtures cover the rules a developer thinks to write tests
for. Real-world M code exercises every weird-but-legal construct the
language permits — and M is liberal enough that "weird" is common:

- The two-space rule for argless commands (`D ^FOO  Q`).
- Naked global references (`^(...)`).
- `?` tab-to-column in WRITE (`W ?40,X`).
- `$S` colon-chains spanning many tokens with internal commas.
- Per-argument postconditionals on DO/GOTO (`D LBL:cond^RTN`).
- Indirection in entry-reference's routine slot (`@RTN`).
- Pattern alternation with multi-atom branches (`(1"X",1"Y".E)`).

A grammar that passes a hand-curated test suite and still fails on
real code is, in practice, broken.

## Decision

Maintain three test layers, each with a different scope:

1. **`test/corpus/*.txt`** — tree-sitter's standard corpus format.
   Hand-curated tests for every grammar feature; one file per feature
   group. The structural baseline.
2. **`test/coverage/keywords.m`** — auto-generated synthetic file
   that exercises every `(canonical, status)` pair in the metadata
   (per [AD-03](AD-03-standard-status-on-nodes.md)). Drives the per-tier
   coverage gate.
3. **Real-source smoke gate** — [`tools/smoke-corpus.js`](../../tools/smoke-corpus.js)
   parses the full local VistA corpus (~39,330 routines / 162 MB) and
   reports per-package error stats. Used as the regression metric
   throughout B4–B5; not in CI (CI lacks the corpus).

The corpus must include actual routines from at least:

- VistA Kernel (IRIS-style M).
- A YottaDB sample application (YDB-style M).
- `m-standard`'s own SAC sources (XINDEX itself, known compliant).
- Synthetic fixtures targeting specific grammar rules.

## Consequences

**Positive:**

- Coverage breadth is provable (all 347 keyword pairs exercised) and
  real-world quality is measurable (99.06% clean on 39,330 routines
  end of B5). The two metrics complement each other: coverage proves
  recognition; smoke proves recognition-in-context.
- The smoke gate doubles as a regression detector — every grammar
  change is run against the full corpus and the per-package stats
  show *where* a regression landed.
- Contributors get a clear pyramid: corpus tests for "does this rule
  do what I mean", coverage gate for "did I forget anything", smoke
  for "does it survive reality".

**Negative:**

- The smoke corpus isn't redistributable (VistA/Kernel routines have
  their own licensing). Smoke runs only on machines with a local
  copy. CI gets the corpus + lib + coverage gate; the real-source
  pass-rate is a manual ritual at release time.
- Synthetic fixtures and real routines can both be wrong (a parse
  that produces no `ERROR` node could still be wrong if the tree
  shape is wrong). Round-trip fidelity tests would catch this; not
  yet implemented (spec §15 risk note).
