package main

import (
	"context"
	"os"
	"path/filepath"
	goruntime "runtime"

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

	repoRoot := filepath.Join(userDataDir(), "repositories")
	staticDir := resolveStaticDir()

	srv, err := apiserver.Start(context.Background(), apiserver.Config{
		RepoRoot:    repoRoot,
		StaticDir:   staticDir,
		ServeStatic: staticDir != "",
		Port:        apiserver.ParsePort(),
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
