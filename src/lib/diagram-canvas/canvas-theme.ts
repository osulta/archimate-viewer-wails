export type CanvasThemeMode = 'light' | 'dark'

export interface CanvasPaintTheme {
  background: string
  gridDot: string
  selectionFill: string
  selectionHeader: string
  selectionBorder: string
  selectionText: string
  changedFill: string
  changedHeader: string
  changedBorder: string
  changedText: string
  referenceFill: string
  referenceFillSelected: string
  referenceBorder: string
  referenceBorderSelected: string
  referenceText: string
  referenceTextSelected: string
  handleFill: string
  handleStroke: string
  junctionFill: string
  junctionFillSelected: string
  junctionStroke: string
  andJunctionFill: string
  endpointHandleStroke: string
  bendpointFill: string
  bendpointFillActive: string
  bendpointStroke: string
}

const LIGHT_CANVAS_THEME: CanvasPaintTheme = {
  background: '#ffffff',
  gridDot: 'rgba(148, 163, 184, 0.4)',
  selectionFill: '#d6e4ff',
  selectionHeader: '#bfd4ff',
  selectionBorder: '#1f47bf',
  selectionText: '#14224d',
  changedFill: '#fff9c4',
  changedHeader: '#fff59d',
  changedBorder: '#e65100',
  changedText: '#3e2723',
  referenceFill: '#f8f9fb',
  referenceFillSelected: '#eef3ff',
  referenceBorder: '#7986cb',
  referenceBorderSelected: '#1f47bf',
  referenceText: '#3949ab',
  referenceTextSelected: '#1f47bf',
  handleFill: '#ffffff',
  handleStroke: '#1f47bf',
  junctionFill: '#ffffff',
  junctionFillSelected: '#d6e4ff',
  junctionStroke: '#000000',
  andJunctionFill: '#000000',
  endpointHandleStroke: '#ffffff',
  bendpointFill: '#ffffff',
  bendpointFillActive: '#ff7a00',
  bendpointStroke: '#ff7a00',
}

const DARK_CANVAS_THEME: CanvasPaintTheme = {
  background: '#1a1a1a',
  gridDot: 'rgba(148, 163, 184, 0.22)',
  selectionFill: '#243356',
  selectionHeader: '#2c3f68',
  selectionBorder: '#6b8cff',
  selectionText: '#e8eeff',
  changedFill: '#3d3420',
  changedHeader: '#4a3f24',
  changedBorder: '#ff9800',
  changedText: '#ffe0b2',
  referenceFill: '#252830',
  referenceFillSelected: '#2a3550',
  referenceBorder: '#7b8cff',
  referenceBorderSelected: '#9eb0ff',
  referenceText: '#b4c0ff',
  referenceTextSelected: '#d0d8ff',
  handleFill: '#1f1f1f',
  handleStroke: '#6b8cff',
  junctionFill: '#2a2a2a',
  junctionFillSelected: '#243356',
  junctionStroke: '#e0e0e0',
  andJunctionFill: '#e8e8e8',
  endpointHandleStroke: '#1a1a1a',
  bendpointFill: '#1f1f1f',
  bendpointFillActive: '#ff9800',
  bendpointStroke: '#ff9800',
}

export function getCanvasPaintTheme(mode: CanvasThemeMode = 'light'): CanvasPaintTheme {
  return mode === 'dark' ? DARK_CANVAS_THEME : LIGHT_CANVAS_THEME
}
