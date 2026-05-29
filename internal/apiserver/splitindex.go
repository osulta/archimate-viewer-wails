package apiserver

import (
	"regexp"
	"sort"
	"strings"
)

const headBytes = 4096

// parsedModelIndexes mirrors the serialized `indexes` object.
type parsedModelIndexes struct {
	ElementRefToDiagramIds      map[string][]string `json:"elementRefToDiagramIds"`
	RelationshipRefToDiagramIds map[string][]string `json:"relationshipRefToDiagramIds"`
}

// parsedModelData mirrors the output of serializeParsedModel.
type parsedModelData struct {
	ModelName     string             `json:"modelName"`
	Format        string             `json:"format"`
	Elements      []any              `json:"elements"`
	Relationships []any              `json:"relationships"`
	Diagrams      []any              `json:"diagrams"`
	ModelRoot     string             `json:"modelRoot"`
	ManifestPath  string             `json:"manifestPath"`
	Indexes       parsedModelIndexes `json:"indexes"`
}

// liteDiagram mirrors the lightweight diagram produced by the split index builder.
type liteDiagram struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Type        string `json:"type"`
	FolderPath  string `json:"folderPath,omitempty"`
	SourceFile  string `json:"sourceFile"`
	Loaded      bool   `json:"loaded"`
	Nodes       []any  `json:"nodes"`
	Connections []any  `json:"connections"`
}

var (
	reHeadID            = regexp.MustCompile(`\bid="([^"]+)"`)
	reHeadName          = regexp.MustCompile(`\bname="([^"]+)"`)
	reArchimateFileName = regexp.MustCompile(`(?i)_((?:id-)?[a-f0-9-]+)\.xml$`)
	reElementType       = regexp.MustCompile(`<(?:[\w-]+:)?([A-Z][A-Za-z0-9]+)`)
	reDiagramElementRef = regexp.MustCompile(`archimateElement[^>]*href="[^"#]*#([^"]+)"`)
	reDiagramRelRef     = regexp.MustCompile(`archimateRelationship[^>]*href="[^"#]*#([^"]+)"`)
)

func headOf(content string) string {
	if len(content) > headBytes {
		return content[:headBytes]
	}
	return content
}

func headAttr(re *regexp.Regexp, head string) string {
	if m := re.FindStringSubmatch(head); m != nil {
		return m[1]
	}
	return ""
}

func extractIDFromArchimateFileName(fileName string) string {
	if m := reArchimateFileName.FindStringSubmatch(fileName); m != nil {
		return m[1]
	}
	return ""
}

func extractElementTypeFromXMLHead(head string) string {
	if m := reElementType.FindStringSubmatch(head); m != nil {
		return "archimate:" + m[1]
	}
	return "archimate:Element"
}

func scanDiagramRefsFromXML(content string) (elementRefs, relationshipRefs []string) {
	for _, m := range reDiagramElementRef.FindAllStringSubmatch(content, -1) {
		elementRefs = append(elementRefs, m[1])
	}
	for _, m := range reDiagramRelRef.FindAllStringSubmatch(content, -1) {
		relationshipRefs = append(relationshipRefs, m[1])
	}
	return
}

// classifySplitFile mirrors the index-builder classifySplitFile (path based).
func classifySplitFile(relativePath string) splitFileCategory {
	segments := splitPathSegments(relativePath)
	fileName := normalizeRelPath(relativePath)
	if len(segments) > 0 {
		fileName = segments[len(segments)-1]
	}
	if fileName == "folder.xml" {
		if len(segments) <= 1 {
			return categoryManifest
		}
		return categoryFolder
	}
	if len(segments) > 0 && segments[0] == "relations" {
		return categoryRelationship
	}
	if len(segments) > 0 && segments[0] == "diagrams" {
		if strings.HasPrefix(fileName, "ArchimateDiagramModel_") {
			return categoryDiagram
		}
		return categoryFolder
	}
	return categoryElement
}

func resolveIndexFolderPath(relativePath string, folderNameByDir map[string]string) string {
	dir := dirOf(relativePath)
	if dir == "" {
		return ""
	}
	var parts []string
	current := dir
	for current != "" {
		if name, ok := folderNameByDir[current]; ok {
			parts = append([]string{name}, parts...)
		}
		if idx := strings.LastIndex(current, "/"); idx >= 0 {
			current = current[:idx]
		} else {
			current = ""
		}
	}
	return strings.Join(parts, " / ")
}

type indexFileEntry struct {
	relativePath string
	category     splitFileCategory
}

// buildSplitModelIndexFromRelativePaths mirrors the index builder of the same name.
func buildSplitModelIndexFromRelativePaths(relativePaths []string, readFull func(string) (string, error)) (*indexModelData, error) {
	entries := make([]indexFileEntry, 0, len(relativePaths))
	for _, rp := range relativePaths {
		entries = append(entries, indexFileEntry{
			relativePath: normalizeRelPath(rp),
			category:     classifySplitFile(rp),
		})
	}

	folderNameByDir := map[string]string{}
	for _, entry := range entries {
		if entry.category != categoryFolder {
			continue
		}
		content, err := readFull(entry.relativePath)
		if err != nil {
			continue
		}
		head := headOf(content)
		name := headAttr(reHeadName, head)
		dir := dirOf(entry.relativePath)
		if name == "" {
			if dir != "" {
				name = dir
			} else {
				name = "Folder"
			}
		}
		folderNameByDir[dir] = name
	}

	modelName := "ArchiMate model"
	for _, entry := range entries {
		if entry.category != categoryManifest {
			continue
		}
		if content, err := readFull(entry.relativePath); err == nil {
			if name := headAttr(reHeadName, headOf(content)); name != "" {
				modelName = name
			}
		}
		break
	}

	elementRefToDiagramIds := map[string][]string{}
	relationshipRefToDiagramIds := map[string][]string{}
	addToIndex := func(index map[string][]string, key, diagramID string) {
		if key == "" {
			return
		}
		list := index[key]
		for _, existing := range list {
			if existing == diagramID {
				return
			}
		}
		index[key] = append(list, diagramID)
	}

	diagrams := []any{}
	for _, entry := range entries {
		if entry.category != categoryDiagram {
			continue
		}
		folderPath := resolveIndexFolderPath(entry.relativePath, folderNameByDir)
		content, err := readFull(entry.relativePath)
		if err != nil {
			continue
		}
		head := headOf(content)
		fileName := lastSegment(entry.relativePath)
		diagramID := headAttr(reHeadID, head)
		if diagramID == "" {
			diagramID = extractIDFromArchimateFileName(fileName)
		}
		if diagramID == "" {
			continue
		}
		elementRefs, relationshipRefs := scanDiagramRefsFromXML(content)
		for _, ref := range elementRefs {
			addToIndex(elementRefToDiagramIds, ref, diagramID)
		}
		for _, ref := range relationshipRefs {
			addToIndex(relationshipRefToDiagramIds, ref, diagramID)
		}
		name := headAttr(reHeadName, head)
		if name == "" {
			name = diagramID
		}
		diagrams = append(diagrams, liteDiagram{
			ID:          diagramID,
			Name:        name,
			Type:        "archimate:ArchimateDiagramModel",
			FolderPath:  folderPath,
			SourceFile:  entry.relativePath,
			Loaded:      false,
			Nodes:       []any{},
			Connections: []any{},
		})
	}

	elements := []any{}
	for _, entry := range entries {
		if entry.category != categoryElement {
			continue
		}
		folderPath := resolveIndexFolderPath(entry.relativePath, folderNameByDir)
		content, err := readFull(entry.relativePath)
		if err != nil {
			continue
		}
		head := headOf(content)
		fileName := lastSegment(entry.relativePath)
		elementID := headAttr(reHeadID, head)
		if elementID == "" {
			elementID = extractIDFromArchimateFileName(fileName)
		}
		if elementID == "" {
			continue
		}
		name := headAttr(reHeadName, head)
		if name == "" {
			name = elementID
		}
		elements = append(elements, liteElement{
			ID:         elementID,
			Name:       name,
			Type:       extractElementTypeFromXMLHead(head),
			FolderPath: folderPath,
			SourceFile: entry.relativePath,
			Lite:       true,
		})
	}

	relationships := []any{}
	for _, entry := range entries {
		if entry.category != categoryRelationship {
			continue
		}
		content, err := readFull(entry.relativePath)
		if err != nil {
			continue
		}
		rel, err := parseRelationshipFile(content, entry.relativePath)
		if err != nil || rel == nil {
			continue
		}
		relationships = append(relationships, rel)
	}

	sortByName(elements)
	sortByName(diagrams)
	sortByName(relationships)

	return &indexModelData{
		ModelName:                   modelName,
		Elements:                    elements,
		Relationships:               relationships,
		Diagrams:                    diagrams,
		ElementRefToDiagramIds:      elementRefToDiagramIds,
		RelationshipRefToDiagramIds: relationshipRefToDiagramIds,
	}, nil
}

// indexModelData holds the raw index result before serialization.
type indexModelData struct {
	ModelName                   string
	Elements                    []any
	Relationships               []any
	Diagrams                    []any
	ElementRefToDiagramIds      map[string][]string
	RelationshipRefToDiagramIds map[string][]string
}

func (m *indexModelData) serialize(modelRoot, manifestPath string) *parsedModelData {
	return &parsedModelData{
		ModelName:     m.ModelName,
		Format:        "split-files",
		Elements:      m.Elements,
		Relationships: m.Relationships,
		Diagrams:      m.Diagrams,
		ModelRoot:     modelRoot,
		ManifestPath:  manifestPath,
		Indexes: parsedModelIndexes{
			ElementRefToDiagramIds:      m.ElementRefToDiagramIds,
			RelationshipRefToDiagramIds: m.RelationshipRefToDiagramIds,
		},
	}
}

func lastSegment(relativePath string) string {
	segments := splitPathSegments(relativePath)
	if len(segments) > 0 {
		return segments[len(segments)-1]
	}
	return normalizeRelPath(relativePath)
}

// sortKey extracts the comparison key from supported entries.
func sortKey(v any) string {
	switch item := v.(type) {
	case liteElement:
		return item.Name
	case liteDiagram:
		return item.Name
	case *parsedElement:
		return item.Name
	case *parsedDiagram:
		return item.Name
	case *parsedRelationship:
		if item.Name != "" {
			return item.Name
		}
		return item.ID
	}
	return ""
}

func sortByName(items []any) {
	sort.SliceStable(items, func(i, j int) bool {
		a := strings.ToLower(sortKey(items[i]))
		b := strings.ToLower(sortKey(items[j]))
		return a < b
	})
}
