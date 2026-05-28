import type { ParsedModel } from '../src/types/model'

export interface LinterFinding {
  elementId: string
  name: string
  type: string
}

export interface LinterRunResult {
  ok: boolean
  message: string
  findings: LinterFinding[]
  /** neutral: список без стиля предупреждения (инвентаризация). */
  findingsStyle?: 'default' | 'neutral'
}

export interface LinterDefinition {
  id: string
  title: string
  description: string
  run(model: ParsedModel | null): LinterRunResult
}
