#!/usr/bin/env bash
# scripts/vista-parse-rate.sh — gate VistA-corpus parse-error rate.
#
# Runs `m fmt --check` over the canonical VistA corpus
# (~/projects/vista-meta/vista/vista-m-host/Packages — 39,375
# routines) and asserts that the parse-error rate stays at or below
# the threshold (default 1.0 %). Used by `make parse-rate-check`
# and by the pre-merge CI gate.
#
# Why parse-error rate? VistA is the original 40K-routine corpus
# tree-sitter-m grew up against — currently 0.97 %, near zero. A
# regression to 1.5 % would mean a grammar change broke ~200
# routines. Keeping the rate under 1.0 % preserves coverage of the
# canonical legacy idioms.
#
# Exit codes:
#   0  parse-error rate <= threshold
#   1  parse-error rate ABOVE threshold (regression — investigate)
#   2  vista-meta corpus not present at the expected location
#   3  m fmt not on PATH

set -u

VISTA_DIR="${VISTA_DIR:-$HOME/projects/vista-meta/vista/vista-m-host/Packages}"
THRESHOLD_PCT="${THRESHOLD_PCT:-1.0}"
M_BIN="${M_BIN:-$(which m 2>/dev/null || echo $HOME/projects/m-cli/.venv/bin/m)}"

if [ ! -d "$VISTA_DIR" ]; then
    echo "vista-parse-rate: corpus missing at $VISTA_DIR" >&2
    echo "  set VISTA_DIR=/path/to/vista/Packages to override" >&2
    exit 2
fi

if [ ! -x "$M_BIN" ]; then
    echo "vista-parse-rate: m CLI not found at $M_BIN" >&2
    echo "  set M_BIN=/path/to/m to override" >&2
    exit 3
fi

# Count parse errors and total .m files. `m fmt --check` emits
# one ``parse error`` line per file that didn't parse cleanly.
parse_errors=$(
    "$M_BIN" fmt --check "$VISTA_DIR" 2>&1 \
    | grep -c "parse error" \
    || true
)
total=$(find "$VISTA_DIR" -name '*.m' -type f | wc -l)
if [ "$total" -eq 0 ]; then
    echo "vista-parse-rate: no .m files under $VISTA_DIR" >&2
    exit 2
fi

# Compute percentage with awk (no python dependency).
pct=$(awk "BEGIN { printf \"%.3f\", ($parse_errors / $total) * 100 }")

printf 'vista-parse-rate: %s parse errors / %s files = %s%% (threshold %s%%)\n' \
    "$parse_errors" "$total" "$pct" "$THRESHOLD_PCT"

# Decimal comparison via awk.
verdict=$(awk "BEGIN { print ($pct <= $THRESHOLD_PCT) ? \"ok\" : \"FAIL\" }")
if [ "$verdict" = "ok" ]; then
    echo "vista-parse-rate: PASS"
    exit 0
fi

echo "vista-parse-rate: FAIL — parse-error rate above threshold" >&2
exit 1
