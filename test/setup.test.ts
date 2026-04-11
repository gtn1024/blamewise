import type { SetupResult } from '../src/commands/setup'
import { execSync } from 'node:child_process'
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  extractScripts,
  parseDockerServices,
  parseEnvExample,
  parseGoMod,
  parseJustfileRecipes,
  parseMakefileTargets,
  parsePyprojectHasPoetry,
  parsePyprojectTomlPythonVersion,
  parseRustToolchain,
  parseSdkmanrcJavaVersion,
} from '../src/commands/setup'
import { renderSetup } from '../src/render'

// --- parseEnvExample ---

describe('parseEnvExample', () => {
  test('extracts variable names from KEY=value lines', () => {
    const content = 'DATABASE_URL=postgres://localhost\nPORT=3000\nHOST=0.0.0.0'
    expect(parseEnvExample(content)).toEqual(['DATABASE_URL', 'PORT', 'HOST'])
  })

  test('extracts variable names from KEY= lines (no value)', () => {
    const content = 'SECRET_KEY=\nAPI_TOKEN='
    expect(parseEnvExample(content)).toEqual(['SECRET_KEY', 'API_TOKEN'])
  })

  test('skips comment lines', () => {
    const content = '# This is a comment\nDATABASE_URL=postgres\n# Another comment\nPORT=3000'
    expect(parseEnvExample(content)).toEqual(['DATABASE_URL', 'PORT'])
  })

  test('skips empty lines', () => {
    const content = '\n\nDATABASE_URL=postgres\n\nPORT=3000\n'
    expect(parseEnvExample(content)).toEqual(['DATABASE_URL', 'PORT'])
  })

  test('handles mixed content', () => {
    const content = `
# Database configuration
DATABASE_URL=postgres://localhost:5432/mydb
DB_USER=admin

# Authentication
JWT_SECRET=supersecret
PORT=3000
`
    expect(parseEnvExample(content)).toEqual(['DATABASE_URL', 'DB_USER', 'JWT_SECRET', 'PORT'])
  })

  test('returns empty array for empty content', () => {
    expect(parseEnvExample('')).toEqual([])
  })

  test('returns empty array for comments only', () => {
    expect(parseEnvExample('# comment\n# another')).toEqual([])
  })
})

// --- parseDockerServices ---

describe('parseDockerServices', () => {
  test('extracts service names', () => {
    const content = `
services:
  db:
    image: postgres:15
  redis:
    image: redis:7
  api:
    build: .
`
    expect(parseDockerServices(content)).toEqual(['db', 'redis', 'api'])
  })

  test('returns empty array when no services section', () => {
    const content = `
version: '3.8'
volumes:
  data:
`
    expect(parseDockerServices(content)).toEqual([])
  })

  test('returns empty array for empty services', () => {
    const content = `
services:
`
    expect(parseDockerServices(content)).toEqual([])
  })

  test('stops at next top-level key', () => {
    const content = `
services:
  db:
    image: postgres
  redis:
    image: redis
volumes:
  data:
`
    expect(parseDockerServices(content)).toEqual(['db', 'redis'])
  })

  test('skips comments inside services', () => {
    const content = `
services:
  # Database
  db:
    image: postgres
`
    expect(parseDockerServices(content)).toEqual(['db'])
  })

  test('handles empty content', () => {
    expect(parseDockerServices('')).toEqual([])
  })
})

// --- parseGoMod ---

describe('parseGoMod', () => {
  test('extracts Go version from go directive', () => {
    const content = `module github.com/user/project

go 1.22

require (
\tgithub.com/gin-gonic/gin v1.9.1
)
`
    expect(parseGoMod(content)).toBe('1.22')
  })

  test('extracts minor version', () => {
    expect(parseGoMod('go 1.21')).toBe('1.21')
  })

  test('extracts patch version', () => {
    expect(parseGoMod('go 1.22.3')).toBe('1.22.3')
  })

  test('returns null when no go directive', () => {
    expect(parseGoMod('module example.com')).toBeNull()
  })

  test('returns null for empty content', () => {
    expect(parseGoMod('')).toBeNull()
  })
})

// --- parsePyprojectTomlPythonVersion ---

describe('parsePyprojectTomlPythonVersion', () => {
  test('extracts requires-python version', () => {
    const content = `[project]
name = "myapp"
requires-python = ">=3.12"
`
    expect(parsePyprojectTomlPythonVersion(content)).toBe('>=3.12')
  })

  test('handles single quotes', () => {
    expect(parsePyprojectTomlPythonVersion('requires-python = \'>=3.11\'')).toBe('>=3.11')
  })

  test('returns null when no requires-python', () => {
    expect(parsePyprojectTomlPythonVersion('[project]\nname = "myapp"')).toBeNull()
  })

  test('returns null for empty content', () => {
    expect(parsePyprojectTomlPythonVersion('')).toBeNull()
  })
})

// --- parsePyprojectHasPoetry ---

describe('parsePyprojectHasPoetry', () => {
  test('detects poetry section', () => {
    expect(parsePyprojectHasPoetry('[tool.poetry]\nname = "myapp"')).toBe(true)
  })

  test('returns false without poetry section', () => {
    expect(parsePyprojectHasPoetry('[project]\nname = "myapp"')).toBe(false)
  })
})

// --- parseRustToolchain ---

describe('parseRustToolchain', () => {
  test('extracts channel version', () => {
    const content = `[toolchain]
channel = "1.76"
`
    expect(parseRustToolchain(content)).toBe('1.76')
  })

  test('extracts stable channel', () => {
    expect(parseRustToolchain('channel = "stable"')).toBe('stable')
  })

  test('returns null when no channel', () => {
    expect(parseRustToolchain('[toolchain]')).toBeNull()
  })

  test('returns null for empty content', () => {
    expect(parseRustToolchain('')).toBeNull()
  })
})

// --- parseSdkmanrcJavaVersion ---

describe('parseSdkmanrcJavaVersion', () => {
  test('extracts java version from sdkmanrc', () => {
    expect(parseSdkmanrcJavaVersion('java=21.0.2-tem\ngradle=8.5')).toBe('21.0.2-tem')
  })

  test('handles spaced equals', () => {
    expect(parseSdkmanrcJavaVersion('java = 21.0.2-tem')).toBe('21.0.2-tem')
  })

  test('returns null when no java line', () => {
    expect(parseSdkmanrcJavaVersion('gradle=8.5')).toBeNull()
  })
})

// --- parseMakefileTargets ---

describe('parseMakefileTargets', () => {
  test('extracts targets', () => {
    const content = `dev:
\tnpm run dev

test:
\tnpm test

build:
\tnpm run build

.PHONY: dev test build
`
    expect(parseMakefileTargets(content)).toEqual(['dev', 'test', 'build'])
  })

  test('skips variable assignments', () => {
    const content = `VAR := value
target:
\techo hello
`
    expect(parseMakefileTargets(content)).toEqual(['target'])
  })

  test('skips special targets', () => {
    const content = `.PHONY: all
all:
\techo all
`
    expect(parseMakefileTargets(content)).toEqual(['all'])
  })

  test('handles targets with dependencies', () => {
    expect(parseMakefileTargets('build: dep1 dep2\n\techo build')).toEqual(['build'])
  })

  test('returns empty array for empty content', () => {
    expect(parseMakefileTargets('')).toEqual([])
  })
})

// --- parseJustfileRecipes ---

describe('parseJustfileRecipes', () => {
  test('extracts recipe names', () => {
    const content = `dev:
    npm run dev

test:
    npm test

build:
    npm run build
`
    expect(parseJustfileRecipes(content)).toEqual(['dev', 'test', 'build'])
  })

  test('skips comments', () => {
    const content = `# This is a comment
dev:
    echo hello
`
    expect(parseJustfileRecipes(content)).toEqual(['dev'])
  })

  test('skips set and mod directives', () => {
    const content = `set shell := ["bash", "-c"]
mod mymod

dev:
    echo hello
`
    expect(parseJustfileRecipes(content)).toEqual(['dev'])
  })

  test('handles recipes with parameters', () => {
    expect(parseJustfileRecipes('test name="default":\n    echo {{name}}')).toEqual(['test'])
  })

  test('returns empty array for empty content', () => {
    expect(parseJustfileRecipes('')).toEqual([])
  })
})

// --- extractScripts ---

describe('extractScripts', () => {
  test('finds all scripts', () => {
    const pkg = {
      scripts: {
        'dev': 'vite',
        'build': 'vite build',
        'test': 'vitest',
        'lint': 'eslint .',
        'format': 'prettier --write .',
        'db:migrate': 'prisma migrate deploy',
      },
    }
    expect(extractScripts(pkg)).toEqual({
      lint: 'lint',
      format: 'format',
      build: 'build',
      dev: 'dev',
      test: 'test',
      migration: 'db:migrate',
    })
  })

  test('returns nulls for missing scripts', () => {
    expect(extractScripts({})).toEqual({
      lint: null,
      format: null,
      build: null,
      dev: null,
      test: null,
      migration: null,
    })
  })

  test('handles partial scripts', () => {
    const pkg = {
      scripts: {
        start: 'node index.js',
        test: 'jest',
      },
    }
    expect(extractScripts(pkg)).toEqual({
      lint: null,
      format: null,
      build: null,
      dev: 'start',
      test: 'test',
      migration: null,
    })
  })

  test('detects migration scripts with various names', () => {
    const pkg = {
      scripts: {
        migrate: 'knex migrate:latest',
      },
    }
    expect(extractScripts(pkg).migration).toBe('migrate')
  })
})

// --- renderSetup ---

describe('renderSetup', () => {
  const fullResult: SetupResult = {
    projectName: 'my-project',
    languages: [
      { name: 'javascript', version: '>=18', packageManager: 'bun', installCommand: 'bun install' },
    ],
    prerequisites: { services: ['postgres', 'redis'] },
    installation: {
      envConfigFile: '.env.example',
      requiredEnvVars: ['DATABASE_URL', 'JWT_SECRET'],
    },
    development: {
      hasDockerCompose: true,
      hasDockerfile: false,
      devCommand: 'bun run dev',
      testCommand: 'bun run test',
      migrationCommand: 'bun run db:migrate',
    },
    commonTasks: {
      lintCommand: 'bun run lint',
      formatCommand: 'bun run format',
      buildCommand: 'bun run build',
    },
    contributingContent: null,
  }

  test('includes project name', () => {
    const md = renderSetup(fullResult)
    expect(md).toContain('# Setup Checklist — my-project')
  })

  test('includes prerequisites', () => {
    const md = renderSetup(fullResult)
    expect(md).toContain('Node.js >=18')
    expect(md).toContain('postgres')
    expect(md).toContain('redis')
  })

  test('includes installation steps', () => {
    const md = renderSetup(fullResult)
    expect(md).toContain('`bun install`')
    expect(md).toContain('.env.example')
    expect(md).toContain('DATABASE_URL')
    expect(md).toContain('JWT_SECRET')
  })

  test('includes development steps with full commands', () => {
    const md = renderSetup(fullResult)
    expect(md).toContain('docker compose up -d')
    expect(md).toContain('`bun run db:migrate`')
    expect(md).toContain('`bun run dev`')
    expect(md).toContain('`bun run test`')
  })

  test('includes common tasks with full commands', () => {
    const md = renderSetup(fullResult)
    expect(md).toContain('`bun run lint`')
    expect(md).toContain('`bun run format`')
    expect(md).toContain('`bun run build`')
  })

  test('omits empty sections', () => {
    const minimal: SetupResult = {
      projectName: 'minimal',
      languages: [{ name: 'go', version: null, packageManager: 'go modules', installCommand: 'go mod download' }],
      prerequisites: { services: [] },
      installation: { envConfigFile: null, requiredEnvVars: [] },
      development: { hasDockerCompose: false, hasDockerfile: false, devCommand: null, testCommand: null, migrationCommand: null },
      commonTasks: { lintCommand: null, formatCommand: null, buildCommand: null },
      contributingContent: null,
    }
    const md = renderSetup(minimal)
    expect(md).not.toContain('Prerequisites')
    expect(md).not.toContain('Required Services')
    expect(md).not.toContain('Development')
    expect(md).not.toContain('Common Tasks')
    expect(md).toContain('Installation')
    expect(md).toContain('`go mod download`')
  })

  test('appends contributing content', () => {
    const result: SetupResult = {
      ...fullResult,
      contributingContent: '## How to Contribute\n\nPlease read this.',
    }
    const md = renderSetup(result)
    expect(md).toContain('## How to Contribute')
    expect(md).toContain('Please read this.')
  })

  test('includes generation date', () => {
    const md = renderSetup(fullResult)
    const today = new Date().toISOString().slice(0, 10)
    expect(md).toContain(`Generated by blamewise on ${today}`)
  })

  test('renders multi-language project', () => {
    const multi: SetupResult = {
      projectName: 'fullstack',
      languages: [
        { name: 'go', version: '1.22', packageManager: 'go modules', installCommand: 'go mod download' },
        { name: 'javascript', version: '20', packageManager: 'npm', installCommand: 'npm install' },
      ],
      prerequisites: { services: [] },
      installation: { envConfigFile: null, requiredEnvVars: [] },
      development: { hasDockerCompose: false, hasDockerfile: true, devCommand: 'make dev', testCommand: 'make test', migrationCommand: null },
      commonTasks: { lintCommand: 'make lint', formatCommand: null, buildCommand: 'make build' },
      contributingContent: null,
    }
    const md = renderSetup(multi)
    expect(md).toContain('Go 1.22')
    expect(md).toContain('Node.js 20')
    expect(md).toContain('`go mod download`')
    expect(md).toContain('`npm install`')
    expect(md).toContain('`make dev`')
    expect(md).toContain('`make test`')
  })

  test('renders Python project correctly', () => {
    const py: SetupResult = {
      projectName: 'my-api',
      languages: [
        { name: 'python', version: '>=3.12', packageManager: 'poetry', installCommand: 'poetry install' },
      ],
      prerequisites: { services: ['postgres'] },
      installation: { envConfigFile: '.env.example', requiredEnvVars: ['DATABASE_URL'] },
      development: { hasDockerCompose: true, hasDockerfile: false, devCommand: null, testCommand: 'poetry run pytest', migrationCommand: null },
      commonTasks: { lintCommand: 'poetry run ruff check .', formatCommand: 'poetry run ruff format .', buildCommand: 'poetry build' },
      contributingContent: null,
    }
    const md = renderSetup(py)
    expect(md).toContain('Python >=3.12')
    expect(md).toContain('`poetry install`')
    expect(md).toContain('`poetry run pytest`')
    expect(md).toContain('`poetry run ruff check .`')
  })
})

// --- End-to-end integration tests ---

describe('setup command (e2e)', () => {
  const TMP = realpathSync(tmpdir())
  let testDir: string

  function initGitRepo(dir: string) {
    execSync('git init', { cwd: dir, stdio: 'pipe' })
    execSync('git config user.email test@test.com', { cwd: dir, stdio: 'pipe' })
    execSync('git config user.name Test', { cwd: dir, stdio: 'pipe' })
  }

  test('generates correct result for JS project', async () => {
    testDir = resolve(TMP, `blamewise-setup-js-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })

    try {
      initGitRepo(testDir)

      writeFileSync(resolve(testDir, '.nvmrc'), '20\n')
      writeFileSync(resolve(testDir, 'bun.lockb'), '')
      writeFileSync(resolve(testDir, '.env.example'), '# Database\nDATABASE_URL=postgres://localhost\n\n# Auth\nJWT_SECRET=\n')
      writeFileSync(resolve(testDir, 'docker-compose.yml'), `
services:
  postgres:
    image: postgres:15
  redis:
    image: redis:7
`)
      writeFileSync(resolve(testDir, 'package.json'), JSON.stringify({
        name: 'test-project',
        scripts: {
          'dev': 'vite',
          'build': 'vite build',
          'test': 'vitest',
          'lint': 'eslint .',
          'db:migrate': 'prisma migrate deploy',
        },
      }, null, 2))

      execSync('git add -A', { cwd: testDir, stdio: 'pipe' })
      execSync('git commit -m init', { cwd: testDir, stdio: 'pipe' })

      const { setup } = await import('../src/commands/setup')
      const { setGitCwd } = await import('../src/git/run')

      setGitCwd(testDir)
      const result = await setup('.')

      expect(result.projectName).toBe('test-project')
      expect(result.languages).toHaveLength(1)
      expect(result.languages[0]!.name).toBe('javascript')
      expect(result.languages[0]!.version).toBe('20')
      expect(result.languages[0]!.packageManager).toBe('bun')
      expect(result.prerequisites.services).toEqual(['postgres', 'redis'])
      expect(result.installation.envConfigFile).toBe('.env.example')
      expect(result.installation.requiredEnvVars).toEqual(['DATABASE_URL', 'JWT_SECRET'])
      expect(result.development.hasDockerCompose).toBe(true)
      expect(result.development.migrationCommand).toBe('bun run db:migrate')
      expect(result.development.devCommand).toBe('bun run dev')
      expect(result.development.testCommand).toBe('bun run test')
      expect(result.commonTasks.lintCommand).toBe('bun run lint')
      expect(result.commonTasks.buildCommand).toBe('bun run build')
    }
    finally {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test('generates correct result for Go project', async () => {
    testDir = resolve(TMP, `blamewise-setup-go-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })

    try {
      initGitRepo(testDir)

      writeFileSync(resolve(testDir, 'go.mod'), `module github.com/user/project

go 1.22

require github.com/gin-gonic/gin v1.9.1
`)
      writeFileSync(resolve(testDir, '.golangci.yml'), 'linters:\n  enable:\n    - errcheck\n')
      writeFileSync(resolve(testDir, 'Dockerfile'), 'FROM golang:1.22\n')

      execSync('git add -A', { cwd: testDir, stdio: 'pipe' })
      execSync('git commit -m init', { cwd: testDir, stdio: 'pipe' })

      const { setup } = await import('../src/commands/setup')
      const { setGitCwd } = await import('../src/git/run')

      setGitCwd(testDir)
      const result = await setup('.')

      expect(result.languages).toHaveLength(1)
      expect(result.languages[0]!.name).toBe('go')
      expect(result.languages[0]!.version).toBe('1.22')
      expect(result.languages[0]!.packageManager).toBe('go modules')
      expect(result.languages[0]!.installCommand).toBe('go mod download')
      expect(result.development.hasDockerfile).toBe(true)
      expect(result.development.devCommand).toBe('go run .')
      expect(result.development.testCommand).toBe('go test ./...')
      expect(result.commonTasks.lintCommand).toBe('golangci-lint run')
      expect(result.commonTasks.buildCommand).toBe('go build ./...')
    }
    finally {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test('generates correct result for Python project', async () => {
    testDir = resolve(TMP, `blamewise-setup-py-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })

    try {
      initGitRepo(testDir)

      writeFileSync(resolve(testDir, 'pyproject.toml'), `[project]
name = "myapp"
requires-python = ">=3.12"

[tool.poetry]
name = "myapp"

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.ruff]
line-length = 88
`)
      writeFileSync(resolve(testDir, '.python-version'), '3.12\n')

      execSync('git add -A', { cwd: testDir, stdio: 'pipe' })
      execSync('git commit -m init', { cwd: testDir, stdio: 'pipe' })

      const { setup } = await import('../src/commands/setup')
      const { setGitCwd } = await import('../src/git/run')

      setGitCwd(testDir)
      const result = await setup('.')

      expect(result.languages).toHaveLength(1)
      expect(result.languages[0]!.name).toBe('python')
      expect(result.languages[0]!.version).toBe('3.12')
      expect(result.languages[0]!.packageManager).toBe('poetry')
      expect(result.languages[0]!.installCommand).toBe('poetry install')
      expect(result.development.testCommand).toBe('poetry run pytest')
      expect(result.commonTasks.lintCommand).toBe('poetry run ruff check .')
      expect(result.commonTasks.formatCommand).toBe('poetry run ruff format .')
      expect(result.commonTasks.buildCommand).toBe('poetry build')
    }
    finally {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test('generates correct result for Rust project', async () => {
    testDir = resolve(TMP, `blamewise-setup-rust-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })

    try {
      initGitRepo(testDir)

      writeFileSync(resolve(testDir, 'Cargo.toml'), `[package]
name = "myapp"
version = "0.1.0"
edition = "2021"
`)
      writeFileSync(resolve(testDir, 'rust-toolchain.toml'), `[toolchain]
channel = "1.76"
`)

      execSync('git add -A', { cwd: testDir, stdio: 'pipe' })
      execSync('git commit -m init', { cwd: testDir, stdio: 'pipe' })

      const { setup } = await import('../src/commands/setup')
      const { setGitCwd } = await import('../src/git/run')

      setGitCwd(testDir)
      const result = await setup('.')

      expect(result.languages).toHaveLength(1)
      expect(result.languages[0]!.name).toBe('rust')
      expect(result.languages[0]!.version).toBe('1.76')
      expect(result.languages[0]!.packageManager).toBe('cargo')
      expect(result.languages[0]!.installCommand).toBe('cargo build')
      expect(result.development.devCommand).toBe('cargo run')
      expect(result.development.testCommand).toBe('cargo test')
      expect(result.commonTasks.buildCommand).toBe('cargo build')
      expect(result.commonTasks.formatCommand).toBe('cargo fmt')
      expect(result.commonTasks.lintCommand).toBe('cargo clippy')
    }
    finally {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test('generates correct result for multi-language project with Makefile', async () => {
    testDir = resolve(TMP, `blamewise-setup-multi-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })

    try {
      initGitRepo(testDir)

      writeFileSync(resolve(testDir, 'go.mod'), `module github.com/user/project\n\ngo 1.22\n`)
      writeFileSync(resolve(testDir, 'package.json'), JSON.stringify({
        name: 'fullstack',
        scripts: { dev: 'vite', build: 'vite build', test: 'vitest' },
      }, null, 2))
      writeFileSync(resolve(testDir, 'Makefile'), `dev:
\tgo run . & npm run dev

test:
\tgo test ./... && npm test

build:
\tgo build ./... && npm run build

lint:
\tgolangci-lint run && npm run lint

.PHONY: dev test build lint
`)

      execSync('git add -A', { cwd: testDir, stdio: 'pipe' })
      execSync('git commit -m init', { cwd: testDir, stdio: 'pipe' })

      const { setup } = await import('../src/commands/setup')
      const { setGitCwd } = await import('../src/git/run')

      setGitCwd(testDir)
      const result = await setup('.')

      expect(result.languages).toHaveLength(2)
      const langNames = result.languages.map(l => l.name).sort()
      expect(langNames).toEqual(['go', 'javascript'])

      // Makefile commands should take priority
      expect(result.development.devCommand).toBe('make dev')
      expect(result.development.testCommand).toBe('make test')
      expect(result.commonTasks.lintCommand).toBe('make lint')
      expect(result.commonTasks.buildCommand).toBe('make build')
    }
    finally {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test('generates minimal result for project with no recognized config', async () => {
    testDir = resolve(TMP, `blamewise-setup-empty-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })

    try {
      initGitRepo(testDir)

      writeFileSync(resolve(testDir, 'main.c'), 'int main() { return 0; }')

      execSync('git add -A', { cwd: testDir, stdio: 'pipe' })
      execSync('git commit -m init', { cwd: testDir, stdio: 'pipe' })

      const { setup } = await import('../src/commands/setup')
      const { setGitCwd } = await import('../src/git/run')

      setGitCwd(testDir)
      const result = await setup('.')

      expect(result.languages).toHaveLength(0)
      expect(result.projectName).toBe(basename(testDir))
      expect(result.prerequisites.services).toEqual([])
      expect(result.development.hasDockerCompose).toBe(false)
      expect(result.development.hasDockerfile).toBe(false)
    }
    finally {
      rmSync(testDir, { recursive: true, force: true })
    }
  })
})
