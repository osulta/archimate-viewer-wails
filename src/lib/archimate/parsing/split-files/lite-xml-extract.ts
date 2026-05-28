export function extractAttributesFromXmlHead(head: string): { id: string; name: string } {
  const id = head.match(/\bid="([^"]+)"/)?.[1] ?? ''
  const name = head.match(/\bname="([^"]+)"/)?.[1] ?? ''
  return { id, name }
}

export function extractIdFromArchimateFileName(fileName: string): string {
  const match = fileName.match(/_((?:id-)?[a-f0-9-]+)\.xml$/i)
  return match?.[1] ?? ''
}

export function extractElementTypeFromXmlHead(head: string): string {
  const match = head.match(/<(?:[\w-]+:)?([A-Z][A-Za-z0-9]+)/)
  return match?.[1] ? `archimate:${match[1]}` : 'archimate:Element'
}

interface DiagramRefs {
  elementRefs: string[]
  relationshipRefs: string[]
}

export function scanDiagramRefsFromXml(content: string): DiagramRefs {
  const elementRefs: string[] = []
  const relationshipRefs: string[] = []
  const elementPattern = /archimateElement[^>]*href="[^"#]*#([^"]+)"/g
  const relationshipPattern = /archimateRelationship[^>]*href="[^"#]*#([^"]+)"/g

  let match = elementPattern.exec(content)
  while (match) {
    elementRefs.push(match[1])
    match = elementPattern.exec(content)
  }

  match = relationshipPattern.exec(content)
  while (match) {
    relationshipRefs.push(match[1])
    match = relationshipPattern.exec(content)
  }

  return { elementRefs, relationshipRefs }
}
