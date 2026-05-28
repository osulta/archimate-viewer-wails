export function idFromArchimateHref(href: string | null | undefined): string {
  if (!href) {
    return ''
  }
  const hashIndex = href.indexOf('#')
  if (hashIndex >= 0) {
    return href.slice(hashIndex + 1)
  }
  return href.trim()
}

export function idFromArchimateChildHref(parent: Element | null | undefined, localName: string): string {
  if (!parent) {
    return ''
  }
  const child = Array.from(parent.children).find((item) => item.localName === localName)
  return idFromArchimateHref(child?.getAttribute('href') ?? '')
}
