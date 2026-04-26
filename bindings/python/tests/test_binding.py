from unittest import TestCase

from tree_sitter import Language, Parser
import tree_sitter_m


class TestLanguage(TestCase):
    def test_can_load_grammar(self):
        try:
            Parser(Language(tree_sitter_m.language()))
        except Exception:
            self.fail("Error loading M grammar")

    def test_parse_sample_routine(self):
        parser = Parser(Language(tree_sitter_m.language()))
        src = b"TEST ;sample\n S X=1\n W X,!\n Q\n"
        tree = parser.parse(src)
        root = tree.root_node
        self.assertEqual(root.type, "source_file")
        self.assertFalse(root.has_error, "unexpected ERROR node in sample routine")
