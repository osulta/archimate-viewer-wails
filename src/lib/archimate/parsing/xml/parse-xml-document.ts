export function parseXmlDocument(xmlText: string): Document {
  const parser = new DOMParser()
  const documentNode = parser.parseFromString(xmlText, 'application/xml')
  const parserError = Array.from(documentNode.getElementsByTagName('*')).find(
    (item) => item.localName === 'parsererror',
  )

  if (parserError) {
    throw new Error('XML parsing failed. Проверьте корректность файла.')
  }

  return documentNode
}

export function getDocumentRootElement(documentNode: Document): Element {
  const root = documentNode.documentElement
  if (!root) {
    throw new Error('Пустой XML-документ.')
  }
  return root
}

export function getRootLocalName(node: Element): string {
  const raw = node.localName ?? node.tagName ?? ''
  if (!raw) {
    return ''
  }
  return raw.includes(':') ? (raw.split(':').pop() ?? raw) : raw
}
