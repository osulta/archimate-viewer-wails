import { getElementNotationStyle } from '../archimate/canvas-draw'
import type { DiagramNode } from '../../types/model'
import type { NodeDrawColors } from './types'

export function resolveNodeDrawColors(
  node: DiagramNode,
  style: ReturnType<typeof getElementNotationStyle>,
  flags: { isSelected: boolean; isChanged: boolean },
): NodeDrawColors {
  const customFill = node.fillColor?.trim()
  const customLine = node.lineColor?.trim()
  const customFont = node.fontColor?.trim()
  return {
    fill: flags.isSelected ? '#d6e4ff' : flags.isChanged ? '#fff9c4' : customFill || style.fill,
    header: flags.isSelected ? '#bfd4ff' : flags.isChanged ? '#fff59d' : customFill || style.header,
    border: flags.isSelected ? '#1f47bf' : flags.isChanged ? '#e65100' : customLine || style.border,
    text: customFont || style.text,
  }
}
