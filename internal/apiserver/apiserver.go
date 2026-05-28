package apiserver

import (
	"context"
	_ "embed"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed git-api-bundle.mjs
var embeddedGitAPI []byte

// Placeholder bundle from git is tiny; real output from `npm run bundle:api` is ~1–2 MiB.
const minEmbeddedBundleBytes = 10_000

var (
	extractedScript string
	extractOnce     sync.Once
	extractErr      error
)

const defaultPort = 5151

// Config for the Node git-api subprocess.
type Config struct {
	RepoRoot  string
	StaticDir string
	ServeStatic bool
	Port      int
}

// Server runs the bundled Express git-api as a child process.
type Server struct {
	cfg        Config
	cmd        *exec.Cmd
	baseURL    string
	mu         sync.Mutex
}

// Start launches git-api and waits until /api/health responds.
func Start(ctx context.Context, cfg Config) (*Server, error) {
	if cfg.RepoRoot == "" {
		return nil, fmt.Errorf("apiserver: empty repo root")
	}
	if err := os.MkdirAll(cfg.RepoRoot, 0o755); err != nil {
		return nil, fmt.Errorf("apiserver: repo root: %w", err)
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
	_ = listener.Close()

	scriptPath, err := resolveGitAPIScript()
	if err != nil {
		return nil, err
	}
	nodeExe, err := resolveNodeExecutable()
	if err != nil {
		return nil, err
	}

	cmd := exec.CommandContext(ctx, nodeExe, scriptPath)
	cmd.Env = append(os.Environ(),
		"GIT_REPO_ROOT="+cfg.RepoRoot,
		fmt.Sprintf("GIT_API_PORT=%d", port),
		"GIT_API_HOST=127.0.0.1",
	)
	if cfg.ServeStatic && cfg.StaticDir != "" {
		cmd.Env = append(cmd.Env,
			"SERVE_STATIC=1",
			"STATIC_DIR="+cfg.StaticDir,
		)
	}
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("apiserver: start node: %w", err)
	}

	s := &Server{
		cfg:     cfg,
		cmd:     cmd,
		baseURL: fmt.Sprintf("http://127.0.0.1:%d", port),
	}

	if err := s.waitHealthy(ctx, 60*time.Second); err != nil {
		_ = s.Stop()
		return nil, err
	}
	return s, nil
}

func (s *Server) BaseURL() string {
	return s.baseURL
}

func (s *Server) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cmd == nil || s.cmd.Process == nil {
		return nil
	}
	_ = s.cmd.Process.Signal(os.Interrupt)
	done := make(chan error, 1)
	go func() { done <- s.cmd.Wait() }()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		_ = s.cmd.Process.Kill()
		<-done
	}
	s.cmd = nil
	return nil
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
		res, err := client.Do(req)
		if err == nil {
			_, _ = io.Copy(io.Discard, res.Body)
			res.Body.Close()
			if res.StatusCode == http.StatusOK {
				return nil
			}
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("apiserver: health check timed out (%s)", url)
		}
		if s.cmd.ProcessState != nil && s.cmd.ProcessState.Exited() {
			return fmt.Errorf("apiserver: node process exited before ready")
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
	}
}

func resolveGitAPIScript() (string, error) {
	if len(embeddedGitAPI) >= minEmbeddedBundleBytes {
		extractOnce.Do(func() {
			dir := filepath.Join(os.TempDir(), "archimate-viewer-git-api")
			if err := os.MkdirAll(dir, 0o755); err != nil {
				extractErr = err
				return
			}
			script := filepath.Join(dir, "git-api.mjs")
			if err := os.WriteFile(script, embeddedGitAPI, 0o644); err != nil {
				extractErr = err
				return
			}
			extractedScript = script
		})
		if extractErr != nil {
			return "", extractErr
		}
		if extractedScript != "" {
			return extractedScript, nil
		}
	}

	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("apiserver: git-api bundle not found (run npm run bundle:api)")
	}
	exeDir := filepath.Dir(exe)
	candidates := []string{
		filepath.Join(exeDir, "git-api", "git-api.mjs"),
	}
	if runtime.GOOS == "darwin" {
		resources := filepath.Clean(filepath.Join(exeDir, "..", "Resources", "git-api", "git-api.mjs"))
		candidates = append(candidates, resources)
	}
	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates,
			filepath.Join(cwd, "build", "git-api", "git-api.mjs"),
			filepath.Join(cwd, "internal", "apiserver", "git-api-bundle.mjs"),
			filepath.Join(cwd, "server", "git-api.mjs"),
		)
	}
	for _, p := range candidates {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p, nil
		}
	}
	return "", fmt.Errorf("apiserver: git-api bundle not found (run npm run bundle:api)")
}

func resolveNodeExecutable() (string, error) {
	exe, err := os.Executable()
	if err == nil {
		exeDir := filepath.Dir(exe)
		bundled := []string{
			filepath.Join(exeDir, "node", nodeBinaryName()),
		}
		if runtime.GOOS == "darwin" {
			bundled = append(bundled, filepath.Join(exeDir, "..", "Resources", "node", nodeBinaryName()))
		}
		for _, p := range bundled {
			if st, err := os.Stat(p); err == nil && !st.IsDir() {
				return p, nil
			}
		}
	}
	if p, err := exec.LookPath("node"); err == nil {
		return p, nil
	}
	return "", fmt.Errorf("apiserver: node executable not found (install Node.js or bundle node next to the app)")
}

func nodeBinaryName() string {
	if runtime.GOOS == "windows" {
		return "node.exe"
	}
	return "node"
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
