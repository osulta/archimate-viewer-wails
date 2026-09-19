package apiserver

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestChunkedModelWriterRoundTrip(t *testing.T) {
	dir := t.TempDir()
	abs := filepath.Join(dir, "model.archimate")
	w := NewChunkedModelWriter()

	id, err := w.Begin(abs, "model.archimate")
	if err != nil {
		t.Fatal(err)
	}
	parts := []string{"<model>", strings.Repeat("x", 1000), "</model>"}
	for _, p := range parts {
		if err := w.Append(id, p); err != nil {
			t.Fatal(err)
		}
	}
	rel, err := w.Commit(id)
	if err != nil {
		t.Fatal(err)
	}
	if rel != "model.archimate" {
		t.Fatalf("rel=%q", rel)
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		t.Fatal(err)
	}
	want := strings.Join(parts, "")
	if string(data) != want {
		t.Fatalf("content mismatch: got %d bytes want %d", len(data), len(want))
	}
}

func TestChunkedModelWriterAbort(t *testing.T) {
	dir := t.TempDir()
	abs := filepath.Join(dir, "model.archimate")
	w := NewChunkedModelWriter()
	id, err := w.Begin(abs, "model.archimate")
	if err != nil {
		t.Fatal(err)
	}
	if err := w.Append(id, "partial"); err != nil {
		t.Fatal(err)
	}
	w.Abort(id)
	if _, err := os.Stat(abs); !os.IsNotExist(err) {
		t.Fatalf("target should not exist after abort, err=%v", err)
	}
	matches, _ := filepath.Glob(abs + ".tmp.*")
	if len(matches) != 0 {
		t.Fatalf("temp files left: %v", matches)
	}
}
