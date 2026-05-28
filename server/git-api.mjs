/**
 * Локальный API для git, чтения/записи .archimate в GIT_REPO_ROOT.
 * Запуск: npm run dev:api (или вместе с Vite: npm run dev)
 *
 * GIT_REPO_ROOT — абсолютный путь к git-репозиторию (по умолчанию родитель этой папки = корень проекта archimate-viewer)
 * GIT_API_PORT — порт (по умолчанию 5151)
 */
import express from 'express'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.GIT_API_PORT || 5151)
const repoRoot = path.resolve(process.env.GIT_REPO_ROOT || path.join(__dirname, '..'))

/** Каталог клона внутри GIT_REPO_ROOT (относительный путь без ..). */
function resolveCloneTargetDir(dirInput) {
  if (!dirInput || typeof dirInput !== 'string') {
    throw new Error('Укажите имя каталога для клона')
  }
  const trimmed = dirInput.trim().replace(/^[\\/]+/, '').replace(/\\/g, '/')
  if (!trimmed || trimmed.includes('..')) {
    throw new Error('Некорректное имя каталога')
  }
  const segments = trimmed.split('/').filter(Boolean)
  if (segments.some((s) => s === '..' || s === '.')) {
    throw new Error('Некорректный путь')
  }
  const abs = path.resolve(repoRoot, trimmed)
  const relToRoot = path.relative(repoRoot, abs)
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    throw new Error('Путь выходит за пределы GIT_REPO_ROOT')
  }
  return { abs, rel: relToRoot.split(path.sep).join('/') }
}

function httpsUrlWithoutCredentials(urlString) {
  try {
    const u = new URL(urlString)
    if (u.protocol !== 'https:') {
      return urlString
    }
    u.username = ''
    u.password = ''
    return u.toString()
  } catch {
    return urlString
  }
}

/**
 * Подставляет PAT в HTTPS URL для одноразового clone.
 * GitHub: x-access-token; GitLab: oauth2; иначе пользователь git.
 */
function applyHttpsPat(originalUrl, pat, usernameOverride) {
  const token = String(pat ?? '').trim()
  if (!token) {
    return { cloneUrl: originalUrl, usedPat: false }
  }
  let u
  try {
    u = new URL(originalUrl)
  } catch {
    throw new Error('Некорректный URL')
  }
  if (u.protocol !== 'https:') {
    throw new Error('PAT поддерживается только для HTTPS (не для git@… / ssh://)')
  }
  if (token.length > 4096) {
    throw new Error('PAT слишком длинный')
  }
  const host = u.hostname.toLowerCase()
  let user = String(usernameOverride ?? '').trim()
  if (!user) {
    if (host === 'github.com' || host.endsWith('.github.com')) {
      user = 'x-access-token'
    } else if (host.includes('gitlab')) {
      user = 'oauth2'
    } else {
      user = 'git'
    }
  }
  u.username = user
  u.password = token
  return { cloneUrl: u.toString(), usedPat: true }
}

function resolveAllowedModelPath(relPath) {
  if (!relPath || typeof relPath !== 'string') {
    throw new Error('Укажите относительный путь к файлу в репозитории')
  }
  const trimmed = relPath.trim().replace(/^[\\/]+/, '')
  const lower = trimmed.toLowerCase()
  if (!lower.endsWith('.archimate') && !lower.endsWith('.xml')) {
    throw new Error('Разрешены только файлы .archimate и .xml')
  }
  const abs = path.resolve(repoRoot, trimmed)
  const relToRoot = path.relative(repoRoot, abs)
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    throw new Error('Путь выходит за пределы GIT_REPO_ROOT')
  }
  return { abs, rel: relToRoot.split(path.sep).join('/') }
}

const SKIP_DIR_NAMES = new Set(['.git', 'node_modules', 'dist', 'build'])

/** @typedef {{ absPath: string, layout: 'single-file' | 'split-files', modelRootAbs?: string }} ModelEntry */

function isSplitModelManifestContent(content) {
  if (typeof content !== 'string' || !content.trim()) {
    return false
  }
  return (
    content.includes('ArchimateModel') &&
    (content.includes('<archimate:ArchimateModel') || content.includes(':ArchimateModel'))
  )
}

/**
 * Split layout: каталог `model/` с `folder.xml` (корень ArchimateModel).
 *
 * @param {string} rootAbs
 * @returns {Promise<ModelEntry | null>}
 */
async function findSplitModelEntryUnder(rootAbs) {
  const queue = [rootAbs]
  let depth = 0
  const maxDepth = 8

  while (queue.length > 0 && depth <= maxDepth) {
    const levelSize = queue.length
    for (let index = 0; index < levelSize; index += 1) {
      const dir = queue.shift()
      const manifestAbs = path.join(dir, 'model', 'folder.xml')
      if (existsSync(manifestAbs)) {
        try {
          const content = await fs.readFile(manifestAbs, 'utf8')
          if (isSplitModelManifestContent(content)) {
            return {
              absPath: manifestAbs,
              layout: 'split-files',
              modelRootAbs: path.dirname(manifestAbs),
            }
          }
        } catch {
          // try next candidate
        }
      }

      let entries
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (entry.isDirectory() && !SKIP_DIR_NAMES.has(entry.name)) {
          queue.push(path.join(dir, entry.name))
        }
      }
    }
    depth += 1
  }

  return null
}

/** Первый .archimate в обходе в ширину. */
async function findFirstArchimateFileUnder(rootAbs) {
  const queue = [rootAbs]
  while (queue.length > 0) {
    const dir = queue.shift()
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    const subdirs = []
    const archi = []
    for (const e of entries) {
      const name = e.name
      const full = path.join(dir, name)
      if (e.isDirectory()) {
        if (SKIP_DIR_NAMES.has(name)) {
          continue
        }
        subdirs.push(full)
      } else if (e.isFile() && name.toLowerCase().endsWith('.archimate')) {
        archi.push(full)
      }
    }
    archi.sort()
    if (archi.length > 0) {
      return archi[0]
    }
    queue.push(...subdirs)
  }
  return null
}

/**
 * Точка входа модели: .archimate → single-file; model/folder.xml (ArchimateModel) → split-files.
 *
 * @param {string} rootAbs
 * @returns {Promise<ModelEntry | null>}
 */
async function findModelEntryUnder(rootAbs) {
  const archimateAbs = await findFirstArchimateFileUnder(rootAbs)
  if (archimateAbs) {
    return { absPath: archimateAbs, layout: 'single-file' }
  }

  const splitEntry = await findSplitModelEntryUnder(rootAbs)
  if (splitEntry) {
    return splitEntry
  }

  return null
}

/** @deprecated Используйте findModelEntryUnder */
async function findFirstModelFileUnder(rootAbs) {
  const entry = await findModelEntryUnder(rootAbs)
  return entry?.absPath ?? null
}

/**
 * @param {string} modelRootAbs
 * @returns {Promise<Array<{ relativePath: string, content: string }>>}
 */
async function collectSplitModelXmlFiles(modelRootAbs) {
  /** @type {Array<{ relativePath: string, content: string }>} */
  const files = []

  async function walk(dirAbs, relPrefix) {
    let entries
    try {
      entries = await fs.readdir(dirAbs, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const full = path.join(dirAbs, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) {
          continue
        }
        const nextRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
        await walk(full, nextRel)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xml')) {
        const relativePath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
        const content = await fs.readFile(full, 'utf8')
        files.push({ relativePath, content })
      }
    }
  }

  await walk(modelRootAbs, '')
  return files
}

/** Корень git-репо: от файла модели вверх до `.git`, иначе GIT_REPO_ROOT. */
function resolveGitWorkTreeFromOptionalModelPath(relPath) {
  const rootResolved = path.resolve(repoRoot)
  if (!relPath || typeof relPath !== 'string' || !relPath.trim()) {
    return rootResolved
  }
  const trimmed = relPath.trim().replace(/^[\\/]+/, '').replace(/\\/g, '/')
  if (!trimmed || trimmed.includes('..')) {
    return rootResolved
  }
  const absFile = path.resolve(repoRoot, trimmed)
  const relToRoot = path.relative(rootResolved, absFile)
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    return rootResolved
  }
  let dir = path.dirname(absFile)
  for (;;) {
    if (existsSync(path.join(dir, '.git'))) {
      return dir
    }
    if (dir === rootResolved) {
      break
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  return rootResolved
}

/**
 * Каталог git (где лежит .git) для файла модели и путь к файлу относительно этого каталога.
 * Нужен для add/commit/status — нельзя вызывать git из GIT_REPO_ROOT, если репозиторий вложенный (клон в git/).
 */
function resolveModelGitContext(relPathFromClient) {
  const { abs, rel } = resolveAllowedModelPath(relPathFromClient)
  const workTree = resolveGitWorkTreeFromOptionalModelPath(rel)
  const relInWorkTree = path.relative(workTree, abs)
  const normalizedRel = relInWorkTree.split(path.sep).join('/')
  if (normalizedRel.startsWith('..') || path.isAbsolute(normalizedRel)) {
    throw new Error('Файл модели вне git-репозитория (нет .git над каталогом файла)')
  }
  return { workTree, abs, relToRepoRoot: rel, relInWorkTree: normalizedRel }
}

/**
 * Пути для git add / status: split-модель (model/folder.xml) — весь каталог модели,
 * single-file — только указанный .archimate / .xml.
 *
 * @param {string} relInWorkTree
 * @returns {string[]}
 */
function resolveGitStagePaths(relInWorkTree) {
  const normalized = String(relInWorkTree ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
  if (!normalized) {
    return []
  }
  const base = path.posix.basename(normalized)
  if (base === 'folder.xml') {
    const dir = path.posix.dirname(normalized)
    if (dir && dir !== '.') {
      return [dir]
    }
  }
  return [normalized]
}

/** Work tree: из пути к модели или из настроенной папки (по умолчанию git), если там есть .git. */
function resolveConfiguredWorkTree(modelPath, workFolderInput) {
  const mp = String(modelPath ?? '').trim()
  if (mp) {
    return resolveGitWorkTreeFromOptionalModelPath(mp)
  }
  let rel = 'git'
  if (workFolderInput && String(workFolderInput).trim()) {
    try {
      rel = resolveCloneTargetDir(String(workFolderInput).trim()).rel
    } catch {
      rel = 'git'
    }
  }
  const abs = path.resolve(repoRoot, rel.split('/').join(path.sep))
  if (existsSync(path.join(abs, '.git'))) {
    return abs
  }
  return path.resolve(repoRoot)
}

function safeRemoteName(name) {
  const s = String(name ?? '').trim()
  if (!s || !/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(s)) {
    throw new Error('Некорректное имя remote (например origin)')
  }
  return s
}

function safeBranchRef(ref) {
  const s = String(ref ?? '').trim()
  if (!s) {
    return ''
  }
  if (s.length > 512 || !/^[a-zA-Z0-9._\-\/:^]+$/.test(s)) {
    throw new Error('Некорректное имя ветки или refspec')
  }
  return s
}

/** Имя ветки, тега или ref для checkout/switch (без произвольных shell-символов). */
function safeCheckoutTarget(ref) {
  const s = String(ref ?? '').trim()
  if (!s) {
    throw new Error('Укажите ветку или ref')
  }
  if (s.length > 256) {
    throw new Error('Строка ref слишком длинная')
  }
  if (/\.\.|^\s|\s$|[\x00-\x1f\x7f;|&`$<>\\"]/.test(s)) {
    throw new Error('Некорректное имя ветки или ref')
  }
  return s
}

function runGitInWorkTree(workTree, args) {
  const r = spawnSync('git', args, {
    cwd: workTree,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  return {
    code: r.status ?? 1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  }
}

const app = express()

// Wails serves the UI from a different origin; Electron used same-origin via SERVE_STATIC.
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  next()
})
app.options('*', (_req, res) => {
  res.sendStatus(204)
})

app.use(express.json({ limit: '128mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, repoRoot })
})

app.post('/api/git/repo-state', async (req, res) => {
  try {
    const workFolderIn = String(req.body?.workFolder ?? 'git').trim() || 'git'
    const { abs, rel } = resolveCloneTargetDir(workFolderIn)
    const hasDotGit = existsSync(path.join(abs, '.git'))
    let remoteUrl = ''
    let currentBranch = ''
    let modelPath = null
    let modelLayout = null
    if (hasDotGit) {
      const gr = runGitInWorkTree(abs, ['remote', 'get-url', 'origin'])
      if (gr.code === 0) {
        remoteUrl = gr.stdout.trim()
      }
      const br = runGitInWorkTree(abs, ['rev-parse', '--abbrev-ref', 'HEAD'])
      if (br.code === 0) {
        currentBranch = br.stdout.trim()
      }
      const modelEntry = await findModelEntryUnder(abs)
      if (modelEntry) {
        modelPath = path.relative(repoRoot, modelEntry.absPath).split(path.sep).join('/')
        modelLayout = modelEntry.layout
      }
    }
    res.json({
      ok: true,
      workFolder: rel,
      hasDotGit,
      remoteUrl: remoteUrl || undefined,
      currentBranch: currentBranch || undefined,
      modelPath: modelPath || undefined,
      modelLayout: modelLayout || undefined,
    })
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

app.post('/api/git/settings', (req, res) => {
  try {
    const workFolderIn = String(req.body?.workFolder ?? 'git').trim() || 'git'
    const { abs, rel } = resolveCloneTargetDir(workFolderIn)
    const remoteName = safeRemoteName(req.body?.remote ?? 'origin')
    let remoteUrlRaw = String(req.body?.remoteUrl ?? '').trim()
    const pat = String(req.body?.pat ?? '').trim()
    const hasGit = existsSync(path.join(abs, '.git'))

    if (!hasGit && (remoteUrlRaw || pat)) {
      res.status(400).json({
        ok: false,
        error: `В каталоге «${rel}» нет репозитория (.git). Сначала выполните git clone в эту папку.`,
      })
      return
    }

    if (!hasGit) {
      res.json({ ok: true, workFolder: rel, hasDotGit: false })
      return
    }

    if (hasGit && !remoteUrlRaw && pat) {
      const cur = runGitInWorkTree(abs, ['remote', 'get-url', remoteName])
      if (cur.code === 0) {
        remoteUrlRaw = cur.stdout.trim()
      }
    }

    if (pat && !remoteUrlRaw) {
      res.status(400).json({
        ok: false,
        error: 'Укажите URL репозитория или настройте remote в репозитории для проверки PAT.',
      })
      return
    }

    if (remoteUrlRaw) {
      const clean = httpsUrlWithoutCredentials(remoteUrlRaw)
      try {
        new URL(clean)
      } catch {
        res.status(400).json({ ok: false, error: 'Некорректный URL репозитория' })
        return
      }
      const getO = runGitInWorkTree(abs, ['remote', 'get-url', remoteName])
      const addOrSet =
        getO.code === 0
          ? ['remote', 'set-url', remoteName, clean]
          : ['remote', 'add', remoteName, clean]
      const sr = runGitInWorkTree(abs, addOrSet)
      if (sr.code !== 0) {
        res.status(400).json({
          ok: false,
          error: sr.stderr.trim() || 'Не удалось задать URL remote',
          detail: sr,
        })
        return
      }
    }

    let patVerified = false
    if (pat && remoteUrlRaw) {
      let applied
      try {
        applied = applyHttpsPat(remoteUrlRaw, pat, req.body?.patUsername)
      } catch (e) {
        res.status(400).json({ ok: false, error: String(e.message || e) })
        return
      }
      if (!applied.usedPat) {
        res.status(400).json({ ok: false, error: 'PAT для проверки доступен только с HTTPS URL' })
        return
      }
      const clean = httpsUrlWithoutCredentials(remoteUrlRaw)
      const setP = runGitInWorkTree(abs, ['remote', 'set-url', remoteName, applied.cloneUrl])
      if (setP.code !== 0) {
        res.status(400).json({
          ok: false,
          error: setP.stderr.trim() || 'Не удалось применить PAT для проверки',
        })
        return
      }
      const verify = runGitInWorkTree(abs, ['ls-remote', '-q', remoteName, 'HEAD'])
      const restore = runGitInWorkTree(abs, ['remote', 'set-url', remoteName, clean])
      if (verify.code !== 0) {
        res.status(400).json({
          ok: false,
          error: verify.stderr.trim() || 'Не удалось получить доступ по PAT (ls-remote)',
          verify,
        })
        return
      }
      if (restore.code !== 0) {
        res.status(400).json({
          ok: false,
          error: restore.stderr.trim() || 'Проверка прошла, но не удалось убрать PAT из URL remote',
        })
        return
      }
      patVerified = true
    }

    res.json({ ok: true, workFolder: rel, hasDotGit: true, patVerified })
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

app.post('/api/git/status', (req, res) => {
  try {
    const filePath = req.body?.path
    if (filePath) {
      const { workTree, relInWorkTree } = resolveModelGitContext(filePath)
      const stagePaths = resolveGitStagePaths(relInWorkTree)
      const args = ['status', '--porcelain=v1', '-u', '--', ...stagePaths]
      const result = runGitInWorkTree(workTree, args)
      res.json({ ok: result.code === 0, workTree, ...result })
      return
    }
    const workTree = resolveConfiguredWorkTree('', req.body?.workFolder)
    const result = runGitInWorkTree(workTree, ['status', '--porcelain=v1', '-u'])
    res.json({ ok: result.code === 0, ...result })
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

/**
 * @param {string} workTree
 * @param {string} ref
 * @param {string} modelRootRel
 * @returns {string[]}
 */
function listSplitModelXmlPathsAtRef(workTree, ref, modelRootRel) {
  const root = String(modelRootRel ?? '')
    .trim()
    .replace(/^[\\/]+/, '')
    .replace(/\\/g, '/')
    .replace(/\/+$/u, '')
  if (!root) {
    throw new Error('Не указан каталог модели')
  }
  const spec = `${ref}:${root}`
  const result = runGitInWorkTree(workTree, ['ls-tree', '-r', '--name-only', spec])
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || 'git ls-tree').trim())
  }
  return result.stdout
    .split('\n')
    .map((line) => line.trim().replace(/\\/g, '/'))
    .filter((line) => line.toLowerCase().endsWith('.xml'))
}

/**
 * @param {string} workTree
 * @param {string} ref
 * @param {string} repoRelativePath
 * @returns {string}
 */
function readRepoFileAtRef(workTree, ref, repoRelativePath) {
  const rel = String(repoRelativePath ?? '')
    .trim()
    .replace(/^[\\/]+/, '')
    .replace(/\\/g, '/')
  if (!rel || rel.includes('..')) {
    throw new Error('Некорректный путь к файлу')
  }
  const result = runGitInWorkTree(workTree, ['show', `${ref}:${rel}`])
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || 'git show').trim())
  }
  return result.stdout
}

app.post('/api/git/show-file', (req, res) => {
  try {
    const filePath = req.body?.path
    const ref = safeBranchRef(req.body?.ref)
    if (!filePath) {
      res.status(400).json({ ok: false, error: 'Укажите path к файлу модели в репозитории' })
      return
    }
    if (!ref) {
      res.status(400).json({ ok: false, error: 'Укажите ref (ветку) для сравнения' })
      return
    }
    const { workTree, relInWorkTree } = resolveModelGitContext(filePath)
    const result = runGitInWorkTree(workTree, ['show', `${ref}:${relInWorkTree}`])
    if (result.code !== 0) {
      res.status(400).json({
        ok: false,
        error: (result.stderr || result.stdout || 'git show').trim(),
        workTree,
        ref,
        path: relInWorkTree,
      })
      return
    }
    res.json({
      ok: true,
      content: result.stdout,
      workTree,
      ref,
      path: relInWorkTree,
    })
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

app.post('/api/git/add', (req, res) => {
  try {
    const { workTree, relInWorkTree } = resolveModelGitContext(req.body?.path)
    const stagePaths = resolveGitStagePaths(relInWorkTree)
    const result = runGitInWorkTree(workTree, ['add', '--', ...stagePaths])
    res.json({ ok: result.code === 0, workTree, ...result })
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

app.post('/api/git/clone', async (req, res) => {
  try {
    const url = String(req.body?.url ?? '').trim()
    if (!url) {
      res.status(400).json({ ok: false, error: 'Укажите URL репозитория (https, git@, ssh://…)' })
      return
    }
    if (url.length > 2048) {
      res.status(400).json({ ok: false, error: 'URL слишком длинный' })
      return
    }

    let dirName = String(req.body?.directory ?? '').trim()
    if (!dirName) {
      const wf = String(req.body?.workFolder ?? '').trim()
      dirName = wf || 'git'
    }
    const { abs, rel } = resolveCloneTargetDir(dirName)

    let exists = false
    try {
      await fs.access(abs)
      exists = true
    } catch {
      exists = false
    }
    if (exists) {
      const st = await fs.stat(abs)
      if (!st.isDirectory()) {
        res.status(400).json({ ok: false, error: `Путь уже существует и это не каталог: ${rel}` })
        return
      }
      const entries = await fs.readdir(abs)
      if (entries.length > 0) {
        res.status(400).json({
          ok: false,
          error: `Каталог не пуст: ${rel}. Укажите другое имя или удалите содержимое.`,
        })
        return
      }
    }

    let cloneUrl = url
    let usedPat = false
    try {
      const applied = applyHttpsPat(url, req.body?.pat, req.body?.patUsername)
      cloneUrl = applied.cloneUrl
      usedPat = applied.usedPat
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e.message || e) })
      return
    }

    const depth = req.body?.depth === true || req.body?.depth === 1
    const args = ['clone']
    if (depth) {
      args.push('--depth', '1')
    }
    args.push(cloneUrl, rel)

    const result = spawnSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
    const exitCode = result.status ?? 1

    let originSanitized = false
    if (exitCode === 0 && usedPat) {
      const clean = httpsUrlWithoutCredentials(url)
      const workTree = path.join(repoRoot, rel)
      const setR = spawnSync('git', ['-C', workTree, 'remote', 'set-url', 'origin', clean], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      })
      originSanitized = (setR.status ?? 1) === 0
    }

    let modelPath = null
    let modelLayout = null
    if (exitCode === 0) {
      const clonedRoot = path.join(repoRoot, rel)
      const modelEntry = await findModelEntryUnder(clonedRoot)
      if (modelEntry) {
        modelPath = path.relative(repoRoot, modelEntry.absPath).split(path.sep).join('/')
        modelLayout = modelEntry.layout
      }
    }

    res.json({
      ok: exitCode === 0,
      path: rel,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      code: exitCode,
      originSanitized,
      modelPath,
      modelLayout,
    })
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

app.post('/api/git/commit', (req, res) => {
  try {
    const message = String(req.body?.message ?? '').trim()
    if (!message) {
      res.status(400).json({ ok: false, error: 'Нужно сообщение коммита' })
      return
    }
    const { workTree, relInWorkTree } = resolveModelGitContext(req.body?.path)
    const stagePaths = resolveGitStagePaths(relInWorkTree)
    const addResult = runGitInWorkTree(workTree, ['add', '--', ...stagePaths])
    if (addResult.code !== 0) {
      res.status(400).json({
        ok: false,
        step: 'add',
        workTree,
        stagePaths,
        error: (addResult.stderr || addResult.stdout || 'git add failed').trim(),
        ...addResult,
      })
      return
    }
    const commitResult = runGitInWorkTree(workTree, ['commit', '-m', message])
    if (commitResult.code !== 0) {
      const stderr = (commitResult.stderr || commitResult.stdout || '').trim()
      const hint = /nothing to commit|no changes added/i.test(stderr)
        ? ' Сначала нажмите «Сохранить модель», затем коммит. Для split-модели в коммит попадает весь каталог model/.'
        : ''
      res.status(400).json({
        ok: false,
        step: 'commit',
        workTree,
        stagePaths,
        error: stderr ? `${stderr}${hint}` : `git commit failed${hint}`,
        add: addResult,
        commit: commitResult,
      })
      return
    }
    res.json({
      ok: true,
      workTree,
      stagePaths,
      add: addResult,
      commit: commitResult,
    })
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

app.post('/api/git/push', (req, res) => {
  try {
    const workTree = resolveConfiguredWorkTree(req.body?.path, req.body?.workFolder)
    const remote = safeRemoteName(req.body?.remote ?? 'origin')
    const branch = safeBranchRef(req.body?.branch)
    const setUpstream = req.body?.setUpstream === true || req.body?.setUpstream === 1
    const pat = String(req.body?.pat ?? '').trim()

    const pushArgs = ['push']
    if (setUpstream) {
      pushArgs.push('-u')
    }
    pushArgs.push(remote)
    if (branch) {
      pushArgs.push(branch)
    }

    if (!pat) {
      const pushResult = runGitInWorkTree(workTree, pushArgs)
      res.json({
        ok: pushResult.code === 0,
        workTree,
        push: pushResult,
      })
      return
    }

    const gr = runGitInWorkTree(workTree, ['remote', 'get-url', remote])
    if (gr.code !== 0) {
      res.status(400).json({
        ok: false,
        error: gr.stderr.trim() || gr.stdout.trim() || 'Не удалось прочитать URL remote',
        workTree,
        remoteGetUrl: gr,
      })
      return
    }

    const remoteUrl = gr.stdout.trim()
    let applied
    try {
      applied = applyHttpsPat(remoteUrl, pat, req.body?.patUsername)
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e.message || e), workTree })
      return
    }
    if (!applied.usedPat) {
      res.status(400).json({ ok: false, error: 'Укажите PAT для HTTPS push', workTree })
      return
    }

    const restoreUrl = httpsUrlWithoutCredentials(remoteUrl)
    const setPat = runGitInWorkTree(workTree, ['remote', 'set-url', remote, applied.cloneUrl])
    if (setPat.code !== 0) {
      res.status(400).json({
        ok: false,
        error: setPat.stderr.trim() || 'Не удалось временно задать URL с PAT',
        workTree,
        remoteSetUrl: setPat,
      })
      return
    }

    const pushResult = runGitInWorkTree(workTree, pushArgs)
    const restore = runGitInWorkTree(workTree, ['remote', 'set-url', remote, restoreUrl])

    res.json({
      ok: pushResult.code === 0,
      workTree,
      push: pushResult,
      originSanitized: restore.code === 0,
      restoreRemote: restore,
    })
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

app.post('/api/git/pull', (req, res) => {
  try {
    const workTree = resolveConfiguredWorkTree(req.body?.path, req.body?.workFolder)
    const remote = safeRemoteName(req.body?.remote ?? 'origin')
    const branch = safeBranchRef(String(req.body?.branch ?? 'main').trim() || 'main')
    const pat = String(req.body?.pat ?? '').trim()
    const pullArgs = ['pull', remote, branch]

    if (!pat) {
      const pullResult = runGitInWorkTree(workTree, pullArgs)
      res.json({
        ok: pullResult.code === 0,
        workTree,
        pull: pullResult,
      })
      return
    }

    const gr = runGitInWorkTree(workTree, ['remote', 'get-url', remote])
    if (gr.code !== 0) {
      res.status(400).json({
        ok: false,
        error: gr.stderr.trim() || gr.stdout.trim() || 'Не удалось прочитать URL remote',
        workTree,
        remoteGetUrl: gr,
      })
      return
    }

    const remoteUrl = gr.stdout.trim()
    let applied
    try {
      applied = applyHttpsPat(remoteUrl, pat, req.body?.patUsername)
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e.message || e), workTree })
      return
    }
    if (!applied.usedPat) {
      res.status(400).json({ ok: false, error: 'Укажите PAT для HTTPS pull', workTree })
      return
    }

    const restoreUrl = httpsUrlWithoutCredentials(remoteUrl)
    const setPat = runGitInWorkTree(workTree, ['remote', 'set-url', remote, applied.cloneUrl])
    if (setPat.code !== 0) {
      res.status(400).json({
        ok: false,
        error: setPat.stderr.trim() || 'Не удалось временно задать URL с PAT',
        workTree,
        remoteSetUrl: setPat,
      })
      return
    }

    const pullResult = runGitInWorkTree(workTree, pullArgs)
    const restore = runGitInWorkTree(workTree, ['remote', 'set-url', remote, restoreUrl])

    res.json({
      ok: pullResult.code === 0,
      workTree,
      pull: pullResult,
      originSanitized: restore.code === 0,
      restoreRemote: restore,
    })
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

app.post('/api/git/branches', (req, res) => {
  try {
    const workTree = resolveConfiguredWorkTree(req.body?.path, req.body?.workFolder)
    if (!existsSync(path.join(workTree, '.git'))) {
      res.json({ ok: true, branches: [], workTree })
      return
    }
    const doFetch = req.body?.fetch === true || req.body?.fetch === 1
    const remote = safeRemoteName(req.body?.remote ?? 'origin')
    const pat = String(req.body?.pat ?? '').trim()
    if (doFetch) {
      if (!pat) {
        runGitInWorkTree(workTree, ['fetch', '--prune', remote])
      } else {
        const gr = runGitInWorkTree(workTree, ['remote', 'get-url', remote])
        if (gr.code === 0) {
          const remoteUrl = gr.stdout.trim()
          try {
            const applied = applyHttpsPat(remoteUrl, pat, req.body?.patUsername)
            if (applied.usedPat) {
              const restoreUrl = httpsUrlWithoutCredentials(remoteUrl)
              const setPat = runGitInWorkTree(workTree, ['remote', 'set-url', remote, applied.cloneUrl])
              if (setPat.code === 0) {
                runGitInWorkTree(workTree, ['fetch', '--prune', remote])
                runGitInWorkTree(workTree, ['remote', 'set-url', remote, restoreUrl])
              }
            }
          } catch {
            // если PAT/URL некорректны — всё равно отдаём список по локальным refs
          }
        }
      }
    }
    const r = runGitInWorkTree(workTree, [
      'for-each-ref',
      '--sort=refname',
      '--format=%(HEAD)\t%(refname:short)\t%(refname)',
      'refs/heads',
      'refs/remotes',
    ])
    if (r.code !== 0) {
      res.status(400).json({
        ok: false,
        error: r.stderr.trim() || 'Не удалось получить список веток',
        workTree,
      })
      return
    }
    const branches = []
    const seen = new Set()
    for (const line of r.stdout.split('\n')) {
      const raw = line.replace(/\r$/, '')
      if (!raw.trim()) {
        continue
      }
      const parts = raw.split('\t')
      if (parts.length < 3) {
        continue
      }
      const [headMark, name, fullRef] = parts
      const shortName = name.trim()
      const full = fullRef.trim()
      if (!shortName || seen.has(shortName) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(shortName)) {
        continue
      }
      seen.add(shortName)
      const local = full.startsWith('refs/heads/')
      branches.push({
        name: shortName,
        current: headMark.trim() === '*',
        local,
      })
    }
    res.json({ ok: true, branches, workTree })
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

app.post('/api/git/checkout', (req, res) => {
  try {
    const workTree = resolveConfiguredWorkTree(req.body?.path, req.body?.workFolder)
    const branch = safeCheckoutTarget(req.body?.branch)
    const createBranch = req.body?.createBranch === true || req.body?.createBranch === 1
    const startPointRaw = req.body?.startPoint
    const startPoint =
      startPointRaw !== undefined && startPointRaw !== null && String(startPointRaw).trim()
        ? safeCheckoutTarget(String(startPointRaw))
        : ''

    let args
    let checkoutMode = 'checkout'
    if (createBranch) {
      args = ['checkout', '-b', branch]
      if (startPoint) {
        args.push(startPoint)
      }
    } else {
      // origin/HEAD → развернуть в origin/main (и т.п.), иначе checkout даст detached HEAD.
      let branchForRemote = branch
      if (/\/HEAD$/u.test(branchForRemote)) {
        const symHead = runGitInWorkTree(workTree, ['symbolic-ref', '-q', `refs/remotes/${branchForRemote}`])
        if (symHead.code === 0) {
          const short = symHead.stdout.trim().replace(/^refs\/remotes\//u, '')
          if (short && !/\/HEAD$/u.test(short)) {
            branchForRemote = short
          }
        }
      }
      // checkout origin/… оставляет detached HEAD — push тогда падает. Если это refs/remotes/…,
      // переключаемся на локальную ветку с тем же суффиксом (создаём/обновляем от remote).
      const remoteRefOk = runGitInWorkTree(workTree, [
        'rev-parse',
        '--verify',
        '--quiet',
        `refs/remotes/${branchForRemote}`,
      ])
      if (remoteRefOk.code === 0) {
        const slash = branchForRemote.indexOf('/')
        const localBranch = slash >= 0 ? branchForRemote.slice(slash + 1) : branchForRemote
        const headish = localBranch.toLowerCase() === 'head' || localBranch === ''
        if (headish) {
          args = ['checkout', branchForRemote]
        } else {
          args = ['checkout', '-B', localBranch, branchForRemote]
          checkoutMode = 'checkout-attached-from-remote'
        }
      } else {
        args = ['checkout', branch]
      }
    }

    const result = runGitInWorkTree(workTree, args)
    let currentBranch = ''
    if (result.code === 0) {
      const sym = runGitInWorkTree(workTree, ['symbolic-ref', '--short', '-q', 'HEAD'])
      if (sym.code === 0) {
        currentBranch = sym.stdout.trim()
      }
    }

    res.json({
      ok: result.code === 0,
      workTree,
      checkout: result,
      checkoutMode,
      currentBranch: currentBranch || undefined,
    })
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

/** Удаляет каталог клона внутри GIT_REPO_ROOT целиком; только если в нём есть .git (защита от ошибочного пути). */
app.post('/api/git/delete-repository', async (req, res) => {
  try {
    const workFolderIn = String(req.body?.workFolder ?? 'git').trim() || 'git'
    const { abs, rel } = resolveCloneTargetDir(workFolderIn)
    const rootResolved = path.resolve(repoRoot)
    const relFromRoot = path.relative(rootResolved, abs)
    if (!relFromRoot || relFromRoot === '.' || relFromRoot.startsWith('..')) {
      res.status(400).json({ ok: false, error: 'Нельзя удалить корень GIT_REPO_ROOT' })
      return
    }
    if (!existsSync(abs)) {
      res.json({ ok: true, deleted: false, rel, message: `Каталог «${rel}» отсутствует.` })
      return
    }
    const st = await fs.stat(abs)
    if (!st.isDirectory()) {
      res.status(400).json({ ok: false, error: 'Путь не является каталогом' })
      return
    }
    if (!existsSync(path.join(abs, '.git'))) {
      res.status(400).json({
        ok: false,
        error: `В каталоге «${rel}» нет .git — удаление отменено.`,
      })
      return
    }
    await fs.rm(abs, { recursive: true, force: true })
    res.json({ ok: true, deleted: true, rel })
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

app.post('/api/model/read', async (req, res) => {
  try {
    const { abs, rel } = resolveAllowedModelPath(req.body?.path)
    const content = await fs.readFile(abs, 'utf8')
    res.json({ ok: true, path: rel, content, layout: 'single-file' })
  } catch (e) {
    if (e?.code === 'ENOENT') {
      res.status(404).json({ ok: false, error: 'Файл не найден' })
      return
    }
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

function resolveSplitModelRootFromManifestPath(manifestRel) {
  const { abs } = resolveAllowedModelPath(manifestRel)
  const modelRootAbs = path.dirname(abs)
  const modelRoot = path.relative(repoRoot, modelRootAbs).split(path.sep).join('/')
  if (modelRoot.startsWith('..') || path.isAbsolute(modelRoot)) {
    throw new Error('Путь выходит за пределы GIT_REPO_ROOT')
  }
  return { modelRootAbs, modelRoot, manifestAbs: abs, manifestRel }
}

function resolveSplitModelFilePath(modelRoot, relativePath) {
  const root = String(modelRoot ?? '')
    .trim()
    .replace(/^[\\/]+/, '')
    .replace(/\\/g, '/')
  const rel = String(relativePath ?? '')
    .trim()
    .replace(/^[\\/]+/, '')
    .replace(/\\/g, '/')
  if (!root || !rel || rel.includes('..') || root.includes('..')) {
    throw new Error('Некорректный путь к файлу модели')
  }
  const abs = path.resolve(repoRoot, root, rel)
  const modelRootAbs = path.resolve(repoRoot, root)
  const relToModel = path.relative(modelRootAbs, abs)
  if (relToModel.startsWith('..') || path.isAbsolute(relToModel)) {
    throw new Error('Путь выходит за пределы каталога модели')
  }
  return { abs, rel: relToModel.split(path.sep).join('/') }
}

app.post('/api/git/read-split-index', async (req, res) => {
  try {
    const pathInput = String(req.body?.path ?? '').trim()
    const ref = safeBranchRef(req.body?.ref)
    if (!pathInput) {
      res.status(400).json({ ok: false, error: 'Укажите путь к model/folder.xml' })
      return
    }
    if (!ref) {
      res.status(400).json({ ok: false, error: 'Укажите ref (ветку) для сравнения' })
      return
    }

    const { workTree, relInWorkTree } = resolveModelGitContext(pathInput)
    const manifest = readRepoFileAtRef(workTree, ref, relInWorkTree)
    if (!isSplitModelManifestContent(manifest)) {
      res.status(400).json({
        ok: false,
        error: 'Указанный файл не является корнем split-модели (ArchimateModel).',
      })
      return
    }

    const { rel: manifestRel } = resolveAllowedModelPath(pathInput)
    const { modelRoot } = resolveSplitModelRootFromManifestPath(manifestRel)
    const modelRootInWorkTree = path.posix
      .dirname(relInWorkTree.replace(/\\/g, '/'))
      .replace(/\\/g, '/')
    const relativePaths = listSplitModelXmlPathsAtRef(workTree, ref, modelRootInWorkTree)
    const { buildSplitModelIndexFromRelativePaths } = await import('./split-index-builder.mjs')
    const { serializeParsedModel } = await import('./model-parser.mjs')

    const indexModel = await buildSplitModelIndexFromRelativePaths(relativePaths, (relativePath) => {
      const gitPath = `${modelRootInWorkTree}/${relativePath}`.replace(/\\/g, '/')
      return Promise.resolve(readRepoFileAtRef(workTree, ref, gitPath))
    })

    const parsedModel = serializeParsedModel({
      ...indexModel,
      modelRoot,
      manifestPath: manifestRel,
      diagramIndexByElementRef: new Map(
        Object.entries(indexModel.indexes.elementRefToDiagramIds),
      ),
      diagramIndexByRelationshipRef: new Map(
        Object.entries(indexModel.indexes.relationshipRefToDiagramIds),
      ),
      elementById: new Map(indexModel.elements.map((item) => [item.id, item])),
      relationshipById: new Map(indexModel.relationships.map((item) => [item.id, item])),
    })

    res.json({
      ok: true,
      layout: 'split-files',
      ref,
      path: manifestRel,
      manifestPath: manifestRel,
      modelRoot,
      parsedModel,
    })
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

app.post('/api/git/read-split-compare-bundle', async (req, res) => {
  try {
    const pathInput = String(req.body?.path ?? '').trim()
    const ref = safeBranchRef(req.body?.ref)
    const diagramSourceFile = String(req.body?.diagramSourceFile ?? '')
      .trim()
      .replace(/^[\\/]+/, '')
      .replace(/\\/g, '/')
    if (!pathInput) {
      res.status(400).json({ ok: false, error: 'Укажите путь к model/folder.xml' })
      return
    }
    if (!ref) {
      res.status(400).json({ ok: false, error: 'Укажите ref (ветку) для сравнения' })
      return
    }
    if (!diagramSourceFile) {
      res.status(400).json({ ok: false, error: 'Укажите diagramSourceFile' })
      return
    }

    const { workTree, relInWorkTree } = resolveModelGitContext(pathInput)
    const manifest = readRepoFileAtRef(workTree, ref, relInWorkTree)
    if (!isSplitModelManifestContent(manifest)) {
      res.status(400).json({
        ok: false,
        error: 'Указанный файл не является корнем split-модели (ArchimateModel).',
      })
      return
    }

    const { rel: manifestRel } = resolveAllowedModelPath(pathInput)
    const { modelRoot } = resolveSplitModelRootFromManifestPath(manifestRel)
    const modelRootInWorkTree = path.posix
      .dirname(relInWorkTree.replace(/\\/g, '/'))
      .replace(/\\/g, '/')
    const modelRelativePaths = listSplitModelXmlPathsAtRef(workTree, ref, modelRootInWorkTree)
    const { buildSplitCompareBundle } = await import('./split-compare-bundle.mjs')

    const bundle = await buildSplitCompareBundle({
      modelRootInWorkTree,
      diagramSourceFile,
      modelRelativePaths,
      readGitFile: (gitPath) => readRepoFileAtRef(workTree, ref, gitPath),
    })

    res.json({
      ok: true,
      layout: 'split-files',
      ref,
      path: manifestRel,
      manifestPath: manifestRel,
      modelRoot,
      diagram: bundle.diagram,
      elements: bundle.elements,
      relationships: bundle.relationships,
    })
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

app.post('/api/model/read-split-index', async (req, res) => {
  try {
    const pathInput = String(req.body?.path ?? '').trim()
    if (!pathInput) {
      res.status(400).json({ ok: false, error: 'Укажите путь к model/folder.xml' })
      return
    }

    const { abs, rel } = resolveAllowedModelPath(pathInput)
    const manifest = await fs.readFile(abs, 'utf8')
    if (!isSplitModelManifestContent(manifest)) {
      res.status(400).json({
        ok: false,
        error: 'Указанный файл не является корнем split-модели (ArchimateModel).',
      })
      return
    }

    const { modelRootAbs, modelRoot } = resolveSplitModelRootFromManifestPath(rel)
    const { buildSplitModelIndex } = await import('./split-index-builder.mjs')
    const { serializeParsedModel } = await import('./model-parser.mjs')
    const indexModel = await buildSplitModelIndex(modelRootAbs)
    const parsedModel = serializeParsedModel({
      ...indexModel,
      modelRoot,
      manifestPath: rel,
      diagramIndexByElementRef: new Map(
        Object.entries(indexModel.indexes.elementRefToDiagramIds),
      ),
      diagramIndexByRelationshipRef: new Map(
        Object.entries(indexModel.indexes.relationshipRefToDiagramIds),
      ),
      elementById: new Map(indexModel.elements.map((item) => [item.id, item])),
      relationshipById: new Map(indexModel.relationships.map((item) => [item.id, item])),
    })

    res.json({
      ok: true,
      layout: 'split-files',
      path: rel,
      manifestPath: rel,
      modelRoot,
      elementCount: indexModel.elements.length,
      diagramCount: indexModel.diagrams.length,
      parsedModel,
    })
  } catch (e) {
    if (e?.code === 'ENOENT') {
      res.status(404).json({ ok: false, error: 'Файл или каталог модели не найден' })
      return
    }
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

app.post('/api/model/read-split-file', async (req, res) => {
  try {
    const modelRoot = String(req.body?.modelRoot ?? '').trim()
    const relativePath = String(req.body?.relativePath ?? '').trim()
    if (!modelRoot || !relativePath) {
      res.status(400).json({ ok: false, error: 'Укажите modelRoot и relativePath' })
      return
    }
    const { abs, rel } = resolveSplitModelFilePath(modelRoot, relativePath)
    const content = await fs.readFile(abs, 'utf8')
    res.json({ ok: true, modelRoot, relativePath: rel, content })
  } catch (e) {
    if (e?.code === 'ENOENT') {
      res.status(404).json({ ok: false, error: 'Файл не найден' })
      return
    }
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

app.post('/api/model/read-split', async (req, res) => {
  try {
    const pathInput = String(req.body?.path ?? '').trim()
    if (!pathInput) {
      res.status(400).json({ ok: false, error: 'Укажите путь к model/folder.xml' })
      return
    }

    const { abs, rel } = resolveAllowedModelPath(pathInput)
    const manifest = await fs.readFile(abs, 'utf8')
    if (!isSplitModelManifestContent(manifest)) {
      res.status(400).json({
        ok: false,
        error: 'Указанный файл не является корнем split-модели (ArchimateModel).',
      })
      return
    }

    const modelRootAbs = path.dirname(abs)
    const modelRoot = path.relative(repoRoot, modelRootAbs).split(path.sep).join('/')
    if (modelRoot.startsWith('..') || path.isAbsolute(modelRoot)) {
      res.status(400).json({ ok: false, error: 'Путь выходит за пределы GIT_REPO_ROOT' })
      return
    }

    const files = await collectSplitModelXmlFiles(modelRootAbs)
    const { parseSplitModelOnServer, serializeParsedModel } = await import('./model-parser.mjs')
    const parsedModel = parseSplitModelOnServer({
      modelRoot,
      manifestPath: rel,
      manifest,
      files,
    })
    res.json({
      ok: true,
      layout: 'split-files',
      path: rel,
      manifestPath: rel,
      modelRoot,
      fileCount: files.length,
      parsedModel: serializeParsedModel(parsedModel),
    })
  } catch (e) {
    if (e?.code === 'ENOENT') {
      res.status(404).json({ ok: false, error: 'Файл или каталог модели не найден' })
      return
    }
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

app.post('/api/model/write', async (req, res) => {
  try {
    const { abs, rel } = resolveAllowedModelPath(req.body?.path)
    const content = req.body?.content
    if (typeof content !== 'string') {
      res.status(400).json({ ok: false, error: 'Нужно содержимое XML (строка)' })
      return
    }
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, content, 'utf8')
    res.json({ ok: true, path: rel })
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) })
  }
})

function attachStaticUi() {
  const staticDir = process.env.STATIC_DIR?.trim()
  if (process.env.SERVE_STATIC !== '1' || !staticDir) {
    return
  }
  const resolved = path.resolve(staticDir)
  app.use(express.static(resolved))
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(resolved, 'index.html'))
  })
}

/** @returns {Promise<import('node:http').Server>} */
export function startGitApiServer() {
  attachStaticUi()
  return new Promise((resolve) => {
    const host = process.env.GIT_API_HOST || '127.0.0.1'
    const server = app.listen(PORT, host, () => {
      // eslint-disable-next-line no-console
      console.log(`Git API http://${host}:${PORT}`)
      // eslint-disable-next-line no-console
      console.log(`GIT_REPO_ROOT=${repoRoot}`)
      resolve(server)
    })
  })
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isDirectRun) {
  startGitApiServer()
}
