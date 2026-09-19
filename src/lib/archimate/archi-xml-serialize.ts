function escapeXmlAttr(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
}

function escapeXmlText(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function getQualifiedName(el: Element): string {
  const prefix = el.prefix
  const localName = el.localName
  return prefix ? `${prefix}:${localName}` : localName
}

function getQualifiedAttrName(attr: Attr): string {
  const prefix = attr.prefix
  const localName = attr.localName || attr.name
  if (prefix && !localName.startsWith('xmlns')) {
    return `${prefix}:${localName}`
  }
  return attr.name
}

function collectAttributes(el: Element): string[] {
  const attrs: string[] = []
  for (let index = 0; index < el.attributes.length; index += 1) {
    const attr = el.attributes[index]
    attrs.push(`${getQualifiedAttrName(attr)}="${escapeXmlAttr(attr.value)}"`)
  }
  return attrs
}

function collectChildElements(el: Element): Element[] {
  const children: Element[] = []
  for (let index = 0; index < el.childNodes.length; index += 1) {
    const child = el.childNodes[index]
    if (child.nodeType === Node.ELEMENT_NODE) {
      children.push(child as Element)
    }
  }
  return children
}

function collectTrimmedText(el: Element): string {
  let text = ''
  for (let index = 0; index < el.childNodes.length; index += 1) {
    const child = el.childNodes[index]
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent ?? ''
    }
  }
  return text.trim()
}

function serializeArchimateElement(el: Element, depth: number): string {
  const tagIndent = depth === 0 ? '' : '  '.repeat(depth)
  const qName = getQualifiedName(el)
  const attrs = collectAttributes(el)
  const childElements = collectChildElements(el)
  const text = collectTrimmedText(el)
  const hasBody = childElements.length > 0 || Boolean(text)
  const attrsInline = attrs.length > 0 ? ` ${attrs.join(' ')}` : ''

  if (!hasBody) {
    return `${tagIndent}<${qName}${attrsInline}/>\n`
  }

  if (text && childElements.length === 0) {
    return `${tagIndent}<${qName}${attrsInline}>${escapeXmlText(text)}</${qName}>\n`
  }

  let result = `${tagIndent}<${qName}${attrsInline}>\n`

  if (text) {
    result += `${tagIndent}  ${escapeXmlText(text)}\n`
  }

  for (const child of childElements) {
    result += serializeArchimateElement(child, depth + 1)
  }

  result += `${tagIndent}</${qName}>\n`
  return result
}

/** Serialize DOM using Archi XML formatting conventions (attrs on one line). */
export function serializeArchimateXml(documentNode: Document): string {
  const root = documentNode.documentElement
  if (!root) {
    return ''
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serializeArchimateElement(root, 0)}`
}
