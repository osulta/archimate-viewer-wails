/** Id → elements that share that id/identifier (diagram objects can collide rarely). */
export type XmlElementIndex = Map<string, Element[]>

export interface XmlDocumentCache {
  document: Document
  elementsById: XmlElementIndex
}

export interface XmlDocumentContainers {
  modelEl: Element | null
  folderOther: Element | null
  relationsFolder: Element | null
  elementsContainer: Element | null
  relationshipsContainer: Element | null
}

export function parseXmlDocument(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml')
}

export function buildXmlElementIndex(documentNode: Document): XmlElementIndex {
  const elementsById: XmlElementIndex = new Map()
  const all = documentNode.getElementsByTagName('*')
  for (let i = 0; i < all.length; i += 1) {
    const el = all[i]
    const id = el.getAttribute('id') ?? el.getAttribute('identifier') ?? ''
    if (!id) {
      continue
    }
    const bucket = elementsById.get(id)
    if (bucket) {
      bucket.push(el)
    } else {
      elementsById.set(id, [el])
    }
  }
  return elementsById
}

export function buildXmlDocumentCache(xml: string): XmlDocumentCache | null {
  if (!xml) {
    return null
  }
  const document = parseXmlDocument(xml)
  return {
    document,
    elementsById: buildXmlElementIndex(document),
  }
}

export function cloneXmlDocumentCache(cache: XmlDocumentCache): XmlDocumentCache {
  const document = cache.document.cloneNode(true) as Document
  return {
    document,
    elementsById: buildXmlElementIndex(document),
  }
}

export function indexElements(elementsById: XmlElementIndex, el: Element): void {
  const id = el.getAttribute('id') ?? el.getAttribute('identifier') ?? ''
  if (!id) {
    return
  }
  const bucket = elementsById.get(id)
  if (bucket) {
    bucket.push(el)
  } else {
    elementsById.set(id, [el])
  }
}

export function findFirstByLocalName(documentNode: Document, localName: string): Element | null {
  const list = documentNode.getElementsByTagName(localName)
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].localName === localName) {
      return list[i]
    }
  }
  // Prefixed tags may not match getElementsByTagName(localName) in some browsers.
  const all = documentNode.getElementsByTagName('*')
  for (let i = 0; i < all.length; i += 1) {
    if (all[i].localName === localName) {
      return all[i]
    }
  }
  return null
}

export function resolveXmlDocumentContainers(documentNode: Document): XmlDocumentContainers {
  const modelEl = findFirstByLocalName(documentNode, 'model')
  let folderOther: Element | null = null
  let folderFallback: Element | null = null
  let relationsFolder: Element | null = null
  let elementsContainer: Element | null = null
  let relationshipsContainer: Element | null = null

  const all = documentNode.getElementsByTagName('*')
  for (let i = 0; i < all.length; i += 1) {
    const el = all[i]
    const ln = el.localName
    if (ln === 'folder') {
      const type = el.getAttribute('type') ?? ''
      if (type === 'other') {
        folderOther = el
      } else if (!folderFallback) {
        folderFallback = el
      }
      if (type === 'relations') {
        relationsFolder = el
      }
    } else if (ln === 'elements' && !elementsContainer) {
      elementsContainer = el
    } else if (ln === 'relationships' && !relationshipsContainer) {
      relationshipsContainer = el
    }
  }

  return {
    modelEl,
    folderOther: folderOther ?? folderFallback,
    relationsFolder,
    elementsContainer,
    relationshipsContainer,
  }
}

export function elementsForId(index: XmlElementIndex, id: string): Element[] {
  return index.get(id) ?? []
}
