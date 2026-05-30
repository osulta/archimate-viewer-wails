package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"archimate-viewer/internal/apiserver"
)

// App is exposed to the frontend via Wails bindings.
type App struct {
	ctx        context.Context
	api        *apiserver.Server
	apiBaseURL string
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	defaultRepoRoot := filepath.Join(userDataDir(), "repositories")
	repoRoot := defaultRepoRoot
	if saved := strings.TrimSpace(loadSavedRepoRoot()); saved != "" {
		repoRoot = saved
	}
	staticDir := resolveStaticDir()

	srv, err := apiserver.Start(context.Background(), apiserver.Config{
		RepoRoot:         repoRoot,
		DefaultRepoRoot:  defaultRepoRoot,
		StaticDir:        staticDir,
		ServeStatic:      staticDir != "",
		Port:             apiserver.ParsePort(),
		OnRepoRootChange: saveRepoRoot,
	})
	if err != nil {
		wailsruntime.LogErrorf(ctx, "git-api: %v", err)
		wailsruntime.MessageDialog(ctx, wailsruntime.MessageDialogOptions{
			Title:   "ArchiMate Viewer",
			Message: "Не удалось запустить локальный API:\n" + err.Error(),
			Type:    wailsruntime.ErrorDialog,
		})
		return
	}
	a.api = srv
	a.apiBaseURL = srv.BaseURL()
}

func (a *App) shutdown(ctx context.Context) {
	if a.api != nil {
		_ = a.api.Stop()
		a.api = nil
	}
}

// GetAPIBaseURL is used by the UI for fetch() when assets are embedded (not same-origin as the API).
func (a *App) GetAPIBaseURL() string {
	return a.apiBaseURL
}

// SelectDirectory opens a native folder picker and returns the chosen absolute
// path (empty when the user cancels). Used by the UI to choose GIT_REPO_ROOT.
func (a *App) SelectDirectory(title string) string {
	if a.ctx == nil {
		return ""
	}
	dialogTitle := strings.TrimSpace(title)
	if dialogTitle == "" {
		dialogTitle = "Выберите каталог"
	}
	selected, err := wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: dialogTitle,
	})
	if err != nil {
		wailsruntime.LogErrorf(a.ctx, "SelectDirectory: %v", err)
		return ""
	}
	return selected
}

// appConfig is the small JSON settings file persisted in the user data dir.
type appConfig struct {
	RepoRoot string `json:"repoRoot,omitempty"`
}

func configFilePath() string {
	return filepath.Join(userDataDir(), "config.json")
}

func loadSavedRepoRoot() string {
	data, err := os.ReadFile(configFilePath())
	if err != nil {
		return ""
	}
	var cfg appConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return ""
	}
	return strings.TrimSpace(cfg.RepoRoot)
}

func saveRepoRoot(newRoot string) error {
	path := configFilePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	cfg := appConfig{}
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &cfg)
	}
	cfg.RepoRoot = strings.TrimSpace(newRoot)
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func userDataDir() string {
	switch goruntime.GOOS {
	case "windows":
		if base := os.Getenv("APPDATA"); base != "" {
			return filepath.Join(base, "ArchiMate Viewer")
		}
	case "darwin":
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, "Library", "Application Support", "ArchiMate Viewer")
		}
	default:
		if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
			return filepath.Join(xdg, "archimate-viewer")
		}
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, ".local", "share", "archimate-viewer")
		}
	}
	if cwd, err := os.Getwd(); err == nil {
		return filepath.Join(cwd, ".archimate-viewer-data")
	}
	return filepath.Join(os.TempDir(), "archimate-viewer")
}

func resolveStaticDir() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	exeDir := filepath.Dir(exe)
	candidates := []string{
		filepath.Join(exeDir, "frontend", "dist"),
	}
	if goruntime.GOOS == "darwin" {
		candidates = append(candidates, filepath.Join(exeDir, "..", "Resources", "frontend", "dist"))
	}
	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(cwd, "dist"))
	}
	for _, dir := range candidates {
		if st, err := os.Stat(filepath.Join(dir, "index.html")); err == nil && !st.IsDir() {
			return dir
		}
	}
	return ""
}
