ifeq ($(OS),Windows_NT)
$(error Windows is not supported)
endif

LANGUAGE_NAME := tree-sitter-m
HOMEPAGE_URL := https://github.com/m-dev-tools/tree-sitter-m
VERSION := 0.1.1

# repository
SRC_DIR := src

TS ?= tree-sitter

# install directory layout
PREFIX ?= /usr/local
DATADIR ?= $(PREFIX)/share
INCLUDEDIR ?= $(PREFIX)/include
LIBDIR ?= $(PREFIX)/lib
PCLIBDIR ?= $(LIBDIR)/pkgconfig

# source/object files
PARSER := $(SRC_DIR)/parser.c
EXTRAS := $(filter-out $(PARSER),$(wildcard $(SRC_DIR)/*.c))
OBJS := $(patsubst %.c,%.o,$(PARSER) $(EXTRAS))

# flags
ARFLAGS ?= rcs
override CFLAGS += -I$(SRC_DIR) -std=c11 -fPIC

# ABI versioning
SONAME_MAJOR = $(shell sed -n 's/\#define LANGUAGE_VERSION //p' $(PARSER))
SONAME_MINOR = $(word 1,$(subst ., ,$(VERSION)))

# OS-specific bits
ifeq ($(shell uname),Darwin)
	SOEXT = dylib
	SOEXTVER_MAJOR = $(SONAME_MAJOR).$(SOEXT)
	SOEXTVER = $(SONAME_MAJOR).$(SONAME_MINOR).$(SOEXT)
	LINKSHARED = -dynamiclib -Wl,-install_name,$(LIBDIR)/lib$(LANGUAGE_NAME).$(SOEXTVER),-rpath,@executable_path/../Frameworks
else
	SOEXT = so
	SOEXTVER_MAJOR = $(SOEXT).$(SONAME_MAJOR)
	SOEXTVER = $(SOEXT).$(SONAME_MAJOR).$(SONAME_MINOR)
	LINKSHARED = -shared -Wl,-soname,lib$(LANGUAGE_NAME).$(SOEXTVER)
endif
ifneq ($(filter $(shell uname),FreeBSD NetBSD DragonFly),)
	PCLIBDIR := $(PREFIX)/libdata/pkgconfig
endif

all: lib$(LANGUAGE_NAME).a lib$(LANGUAGE_NAME).$(SOEXT) $(LANGUAGE_NAME).pc

lib$(LANGUAGE_NAME).a: $(OBJS)
	$(AR) $(ARFLAGS) $@ $^

lib$(LANGUAGE_NAME).$(SOEXT): $(OBJS)
	$(CC) $(LDFLAGS) $(LINKSHARED) $^ $(LDLIBS) -o $@
ifneq ($(STRIP),)
	$(STRIP) $@
endif

$(LANGUAGE_NAME).pc: bindings/c/$(LANGUAGE_NAME).pc.in
	sed -e 's|@PROJECT_VERSION@|$(VERSION)|' \
		-e 's|@CMAKE_INSTALL_LIBDIR@|$(LIBDIR:$(PREFIX)/%=%)|' \
		-e 's|@CMAKE_INSTALL_INCLUDEDIR@|$(INCLUDEDIR:$(PREFIX)/%=%)|' \
		-e 's|@PROJECT_DESCRIPTION@|$(DESCRIPTION)|' \
		-e 's|@PROJECT_HOMEPAGE_URL@|$(HOMEPAGE_URL)|' \
		-e 's|@CMAKE_INSTALL_PREFIX@|$(PREFIX)|' $< > $@

$(PARSER): $(SRC_DIR)/grammar.json
	$(TS) generate $^

install: all
	install -d '$(DESTDIR)$(DATADIR)'/tree-sitter/queries/m '$(DESTDIR)$(INCLUDEDIR)'/tree_sitter '$(DESTDIR)$(PCLIBDIR)' '$(DESTDIR)$(LIBDIR)'
	install -m644 bindings/c/tree_sitter/$(LANGUAGE_NAME).h '$(DESTDIR)$(INCLUDEDIR)'/tree_sitter/$(LANGUAGE_NAME).h
	install -m644 $(LANGUAGE_NAME).pc '$(DESTDIR)$(PCLIBDIR)'/$(LANGUAGE_NAME).pc
	install -m644 lib$(LANGUAGE_NAME).a '$(DESTDIR)$(LIBDIR)'/lib$(LANGUAGE_NAME).a
	install -m755 lib$(LANGUAGE_NAME).$(SOEXT) '$(DESTDIR)$(LIBDIR)'/lib$(LANGUAGE_NAME).$(SOEXTVER)
	ln -sf lib$(LANGUAGE_NAME).$(SOEXTVER) '$(DESTDIR)$(LIBDIR)'/lib$(LANGUAGE_NAME).$(SOEXTVER_MAJOR)
	ln -sf lib$(LANGUAGE_NAME).$(SOEXTVER_MAJOR) '$(DESTDIR)$(LIBDIR)'/lib$(LANGUAGE_NAME).$(SOEXT)
ifneq ($(wildcard queries/*.scm),)
	install -m644 queries/*.scm '$(DESTDIR)$(DATADIR)'/tree-sitter/queries/m
endif

uninstall:
	$(RM) '$(DESTDIR)$(LIBDIR)'/lib$(LANGUAGE_NAME).a \
		'$(DESTDIR)$(LIBDIR)'/lib$(LANGUAGE_NAME).$(SOEXTVER) \
		'$(DESTDIR)$(LIBDIR)'/lib$(LANGUAGE_NAME).$(SOEXTVER_MAJOR) \
		'$(DESTDIR)$(LIBDIR)'/lib$(LANGUAGE_NAME).$(SOEXT) \
		'$(DESTDIR)$(INCLUDEDIR)'/tree_sitter/$(LANGUAGE_NAME).h \
		'$(DESTDIR)$(PCLIBDIR)'/$(LANGUAGE_NAME).pc
	$(RM) -r '$(DESTDIR)$(DATADIR)'/tree-sitter/queries/m

clean:
	$(RM) $(OBJS) $(LANGUAGE_NAME).pc lib$(LANGUAGE_NAME).a lib$(LANGUAGE_NAME).$(SOEXT)

test:
	$(TS) test

# parse-rate-check: run `m fmt --check` over the canonical VistA
# corpus and assert that the parse-error rate stays at or below
# THRESHOLD_PCT (default 1.0%). Pre-merge gate to catch grammar
# regressions on legacy VistA syntax.
#
#   THRESHOLD_PCT=1.0 make parse-rate-check
#   VISTA_DIR=/other/path THRESHOLD_PCT=2.0 make parse-rate-check
parse-rate-check:
	./scripts/vista-parse-rate.sh

# ── Phase-0 AI-discoverability contract ───────────────────────────────
#
# Tier-2 entry to the org catalog. See
# https://github.com/m-dev-tools/.github/blob/main/docs/AI-discoverability-plan.md
#
# The exposed `src/{node-types,grammar,grammar-metadata}.json` files
# are tree-sitter-generated and already committed; there's no separate
# `make manifest` step that regenerates them outside the existing
# `tree-sitter generate` / `tools/build-grammar.js` chain (gated by
# `make test`). `make manifest` is therefore a no-op pointer — it
# exists only so verification_commands in dist/repo.meta.json line up
# with the other org repos.

manifest:
	@echo "tree-sitter-m: dist/repo.meta.json exposes are tree-sitter-generated under src/."
	@echo "  - 'tree-sitter generate'         → src/{parser.c,grammar.json,node-types.json}"
	@echo "  - 'node tools/build-grammar.js'  → grammar.js + src/grammar-metadata.json"
	@echo "    (the build-grammar step requires a sibling m-standard checkout)"

check-manifest:
	python3 tools/check-manifest.py

# Guardrail: docs/ holds only human-readable prose. Same target name
# as the tier-1 repos so cross-repo muscle memory works.
check-docs-prose:
	@if [ ! -d docs ]; then echo "check-docs-prose: no docs/ directory ✓"; exit 0; fi; \
	violations=$$(find docs -type f \
	    ! -name '*.md' ! -name '*.markdown' \
	    ! -name '*.png' ! -name '*.jpg' ! -name '*.jpeg' \
	    ! -name '*.gif' ! -name '*.svg' ! -name '*.webp' \
	    ! -name '.gitkeep'); \
	if [ -n "$$violations" ]; then \
	  echo "ERROR: non-prose files under docs/ — move to a top-level domain dir:" >&2; \
	  echo "$$violations" >&2; \
	  exit 1; \
	fi; \
	echo "check-docs-prose: docs/ is prose-only ✓"

.PHONY: all install uninstall clean test parse-rate-check manifest check-manifest check-docs-prose
