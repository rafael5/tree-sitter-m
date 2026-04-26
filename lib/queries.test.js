// Smoke test for the bundled tree-sitter queries — guards against
// query-file rot when grammar.js node types get renamed or removed.
// "Compiles cleanly" is a stronger gate than "is checked in".
//
// We don't assert what scopes appear (themes vary); we just verify
// the query loads against the current parser and matches at least
// one node on a representative M routine.

'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const Parser = require('tree-sitter');
const M = require('..');

const QUERY_PATHS = [
  path.resolve(__dirname, '..', 'queries', 'highlights.scm'),
];

const SAMPLE = `TEST(A,B) ;sample routine
 S X=1
 W "hello",!
 I X>0 D
 . W X,!
 Q $$RESULT^OTHER(X)
`;

for (const qp of QUERY_PATHS) {
  test(`queries/${path.basename(qp)} compiles against the current grammar`, () => {
    const text = fs.readFileSync(qp, 'utf-8');
    let q;
    assert.doesNotThrow(() => { q = new Parser.Query(M, text); }, 'query failed to compile');

    const parser = new Parser();
    parser.setLanguage(M);
    const tree = parser.parse(SAMPLE);
    const captures = q.captures(tree.rootNode);
    assert.ok(captures.length > 0, 'query matched zero nodes on the sample routine');
  });
}
