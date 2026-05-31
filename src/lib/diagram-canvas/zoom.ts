import { ZOOM_MIN, ZOOM_MAX } from './constants'

export function clampZoom(zoom: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom))
}
