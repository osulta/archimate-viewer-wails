package apiserver

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

var skipDirNames = map[string]bool{
	".git":         true,
	"node_modules": true,
	"dist":         true,
	"build":        true,
}

// findFirstArchimateFileUnder finds the first *.archimate file under rootAbs (BFS).
func findFirstArchimateFileUnder(rootAbs string) string {
	queue := []string{rootAbs}
	for len(queue) > 0 {
		dir := queue[0]
		queue = queue[1:]
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		var subdirs []string
		var archi []string
		for _, e := range entries {
			name := e.Name()
			full := filepath.Join(dir, name)
			if e.IsDir() {
				if skipDirNames[name] {
					continue
				}
				subdirs = append(subdirs, full)
			} else if strings.HasSuffix(strings.ToLower(name), ".archimate") {
				archi = append(archi, full)
			}
		}
		sort.Strings(archi)
		if len(archi) > 0 {
			return archi[0]
		}
		queue = append(queue, subdirs...)
	}
	return ""
}

// findModelEntryUnder returns the absolute path of the first .archimate file under rootAbs.
func findModelEntryUnder(rootAbs string) string {
	return findFirstArchimateFileUnder(rootAbs)
}
