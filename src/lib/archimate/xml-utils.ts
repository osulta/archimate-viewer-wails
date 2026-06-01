import type { Bendpoint, DiagramNode, ElementProperty } from '../../types/model'

export function getName(element: Element | null): string {
  if (!element) {
    return ''
  }

  const attrName = element.getAttribute('name')
  if (attrName?.trim()) {
    return attrName.trim()
  }

  const nameNode = Array.from(element.children).find(
    (child) => child.localName === 'name',
  )
  if (nameNode?.textContent?.trim()) {
    return nameNode.textContent.trim()
  }

  return element.getAttribute('identifier') ?? ''
}

export function getId(node: Element): string {
  return node.getAttribute('identifier') ?? node.getAttribute('id') ?? ''
}

export function getDirectChildrenByTag(parent: Element | null, localName: string): Element[] {
  if (!parent) {
    return []
  }

  return Array.from(parent.children).filter((item) => item.localName === localName)
}

export function getDirectChildByTag(parent: Element | null, localName: string): Element | null {
  return getDirectChildrenByTag(parent, localName)[0] ?? null
}

export function getType(node: Element, fallback: string): string {
  return (
    node.getAttribute('xsi:type') ??
    node.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type') ??
    node.getAttribute('type') ??
    fallback
  )
}

export function getDiagramObjectLabel(node: Element | null): string {
  if (!node) {
    return ''
  }

  const contentChild = getDirectChildByTag(node, 'content')
  if (contentChild?.textContent?.trim()) {
    return contentChild.textContent.trim()
  }

  for (const labelNode of getDirectChildrenByTag(node, 'label')) {
    const nestedContent = getDirectChildByTag(labelNode, 'content')
    const text =
      nestedContent?.textContent?.trim() ||
      labelNode.textContent?.trim() ||
      labelNode.getAttribute('name')?.trim() ||
      ''
    if (text) {
      return text
    }
  }

  const attrName = node.getAttribute('name')?.trim()
  if (attrName) {
    return attrName
  }

  return ''
}

export function getDocumentation(element: Element | null): string {
  if (!element) {
    return ''
  }
  const docNode = getDirectChildByTag(element, 'documentation')
  return docNode?.textContent?.trim() ?? ''
}

/** Записывает или удаляет дочерний <documentation> у элемента модели. */
export function applyDocumentationToElementXml(el: Element, documentNode: Document, documentation: string | null | undefined): void {
  const text = String(documentation ?? '')
  let docNode = getDirectChildByTag(el, 'documentation')
  if (!text.trim()) {
    if (docNode) {
      el.removeChild(docNode)
    }
    return
  }
  if (!docNode) {
    docNode = documentNode.createElement(
      el.prefix ? `${el.prefix}:documentation` : 'documentation',
    )
    const nameNode = getDirectChildByTag(el, 'name')
    if (nameNode?.nextSibling) {
      el.insertBefore(docNode, nameNode.nextSibling)
    } else if (nameNode) {
      el.appendChild(docNode)
    } else {
      el.appendChild(docNode)
    }
  }
  docNode.textContent = text
}

/** Archi split-model format: `<properties key="…" value="…"/>` (not archimate:property). */
export function applyPropertiesToElementXml(
  el: Element,
  documentNode: Document,
  properties: ElementProperty[],
): void {
  getDirectChildrenByTag(el, 'property').forEach((node) => el.removeChild(node))
  getDirectChildrenByTag(el, 'properties').forEach((node) => el.removeChild(node))
  properties.forEach((prop) => {
    const propNode = documentNode.createElement('properties')
    propNode.setAttribute('key', prop.key)
    propNode.setAttribute('value', prop.value ?? '')
    el.appendChild(propNode)
  })
}

export function parseProperties(node: Element): ElementProperty[] {
  const props: ElementProperty[] = []
  getDirectChildrenByTag(node, 'property').forEach((propNode) => {
    const key =
      propNode.getAttribute('key') ??
      propNode.getAttribute('propertyDefinitionRef') ??
      propNode.getAttribute('identifierRef') ??
      ''
    const value =
      propNode.getAttribute('value') ?? propNode.textContent?.trim() ?? ''
    if (key || value) {
      props.push({ key: key || '(property)', value: value || '' })
    }
  })
  getDirectChildrenByTag(node, 'properties').forEach((propNode) => {
    const key = propNode.getAttribute('key') ?? ''
    const value = propNode.getAttribute('value') ?? propNode.textContent?.trim() ?? ''
    if (key || value) {
      props.push({ key: key || '(property)', value: value || '' })
    }
  })
  return props
}

export interface DiagramObjectColors {
  fillColor?: string
  lineColor?: string
  fontColor?: string
}

function normalizeDiagramHexColor(raw: string | null | undefined): string | undefined {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) {
    return undefined
  }
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed) || /^#[0-9a-fA-F]{8}$/.test(trimmed)) {
    return trimmed.toLowerCase()
  }
  return trimmed
}

function rgbColorElementToHex(colorEl: Element | null): string | undefined {
  if (!colorEl) {
    return undefined
  }
  const r = colorEl.getAttribute('r')
  const g = colorEl.getAttribute('g')
  const b = colorEl.getAttribute('b')
  if (r == null || g == null || b == null) {
    return undefined
  }
  const rn = Number(r)
  const gn = Number(g)
  const bn = Number(b)
  if (!Number.isFinite(rn) || !Number.isFinite(gn) || !Number.isFinite(bn)) {
    return undefined
  }
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${toHex(rn)}${toHex(gn)}${toHex(bn)}`
}

/** Reads fill/line/font colors from Archi diagram object XML (attributes or exchange style). */
export function parseDiagramObjectColors(node: Element): DiagramObjectColors {
  const colors: DiagramObjectColors = {
    fillColor: normalizeDiagramHexColor(node.getAttribute('fillColor')),
    lineColor: normalizeDiagramHexColor(node.getAttribute('lineColor')),
    fontColor: normalizeDiagramHexColor(node.getAttribute('fontColor')),
  }

  const styleEl = getDirectChildByTag(node, 'style')
  if (styleEl) {
    if (!colors.fillColor) {
      colors.fillColor = rgbColorElementToHex(getDirectChildByTag(styleEl, 'fillColor'))
    }
    if (!colors.lineColor) {
      colors.lineColor = rgbColorElementToHex(getDirectChildByTag(styleEl, 'lineColor'))
    }
  }

  return colors
}

/** Writes diagram object fill color to Archi XML (attribute on children/child/node). */
export function applyDiagramObjectVisualToXml(xmlEl: Element, node: DiagramNode): void {
  const fill = node.fillColor?.trim()
  if (fill) {
    xmlEl.setAttribute('fillColor', fill)
  } else {
    xmlEl.removeAttribute('fillColor')
  }
}

const CONNECTION_BENDPOINT_TAGS = ['bendpoints', 'bendpoint']

export function parseConnectionBendpoints(connectionNode: Element): Bendpoint[] {
  const out: Bendpoint[] = []
  for (const tag of CONNECTION_BENDPOINT_TAGS) {
    getDirectChildrenByTag(connectionNode, tag).forEach((bp) => {
      out.push({
        startX: Number(bp.getAttribute('startX') ?? 0),
        startY: Number(bp.getAttribute('startY') ?? 0),
        endX: Number(bp.getAttribute('endX') ?? 0),
        endY: Number(bp.getAttribute('endY') ?? 0),
      })
    })
  }
  return out
}

export function clearConnectionBendpoints(connectionEl: Element): void {
  for (const tag of CONNECTION_BENDPOINT_TAGS) {
    getDirectChildrenByTag(connectionEl, tag).forEach((bp) => connectionEl.removeChild(bp))
  }
}

export function appendConnectionBendpoints(connectionEl: Element, documentNode: Document, bendpoints: Bendpoint[]): void {
  if (!bendpoints?.length) {
    return
  }
  const tagName = connectionEl.prefix
    ? `${connectionEl.prefix}:bendpoints`
    : 'bendpoints'
  bendpoints.forEach((bp) => {
    const bpNode = documentNode.createElement(tagName)
    bpNode.setAttribute('startX', String(Math.round(bp.startX ?? 0)))
    bpNode.setAttribute('startY', String(Math.round(bp.startY ?? 0)))
    bpNode.setAttribute('endX', String(Math.round(bp.endX ?? 0)))
    bpNode.setAttribute('endY', String(Math.round(bp.endY ?? 0)))
    connectionEl.appendChild(bpNode)
  })
}
