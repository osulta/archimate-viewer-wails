package apiserver

import (
	"fmt"
	"regexp"
	"strings"
)

var reDiagramHrefFile = regexp.MustCompile(`(?i)href="([^"?#]+\.xml)(?:[#?]|")`)

// extractModelFileNamesFromDiagramXml mirrors the split-compare-bundle helper.
func extractModelFileNamesFromDiagramXml(content string) []string {
	seen := map[string]bool{}
	var out []string
	for _, m := range reDiagramHrefFile.FindAllStringSubmatch(content, -1) {
		fileName := strings.TrimSpace(lastSegment(m[1]))
		if fileName != "" && !seen[fileName] {
			seen[fileName] = true
			out = append(out, fileName)
		}
	}
	return out
}

// buildFileNameToRelativePathMap mirrors the split-compare-bundle helper.
func buildFileNameToRelativePathMap(modelRelativePaths []string) map[string]string {
	m := map[string]string{}
	for _, rp := range modelRelativePaths {
		fileName := lastSegment(rp)
		if fileName != "" {
			if _, exists := m[fileName]; !exists {
				m[fileName] = normalizeRelPath(rp)
			}
		}
	}
	return m
}

type compareBundle struct {
	Diagram       *parsedDiagram
	Elements      []any
	Relationships []any
}

// buildSplitCompareBundle mirrors split-compare-bundle buildSplitCompareBundle.
func buildSplitCompareBundle(modelRootInWorkTree, diagramSourceFile string, modelRelativePaths []string, readGitFile func(string) (string, error)) (*compareBundle, error) {
	normalizedSource := strings.ReplaceAll(strings.TrimLeft(strings.TrimSpace(diagramSourceFile), "/\\"), "\\", "/")
	if normalizedSource == "" {
		return nil, fmt.Errorf("Не указан файл диаграммы")
	}

	diagramGitPath := strings.ReplaceAll(modelRootInWorkTree+"/"+normalizedSource, "\\", "/")
	diagramContent, err := readGitFile(diagramGitPath)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(diagramContent) == "" {
		return nil, fmt.Errorf("Диаграмма не найдена в ветке: %s", normalizedSource)
	}

	diagram, err := parseDiagramFile(diagramContent, normalizedSource, "")
	if err != nil {
		return nil, err
	}
	if diagram == nil {
		return nil, fmt.Errorf("Не удалось разобрать диаграмму %s", normalizedSource)
	}

	fileNameIndex := buildFileNameToRelativePathMap(modelRelativePaths)
	hrefFileNames := extractModelFileNamesFromDiagramXml(diagramContent)
	var relatedPaths []string
	for _, fileName := range hrefFileNames {
		if rp, ok := fileNameIndex[fileName]; ok {
			relatedPaths = append(relatedPaths, rp)
		}
	}

	elements := []any{}
	relationships := []any{}
	for _, relativePath := range relatedPaths {
		gitPath := strings.ReplaceAll(modelRootInWorkTree+"/"+relativePath, "\\", "/")
		content, err := readGitFile(gitPath)
		if err != nil || strings.TrimSpace(content) == "" {
			continue
		}
		if strings.HasPrefix(relativePath, "relations/") {
			rel, err := parseRelationshipFile(content, relativePath)
			if err != nil || rel == nil {
				continue
			}
			relationships = append(relationships, rel)
			continue
		}
		parsed, err := parseElementFile(content, relativePath, "")
		if err != nil || parsed == nil {
			continue
		}
		liteFalse := false
		parsed.Lite = &liteFalse
		elements = append(elements, parsed)
	}

	loaded := true
	diagram.Loaded = &loaded
	return &compareBundle{
		Diagram:       diagram,
		Elements:      elements,
		Relationships: relationships,
	}, nil
}
