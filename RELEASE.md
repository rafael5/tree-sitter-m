# Release checklist — tree-sitter-m

A walk-through for publishing `tree-sitter-m` to npm, crates.io,
PyPI, the Go module proxy, and GitHub releases. Run against this
checklist; do not skip steps.

> **First-publish note.** The initial public release is **0.1.0**
> — all four binding scaffolds work locally and across the CI
> matrix, but no consumer has touched the package yet. The 0.x
> prefix signals "expect breaking changes during the editor-
> integration shakedown" (success criterion #8). Bump to 1.0.0
> only after at least one editor integration ships and absorbs
> real usage feedback.

## 0. Pre-flight — must all be green

Run from `~/projects/tree-sitter-m/` on a clean `main`:

```bash
git status                                          # clean working tree
git pull --ff-only                                  # at HEAD
nvm use 22                                          # tree-sitter@0.25 requires Node 22 LTS
npm ci
npm test                                            # corpus + lib + coverage gate
npx tree-sitter generate
git diff --exit-code -- src/parser.c src/grammar.json src/node-types.json
                                                    # parser regen-clean
node tools/smoke-corpus.js ~/vista-meta/vista/vista-m-host/Packages \
  --by-package | tail -20                           # ≥99% clean
node tools/perf-bench.js                            # 10k synth under 100ms
cargo test --release                                # rust binding
go test ./bindings/go/...                           # go binding
```

If any of these fail, **stop**. Diagnose, fix, recommit, restart
this checklist.

Also check:

- [ ] CI on main is fully green for the most recent commit
      (`gh run list -L 1 --branch main`).
- [ ] No uncommitted changes to ADRs / spec / generated artifacts.
- [ ] m-standard schema_version pin in `package.json` matches what
      `~/projects/m-standard/integrated/grammar-surface.json`
      currently ships.

## 1. Coordinate the version bump

Six files declare the version. Bump them together — drift here
breaks the npm/crates/PyPI metadata link.

```
package.json        line 3   "version": "0.1.0"
tree-sitter.json    line 13  "version": "0.1.0"
Cargo.toml          line 4   version = "0.1.0"
pyproject.toml      line 8   version = "0.1.0"
CMakeLists.txt      line 4   VERSION "0.1.0"
Makefile            line ~5  VERSION := 0.1.0
```

For the *first* publish stay on **0.1.0** in all six. For
subsequent bumps, do all six in one commit:

```bash
NEW=0.1.1
sed -i 's/"version": "0\.1\.0"/"version": "'"$NEW"'"/' package.json tree-sitter.json
sed -i 's/version = "0\.1\.0"/version = "'"$NEW"'"/' Cargo.toml pyproject.toml
sed -i 's/VERSION "0\.1\.0"/VERSION "'"$NEW"'"/' CMakeLists.txt
sed -i 's/^VERSION := 0\.1\.0/VERSION := '"$NEW"'/' Makefile
git diff                                            # eyeball all 6 changes
git commit -am "release: v$NEW"
```

## 2. Confirm credentials before publishing

Each registry has its own auth. A 2FA prompt mid-publish on one
ecosystem when the others are already up is irritating; do this
first.

- [ ] **npm** — `npm whoami` returns `rafael5` (or the publish
      account). Set up 2FA if not already.
- [ ] **crates.io** — `cargo login` token in `~/.cargo/credentials.toml`,
      account at https://crates.io/me/.
- [ ] **PyPI** — API token in `~/.pypirc` under `[pypi]`. Generate
      at https://pypi.org/manage/account/token/. Scope to
      `tree-sitter-m` after first publish.
- [ ] **Go** — no account; the proxy picks up tagged releases from
      the public GitHub repo automatically.
- [ ] **GitHub** — `gh auth status` shows logged in.

## 3. Publish to npm

```bash
nvm use 22
npm ci
npm pack --dry-run                                  # confirm files list
npm publish --access public                         # 2FA prompt
```

`--access public` is required because the package name has no
scope; npm assumes scoped packages are private otherwise.

**Verify:**
```bash
mkdir -p /tmp/ts-m-npm-verify && cd /tmp/ts-m-npm-verify
npm init -y
npm install tree-sitter-m tree-sitter
node -e "const P=require('tree-sitter'); const M=require('tree-sitter-m');
  const p=new P(); p.setLanguage(M);
  const t=p.parse('TEST ;sample\n S X=1\n Q\n');
  console.log('node binding:', t.rootNode.type, 'hasError=', t.rootNode.hasError);"
```

**Prebuilds** (now wired): `.github/workflows/prebuilds.yml` runs
on `v*` tag push and produces N-API binaries for
linux-x64/arm64, macos-x64/arm64, windows-x64. Each matrix leg
uploads a `prebuilds-<os>-<arch>.tar.gz` artifact, then a final
job attaches all five tarballs to the GitHub Release for the tag.

To bundle them into the npm package before `npm publish`:

```bash
TAG="v$NEW"
gh release download "$TAG" -p 'prebuilds-*.tar.gz' -D /tmp/ts-m-prebuilds
for f in /tmp/ts-m-prebuilds/prebuilds-*.tar.gz; do tar -xzf "$f"; done
ls prebuilds/                                       # 5 platform dirs
npm pack --dry-run | grep prebuilds                 # confirm bundled
npm publish --access public
```

Without this step, first-time consumers on a platform without a
prebuild fall back to `node-gyp` build at install time (works,
but slow and requires a C toolchain).

The CI workflow runs *after* `git push origin "v$NEW"` (step 6,
below). Wait for the workflow's "Attach prebuilds to GitHub
Release" job to finish before running the consumer-bundle block
above.

## 4. Publish to crates.io

```bash
cargo publish --dry-run                             # validates manifest
cargo publish                                       # writes — irreversible
```

crates.io publishes are **immutable** — once a version is up, you
can `cargo yank` (which prevents new dependents from picking it
up) but you cannot republish or delete it. Verify the dry-run
output before the real publish.

**Verify:**
```bash
mkdir -p /tmp/ts-m-cargo-verify && cd /tmp/ts-m-cargo-verify
cargo init --name ts-m-verify
cargo add tree-sitter-m tree-sitter
cat > src/main.rs << 'EOF'
fn main() {
    let mut p = tree_sitter::Parser::new();
    p.set_language(&tree_sitter_m::LANGUAGE.into()).unwrap();
    let t = p.parse("TEST ;sample\n S X=1\n Q\n", None).unwrap();
    println!("rust binding: {} hasError={}", t.root_node().kind(), t.root_node().has_error());
}
EOF
cargo run
```

## 5. Publish to PyPI

```bash
pip install --upgrade build twine
rm -rf dist/ build/ *.egg-info
python -m build                                     # builds sdist + wheel
twine check dist/*
twine upload dist/*                                 # API token prompt
```

PyPI also doesn't allow re-uploading the same version. If the
upload partially fails, bump the version (e.g. 0.1.0 → 0.1.0.post1
for a metadata-only fix).

**Verify:**
```bash
uv venv /tmp/ts-m-pypi-verify --python 3.12 --managed-python
source /tmp/ts-m-pypi-verify/bin/activate
uv pip install "tree-sitter>=0.24" tree-sitter-m
python -c "
from tree_sitter import Language, Parser
import tree_sitter_m
p = Parser(Language(tree_sitter_m.language()))
t = p.parse(b'TEST ;sample\n S X=1\n Q\n')
print('python binding:', t.root_node.type, 'hasError=', t.root_node.has_error)
"
```

## 6. Tag for Go module proxy

Go modules consume directly from the GitHub repo via tagged
releases. No registry push.

```bash
git tag -a "v$NEW" -m "release: v$NEW"
git push origin "v$NEW"
```

The Go proxy (`proxy.golang.org`) picks the tag up automatically
within a few minutes.

**Verify:**
```bash
mkdir -p /tmp/ts-m-go-verify && cd /tmp/ts-m-go-verify
go mod init ts-m-verify
go get github.com/rafael5/tree-sitter-m@v$NEW
cat > main.go << 'EOF'
package main
import (
    "fmt"
    tree_sitter "github.com/tree-sitter/go-tree-sitter"
    tree_sitter_m "github.com/rafael5/tree-sitter-m/bindings/go"
)
func main() {
    p := tree_sitter.NewParser()
    p.SetLanguage(tree_sitter.NewLanguage(tree_sitter_m.Language()))
    t := p.Parse([]byte("TEST ;sample\n S X=1\n Q\n"), nil)
    r := t.RootNode()
    fmt.Printf("go binding: %s hasError=%v\n", r.Kind(), r.HasError())
}
EOF
go run main.go
```

## 7. Cut a GitHub release

Anchor the changelog and link the published artifacts.

```bash
gh release create "v$NEW" \
  --title "v$NEW" \
  --notes-file <(cat <<'EOF'
## Highlights

- (write 2–4 bullets summarising what changed)

## Published artifacts

- npm: https://www.npmjs.com/package/tree-sitter-m/v/$NEW
- crates.io: https://crates.io/crates/tree-sitter-m/$NEW
- PyPI: https://pypi.org/project/tree-sitter-m/$NEW/
- Go: `go get github.com/rafael5/tree-sitter-m@v$NEW`

## Status

See `STATUS.md` for v1.0 success-criteria progress and
`docs/build-log.md` for the per-feature progression.
EOF
)
```

(The `cat <<'EOF'` heredoc inside `<()` works; if `gh release
create` complains about variable expansion in the notes, edit the
notes in-place after creation: `gh release edit "v$NEW"`.)

## 8. Post-publish smoke

After all four registries are up:

- [ ] All four `verify` blocks above print `hasError=false`.
- [ ] Each registry's package page renders the README.
- [ ] The Go badge resolves at `https://pkg.go.dev/github.com/rafael5/tree-sitter-m`.
- [ ] Update `STATUS.md` criterion #7 from ⚠️ to ✅.

## 9. Rollback options if something is wrong

In rough order of severity:

| Ecosystem | Reversal options |
|---|---|
| npm | `npm deprecate tree-sitter-m@$NEW "reason"` (warns on install). Cannot delete after 24 hours. Best: bump the patch version with the fix. |
| crates.io | `cargo yank --version $NEW`. Cannot delete. Yanked versions stay installable but won't resolve from `^` deps. |
| PyPI | "Yank" via the PyPI web UI. Cannot delete (administrators only, for serious reasons). |
| Go | Nothing to do — modules are immutable. Publish a higher-version tag with the fix; the proxy will surface it. |
| GitHub release | `gh release delete "v$NEW"` works but the git tag persists and Go still serves from it. |

In all four cases the practical fix is **publish a new patch
version** with the correction. Treat any published version as
immutable.

## 10. After the first release lands

- [ ] Watch `npm view tree-sitter-m` downloads, the crates.io
      reverse-deps page, and PyPI BigQuery for early-adopter
      activity.
- [ ] Open issues for any platform-specific install failures
      reported by users; the prebuildify rollout is the lever for
      most of them.
- [ ] Plan #8 (one editor integration). VS Code extension and
      nvim-treesitter PR are the two natural targets — pick one
      and ship.
