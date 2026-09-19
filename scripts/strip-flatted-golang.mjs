import { rmSync } from 'node:fs'

/**
 * flatted ships experimental Go sources under golang/.
 * When node_modules lives in the Go module root, Wails/go list
 * can pick them up and fail binding generation on newer Go toolchains.
 */
rmSync(new URL('../node_modules/flatted/golang', import.meta.url), {
  recursive: true,
  force: true,
})
