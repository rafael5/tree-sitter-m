# Architectural decisions — tree-sitter-m

The six decisions that drive the rest of [`docs/spec.md`](../spec.md).
Each ADR documents context (what problem), decision (what we're
doing), and consequences (good and bad). All status `accepted`.

| | Decision |
|---|---|
| [AD-01](AD-01-source-grammar-surface.md) | Source the keyword tables from `m-standard`'s grammar-surface, not from any single standard. |
| [AD-02](AD-02-hand-code-language-structure.md) | Hand-code the language structure; data-drive the keyword tables. |
| [AD-03](AD-03-standard-status-on-nodes.md) | Stamp `standard_status` as an AST node attribute. |
| [AD-04](AD-04-pin-mstandard-schema.md) | Pin to a specific `m-standard` schema version. |
| [AD-05](AD-05-real-source-corpus.md) | Test against a corpus of real M code from multiple sources. |
| [AD-06](AD-06-tree-sitter-bindings.md) | Provide language bindings via tree-sitter's standard scaffold. |
