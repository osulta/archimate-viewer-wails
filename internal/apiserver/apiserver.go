// Package apiserver implements the local HTTP API (git operations + reading and
// writing ArchiMate models) in pure Go. It replaces the previous Node.js/Express
// service and runs in-process inside the Wails app, or standalone via cmd/git-api.
package apiserver

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const defaultPort = 5151

// Config configures the API server.
type Config struct {
	RepoRoot    string
	StaticDir   string
	ServeStatic bool
	Port        int

	// DefaultRepoRoot is the platform default reported to the UI so it can offer
	// a "reset to default" action. When empty it falls back to RepoRoot.
	DefaultRepoRoot string
	// OnRepoRootChange is invoked after the repo root is changed at runtime so the
	// host (e.g. the desktop app) can persist the new value. It may be nil.
	OnRepoRootChange func(newRoot string) error
}

// Server is the in-process HTTP API server.
type Server struct {
	repoRoot        string
	defaultRepoRoot string
	staticDir       string
	serveStatic     bool
	baseURL         string

	onRepoRootChange func(string) error

	httpServer *http.Server
	listener   net.Listener
	mu         sync.Mutex
	repoRootMu sync.RWMutex
}

// Start binds an in-process HTTP server on 127.0.0.1 and waits until it is healthy.
func Start(ctx context.Context, cfg Config) (*Server, error) {
	if cfg.RepoRoot == "" {
		return nil, fmt.Errorf("apiserver: empty repo root")
	}
	if err := os.MkdirAll(cfg.RepoRoot, 0o755); err != nil {
		return nil, fmt.Errorf("apiserver: repo root: %w", err)
	}
	repoRootAbs, err := filepath.Abs(cfg.RepoRoot)
	if err != nil {
		return nil, fmt.Errorf("apiserver: repo root abs: %w", err)
	}

	port := cfg.Port
	if port <= 0 {
		port = defaultPort
	}
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		listener, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			return nil, fmt.Errorf("apiserver: listen: %w", err)
		}
	}
	port = listener.Addr().(*net.TCPAddr).Port

	defaultRoot := strings.TrimSpace(cfg.DefaultRepoRoot)
	if defaultRoot == "" {
		defaultRoot = repoRootAbs
	} else if abs, e := filepath.Abs(defaultRoot); e == nil {
		defaultRoot = abs
	}

	s := &Server{
		repoRoot:         repoRootAbs,
		defaultRepoRoot:  defaultRoot,
		staticDir:        cfg.StaticDir,
		serveStatic:      cfg.ServeStatic,
		baseURL:          fmt.Sprintf("http://127.0.0.1:%d", port),
		listener:         listener,
		onRepoRootChange: cfg.OnRepoRootChange,
	}
	s.httpServer = &http.Server{Handler: s.routes()}

	go func() {
		_ = s.httpServer.Serve(listener)
	}()

	if err := s.waitHealthy(ctx, 10*time.Second); err != nil {
		_ = s.Stop()
		return nil, err
	}
	return s, nil
}

// BaseURL returns the loopback base URL the frontend should target.
func (s *Server) BaseURL() string {
	return s.baseURL
}

// RepoRoot returns the current GIT_REPO_ROOT (thread-safe).
func (s *Server) RepoRoot() string {
	s.repoRootMu.RLock()
	defer s.repoRootMu.RUnlock()
	return s.repoRoot
}

// DefaultRepoRoot returns the platform default repo root.
func (s *Server) DefaultRepoRoot() string {
	return s.defaultRepoRoot
}

// SetRepoRoot validates, creates if needed, and switches the GIT_REPO_ROOT used
// for all subsequent git/model operations. Returns the normalized absolute path.
func (s *Server) SetRepoRoot(newRoot string) (string, error) {
	trimmed := strings.TrimSpace(newRoot)
	if trimmed == "" {
		return "", fmt.Errorf("Укажите путь к каталогу GIT_REPO_ROOT")
	}
	if !filepath.IsAbs(trimmed) {
		return "", fmt.Errorf("Путь к GIT_REPO_ROOT должен быть абсолютным")
	}
	abs, err := filepath.Abs(trimmed)
	if err != nil {
		return "", fmt.Errorf("Некорректный путь: %w", err)
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return "", fmt.Errorf("Не удалось создать каталог: %w", err)
	}
	st, err := os.Stat(abs)
	if err != nil {
		return "", fmt.Errorf("Не удалось открыть каталог: %w", err)
	}
	if !st.IsDir() {
		return "", fmt.Errorf("Путь не является каталогом")
	}

	s.repoRootMu.Lock()
	s.repoRoot = abs
	s.repoRootMu.Unlock()

	if s.onRepoRootChange != nil {
		if err := s.onRepoRootChange(abs); err != nil {
			return abs, fmt.Errorf("Каталог применён, но не удалось сохранить настройку: %w", err)
		}
	}
	return abs, nil
}

// Stop shuts the HTTP server down.
func (s *Server) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.httpServer == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	err := s.httpServer.Shutdown(ctx)
	s.httpServer = nil
	return err
}

func (s *Server) waitHealthy(ctx context.Context, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 2 * time.Second}
	url := s.baseURL + "/api/health"
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return err
		}
		if res, err := client.Do(req); err == nil {
			_, _ = io.Copy(io.Discard, res.Body)
			res.Body.Close()
			if res.StatusCode == http.StatusOK {
				return nil
			}
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("apiserver: health check timed out (%s)", url)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(50 * time.Millisecond):
		}
	}
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", s.handleHealth)
	mux.HandleFunc("/api/git/repo-root", s.handleRepoRoot)
	mux.HandleFunc("/api/git/repo-state", s.handleRepoState)
	mux.HandleFunc("/api/git/settings", s.handleSettings)
	mux.HandleFunc("/api/git/status", s.handleStatus)
	mux.HandleFunc("/api/git/show-file", s.handleShowFile)
	mux.HandleFunc("/api/git/add", s.handleAdd)
	mux.HandleFunc("/api/git/clone", s.handleClone)
	mux.HandleFunc("/api/git/commit", s.handleCommit)
	mux.HandleFunc("/api/git/push", func(w http.ResponseWriter, r *http.Request) { s.handlePushPull(w, r, false) })
	mux.HandleFunc("/api/git/pull", func(w http.ResponseWriter, r *http.Request) { s.handlePushPull(w, r, true) })
	mux.HandleFunc("/api/git/branches", s.handleBranches)
	mux.HandleFunc("/api/git/checkout", s.handleCheckout)
	mux.HandleFunc("/api/git/delete-repository", s.handleDeleteRepository)
	mux.HandleFunc("/api/git/read-split-index", s.handleGitReadSplitIndex)
	mux.HandleFunc("/api/git/read-split-compare-bundle", s.handleGitReadSplitCompareBundle)
	mux.HandleFunc("/api/model/read", s.handleModelRead)
	mux.HandleFunc("/api/model/write", s.handleModelWrite)
	mux.HandleFunc("/api/model/read-split-index", s.handleModelReadSplitIndex)
	mux.HandleFunc("/api/model/read-split-file", s.handleModelReadSplitFile)
	mux.HandleFunc("/api/model/read-split", s.handleModelReadSplit)

	var root http.Handler = mux
	if s.serveStatic && s.staticDir != "" {
		root = s.withStatic(mux)
	}
	return s.withCORS(root)
}

func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) withStatic(apiMux http.Handler) http.Handler {
	fileServer := http.FileServer(http.Dir(s.staticDir))
	indexFile := filepath.Join(s.staticDir, "index.html")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			apiMux.ServeHTTP(w, r)
			return
		}
		candidate := filepath.Join(s.staticDir, filepath.Clean("/"+r.URL.Path))
		if st, err := os.Stat(candidate); err == nil && !st.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, indexFile)
	})
}

// ParsePort reads GIT_API_PORT from the environment.
func ParsePort() int {
	raw := strings.TrimSpace(os.Getenv("GIT_API_PORT"))
	if raw == "" {
		return defaultPort
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return defaultPort
	}
	return n
}
