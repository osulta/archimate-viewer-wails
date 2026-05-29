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

type modelLayout string

const (
	layoutSingleFile modelLayout = "single-file"
	layoutSplitFiles modelLayout = "split-files"
)

type modelEntry struct {
	absPath      string
	layout       modelLayout
	modelRootAbs string
}

// isSplitModelManifestContent mirrors isSplitModelManifestContent.
func isSplitModelManifestContent(content string) bool {
	if strings.TrimSpace(content) == "" {
		return false
	}
	return strings.Contains(content, "ArchimateModel") &&
		(strings.Contains(content, "<archimate:ArchimateModel") || strings.Contains(content, ":ArchimateModel"))
}

// findFirstArchimateFileUnder mirrors findFirstArchimateFileUnder (BFS).
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

// findSplitModelEntryUnder mirrors findSplitModelEntryUnder (BFS, max depth 8).
func findSplitModelEntryUnder(rootAbs string) *modelEntry {
	queue := []string{rootAbs}
	depth := 0
	const maxDepth = 8
	for len(queue) > 0 && depth <= maxDepth {
		levelSize := len(queue)
		for i := 0; i < levelSize; i++ {
			dir := queue[0]
			queue = queue[1:]
			manifestAbs := filepath.Join(dir, "model", "folder.xml")
			if pathExists(manifestAbs) {
				if content, err := os.ReadFile(manifestAbs); err == nil {
					if isSplitModelManifestContent(string(content)) {
						return &modelEntry{
							absPath:      manifestAbs,
							layout:       layoutSplitFiles,
							modelRootAbs: filepath.Dir(manifestAbs),
						}
					}
				}
			}
			entries, err := os.ReadDir(dir)
			if err != nil {
				continue
			}
			for _, entry := range entries {
				if entry.IsDir() && !skipDirNames[entry.Name()] {
					queue = append(queue, filepath.Join(dir, entry.Name()))
				}
			}
		}
		depth++
	}
	return nil
}

// findModelEntryUnder mirrors findModelEntryUnder.
func findModelEntryUnder(rootAbs string) *modelEntry {
	if archimateAbs := findFirstArchimateFileUnder(rootAbs); archimateAbs != "" {
		return &modelEntry{absPath: archimateAbs, layout: layoutSingleFile}
	}
	return findSplitModelEntryUnder(rootAbs)
}

// collectSplitModelXmlFiles mirrors collectSplitModelXmlFiles.
func collectSplitModelXmlFiles(modelRootAbs string) ([]splitModelFile, error) {
	var files []splitModelFile
	var walk func(dirAbs, relPrefix string)
	walk = func(dirAbs, relPrefix string) {
		entries, err := os.ReadDir(dirAbs)
		if err != nil {
			return
		}
		for _, entry := range entries {
			full := filepath.Join(dirAbs, entry.Name())
			if entry.IsDir() {
				if skipDirNames[entry.Name()] {
					continue
				}
				next := entry.Name()
				if relPrefix != "" {
					next = relPrefix + "/" + entry.Name()
				}
				walk(full, next)
			} else if strings.HasSuffix(strings.ToLower(entry.Name()), ".xml") {
				rel := entry.Name()
				if relPrefix != "" {
					rel = relPrefix + "/" + entry.Name()
				}
				content, err := os.ReadFile(full)
				if err != nil {
					continue
				}
				files = append(files, splitModelFile{RelativePath: rel, Content: string(content)})
			}
		}
	}
	walk(modelRootAbs, "")
	return files, nil
}

// buildSplitModelIndex mirrors buildSplitModelIndex (filesystem walk + index builder).
func buildSplitModelIndex(modelRootAbs string) (*indexModelData, error) {
	var relativePaths []string
	var walk func(dirAbs, relPrefix string)
	walk = func(dirAbs, relPrefix string) {
		entries, err := os.ReadDir(dirAbs)
		if err != nil {
			return
		}
		for _, entry := range entries {
			if entry.Name() == ".git" || entry.Name() == "node_modules" {
				continue
			}
			full := filepath.Join(dirAbs, entry.Name())
			rel := entry.Name()
			if relPrefix != "" {
				rel = relPrefix + "/" + entry.Name()
			}
			if entry.IsDir() {
				walk(full, rel)
			} else if strings.HasSuffix(strings.ToLower(entry.Name()), ".xml") {
				relativePaths = append(relativePaths, rel)
			}
		}
	}
	walk(modelRootAbs, "")

	return buildSplitModelIndexFromRelativePaths(relativePaths, func(relativePath string) (string, error) {
		content, err := os.ReadFile(filepath.Join(modelRootAbs, filepath.FromSlash(relativePath)))
		if err != nil {
			return "", err
		}
		return string(content), nil
	})
}
