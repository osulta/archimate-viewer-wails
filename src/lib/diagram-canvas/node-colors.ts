import { getElementNotationStyle } from '../archimate/canvas-draw'
import type { DiagramNode } from '../../types/model'
import type { CanvasPaintTheme } from './canvas-theme'
import { getCanvasPaintTheme } from './canvas-theme'
import type { NodeDrawColors } from './types'

export function resolveNodeDrawColors(
  node: DiagramNode,
  style: ReturnType<typeof getElementNotationStyle>,
  flags: { isSelected: boolean; isChanged: boolean },
  theme: CanvasPaintTheme = getCanvasPaintTheme('light'),
): NodeDrawColors {
  const customFill = node.fillColor?.trim()
  const customLine = node.lineColor?.trim()
  const customFont = node.fontColor?.trim()
  return {
    fill: flags.isSelected
      ? theme.selectionFill
      : flags.isChanged
        ? theme.changedFill
        : customFill || style.fill,
    header: flags.isSelected
      ? theme.selectionHeader
      : flags.isChanged
        ? theme.changedHeader
        : customFill || style.header,
    border: flags.isSelected
      ? theme.selectionBorder
      : flags.isChanged
        ? theme.changedBorder
        : customLine || style.border,
    text: flags.isSelected
      ? theme.selectionText
      : flags.isChanged
        ? theme.changedText
        : customFont || style.text,
  }
}
