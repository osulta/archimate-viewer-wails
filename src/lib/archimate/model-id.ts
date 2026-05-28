/**
 * Archi / split-export id: `id-` + 32 hex chars (e.g. id-e0a5ad453a344edfacff05726568246f).
 */
export function generateArchimateModelId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `id-${crypto.randomUUID().replace(/-/g, '')}`
  }
  let hex = ''
  for (let i = 0; i < 32; i += 1) {
    hex += Math.floor(Math.random() * 16).toString(16)
  }
  return `id-${hex}`
}
