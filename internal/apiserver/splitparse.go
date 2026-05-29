package apiserver

import (
	"fmt"
	"regexp"
	"strings"
)

// parsedElement mirrors ParsedElement (full form, from parseElementFile).
type parsedElement struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Type          string            `json:"type"`
	Documentation string            `json:"documentation"`
	Properties    []elementProperty `json:"properties"`
	FolderPath    string            `json:"folderPath,omitempty"`
	SourceFile    string            `json:"sourceFile"`
	Lite          *bool             `json:"lite,omitempty"`
}

// liteElement mirrors the lightweight element produced by the split index builder.
type liteElement struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	FolderPath string `json:"folderPath,omitempty"`
	SourceFile string `json:"sourceFile"`
	Lite       bool   `json:"lite"`
}

// parsedRelationship mirrors ParsedRelationship.
type parsedRelationship struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Type          string            `json:"type"`
	Source        string            `json:"source"`
	Target        string            `json:"target"`
	AccessType    *string           `json:"accessType,omitempty"`
	Documentation string            `json:"documentation"`
	Properties    []elementProperty `json:"properties"`
	FolderPath    string            `json:"folderPath"`
	SourceFile    string            `json:"sourceFile"`
}

// diagramNode mirrors DiagramNode.
type diagramNode struct {
	ID         string        `json:"id"`
	ElementRef string        `json:"elementRef"`
	Type       string        `json:"type"`
	Label      string        `json:"label"`
	X          float64       `json:"x"`
	Y          float64       `json:"y"`
	Width      float64       `json:"width"`
	Height     float64       `json:"height"`
	Children   []diagramNode `json:"children"`
}

// diagramConnection mirrors DiagramConnection.
type diagramConnection struct {
	ID               string      `json:"id"`
	RelationshipRef  string      `json:"relationshipRef"`
	RelationshipType string      `json:"relationshipType"`
	Source           string      `json:"source"`
	Target           string      `json:"target"`
	Bendpoints       []bendpoint `json:"bendpoints"`
}

// parsedDiagram mirrors ParsedDiagram. Pointer fields allow omitting keys that
// the TypeScript version leaves undefined.
type parsedDiagram struct {
	ID          string              `json:"id"`
	Name        string              `json:"name"`
	Type        string              `json:"type"`
	FolderPath  *string             `json:"folderPath,omitempty"`
	SourceFile  string              `json:"sourceFile,omitempty"`
	Loaded      *bool               `json:"loaded,omitempty"`
	Nodes       []diagramNode       `json:"nodes"`
	Connections []diagramConnection `json:"connections"`
}

// splitFileCategory mirrors SplitFileCategory.
type splitFileCategory string

const (
	categoryManifest     splitFileCategory = "manifest"
	categoryFolder       splitFileCategory = "folder"
	categoryElement      splitFileCategory = "element"
	categoryRelationship splitFileCategory = "relationship"
	categoryDiagram      splitFileCategory = "diagram"
)

func normalizeRelPath(relativePath string) string {
	normalized := strings.ReplaceAll(relativePath, "\\", "/")
	return strings.TrimLeft(normalized, "/")
}

func splitPathSegments(relativePath string) []string {
	normalized := normalizeRelPath(relativePath)
	var segments []string
	for _, s := range strings.Split(normalized, "/") {
		if s != "" {
			segments = append(segments, s)
		}
	}
	return segments
}

// classifySplitModelFile mirrors classifySplitModelFile (DOM-based).
func classifySplitModelFile(relativePath, rootLocalName string) splitFileCategory {
	normalized := normalizeRelPath(relativePath)
	segments := splitPathSegments(normalized)
	fileName := normalized
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
		if rootLocalName == "ArchimateDiagramModel" {
			return categoryDiagram
		}
		return categoryFolder
	}
	return categoryElement
}

// folderPathResolver mirrors buildFolderPathResolver.
type folderPathResolver struct {
	folderNameByDir map[string]string
}

func dirOf(relativePath string) string {
	normalized := normalizeRelPath(relativePath)
	if idx := strings.LastIndex(normalized, "/"); idx >= 0 {
		return normalized[:idx]
	}
	return ""
}

func buildFolderPathResolver(files []splitModelFile) *folderPathResolver {
	r := &folderPathResolver{folderNameByDir: map[string]string{}}
	for _, file := range files {
		doc, err := parseXMLDocument(file.Content)
		if err != nil {
			continue
		}
		rootLocalName := doc.rootLocalName()
		if classifySplitModelFile(file.RelativePath, rootLocalName) != categoryFolder {
			continue
		}
		dir := dirOf(file.RelativePath)
		name := getName(doc)
		if name == "" {
			if dir != "" {
				name = dir
			} else {
				name = "Folder"
			}
		}
		r.folderNameByDir[dir] = name
	}
	return r
}

func (r *folderPathResolver) resolve(relativePath string) string {
	dir := dirOf(relativePath)
	if dir == "" {
		return ""
	}
	var parts []string
	current := dir
	for current != "" {
		if name, ok := r.folderNameByDir[current]; ok {
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

// parseElementFile mirrors element-file-parser parseElementFile.
func parseElementFile(content, relativePath, folderPath string) (*parsedElement, error) {
	doc, err := parseXMLDocument(content)
	if err != nil {
		return nil, err
	}
	rootLocalName := doc.rootLocalName()
	if rootLocalName == "Folder" || rootLocalName == "ArchimateModel" {
		return nil, nil
	}

	documentation := getDocumentation(doc)
	if documentation == "" {
		if v, ok := doc.attr("documentation"); ok {
			documentation = strings.TrimSpace(v)
		}
	}

	id := getID(doc)
	name := getName(doc)
	if name == "" {
		name = id
	}

	return &parsedElement{
		ID:            id,
		Name:          name,
		Type:          getType(doc, "archimate:"+rootLocalName),
		Documentation: documentation,
		Properties:    parseProperties(doc),
		FolderPath:    folderPath,
		SourceFile:    relativePath,
	}, nil
}

// parseRelationshipEndpoints mirrors parse-diagram-tree parseRelationshipEndpoints.
func parseRelationshipEndpoints(n *xmlNode) (source, target string) {
	sourceAttr, hasSource := n.attr("source")
	targetAttr, hasTarget := n.attr("target")
	if hasSource && hasTarget && sourceAttr != "" && targetAttr != "" {
		return sourceAttr, targetAttr
	}
	return idFromArchimateChildHref(n, "source"), idFromArchimateChildHref(n, "target")
}

// parseRelationshipFile mirrors relationship-file-parser parseRelationshipFile.
func parseRelationshipFile(content, relativePath string) (*parsedRelationship, error) {
	doc, err := parseXMLDocument(content)
	if err != nil {
		return nil, err
	}
	source, target := parseRelationshipEndpoints(doc)

	documentation := getDocumentation(doc)
	if documentation == "" {
		if v, ok := doc.attr("documentation"); ok {
			documentation = strings.TrimSpace(v)
		}
	}

	id := getID(doc)
	rootLocalName := doc.rootLocalName()
	rawName := getName(doc)
	name := ""
	if rawName != "" && rawName != id {
		name = rawName
	}

	rel := &parsedRelationship{
		ID:            id,
		Name:          name,
		Type:          getType(doc, "archimate:"+rootLocalName),
		Source:        source,
		Target:        target,
		Documentation: documentation,
		Properties:    parseProperties(doc),
		FolderPath:    "Relations",
		SourceFile:    relativePath,
	}
	if v, ok := doc.attr("accessType"); ok {
		rel.AccessType = &v
	}
	return rel, nil
}

var (
	diagramObjectTags = []string{"child", "children"}
	connectionTags    = []string{"sourceConnection", "sourceConnections"}
	relTypeFromFile   = regexp.MustCompile(`^([A-Za-z]+Relationship)_`)
)

func getDiagramObjectChildren(parent *xmlNode) []*xmlNode {
	var out []*xmlNode
	for _, tag := range diagramObjectTags {
		out = append(out, parent.childrenByLocal(tag)...)
	}
	return out
}

func getConnectionChildren(parent *xmlNode) []*xmlNode {
	var out []*xmlNode
	for _, tag := range connectionTags {
		out = append(out, parent.childrenByLocal(tag)...)
	}
	return out
}

func getDiagramObjectElementRef(node *xmlNode) string {
	if v, ok := node.attr("archimateElement"); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return idFromArchimateChildHref(node, "archimateElement")
}

func getConnectionRelationshipRef(node *xmlNode) string {
	if v, ok := node.attr("archimateRelationship"); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return idFromArchimateChildHref(node, "archimateRelationship")
}

func getConnectionRelationshipType(node *xmlNode) string {
	relNode := node.firstChildByLocal("archimateRelationship")
	if relNode == nil {
		return ""
	}
	if fromAttr := getType(relNode, ""); strings.TrimSpace(fromAttr) != "" {
		return strings.TrimSpace(fromAttr)
	}
	href, _ := relNode.attr("href")
	fileName := href
	if idx := strings.Index(fileName, "#"); idx >= 0 {
		fileName = fileName[:idx]
	}
	if idx := strings.LastIndex(fileName, "/"); idx >= 0 {
		fileName = fileName[idx+1:]
	}
	if m := relTypeFromFile.FindStringSubmatch(fileName); m != nil {
		return "archimate:" + m[1]
	}
	return ""
}

// parseDiagramFromXmlNode mirrors parse-diagram-tree parseDiagramFromXmlNode.
func parseDiagramFromXmlNode(diagramNodeEl *xmlNode, folderPath string) parsedDiagram {
	var parseObject func(child *xmlNode, parentAbsX, parentAbsY float64) diagramNode
	parseObject = func(child *xmlNode, parentAbsX, parentAbsY float64) diagramNode {
		boundsNode := child.firstChildByLocal("bounds")
		x := numAttr(boundsNode, "x", 0)
		y := numAttr(boundsNode, "y", 0)
		width := numAttr(boundsNode, "width", 120)
		height := numAttr(boundsNode, "height", 55)

		absX := parentAbsX + x
		absY := parentAbsY + y

		children := []diagramNode{}
		for _, nested := range getDiagramObjectChildren(child) {
			children = append(children, parseObject(nested, absX, absY))
		}

		return diagramNode{
			ID:         getID(child),
			ElementRef: getDiagramObjectElementRef(child),
			Type:       getType(child, "DiagramObject"),
			Label:      getDiagramObjectLabel(child),
			X:          absX,
			Y:          absY,
			Width:      width,
			Height:     height,
			Children:   children,
		}
	}

	var collectConnections func(child *xmlNode, out *[]diagramConnection)
	collectConnections = func(child *xmlNode, out *[]diagramConnection) {
		for _, conn := range getConnectionChildren(child) {
			source, _ := conn.attr("source")
			target, _ := conn.attr("target")
			*out = append(*out, diagramConnection{
				ID:               getID(conn),
				RelationshipRef:  getConnectionRelationshipRef(conn),
				RelationshipType: getConnectionRelationshipType(conn),
				Source:           source,
				Target:           target,
				Bendpoints:       parseConnectionBendpoints(conn),
			})
		}
		for _, nested := range getDiagramObjectChildren(child) {
			collectConnections(nested, out)
		}
	}

	topChildren := getDiagramObjectChildren(diagramNodeEl)
	nodes := []diagramNode{}
	for _, child := range topChildren {
		nodes = append(nodes, parseObject(child, 0, 0))
	}

	connections := []diagramConnection{}
	for _, child := range topChildren {
		collectConnections(child, &connections)
	}

	name := getName(diagramNodeEl)
	if name == "" {
		name = getID(diagramNodeEl)
	}
	fp := folderPath
	return parsedDiagram{
		ID:          getID(diagramNodeEl),
		Name:        name,
		Type:        getType(diagramNodeEl, "View"),
		FolderPath:  &fp,
		Nodes:       nodes,
		Connections: connections,
	}
}

// parseDiagramFile mirrors diagram-file-parser parseDiagramFile.
func parseDiagramFile(content, relativePath, folderPath string) (*parsedDiagram, error) {
	doc, err := parseXMLDocument(content)
	if err != nil {
		return nil, err
	}
	if doc.rootLocalName() != "ArchimateDiagramModel" {
		return nil, nil
	}
	diagram := parseDiagramFromXmlNode(doc, folderPath)
	diagram.SourceFile = relativePath
	return &diagram, nil
}

// splitModelFile mirrors { relativePath, content }.
type splitModelFile struct {
	RelativePath string
	Content      string
}

// parseSplitModel mirrors parse-split-model parseSplitModel.
func parseSplitModel(modelRoot, manifestPath, manifest string, files []splitModelFile) (*parsedModelData, error) {
	if strings.TrimSpace(manifest) == "" {
		return nil, fmt.Errorf("Отсутствует manifest (model/folder.xml) для split-модели.")
	}

	manifestDoc, err := parseXMLDocument(manifest)
	if err != nil {
		return nil, err
	}
	modelName := getName(manifestDoc)
	if modelName == "" {
		modelName = "ArchiMate model"
	}

	resolver := buildFolderPathResolver(files)

	elements := []any{}
	relationships := []any{}
	diagrams := []any{}

	for _, file := range files {
		relativePath := normalizeRelPath(file.RelativePath)
		doc, err := parseXMLDocument(file.Content)
		if err != nil {
			return nil, fmt.Errorf("Не удалось разобрать %s: %s", relativePath, err.Error())
		}
		rootLocalName := doc.rootLocalName()
		category := classifySplitModelFile(relativePath, rootLocalName)
		folderPath := resolver.resolve(relativePath)

		switch category {
		case categoryManifest, categoryFolder:
			continue
		case categoryElement:
			el, err := parseElementFile(file.Content, relativePath, folderPath)
			if err != nil {
				return nil, err
			}
			if el != nil {
				elements = append(elements, el)
			}
		case categoryRelationship:
			rel, err := parseRelationshipFile(file.Content, relativePath)
			if err != nil {
				return nil, err
			}
			relationships = append(relationships, rel)
		case categoryDiagram:
			diagram, err := parseDiagramFile(file.Content, relativePath, folderPath)
			if err != nil {
				return nil, err
			}
			if diagram != nil {
				diagrams = append(diagrams, diagram)
			}
		}
	}

	return &parsedModelData{
		ModelName:     modelName,
		Format:        "split-files",
		Elements:      elements,
		Relationships: relationships,
		Diagrams:      diagrams,
		ModelRoot:     modelRoot,
		ManifestPath:  manifestPath,
		Indexes: parsedModelIndexes{
			ElementRefToDiagramIds:      map[string][]string{},
			RelationshipRefToDiagramIds: map[string][]string{},
		},
	}, nil
}
