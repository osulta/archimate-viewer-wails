// Hand-maintained bridge; `wails generate module` may refresh this file.
type BoundApp = {
  GetAPIBaseURL?: () => Promise<string>
  SelectDirectory?: (title: string) => Promise<string>
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

/** True when running inside the Wails desktop shell (native dialogs available). */
export function isWailsRuntime(): boolean {
  return Boolean(boundApp()?.SelectDirectory)
}
