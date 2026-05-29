// Command git-api runs the ArchiMate git/model HTTP API standalone (without the
// Wails desktop shell). It is used in development together with the Vite dev
// server, which proxies /api to this process.
package main

import (
	"context"
	"log"
	"os"

	"archimate-viewer/internal/apiserver"
)

func main() {
	repoRoot := os.Getenv("GIT_REPO_ROOT")
	if repoRoot == "" {
		if cwd, err := os.Getwd(); err == nil {
			repoRoot = cwd
		}
	}

	cfg := apiserver.Config{
		RepoRoot:    repoRoot,
		Port:        apiserver.ParsePort(),
		ServeStatic: os.Getenv("SERVE_STATIC") == "1",
		StaticDir:   os.Getenv("STATIC_DIR"),
	}

	srv, err := apiserver.Start(context.Background(), cfg)
	if err != nil {
		log.Fatalf("git-api: %v", err)
	}
	log.Printf("Git API %s", srv.BaseURL())
	log.Printf("GIT_REPO_ROOT=%s", repoRoot)

	select {}
}
