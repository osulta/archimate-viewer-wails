import type { DiagramConnection } from '../../types/model'

export const DEFAULT_CONNECTION_LINE_COLOR = '#242424'

export function resolveConnectionLineColor(
  connection: DiagramConnection,
  fallback = DEFAULT_CONNECTION_LINE_COLOR,
): string {
  return connection.lineColor?.trim() || fallback
}
