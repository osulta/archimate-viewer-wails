import { slugForDiagramExport } from '../archimate/canvas-draw'
import type { ParsedDiagram } from '../../types/model'

export function exportDiagramPng(
  canvas: HTMLCanvasElement | null,
  diagram: ParsedDiagram | null,
  diagramExportName?: string,
): void {
  if (!canvas || !diagram) {
    return
  }
  let dataUrl: string
  try {
    dataUrl = canvas.toDataURL('image/png')
  } catch {
    return
  }
  const base = slugForDiagramExport(diagramExportName ?? diagram.name)
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `${base}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
}
