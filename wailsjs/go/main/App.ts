// Hand-maintained bridge; `wails generate module` may refresh this file.
export function GetAPIBaseURL(): Promise<string> {
  const app = (window as Window & { go?: { main?: { App?: { GetAPIBaseURL?: () => Promise<string> } } } })
    .go?.main?.App
  if (app?.GetAPIBaseURL) {
    return app.GetAPIBaseURL()
  }
  return Promise.resolve('')
}
