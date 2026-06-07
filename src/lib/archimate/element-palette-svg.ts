import { getElementNotationStyle, getElementVisualSpec } from './notation'
import type { ElementVisualSpec } from '../../types/model'

const VIEWBOX_W = 32
const VIEWBOX_H = 24
const ICON_W = 14
const ICON_H = 12
const ICON_SCALE = 1.45

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function resolvePaletteIconName(visual: ElementVisualSpec): string {
  if (visual.bare || visual.icon === 'none') {
    return 'generic'
  }
  if (visual.shape === 'junction' || visual.shape === 'and-junction') {
    return 'junction'
  }
  if (visual.shape === 'interface') {
    return 'interface'
  }
  return visual.icon
}

function buildElementIconMarkup(icon: string, color: string, fillColor: string): string {
  const stroke = escapeXml(color)
  const fill = escapeXml(fillColor)
  const gOpen = `<g fill="none" stroke="${stroke}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">`
  const gClose = '</g>'

  switch (icon) {
    case 'service':
      return `${gOpen}<rect x="0" y="2.5" width="14" height="7" rx="3" fill="none"/>${gClose}`
    case 'business-event':
      return `${gOpen}<path d="M 1 2.5 H 3.5 L 3.5 5 A 8.5 4.25 0 0 1 12 5 V 7.5 H 1 Z" fill="${fill}" stroke="${stroke}"/>${gClose}`
    case 'event':
      return `${gOpen}<path d="M 0 2 H 10 Q 14 6 10 10 H 0 Z" fill="none"/>${gClose}`
    case 'object':
      return `${gOpen}<rect x="1" y="1" width="11" height="9" fill="none"/><path d="M 1 3.5 H 12"/>${gClose}`
    case 'contract':
      return `${gOpen}<rect x="1" y="1" width="11" height="9" fill="none"/><path d="M 1 3 H 12 M 1 7 H 12"/>${gClose}`
    case 'product':
      return `${gOpen}<rect x="1" y="1" width="11" height="9" fill="none"/><rect x="1" y="1" width="4.2" height="3.2" fill="none"/>${gClose}`
    case 'artifact':
      return `${gOpen}<path d="M 1 1 H 9 L 12 4 V 10 H 1 Z" fill="none"/><path d="M 9 1 V 4 H 12"/>${gClose}`
    case 'application-component':
    case 'component':
    case 'tech':
      return `${gOpen}<rect x="5" y="1" width="8" height="9" fill="${fill}" stroke="${stroke}"/><rect x="3" y="2.4" width="4" height="3.2" fill="${fill}" stroke="${stroke}"/><rect x="3" y="6.4" width="4" height="3.2" fill="${fill}" stroke="${stroke}"/>${gClose}`
    case 'business-collaboration':
    case 'application-collaboration':
    case 'technology-collaboration':
    case 'collaboration':
      return `${gOpen}<circle cx="5" cy="5.5" r="3.1" fill="none"/><circle cx="9.5" cy="5.5" r="3.1" fill="none"/>${gClose}`
    case 'system-software':
      return `${gOpen}<circle cx="5" cy="5.5" r="3.2" fill="${fill}" stroke="${stroke}"/><circle cx="9.5" cy="5.5" r="3.2" fill="${fill}" stroke="${stroke}"/>${gClose}`
    case 'interface':
      return `${gOpen}<path d="M 1.2 5 H 8.35"/><circle cx="11.2" cy="5" r="2.85" fill="none"/>${gClose}`
    case 'business-process':
    case 'process':
      return `${gOpen}<path d="M 1 3.6 H 6 V 1 L 12 5 L 6 9 V 6.4 H 1 Z" fill="${fill}" stroke="${stroke}"/>${gClose}`
    case 'application-function':
    case 'function':
      return `${gOpen}<path d="M 1 4 L 6.5 1.5 L 12 4 V 9 L 6.5 6.5 L 1 9 Z" fill="${fill}" stroke="${stroke}"/>${gClose}`
    case 'interaction':
      return `${gOpen}<path d="M 1.2 8 A 3.05 3.05 0 0 1 1.2 2 Z" fill="${fill}" stroke="${stroke}"/><path d="M 6.6 2 A 3.05 3.05 0 0 1 6.6 8 Z" fill="${fill}" stroke="${stroke}"/>${gClose}`
    case 'role':
      return `${gOpen}<path d="M 3.4 2.65 Q 1.35 5.5 3.4 8.35 H 10.75 A 1.75 2.85 0 1 0 10.75 2.65 Z" fill="${fill}" stroke="${stroke}"/><ellipse cx="10.75" cy="5.5" rx="1.75" ry="2.85" fill="none"/>${gClose}`
    case 'actor':
      return `${gOpen}<circle cx="7" cy="2.5" r="2" fill="none"/><path d="M 7 4.5 V 7.5 M 3.5 5.5 H 10.5 M 7 7.5 L 4.5 10 M 7 7.5 L 9.5 10"/>${gClose}`
    case 'node':
      return `${gOpen}<path d="M 1 8 4 5 12.5 5 9.5 2 H 1 Z" fill="${fill}" stroke="${stroke}"/><path d="M 9.5 2 V 8.5 L 12.5 5.5 V 11.5 H 1 V 8 Z" fill="${fill}" stroke="${stroke}"/><rect x="1" y="8" width="8.5" height="3.5" fill="${fill}" stroke="${stroke}"/>${gClose}`
    case 'device':
      return `${gOpen}<rect x="1" y="1" width="12" height="7" rx="1.2" fill="none"/><path d="M 4.5 8.5 H 9.5 L 8.2 10.5 H 5.8 Z" fill="none"/>${gClose}`
    case 'equipment':
      return `${gOpen}<circle cx="5.2" cy="6.2" r="2.1" fill="none"/><g stroke-width="0.9">${Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2
        return `<path d="M ${5.2 + Math.cos(a) * 2.3} ${6.2 + Math.sin(a) * 2.3} L ${5.2 + Math.cos(a) * 3.6} ${6.2 + Math.sin(a) * 3.6}"/>`
      }).join('')}</g><circle cx="9.4" cy="4.4" r="1.6" fill="none"/>${gClose}`
    case 'facility':
      return `${gOpen}<path d="M 1.2 9 V 1 H 3.65 V 4.35 L 5.1 2.05 L 6.75 4.35 L 8.35 2.05 L 9.95 4.35 L 11.55 2.05 L 12.6 4.35 V 9 Z" fill="${fill}" stroke="${stroke}"/>${gClose}`
    case 'communication-network':
      return `${gOpen}<polygon points="3,2 11,2 10,8.5 2,8.5" fill="none"/><circle cx="3" cy="2" r="1.35" fill="${stroke}"/><circle cx="11" cy="2" r="1.35" fill="${stroke}"/><circle cx="10" cy="8.5" r="1.35" fill="${stroke}"/><circle cx="2" cy="8.5" r="1.35" fill="${stroke}"/>${gClose}`
    case 'capability':
      return `${gOpen}${[
        [0, 6.4],
        [3.2, 3.2],
        [3.2, 6.4],
        [6.4, 0],
        [6.4, 3.2],
        [6.4, 6.4],
      ]
        .map(([col, row]) => `<rect x="${col}" y="${row}" width="2.6" height="2.6" fill="none"/>`)
        .join('')}${gClose}`
    case 'strategy':
      return `${gOpen}<path d="M 0 1 H 10 L 14 6 L 10 11 H 0 Z" fill="none"/>${gClose}`
    case 'motivation':
      return `${gOpen}<circle cx="7" cy="5.5" r="5" fill="none"/><circle cx="7" cy="5.5" r="3" fill="none"/><circle cx="7" cy="5.5" r="1.5" fill="${stroke}"/>${gClose}`
    case 'outcome':
      return `${gOpen}<circle cx="6" cy="6" r="5" fill="none"/><circle cx="6" cy="6" r="3" fill="none"/><circle cx="6" cy="6" r="1.3" fill="${stroke}"/><path d="M 13.5 0 L 6 6"/>${gClose}`
    case 'driver':
      return `${gOpen}<circle cx="7" cy="5.5" r="4" fill="none" stroke-width="1.4"/><circle cx="7" cy="5.5" r="2" fill="none" stroke-width="1.4"/>${Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2
        return `<path d="M ${7 + Math.cos(a) * 2} ${5.5 + Math.sin(a) * 2} L ${7 + Math.cos(a) * 5.2} ${5.5 + Math.sin(a) * 5.2}" stroke-width="1.4"/>`
      }).join('')}<circle cx="7" cy="5.5" r="1.1" fill="${stroke}"/>${gClose}`
    case 'assessment':
      return `${gOpen}<circle cx="8.5" cy="4" r="3" fill="none"/><path d="M 6.4 6.1 L 4.5 8.7"/>${gClose}`
    case 'requirement':
      return `${gOpen}<path d="M 3 0 L 12 0 L 9 10 H 0 Z" fill="none"/>${gClose}`
    case 'constraint':
      return `${gOpen}<path d="M 3 1 H 13 L 10 10 H 0 Z" fill="none"/><path d="M 4.8 1 L 1.8 10"/>${gClose}`
    case 'principle':
      return `${gOpen}<rect x="1.5" y="0.5" width="11" height="10" rx="2.5" fill="none"/><text x="7" y="5.8" text-anchor="middle" font-size="7" font-weight="700" fill="${stroke}" stroke="none">!</text><circle cx="7" cy="8" r="1" fill="${stroke}" stroke="none"/>${gClose}`
    case 'value':
      return `${gOpen}<ellipse cx="7" cy="5.5" rx="5.5" ry="4" fill="none"/>${gClose}`
    case 'meaning':
      return `${gOpen}<path d="M 4 4.5 Q 4 1 6.5 1 Q 8 0 10.5 1 Q 13 1 13 3.5 Q 13 6 10.5 7 Q 8 8 6 7 Q 4 7 4 4.5 Z" fill="none"/><circle cx="3.5" cy="9" r="1" fill="none"/><circle cx="2.5" cy="11" r="0.6" fill="none"/>${gClose}`
    case 'resource':
      return `${gOpen}<rect x="1" y="1.5" width="10" height="8" fill="none"/><rect x="11" y="3.5" width="2" height="4" fill="${stroke}" stroke="none"/><rect x="3" y="3" width="1.5" height="5" fill="${stroke}" stroke="none"/><rect x="5.7" y="3" width="1.5" height="5" fill="${stroke}" stroke="none"/><rect x="8.4" y="3" width="1.5" height="5" fill="${stroke}" stroke="none"/>${gClose}`
    case 'value-stream':
      return `${gOpen}<path d="M 0 1 H 10 L 14 5.5 L 10 10 H 0 L 3.5 5.5 Z" fill="none"/>${gClose}`
    case 'course-of-action':
      return `${gOpen}<circle cx="10" cy="3.5" r="3.5" fill="none"/><circle cx="10" cy="3.5" r="2" fill="none"/><circle cx="10" cy="3.5" r="0.9" fill="${stroke}"/><path d="M 0.5 10 L 7 7"/>${gClose}`
    case 'work':
      return `${gOpen}<path d="M 5 2 A 3.5 3.5 0 0 1 5 9" fill="none"/><path d="M 7.4 5 L 13.5 5"/><path d="M 11.5 3.5 L 13.5 5 L 11.5 6.5" fill="${stroke}"/>${gClose}`
    case 'deliverable':
      return `${gOpen}<path d="M 1 1 H 13 V 7 Q 10 10 7 7 Q 4 4 1 7 Z" fill="none"/>${gClose}`
    case 'plateau':
      return `${gOpen}<rect x="4" y="1.5" width="8" height="2" fill="${stroke}" stroke="none"/><rect x="2" y="5" width="8" height="2" fill="${stroke}" stroke="none"/><rect x="0" y="8.5" width="8" height="2" fill="${stroke}" stroke="none"/>${gClose}`
    case 'gap':
      return `${gOpen}<circle cx="7" cy="5.5" r="4" fill="none"/><path d="M 1.2 3.7 H 12.8 M 1.2 7.3 H 12.8"/>${gClose}`
    case 'location':
      return `${gOpen}<path d="M 7 9 V 3 A 2.5 2.5 0 1 0 7 9 Z" fill="none"/>${gClose}`
    case 'grouping':
      return `${gOpen}<path d="M 1 1.5 H 9.2 V 4.7 H 13 V 10 H 1 V 4.7 H 9.2 V 1.5 Z" fill="none" stroke-dasharray="2.5 2"/>${gClose}`
    case 'path':
      return `${gOpen}<path d="M 3.5 2 L 1 5 L 3.5 8 M 10.5 2 L 13 5 L 10.5 8" fill="none"/><rect x="5" y="4.4" width="1.25" height="1.25" fill="${stroke}" stroke="none"/><rect x="8" y="4.4" width="1.25" height="1.25" fill="${stroke}" stroke="none"/>${gClose}`
    case 'junction':
      return `${gOpen}<circle cx="7" cy="6" r="3.2" fill="${stroke}" stroke="none"/>${gClose}`
    case 'generic':
    default:
      return `${gOpen}<circle cx="7" cy="6" r="2.1" fill="${stroke}" stroke="none"/>${gClose}`
  }
}

export function buildElementPaletteSvg(elementType: string): string {
  const localType = elementType.replace(/^archimate:/i, '')
  const archimateType = `archimate:${localType}`
  const style = getElementNotationStyle(archimateType)
  const visual = getElementVisualSpec(archimateType)
  const iconName = resolvePaletteIconName(visual)
  const iconMarkup = buildElementIconMarkup(iconName, style.border, style.fill)

  const offsetX = (VIEWBOX_W - ICON_W * ICON_SCALE) / 2
  const offsetY = (VIEWBOX_H - ICON_H * ICON_SCALE) / 2
  const background = `<rect x="0.5" y="0.5" width="${VIEWBOX_W - 1}" height="${VIEWBOX_H - 1}" rx="2" fill="${escapeXml(style.fill)}" stroke="${escapeXml(style.border)}" stroke-width="0.75"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX_W} ${VIEWBOX_H}" role="img" aria-hidden="true">${background}<g transform="translate(${offsetX} ${offsetY}) scale(${ICON_SCALE})">${iconMarkup}</g></svg>`
}

export function buildElementPaletteSvgDataUrl(elementType: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildElementPaletteSvg(elementType))}`
}
