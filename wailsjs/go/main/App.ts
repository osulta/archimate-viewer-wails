// Hand-maintained bridge; `wails generate module` may refresh this file.
type BoundApp = {
  GetAPIBaseURL?: () => Promise<string>
  SelectDirectory?: (title: string) => Promise<string>
  WriteModelFile?: (
    relPath: string,
    content: string,
  ) => Promise<{ ok?: boolean; path?: string; error?: string }>
  BeginModelWrite?: (
    relPath: string,
  ) => Promise<{ ok?: boolean; writeId?: string; error?: string }>
  AppendModelWriteChunk?: (
    writeId: string,
    chunk: string,
  ) => Promise<{ ok?: boolean; error?: string }>
  CommitModelWrite?: (
    writeId: string,
  ) => Promise<{ ok?: boolean; path?: string; error?: string }>
  AbortModelWrite?: (writeId: string) => Promise<{ ok?: boolean; error?: string }>
}

function boundApp(): BoundApp | undefined {
  return (window as Window & { go?: { main?: { App?: BoundApp } } }).go?.main?.App
}

export function GetAPIBaseURL(): Promise<string> {
  const app = boundApp()
  if (app?.GetAPIBaseURL) {
    return app.GetAPIBaseURL()
  }
  return Promise.resolve('')
}

/** Opens a native folder picker (desktop only). Resolves '' outside Wails or on cancel. */
export function SelectDirectory(title = ''): Promise<string> {
  const app = boundApp()
  if (app?.SelectDirectory) {
    return app.SelectDirectory(title)
  }
  return Promise.resolve('')
}

/** Writes model XML via the Go binding (desktop). Prefer this over HTTP JSON for large files. */
export function WriteModelFile(
  relPath: string,
  content: string,
): Promise<{ ok?: boolean; path?: string; error?: string }> {
  const app = boundApp()
  if (app?.WriteModelFile) {
    return app.WriteModelFile(relPath, content)
  }
  return Promise.resolve({ ok: false, error: 'WriteModelFile недоступен вне desktop runtime' })
}

export function BeginModelWrite(
  relPath: string,
): Promise<{ ok?: boolean; writeId?: string; error?: string }> {
  const app = boundApp()
  if (app?.BeginModelWrite) {
    return app.BeginModelWrite(relPath)
  }
  return Promise.resolve({ ok: false, error: 'BeginModelWrite недоступен вне desktop runtime' })
}

export function AppendModelWriteChunk(
  writeId: string,
  chunk: string,
): Promise<{ ok?: boolean; error?: string }> {
  const app = boundApp()
  if (app?.AppendModelWriteChunk) {
    return app.AppendModelWriteChunk(writeId, chunk)
  }
  return Promise.resolve({ ok: false, error: 'AppendModelWriteChunk недоступен вне desktop runtime' })
}

export function CommitModelWrite(
  writeId: string,
): Promise<{ ok?: boolean; path?: string; error?: string }> {
  const app = boundApp()
  if (app?.CommitModelWrite) {
    return app.CommitModelWrite(writeId)
  }
  return Promise.resolve({ ok: false, error: 'CommitModelWrite недоступен вне desktop runtime' })
}

export function AbortModelWrite(writeId: string): Promise<{ ok?: boolean; error?: string }> {
  const app = boundApp()
  if (app?.AbortModelWrite) {
    return app.AbortModelWrite(writeId)
  }
  return Promise.resolve({ ok: false, error: 'AbortModelWrite недоступен вне desktop runtime' })
}

const MODEL_WRITE_CHUNK_CHARS = 512 * 1024

/** Chunked desktop write — avoids one multi‑MB IPC marshaling spike. */
export async function WriteModelFileChunked(
  relPath: string,
  content: string,
): Promise<{ ok?: boolean; path?: string; error?: string }> {
  const app = boundApp()
  if (!app?.BeginModelWrite || !app?.AppendModelWriteChunk || !app?.CommitModelWrite) {
    return WriteModelFile(relPath, content)
  }
  if (content.length <= MODEL_WRITE_CHUNK_CHARS) {
    return WriteModelFile(relPath, content)
  }

  const begin = await BeginModelWrite(relPath)
  if (!begin.ok || !begin.writeId) {
    return { ok: false, error: begin.error || 'Не удалось начать запись модели' }
  }
  const writeId = begin.writeId
  try {
    for (let offset = 0; offset < content.length; offset += MODEL_WRITE_CHUNK_CHARS) {
      const chunk = content.slice(offset, offset + MODEL_WRITE_CHUNK_CHARS)
      const appended = await AppendModelWriteChunk(writeId, chunk)
      if (!appended.ok) {
        await AbortModelWrite(writeId)
        return { ok: false, error: appended.error || 'Ошибка записи фрагмента модели' }
      }
      // Yield so the loading UI can stay responsive between chunks.
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0)
      })
    }
    return CommitModelWrite(writeId)
  } catch (err) {
    await AbortModelWrite(writeId)
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** True when running inside the Wails desktop shell (native dialogs available). */
export function isWailsRuntime(): boolean {
  return Boolean(boundApp()?.SelectDirectory)
}
