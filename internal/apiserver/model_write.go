package apiserver

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

// WriteModelFileAtomic writes content via a temp file then replaces the destination.
// On Windows, os.Rename cannot overwrite an existing file, so we remove first.
func WriteModelFileAtomic(absPath, content string) error {
	if err := os.MkdirAll(filepath.Dir(absPath), 0o755); err != nil {
		return err
	}
	tmpPath := absPath + ".tmp"
	if err := os.WriteFile(tmpPath, []byte(content), 0o644); err != nil {
		return err
	}
	return replaceFile(tmpPath, absPath)
}

func replaceFile(tmpPath, absPath string) error {
	if err := os.Remove(absPath); err != nil && !os.IsNotExist(err) {
		_ = os.Remove(tmpPath)
		return err
	}
	if err := os.Rename(tmpPath, absPath); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	return nil
}

type pendingModelWrite struct {
	absPath string
	relPath string
	tmpPath string
	file    *os.File
	created time.Time
}

// ChunkedModelWriter assembles large model XML on disk in chunks to avoid
// shipping one multi‑MB string through the desktop IPC bridge.
type ChunkedModelWriter struct {
	mu      sync.Mutex
	pending map[string]*pendingModelWrite
}

func NewChunkedModelWriter() *ChunkedModelWriter {
	return &ChunkedModelWriter{pending: make(map[string]*pendingModelWrite)}
}

func (w *ChunkedModelWriter) Begin(absPath, relPath string) (writeID string, err error) {
	if err := os.MkdirAll(filepath.Dir(absPath), 0o755); err != nil {
		return "", err
	}
	tmpPath := absPath + ".tmp." + uuid.NewString()
	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return "", err
	}
	id := uuid.NewString()
	w.mu.Lock()
	w.pending[id] = &pendingModelWrite{
		absPath: absPath,
		relPath: relPath,
		tmpPath: tmpPath,
		file:    f,
		created: time.Now(),
	}
	w.mu.Unlock()
	return id, nil
}

func (w *ChunkedModelWriter) Append(writeID, chunk string) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	p := w.pending[writeID]
	if p == nil || p.file == nil {
		return fmt.Errorf("unknown or closed write session")
	}
	_, err := p.file.WriteString(chunk)
	return err
}

func (w *ChunkedModelWriter) Commit(writeID string) (relPath string, err error) {
	w.mu.Lock()
	p := w.pending[writeID]
	delete(w.pending, writeID)
	w.mu.Unlock()
	if p == nil {
		return "", fmt.Errorf("unknown write session")
	}
	if p.file != nil {
		if cerr := p.file.Close(); cerr != nil {
			_ = os.Remove(p.tmpPath)
			return "", cerr
		}
		p.file = nil
	}
	if err := replaceFile(p.tmpPath, p.absPath); err != nil {
		return "", err
	}
	return p.relPath, nil
}

func (w *ChunkedModelWriter) Abort(writeID string) {
	w.mu.Lock()
	p := w.pending[writeID]
	delete(w.pending, writeID)
	w.mu.Unlock()
	if p == nil {
		return
	}
	if p.file != nil {
		_ = p.file.Close()
	}
	_ = os.Remove(p.tmpPath)
}
