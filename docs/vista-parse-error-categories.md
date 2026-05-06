# VistA parse-error triage — patterns to close

Living document. Triage of the 376 parse-error files in the
canonical VistA corpus (39,375 routines, 0.97 % rate as of
2026-05-06).

## How to use

1. Re-run the gate to capture the current parse-error file list:
   ```bash
   m fmt --check ~/projects/vista-meta/vista/vista-m-host/Packages/ \
     2>&1 | grep "parse error" > vista-parse-errors.txt
   ```
2. Pick a file from the list and inspect.
3. Identify which category the gap falls under (extend the list
   below if a new pattern shows up).
4. Add a minimal fixture under `test/corpus/vista-legacy/` —
   the smallest snippet that reproduces the parse error.
5. Fix grammar; re-run `make test` and `make parse-rate-check`.

## Known categories (initial triage)

### Cat-1 — `%` as a bare local variable name

Sample: `KMPBEMRT.m:13` —
```m
 N KMPPARMS,KMPVSITE,KMPVSINF,KMPSC,KMPVSTOP,KMPVCHKH,KMPVH,KMPVSINT,KMPVHANG,KMPVSLOT,ZTDTH,ZTRTN,ZTDESC,ZTSAVE,%
```

The trailing `%` is a legal M local-variable name (a `%`-prefixed
local with empty body, conventionally a Kernel scratch). The
grammar's `local_variable` rule likely requires at least one
`[A-Z0-9]` character after the leading `%` / letter. Fix: extend
the local_variable token regex to accept `%` followed by an
optional name body.

### Cat-2 — GT.M-specific intrinsic special variables (`$V`, `$ZB`, `$ZH`)

Sample: `A1BFDBWR.m:8` —
```m
 S A1BFVP=$V(44)+2,A1BFVP1=$V(A1BFVP+2,-3,2),A1BFVD1=$ZH(2000)
 I $ZB(A1BFVP1,A1BFVD1,1) S A1BFDSON=0 Q
```

`$V` (GT.M alias for `$VIEW`), `$ZB` and `$ZH` are GT.M-specific
intrinsics that VistA-on-DSM legacy code uses heavily. The grammar
may not register them as known intrinsic_function_keyword. Fix
direction: data-driven keyword set already covers most $Z\* — verify
m-standard's TSV includes the GT.M alias forms; if not, register
the aliases in tree-sitter-m's keyword overlay.

### Cat-3 — banner-line patterns with embedded `^` / `;;`

Status: needs sampling. Many `parse error — 1 error nodes` files
have a short banner-only error count, suggesting a single
problematic structural element near the routine top. Likely
candidates: `;;` directives carrying file-IEN or version embeds
that contain `^` or unusual characters the comment lexer's
inner-content rule doesn't accept.

### Cat-4 — multi-line `for ... do  quit:` constructs

Status: needs sampling. Files with 6+ error nodes (A1BULOOK.m,
A1CRCOM.m, KMPBEMRT.m at 22) are candidates — these likely
combine multiple legacy patterns in one file, each contributing
its own error nodes.

## What's already known to work

- Standard ANSI command set
- All standard intrinsic functions and ISVs
- Postconditionals (`Q:cond`)
- Indirection (`@var`, `@$$func()`)
- Dot-blocks (single + nested)
- Banner lines `;;version;package;...;date;build`
- Comments with embedded special characters

## Where to start

The single highest-value fix is **Cat-1 (`%` bare-name)**:
appears in many of the multi-error-node files (large `NEW` lists
ending in `,%` are a common Kernel pattern). One grammar tweak
likely closes 50-100 files. Cat-2 (GT.M intrinsics) is a close
second — concentrated in the older Albany ISC routines.
