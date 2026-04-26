package tree_sitter_m_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_m "github.com/rafael5/tree-sitter-m/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_m.Language())
	if language == nil {
		t.Errorf("Error loading M grammar")
	}
}

func TestParseSampleRoutine(t *testing.T) {
	parser := tree_sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(tree_sitter.NewLanguage(tree_sitter_m.Language())); err != nil {
		t.Fatalf("set language: %v", err)
	}
	src := []byte("TEST ;sample\n S X=1\n W X,!\n Q\n")
	tree := parser.Parse(src, nil)
	defer tree.Close()
	root := tree.RootNode()
	if root.HasError() {
		t.Fatalf("unexpected ERROR node in sample routine; sexp=%s", root.ToSexp())
	}
	if got := root.Kind(); got != "source_file" {
		t.Fatalf("root kind = %q, want \"source_file\"", got)
	}
}
