const assert = require("node:assert");
const { test } = require("node:test");

const Parser = require("tree-sitter");

test("can load grammar", () => {
  const parser = new Parser();
  assert.doesNotThrow(() => parser.setLanguage(require(".")));
});

test("parses a sample routine without errors", () => {
  const parser = new Parser();
  parser.setLanguage(require("."));
  const src = "TEST ;sample\n S X=1\n W X,!\n Q\n";
  const tree = parser.parse(src);
  assert.strictEqual(tree.rootNode.type, "source_file");
  assert.ok(!tree.rootNode.hasError, "unexpected ERROR node in sample routine");
});
