package main

import (
	"embed"
	"io/fs"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:dist
var embeddedAssets embed.FS

func main() {
	distFS, err := fs.Sub(embeddedAssets, "dist")
	if err != nil {
		log.Fatal(err)
	}

	app := NewApp()

	err = wails.Run(&options.App{
		Title:     "ArchiMate Viewer",
		Width:     1440,
		Height:    900,
		MinWidth:  960,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets: distFS,
		},
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
