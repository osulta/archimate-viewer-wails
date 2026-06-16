const MAIN_BRANCH_FALLBACKS = ['master', 'main'] as const

export function resolveDefaultCompareBranch(
  branchNames: string[],
  options?: { defaultBranch?: string | null },
): string {
  const uniqueNames = [...new Set(branchNames.map((name) => name.trim()).filter(Boolean))]
  if (!uniqueNames.length) {
    return ''
  }

  const remoteDefault = options?.defaultBranch?.trim()
  if (remoteDefault && uniqueNames.includes(remoteDefault)) {
    return remoteDefault
  }

  for (const candidate of MAIN_BRANCH_FALLBACKS) {
    if (uniqueNames.includes(candidate)) {
      return candidate
    }
  }

  return uniqueNames[0]
}
