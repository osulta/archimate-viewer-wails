package apiserver

import (
	"encoding/xml"
	"errors"
	"io"
	"strconv"
	"strings"
)

// xsiNamespace is the XML Schema instance namespace used for xsi:type.
const xsiNamespace = "http://www.w3.org/2001/XMLSchema-instance"

var errEmptyDocument = errors.New("Пустой XML-документ.")

// xmlNode is a minimal DOM-like node tree, modelled after the browser DOM
// helpers used by the original TypeScript parsers (localName + attributes +
// children + text content).
type xmlNode struct {
	Local    string
	Space    string
	Attrs    []xml.Attr
	Children []*xmlNode
	text     string
}

// parseXMLDocument parses XML text into a node tree. It mirrors
// parseXmlDocument from the TypeScript side, returning an error on malformed
// input instead of producing a <parsererror> element.
func parseXMLDocument(content string) (*xmlNode, error) {
	dec := xml.NewDecoder(strings.NewReader(content))
	dec.Strict = false
	dec.CharsetReader = func(_ string, input io.Reader) (io.Reader, error) {
		return input, nil
	}

	var root *xmlNode
	stack := make([]*xmlNode, 0, 16)

	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, errors.New("XML parsing failed. Проверьте корректность файла.")
		}

		switch t := tok.(type) {
		case xml.StartElement:
			node := &xmlNode{
				Local: stripPrefix(t.Name.Local),
				Space: t.Name.Space,
				Attrs: append([]xml.Attr(nil), t.Attr...),
			}
			if len(stack) > 0 {
				parent := stack[len(stack)-1]
				parent.Children = append(parent.Children, node)
			} else if root == nil {
				root = node
			}
			stack = append(stack, node)
		case xml.EndElement:
			if len(stack) > 0 {
				stack = stack[:len(stack)-1]
			}
		case xml.CharData:
			if len(stack) > 0 {
				stack[len(stack)-1].text += string(t)
			}
		}
	}

	if root == nil {
		return nil, errEmptyDocument
	}
	return root, nil
}

func stripPrefix(name string) string {
	if idx := strings.LastIndex(name, ":"); idx >= 0 {
		return name[idx+1:]
	}
	return name
}

// rootLocalName mirrors getRootLocalName.
func (n *xmlNode) rootLocalName() string {
	if n == nil {
		return ""
	}
	return stripPrefix(n.Local)
}

// textContent concatenates all descendant character data, like DOM textContent.
func (n *xmlNode) textContent() string {
	if n == nil {
		return ""
	}
	var b strings.Builder
	var walk func(*xmlNode)
	walk = func(x *xmlNode) {
		b.WriteString(x.text)
		for _, c := range x.Children {
			walk(c)
		}
	}
	walk(n)
	return b.String()
}

// attr returns the value of an unprefixed (no-namespace) attribute, mirroring
// DOM getAttribute for non-qualified names.
func (n *xmlNode) attr(local string) (string, bool) {
	if n == nil {
		return "", false
	}
	for _, a := range n.Attrs {
		if a.Name.Local == local && a.Name.Space == "" {
			return a.Value, true
		}
	}
	return "", false
}

// childrenByLocal returns direct children whose local name matches.
func (n *xmlNode) childrenByLocal(local string) []*xmlNode {
	if n == nil {
		return nil
	}
	var out []*xmlNode
	for _, c := range n.Children {
		if c.Local == local {
			out = append(out, c)
		}
	}
	return out
}

// firstChildByLocal returns the first direct child whose local name matches.
func (n *xmlNode) firstChildByLocal(local string) *xmlNode {
	for _, c := range n.childrenByLocal(local) {
		return c
	}
	return nil
}

// getName mirrors xml-utils getName.
func getName(n *xmlNode) string {
	if n == nil {
		return ""
	}
	if v, ok := n.attr("name"); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	for _, child := range n.Children {
		if child.Local == "name" {
			if t := strings.TrimSpace(child.textContent()); t != "" {
				return t
			}
			break
		}
	}
	if v, ok := n.attr("identifier"); ok {
		return v
	}
	return ""
}

// getID mirrors xml-utils getId.
func getID(n *xmlNode) string {
	if v, ok := n.attr("identifier"); ok {
		return v
	}
	if v, ok := n.attr("id"); ok {
		return v
	}
	return ""
}

// getType mirrors xml-utils getType (xsi:type / xsi-namespaced type / type / fallback).
func getType(n *xmlNode, fallback string) string {
	if n == nil {
		return fallback
	}
	for _, a := range n.Attrs {
		if a.Name.Local == "type" && (a.Name.Space == xsiNamespace || a.Name.Space == "xsi") {
			return a.Value
		}
	}
	if v, ok := n.attr("type"); ok {
		return v
	}
	return fallback
}

// getDocumentation mirrors xml-utils getDocumentation.
func getDocumentation(n *xmlNode) string {
	doc := n.firstChildByLocal("documentation")
	if doc == nil {
		return ""
	}
	return strings.TrimSpace(doc.textContent())
}

// getDiagramObjectLabel mirrors xml-utils getDiagramObjectLabel.
func getDiagramObjectLabel(n *xmlNode) string {
	if n == nil {
		return ""
	}
	if content := n.firstChildByLocal("content"); content != nil {
		if t := strings.TrimSpace(content.textContent()); t != "" {
			return t
		}
	}
	for _, label := range n.childrenByLocal("label") {
		nested := label.firstChildByLocal("content")
		text := ""
		if nested != nil {
			text = strings.TrimSpace(nested.textContent())
		}
		if text == "" {
			text = strings.TrimSpace(label.textContent())
		}
		if text == "" {
			if v, ok := label.attr("name"); ok {
				text = strings.TrimSpace(v)
			}
		}
		if text != "" {
			return text
		}
	}
	if v, ok := n.attr("name"); ok {
		if t := strings.TrimSpace(v); t != "" {
			return t
		}
	}
	return ""
}

// elementProperty mirrors ElementProperty in the TS model types.
type elementProperty struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// parseProperties mirrors xml-utils parseProperties.
func parseProperties(n *xmlNode) []elementProperty {
	props := []elementProperty{}
	for _, p := range n.childrenByLocal("property") {
		key := ""
		if v, ok := p.attr("key"); ok {
			key = v
		} else if v, ok := p.attr("propertyDefinitionRef"); ok {
			key = v
		} else if v, ok := p.attr("identifierRef"); ok {
			key = v
		}
		value := ""
		if v, ok := p.attr("value"); ok {
			value = v
		} else {
			value = strings.TrimSpace(p.textContent())
		}
		if key != "" || value != "" {
			if key == "" {
				key = "(property)"
			}
			props = append(props, elementProperty{Key: key, Value: value})
		}
	}
	for _, p := range n.childrenByLocal("properties") {
		key := ""
		if v, ok := p.attr("key"); ok {
			key = v
		}
		value := ""
		if v, ok := p.attr("value"); ok {
			value = v
		} else {
			value = strings.TrimSpace(p.textContent())
		}
		if key != "" || value != "" {
			if key == "" {
				key = "(property)"
			}
			props = append(props, elementProperty{Key: key, Value: value})
		}
	}
	return props
}

// bendpoint mirrors the Bendpoint type.
type bendpoint struct {
	StartX float64 `json:"startX"`
	StartY float64 `json:"startY"`
	EndX   float64 `json:"endX"`
	EndY   float64 `json:"endY"`
}

// parseConnectionBendpoints mirrors xml-utils parseConnectionBendpoints.
func parseConnectionBendpoints(n *xmlNode) []bendpoint {
	out := []bendpoint{}
	for _, tag := range []string{"bendpoints", "bendpoint"} {
		for _, bp := range n.childrenByLocal(tag) {
			out = append(out, bendpoint{
				StartX: numAttr(bp, "startX", 0),
				StartY: numAttr(bp, "startY", 0),
				EndX:   numAttr(bp, "endX", 0),
				EndY:   numAttr(bp, "endY", 0),
			})
		}
	}
	return out
}

// numAttr returns the numeric value of an attribute, using the fallback when
// the attribute is absent (mirrors `Number(getAttribute(x) ?? fallback)`).
func numAttr(n *xmlNode, local string, fallback float64) float64 {
	v, ok := n.attr(local)
	if !ok {
		return fallback
	}
	v = strings.TrimSpace(v)
	if v == "" {
		return 0
	}
	parsed, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return 0
	}
	return parsed
}

// idFromArchimateHref mirrors href-utils idFromArchimateHref.
func idFromArchimateHref(href string) string {
	if href == "" {
		return ""
	}
	if idx := strings.Index(href, "#"); idx >= 0 {
		return href[idx+1:]
	}
	return strings.TrimSpace(href)
}

// idFromArchimateChildHref mirrors href-utils idFromArchimateChildHref.
func idFromArchimateChildHref(parent *xmlNode, local string) string {
	if parent == nil {
		return ""
	}
	child := parent.firstChildByLocal(local)
	if child == nil {
		return ""
	}
	href, _ := child.attr("href")
	return idFromArchimateHref(href)
}
