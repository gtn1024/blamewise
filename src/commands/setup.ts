import { access, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { getGitCwd } from '../git/run'

const ENV_VAR_RE = /^([A-Z_][A-Z0-9_]*)=/
const SERVICES_KEY_RE = /^\s*services\s*:\s*$/
const TOP_LEVEL_KEY_RE = /^[a-z]/i
const SERVICE_NAME_RE = /^([\w.-]+)\s*:/

export interface SetupOptions {
  output?: string
  json?: boolean
}

export interface SetupResult {
  projectName: string
  prerequisites: {
    nodeVersion: string | null
    services: string[]
  }
  installation: {
    packageManager: string
    envConfigFile: string | null
    requiredEnvVars: string[]
  }
  development: {
    hasDockerCompose: boolean
    migrationScript: string | null
    devServerScript: string | null
    testScript: string | null
  }
  commonTasks: {
    lintScript: string | null
    formatScript: string | null
    buildScript: string | null
  }
  contributingContent: string | null
}

// --- Pure parsing functions (exported for testing) ---

/**
 * Extract environment variable names from .env.example content.
 * Matches lines like `KEY=value`, `KEY=`, skips comments and empty lines.
 */
export function parseEnvExample(content: string): string[] {
  const vars: string[] = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue
    const match = ENV_VAR_RE.exec(trimmed)
    if (match && match[1])
      vars.push(match[1])
  }
  return vars
}

/**
 * Extract top-level service names from docker-compose.yml content.
 * Finds keys under `services:` at the top indentation level.
 */
export function parseDockerServices(content: string): string[] {
  const services: string[] = []
  const lines = content.split('\n')
  let inServices = false
  let serviceIndent = 0

  for (const line of lines) {
    const stripped = line.trim()

    // Detect top-level "services:" key
    if (!inServices && SERVICES_KEY_RE.test(stripped)) {
      inServices = true
      continue
    }

    if (inServices) {
      // Skip empty lines and comments
      if (!stripped || stripped.startsWith('#'))
        continue

      // A non-indented top-level key ends the services block
      if (TOP_LEVEL_KEY_RE.test(stripped) && !line.startsWith(' ') && !line.startsWith('\t')) {
        break
      }

      const currentIndent = line.startsWith(' ') || line.startsWith('\t')
        ? line.length - line.trimStart().length
        : 0

      // Detect service indent level on first indented non-comment line
      if (serviceIndent === 0 && currentIndent > 0) {
        serviceIndent = currentIndent
      }

      // Only match keys at the service indent level (not deeper nested keys)
      if (serviceIndent > 0 && currentIndent === serviceIndent) {
        const match = SERVICE_NAME_RE.exec(stripped)
        if (match && match[1])
          services.push(match[1])
      }
    }
  }

  return services
}

/**
 * Extract relevant scripts from a parsed package.json.
 */
export function extractScripts(pkg: { scripts?: Record<string, string> }): {
  lintScript: string | null
  formatScript: string | null
  buildScript: string | null
  devServerScript: string | null
  testScript: string | null
  migrationScript: string | null
} {
  const scripts = pkg.scripts ?? {}

  // Map of script keys to check (in priority order)
  const lintKeys = ['lint', 'lint:check']
  const formatKeys = ['format', 'fmt']
  const buildKeys = ['build', 'compile']
  const devKeys = ['dev', 'start', 'serve']
  const testKeys = ['test', 'test:unit']
  const migrationKeys = ['migrate', 'migration', 'db:migrate', 'db:push', 'prisma:migrate', 'prisma:push']

  function findScript(keys: string[]): string | null {
    for (const key of keys) {
      if (scripts[key])
        return key
    }
    return null
  }

  return {
    lintScript: findScript(lintKeys),
    formatScript: findScript(formatKeys),
    buildScript: findScript(buildKeys),
    devServerScript: findScript(devKeys),
    testScript: findScript(testKeys),
    migrationScript: findScript(migrationKeys),
  }
}

// --- Async file-system helpers ---

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  }
  catch {
    return false
  }
}

async function readTextFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  }
  catch {
    return null
  }
}

async function detectPackageManager(repoRoot: string): Promise<string> {
  const lockFiles: [string, string][] = [
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
  ]

  for (const [file, pm] of lockFiles) {
    if (await fileExists(join(repoRoot, file)))
      return pm
  }

  return 'npm'
}

async function detectNodeVersion(repoRoot: string): Promise<string | null> {
  // Check .nvmrc
  const nvmrc = await readTextFile(join(repoRoot, '.nvmrc'))
  if (nvmrc) {
    const version = nvmrc.trim()
    if (version && !version.startsWith('#'))
      return version
  }

  // Check .node-version
  const nodeVersion = await readTextFile(join(repoRoot, '.node-version'))
  if (nodeVersion) {
    const version = nodeVersion.trim()
    if (version && !version.startsWith('#'))
      return version
  }

  // Check package.json engines.node
  const pkgContent = await readTextFile(join(repoRoot, 'package.json'))
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent)
      return pkg.engines?.node ?? null
    }
    catch {
      // Ignore parse errors
    }
  }

  return null
}

async function extractEnvVars(repoRoot: string): Promise<{ configFile: string | null, vars: string[] }> {
  const candidates = ['.env.example', '.env.sample', '.env.template']

  for (const file of candidates) {
    const content = await readTextFile(join(repoRoot, file))
    if (content) {
      const vars = parseEnvExample(content)
      return { configFile: file, vars }
    }
  }

  return { configFile: null, vars: [] }
}

async function detectDockerServicesFromFile(repoRoot: string): Promise<{ hasCompose: boolean, services: string[] }> {
  const candidates = ['docker-compose.yml', 'docker-compose.yaml']

  for (const file of candidates) {
    const content = await readTextFile(join(repoRoot, file))
    if (content) {
      return { hasCompose: true, services: parseDockerServices(content) }
    }
  }

  return { hasCompose: false, services: [] }
}

async function readContributing(repoRoot: string): Promise<string | null> {
  return await readTextFile(join(repoRoot, 'CONTRIBUTING.md'))
}

// --- Main command ---

export async function setup(dir: string, _options?: SetupOptions): Promise<SetupResult> {
  const projectDir = dir === '.' ? getGitCwd() : join(getGitCwd(), dir)

  // Run all detectors in parallel
  const [nodeVersion, packageManager, envVars, docker, contributingContent] = await Promise.all([
    detectNodeVersion(projectDir),
    detectPackageManager(projectDir),
    extractEnvVars(projectDir),
    detectDockerServicesFromFile(projectDir),
    readContributing(projectDir),
  ])

  // Read package.json for scripts
  const pkgContent = await readTextFile(join(projectDir, 'package.json'))
  let pkg: any = null
  if (pkgContent) {
    try {
      pkg = JSON.parse(pkgContent)
    }
    catch {
      // Ignore parse errors
    }
  }

  const scripts = extractScripts(pkg ?? {})

  // Prefer package.json name, fall back to directory name
  const projectName = pkg?.name ?? basename(projectDir)

  return {
    projectName,
    prerequisites: {
      nodeVersion,
      services: docker.services,
    },
    installation: {
      packageManager,
      envConfigFile: envVars.configFile,
      requiredEnvVars: envVars.vars,
    },
    development: {
      hasDockerCompose: docker.hasCompose,
      migrationScript: scripts.migrationScript,
      devServerScript: scripts.devServerScript,
      testScript: scripts.testScript,
    },
    commonTasks: {
      lintScript: scripts.lintScript,
      formatScript: scripts.formatScript,
      buildScript: scripts.buildScript,
    },
    contributingContent,
  }
}
