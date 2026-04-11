import { access, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { getGitCwd } from '../git/run'

// --- Regex patterns ---

const ENV_VAR_RE = /^([A-Z_][A-Z0-9_]*)=/
const SERVICES_KEY_RE = /^\s*services\s*:\s*$/
const TOP_LEVEL_KEY_RE = /^[a-z]/i
const SERVICE_NAME_RE = /^([\w.-]+)\s*:/
const GO_VERSION_RE = /^go\s+(\d+(?:\.\d+)*)/m
const REQUIRES_PYTHON_RE = /requires-python\s*=\s*["']([^"']+)["']/
const RUST_CHANNEL_RE = /channel\s*=\s*["']([^"']+)["']/
const MAKEFILE_TARGET_RE = /^([A-Z0-9][\w-]*)\s*:(?!=)/i
const JUSTFILE_NAME_RE = /^@?\w[\w-]*/
const SDKMAN_JAVA_RE = /^java\s*=\s*(\S.*)$/m

// --- Types ---

export interface SetupOptions {
  output?: string
  json?: boolean
}

export interface LanguageInfo {
  name: string
  version: string | null
  packageManager: string
  installCommand: string
}

export interface SetupResult {
  projectName: string
  languages: LanguageInfo[]
  prerequisites: {
    services: string[]
  }
  installation: {
    envConfigFile: string | null
    requiredEnvVars: string[]
  }
  development: {
    hasDockerCompose: boolean
    hasDockerfile: boolean
    devCommand: string | null
    testCommand: string | null
    migrationCommand: string | null
  }
  commonTasks: {
    lintCommand: string | null
    formatCommand: string | null
    buildCommand: string | null
  }
  contributingContent: string | null
}

// --- Pure parsing functions (exported for testing) ---

/**
 * Extract environment variable names from .env.example content.
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
 */
export function parseDockerServices(content: string): string[] {
  const services: string[] = []
  const lines = content.split('\n')
  let inServices = false
  let serviceIndent = 0

  for (const line of lines) {
    const stripped = line.trim()

    if (!inServices && SERVICES_KEY_RE.test(stripped)) {
      inServices = true
      continue
    }

    if (inServices) {
      if (!stripped || stripped.startsWith('#'))
        continue

      if (TOP_LEVEL_KEY_RE.test(stripped) && !line.startsWith(' ') && !line.startsWith('\t')) {
        break
      }

      const currentIndent = line.startsWith(' ') || line.startsWith('\t')
        ? line.length - line.trimStart().length
        : 0

      if (serviceIndent === 0 && currentIndent > 0) {
        serviceIndent = currentIndent
      }

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
 * Extract Go version from go.mod content.
 * Matches the `go` directive, e.g. `go 1.22`.
 */
export function parseGoMod(content: string): string | null {
  const match = GO_VERSION_RE.exec(content)
  return match?.[1] ?? null
}

/**
 * Extract Python version requirement from pyproject.toml content.
 * Matches `requires-python = ">=3.12"` style lines.
 */
export function parsePyprojectTomlPythonVersion(content: string): string | null {
  const match = REQUIRES_PYTHON_RE.exec(content)
  return match?.[1] ?? null
}

const POETRY_SECTION_RE = /^\[tool\.poetry\]/m

/**
 * Check if pyproject.toml uses Poetry (has [tool.poetry] section).
 */
export function parsePyprojectHasPoetry(content: string): boolean {
  return POETRY_SECTION_RE.test(content)
}

/**
 * Extract Rust version from rust-toolchain.toml content.
 * Matches `channel = "1.76"` or `channel = "stable"`.
 */
export function parseRustToolchain(content: string): string | null {
  const match = RUST_CHANNEL_RE.exec(content)
  return match?.[1] ?? null
}

/**
 * Extract Makefile targets (non-variable-assignment lines with `:`).
 */
export function parseMakefileTargets(content: string): string[] {
  const targets: string[] = []
  for (const line of content.split('\n')) {
    const match = MAKEFILE_TARGET_RE.exec(line)
    if (match && match[1] && !['PHONY', 'SUFFIXES', 'DEFAULT', 'PRECIOUS', 'INTERMEDIATE', 'SECONDARY', 'SECONDEXPANSION', 'DELETE_ON_ERROR', 'IGNORE', 'LOW_RESOLUTION_TIME', 'SILENT', 'EXPORT', 'UNEXPORT', 'POSIX', 'ONESHELL', 'MAKEFILE', 'include', 'undefine'].includes(match[1])) {
      targets.push(match[1])
    }
  }
  return targets
}

/**
 * Extract justfile recipe names.
 */
export function parseJustfileRecipes(content: string): string[] {
  const recipes: string[] = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#') || trimmed.startsWith('import') || trimmed.startsWith('mod') || trimmed.startsWith('set'))
      continue
    if (!trimmed.endsWith(':'))
      continue
    const beforeColon = trimmed.slice(0, -1).trim()
    const match = JUSTFILE_NAME_RE.exec(beforeColon)
    if (match && match[0])
      recipes.push(match[0])
  }
  return recipes
}

/**
 * Extract Java version from .sdkmanrc content.
 * Matches `java=21.0.2-tem` style lines.
 */
export function parseSdkmanrcJavaVersion(content: string): string | null {
  const match = SDKMAN_JAVA_RE.exec(content)
  return match?.[1]?.trim() ?? null
}

/**
 * Extract relevant scripts from a parsed package.json.
 * Returns script names (not full commands).
 */
export function extractScripts(pkg: { scripts?: Record<string, string> }): {
  lint: string | null
  format: string | null
  build: string | null
  dev: string | null
  test: string | null
  migration: string | null
} {
  const scripts = pkg.scripts ?? {}

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
    lint: findScript(lintKeys),
    format: findScript(formatKeys),
    build: findScript(buildKeys),
    dev: findScript(devKeys),
    test: findScript(testKeys),
    migration: findScript(migrationKeys),
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

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isDirectory()
  }
  catch {
    return false
  }
}

// --- Language detection ---

async function detectJavascript(repoRoot: string): Promise<LanguageInfo | null> {
  const pkgContent = await readTextFile(join(repoRoot, 'package.json'))
  if (!pkgContent)
    return null

  let pkg: any
  try {
    pkg = JSON.parse(pkgContent)
  }
  catch {
    return null
  }

  // Detect version
  let version: string | null = null

  const nvmrc = await readTextFile(join(repoRoot, '.nvmrc'))
  if (nvmrc) {
    const v = nvmrc.trim()
    if (v && !v.startsWith('#'))
      version = v
  }

  if (!version) {
    const nodeVersion = await readTextFile(join(repoRoot, '.node-version'))
    if (nodeVersion) {
      const v = nodeVersion.trim()
      if (v && !v.startsWith('#'))
        version = v
    }
  }

  if (!version) {
    version = pkg.engines?.node ?? null
  }

  // Detect package manager
  const lockFiles: [string, string][] = [
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
  ]

  let pm = 'npm'
  for (const [file, name] of lockFiles) {
    if (await fileExists(join(repoRoot, file))) {
      pm = name
      break
    }
  }

  const installCmd = pm === 'bun' ? 'bun install' : pm === 'pnpm' ? 'pnpm install' : pm === 'yarn' ? 'yarn install' : 'npm install'

  return {
    name: 'javascript',
    version,
    packageManager: pm,
    installCommand: installCmd,
  }
}

async function detectPython(repoRoot: string): Promise<LanguageInfo | null> {
  // Check for Python marker files
  const markers = ['pyproject.toml', 'requirements.txt', 'Pipfile', 'setup.py', 'setup.cfg']
  let hasMarker = false
  for (const m of markers) {
    if (await fileExists(join(repoRoot, m))) {
      hasMarker = true
      break
    }
  }
  if (!hasMarker)
    return null

  // Detect version
  let version: string | null = null

  const pythonVersion = await readTextFile(join(repoRoot, '.python-version'))
  if (pythonVersion) {
    const v = pythonVersion.trim()
    if (v && !v.startsWith('#'))
      version = v
  }

  if (!version) {
    const pyproject = await readTextFile(join(repoRoot, 'pyproject.toml'))
    if (pyproject)
      version = parsePyprojectTomlPythonVersion(pyproject)
  }

  // Detect package manager
  let pm = 'pip'
  let installCmd = 'pip install -r requirements.txt'

  const pyproject = await readTextFile(join(repoRoot, 'pyproject.toml'))
  if (pyproject && parsePyprojectHasPoetry(pyproject)) {
    pm = 'poetry'
    installCmd = 'poetry install'
  }
  else if (await fileExists(join(repoRoot, 'uv.lock'))) {
    pm = 'uv'
    installCmd = 'uv sync'
  }
  else if (await fileExists(join(repoRoot, 'Pipfile.lock'))) {
    pm = 'pipenv'
    installCmd = 'pipenv install'
  }
  else if (await fileExists(join(repoRoot, 'requirements.txt'))) {
    pm = 'pip'
    installCmd = 'pip install -r requirements.txt'
  }
  else if (pyproject) {
    // Has pyproject.toml but no lock file — suggest pip
    pm = 'pip'
    installCmd = 'pip install .'
  }

  return {
    name: 'python',
    version,
    packageManager: pm,
    installCommand: installCmd,
  }
}

async function detectGo(repoRoot: string): Promise<LanguageInfo | null> {
  const goMod = await readTextFile(join(repoRoot, 'go.mod'))
  if (!goMod)
    return null

  const version = parseGoMod(goMod)

  return {
    name: 'go',
    version,
    packageManager: 'go modules',
    installCommand: 'go mod download',
  }
}

async function detectRust(repoRoot: string): Promise<LanguageInfo | null> {
  const cargoToml = await readTextFile(join(repoRoot, 'Cargo.toml'))
  if (!cargoToml)
    return null

  let version: string | null = null
  const toolchain = await readTextFile(join(repoRoot, 'rust-toolchain.toml'))
  if (toolchain)
    version = parseRustToolchain(toolchain)

  // Fallback: rust-toolchain (no extension, plain text)
  if (!version) {
    const toolchainPlain = await readTextFile(join(repoRoot, 'rust-toolchain'))
    if (toolchainPlain) {
      const v = toolchainPlain.trim()
      if (v)
        version = v
    }
  }

  return {
    name: 'rust',
    version,
    packageManager: 'cargo',
    installCommand: 'cargo build',
  }
}

async function detectJava(repoRoot: string): Promise<LanguageInfo | null> {
  const hasMaven = await fileExists(join(repoRoot, 'pom.xml'))
  const hasGradle = await fileExists(join(repoRoot, 'build.gradle')) || await fileExists(join(repoRoot, 'build.gradle.kts'))

  if (!hasMaven && !hasGradle)
    return null

  // Detect version
  let version: string | null = null

  const sdkmanrc = await readTextFile(join(repoRoot, '.sdkmanrc'))
  if (sdkmanrc)
    version = parseSdkmanrcJavaVersion(sdkmanrc)

  if (!version) {
    const javaVersion = await readTextFile(join(repoRoot, '.java-version'))
    if (javaVersion) {
      const v = javaVersion.trim()
      if (v)
        version = v
    }
  }

  const pm = hasMaven ? 'maven' : 'gradle'
  const installCmd = hasMaven ? 'mvn install' : './gradlew build'

  return {
    name: 'java',
    version,
    packageManager: pm,
    installCommand: installCmd,
  }
}

async function detectRuby(repoRoot: string): Promise<LanguageInfo | null> {
  const gemfile = await readTextFile(join(repoRoot, 'Gemfile'))
  if (!gemfile)
    return null

  let version: string | null = null
  const rubyVersion = await readTextFile(join(repoRoot, '.ruby-version'))
  if (rubyVersion) {
    const v = rubyVersion.trim()
    if (v)
      version = v
  }

  return {
    name: 'ruby',
    version,
    packageManager: 'bundler',
    installCommand: 'bundle install',
  }
}

async function detectPhp(repoRoot: string): Promise<LanguageInfo | null> {
  const composerJson = await readTextFile(join(repoRoot, 'composer.json'))
  if (!composerJson)
    return null

  let version: string | null = null
  const phpVersion = await readTextFile(join(repoRoot, '.php-version'))
  if (phpVersion) {
    const v = phpVersion.trim()
    if (v)
      version = v
  }

  return {
    name: 'php',
    version,
    packageManager: 'composer',
    installCommand: 'composer install',
  }
}

async function detectLanguages(repoRoot: string): Promise<LanguageInfo[]> {
  const detectors = [
    detectJavascript,
    detectPython,
    detectGo,
    detectRust,
    detectJava,
    detectRuby,
    detectPhp,
  ]

  const results = await Promise.all(detectors.map(d => d(repoRoot)))
  return results.filter((r): r is LanguageInfo => r !== null)
}

// --- Command detection ---

interface Commands {
  dev: string | null
  test: string | null
  lint: string | null
  format: string | null
  build: string | null
  migration: string | null
}

/**
 * Map target names to command categories.
 */
function mapTaskRunnerTargets(targets: string[]): Partial<Commands> {
  const cmds: Partial<Commands> = {}
  const targetSet = new Set(targets)

  // dev
  for (const name of ['dev', 'start', 'serve', 'run']) {
    if (targetSet.has(name)) {
      cmds.dev = `make ${name}`
      break
    }
  }

  // test
  for (const name of ['test', 'check', 'specs']) {
    if (targetSet.has(name)) {
      cmds.test = `make ${name}`
      break
    }
  }

  // lint
  if (targetSet.has('lint'))
    cmds.lint = 'make lint'

  // format
  for (const name of ['format', 'fmt']) {
    if (targetSet.has(name)) {
      cmds.format = `make ${name}`
      break
    }
  }

  // build
  for (const name of ['build', 'compile']) {
    if (targetSet.has(name)) {
      cmds.build = `make ${name}`
      break
    }
  }

  // migration
  for (const name of ['migrate', 'migration', 'db-migrate', 'db-migration']) {
    if (targetSet.has(name)) {
      cmds.migration = `make ${name}`
      break
    }
  }

  return cmds
}

function mapJustfileRecipes(recipes: string[]): Partial<Commands> {
  const cmds: Partial<Commands> = {}
  const recipeSet = new Set(recipes)

  for (const name of ['dev', 'start', 'serve', 'run']) {
    if (recipeSet.has(name)) {
      cmds.dev = `just ${name}`
      break
    }
  }

  for (const name of ['test', 'check', 'specs']) {
    if (recipeSet.has(name)) {
      cmds.test = `just ${name}`
      break
    }
  }

  if (recipeSet.has('lint'))
    cmds.lint = 'just lint'

  for (const name of ['format', 'fmt']) {
    if (recipeSet.has(name)) {
      cmds.format = `just ${name}`
      break
    }
  }

  for (const name of ['build', 'compile']) {
    if (recipeSet.has(name)) {
      cmds.build = `just ${name}`
      break
    }
  }

  for (const name of ['migrate', 'migration', 'db-migrate', 'db-migration']) {
    if (recipeSet.has(name)) {
      cmds.migration = `just ${name}`
      break
    }
  }

  return cmds
}

/**
 * Detect JS commands from package.json scripts.
 */
function detectJsCommands(_repoRoot: string, pkgContent: string | null, pm: string): Partial<Commands> {
  if (!pkgContent)
    return {}

  let pkg: any
  try {
    pkg = JSON.parse(pkgContent)
  }
  catch {
    return {}
  }

  const scripts = extractScripts(pkg)
  const prefix = pm === 'npm' || pm === 'bun' ? `${pm} run` : `${pm} run`
  const testPrefix = pm === 'npm' ? 'npm' : `${pm} run`

  const cmds: Partial<Commands> = {}

  if (scripts.dev)
    cmds.dev = `${prefix} ${scripts.dev}`
  if (scripts.test)
    cmds.test = `${testPrefix} ${scripts.test}`
  if (scripts.lint)
    cmds.lint = `${prefix} ${scripts.lint}`
  if (scripts.format)
    cmds.format = `${prefix} ${scripts.format}`
  if (scripts.build)
    cmds.build = `${prefix} ${scripts.build}`
  if (scripts.migration)
    cmds.migration = `${prefix} ${scripts.migration}`

  return cmds
}

/**
 * Detect Python convention-based commands from tool config file presence.
 */
async function detectPythonConventionCommands(repoRoot: string, pm: string): Promise<Partial<Commands>> {
  const cmds: Partial<Commands> = {}
  const runPrefix = pm === 'poetry' ? 'poetry run ' : pm === 'pipenv' ? 'pipenv run ' : pm === 'uv' ? 'uv run ' : ''

  // Test: pytest
  const hasPytest = await fileExists(join(repoRoot, 'pytest.ini'))
    || await fileExists(join(repoRoot, 'conftest.py'))
    || await fileExists(join(repoRoot, 'pyproject.toml'))
      .then(async (hasToml) => {
        if (!hasToml)
          return false
        const content = await readTextFile(join(repoRoot, 'pyproject.toml'))
        return content ? content.includes('[tool.pytest') : false
      })
  if (hasPytest)
    cmds.test = `${runPrefix}pytest`

  // Lint: ruff
  const hasRuff = await fileExists(join(repoRoot, 'ruff.toml'))
    || (await readTextFile(join(repoRoot, 'pyproject.toml')))?.includes('[tool.ruff]')
  if (hasRuff)
    cmds.lint = `${runPrefix}ruff check .`

  // Format: ruff format > black
  if (hasRuff) {
    cmds.format = `${runPrefix}ruff format .`
  }
  else {
    const hasBlack = await fileExists(join(repoRoot, 'pyproject.toml'))
      .then(async (hasToml) => {
        if (!hasToml)
          return false
        const content = await readTextFile(join(repoRoot, 'pyproject.toml'))
        return content ? content.includes('[tool.black]') : false
      })
    if (hasBlack)
      cmds.format = `${runPrefix}black .`
  }

  // Build
  if (pm === 'poetry')
    cmds.build = 'poetry build'

  return cmds
}

/**
 * Detect Go convention-based commands.
 */
async function detectGoConventionCommands(repoRoot: string): Promise<Partial<Commands>> {
  const cmds: Partial<Commands> = {}

  cmds.dev = 'go run .'
  cmds.test = 'go test ./...'
  cmds.build = 'go build ./...'

  // Lint: golangci-lint
  const hasGolangciLint = await fileExists(join(repoRoot, '.golangci.yml'))
    || await fileExists(join(repoRoot, '.golangci.yaml'))
    || await fileExists(join(repoRoot, '.golangci.json'))
  if (hasGolangciLint)
    cmds.lint = 'golangci-lint run'

  return cmds
}

/**
 * Detect Rust convention-based commands.
 */
async function detectRustConventionCommands(_repoRoot: string): Promise<Partial<Commands>> {
  return {
    dev: 'cargo run',
    test: 'cargo test',
    build: 'cargo build',
    format: 'cargo fmt',
    lint: 'cargo clippy',
  }
}

/**
 * Detect Java convention-based commands.
 */
async function detectJavaConventionCommands(repoRoot: string, pm: string): Promise<Partial<Commands>> {
  const cmds: Partial<Commands> = {}
  const hasGradlew = await fileExists(join(repoRoot, 'gradlew'))

  if (pm === 'maven') {
    cmds.test = 'mvn test'
    cmds.build = 'mvn package'
  }
  else {
    const gradleCmd = hasGradlew ? './gradlew' : 'gradle'
    cmds.test = `${gradleCmd} test`
    cmds.build = `${gradleCmd} build`
  }

  return cmds
}

/**
 * Detect Ruby convention-based commands.
 */
async function detectRubyConventionCommands(repoRoot: string): Promise<Partial<Commands>> {
  const cmds: Partial<Commands> = {}

  // Test: rspec
  const hasRspec = await fileExists(join(repoRoot, '.rspec'))
    || await dirExists(join(repoRoot, 'spec'))
  if (hasRspec)
    cmds.test = 'bundle exec rspec'

  // Lint: rubocop
  const hasRubocop = await fileExists(join(repoRoot, '.rubocop.yml'))
  if (hasRubocop)
    cmds.lint = 'bundle exec rubocop'

  return cmds
}

/**
 * Detect PHP convention-based commands.
 */
async function detectPhpConventionCommands(repoRoot: string): Promise<Partial<Commands>> {
  const cmds: Partial<Commands> = {}

  // Test: phpunit
  const hasPhpunit = await fileExists(join(repoRoot, 'phpunit.xml'))
    || await fileExists(join(repoRoot, 'phpunit.xml.dist'))
  if (hasPhpunit)
    cmds.test = 'vendor/bin/phpunit'

  return cmds
}

async function detectCommands(repoRoot: string, languages: LanguageInfo[]): Promise<Commands> {
  const result: Commands = {
    dev: null,
    test: null,
    lint: null,
    format: null,
    build: null,
    migration: null,
  }

  // Layer 1: Task runners (highest priority)
  const makefileContent = await readTextFile(join(repoRoot, 'Makefile')) || await readTextFile(join(repoRoot, 'makefile'))
  const justfileContent = await readTextFile(join(repoRoot, 'justfile'))

  if (makefileContent) {
    const targets = parseMakefileTargets(makefileContent)
    const mapped = mapTaskRunnerTargets(targets)
    Object.assign(result, mapped)
  }

  if (justfileContent) {
    const recipes = parseJustfileRecipes(justfileContent)
    const mapped = mapJustfileRecipes(recipes)
    // Only fill gaps (Makefile takes precedence)
    for (const [key, value] of Object.entries(mapped)) {
      if (value && !(result as any)[key])
        (result as any)[key] = value
    }
  }

  // Layer 2: Language-specific scripts
  const langNames = new Set(languages.map(l => l.name))
  const jsLang = languages.find(l => l.name === 'javascript')

  if (jsLang) {
    const pkgContent = await readTextFile(join(repoRoot, 'package.json'))
    const jsCmds = detectJsCommands(repoRoot, pkgContent, jsLang.packageManager)
    for (const [key, value] of Object.entries(jsCmds)) {
      if (value && !(result as any)[key])
        (result as any)[key] = value
    }
  }

  // Layer 3: Convention-based (lowest priority, only fills remaining gaps)
  if (langNames.has('python')) {
    const pyLang = languages.find(l => l.name === 'python')!
    const pyCmds = await detectPythonConventionCommands(repoRoot, pyLang.packageManager)
    for (const [key, value] of Object.entries(pyCmds)) {
      if (value && !(result as any)[key])
        (result as any)[key] = value
    }
  }

  if (langNames.has('go')) {
    const goCmds = await detectGoConventionCommands(repoRoot)
    for (const [key, value] of Object.entries(goCmds)) {
      if (value && !(result as any)[key])
        (result as any)[key] = value
    }
  }

  if (langNames.has('rust')) {
    const rustCmds = await detectRustConventionCommands(repoRoot)
    for (const [key, value] of Object.entries(rustCmds)) {
      if (value && !(result as any)[key])
        (result as any)[key] = value
    }
  }

  if (langNames.has('java')) {
    const javaLang = languages.find(l => l.name === 'java')!
    const javaCmds = await detectJavaConventionCommands(repoRoot, javaLang.packageManager)
    for (const [key, value] of Object.entries(javaCmds)) {
      if (value && !(result as any)[key])
        (result as any)[key] = value
    }
  }

  if (langNames.has('ruby')) {
    const rubyCmds = await detectRubyConventionCommands(repoRoot)
    for (const [key, value] of Object.entries(rubyCmds)) {
      if (value && !(result as any)[key])
        (result as any)[key] = value
    }
  }

  if (langNames.has('php')) {
    const phpCmds = await detectPhpConventionCommands(repoRoot)
    for (const [key, value] of Object.entries(phpCmds)) {
      if (value && !(result as any)[key])
        (result as any)[key] = value
    }
  }

  return result
}

// --- Universal detection ---

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

async function detectDocker(repoRoot: string): Promise<{ hasCompose: boolean, hasDockerfile: boolean, services: string[] }> {
  // Docker Compose
  let hasCompose = false
  let services: string[] = []
  for (const file of ['docker-compose.yml', 'docker-compose.yaml']) {
    const content = await readTextFile(join(repoRoot, file))
    if (content) {
      hasCompose = true
      services = parseDockerServices(content)
      break
    }
  }

  // Dockerfile
  const hasDockerfile = await fileExists(join(repoRoot, 'Dockerfile'))

  return { hasCompose, hasDockerfile, services }
}

async function readContributing(repoRoot: string): Promise<string | null> {
  return await readTextFile(join(repoRoot, 'CONTRIBUTING.md'))
}

// --- Main command ---

export async function setup(dir: string, _options?: SetupOptions): Promise<SetupResult> {
  const projectDir = dir === '.' ? getGitCwd() : join(getGitCwd(), dir)

  // Run all detectors in parallel
  const [languages, envVars, docker, contributingContent] = await Promise.all([
    detectLanguages(projectDir),
    extractEnvVars(projectDir),
    detectDocker(projectDir),
    readContributing(projectDir),
  ])

  // Detect commands
  const commands = await detectCommands(projectDir, languages)

  // Project name: prefer package.json name, then directory name
  let projectName = basename(projectDir)
  const pkgContent = await readTextFile(join(projectDir, 'package.json'))
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent)
      if (pkg.name)
        projectName = pkg.name
    }
    catch {
      // Ignore parse errors
    }
  }

  return {
    projectName,
    languages,
    prerequisites: {
      services: docker.services,
    },
    installation: {
      envConfigFile: envVars.configFile,
      requiredEnvVars: envVars.vars,
    },
    development: {
      hasDockerCompose: docker.hasCompose,
      hasDockerfile: docker.hasDockerfile,
      devCommand: commands.dev,
      testCommand: commands.test,
      migrationCommand: commands.migration,
    },
    commonTasks: {
      lintCommand: commands.lint,
      formatCommand: commands.format,
      buildCommand: commands.build,
    },
    contributingContent,
  }
}
