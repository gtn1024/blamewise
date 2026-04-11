import type { SetupResult } from '../src/commands/setup'
import { execSync } from 'node:child_process'
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { extractScripts, parseDockerServices, parseEnvExample } from '../src/commands/setup'
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
      lintScript: 'lint',
      formatScript: 'format',
      buildScript: 'build',
      devServerScript: 'dev',
      testScript: 'test',
      migrationScript: 'db:migrate',
    })
  })

  test('returns nulls for missing scripts', () => {
    expect(extractScripts({})).toEqual({
      lintScript: null,
      formatScript: null,
      buildScript: null,
      devServerScript: null,
      testScript: null,
      migrationScript: null,
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
      lintScript: null,
      formatScript: null,
      buildScript: null,
      devServerScript: 'start',
      testScript: 'test',
      migrationScript: null,
    })
  })

  test('detects migration scripts with various names', () => {
    const pkg = {
      scripts: {
        migrate: 'knex migrate:latest',
      },
    }
    expect(extractScripts(pkg).migrationScript).toBe('migrate')
  })
})

// --- renderSetup ---

describe('renderSetup', () => {
  const fullResult: SetupResult = {
    projectName: 'my-project',
    prerequisites: { nodeVersion: '>=18', services: ['postgres', 'redis'] },
    installation: {
      packageManager: 'bun',
      envConfigFile: '.env.example',
      requiredEnvVars: ['DATABASE_URL', 'JWT_SECRET'],
    },
    development: {
      hasDockerCompose: true,
      migrationScript: 'db:migrate',
      devServerScript: 'dev',
      testScript: 'test',
    },
    commonTasks: {
      lintScript: 'lint',
      formatScript: 'format',
      buildScript: 'build',
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

  test('includes installation steps with correct package manager', () => {
    const md = renderSetup(fullResult)
    expect(md).toContain('`bun install`')
    expect(md).toContain('.env.example')
    expect(md).toContain('DATABASE_URL')
    expect(md).toContain('JWT_SECRET')
  })

  test('includes development steps', () => {
    const md = renderSetup(fullResult)
    expect(md).toContain('docker compose up -d')
    expect(md).toContain('`bun run db:migrate`')
    expect(md).toContain('`bun run dev`')
    expect(md).toContain('`bun test`')
  })

  test('includes common tasks', () => {
    const md = renderSetup(fullResult)
    expect(md).toContain('`bun run lint`')
    expect(md).toContain('`bun run format`')
    expect(md).toContain('`bun run build`')
  })

  test('omits empty sections', () => {
    const minimal: SetupResult = {
      projectName: 'minimal',
      prerequisites: { nodeVersion: null, services: [] },
      installation: { packageManager: 'npm', envConfigFile: null, requiredEnvVars: [] },
      development: { hasDockerCompose: false, migrationScript: null, devServerScript: null, testScript: null },
      commonTasks: { lintScript: null, formatScript: null, buildScript: null },
      contributingContent: null,
    }
    const md = renderSetup(minimal)
    expect(md).not.toContain('Prerequisites')
    expect(md).not.toContain('Required Services')
    expect(md).not.toContain('Development')
    expect(md).not.toContain('Common Tasks')
    expect(md).toContain('Installation')
    expect(md).toContain('`npm install`')
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
})

// --- End-to-end integration test ---

describe('setup command (e2e)', () => {
  const TMP = realpathSync(tmpdir())
  let testDir: string

  function initGitRepo(dir: string) {
    execSync('git init', { cwd: dir, stdio: 'pipe' })
    execSync('git config user.email test@test.com', { cwd: dir, stdio: 'pipe' })
    execSync('git config user.name Test', { cwd: dir, stdio: 'pipe' })
  }

  test('generates correct result for a project with config files', async () => {
    testDir = resolve(TMP, `blamewise-setup-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })

    try {
      // Create git repo
      initGitRepo(testDir)

      // Create config files
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

      // Make an initial commit so git log works
      execSync('git add -A', { cwd: testDir, stdio: 'pipe' })
      execSync('git commit -m init', { cwd: testDir, stdio: 'pipe' })

      // Import and run setup
      const { setup } = await import('../src/commands/setup')
      const { setGitCwd } = await import('../src/git/run')

      setGitCwd(testDir)
      const result = await setup('.')

      expect(result.projectName).toBe('test-project')
      expect(result.prerequisites.nodeVersion).toBe('20')
      expect(result.prerequisites.services).toEqual(['postgres', 'redis'])
      expect(result.installation.packageManager).toBe('bun')
      expect(result.installation.envConfigFile).toBe('.env.example')
      expect(result.installation.requiredEnvVars).toEqual(['DATABASE_URL', 'JWT_SECRET'])
      expect(result.development.hasDockerCompose).toBe(true)
      expect(result.development.migrationScript).toBe('db:migrate')
      expect(result.development.devServerScript).toBe('dev')
      expect(result.development.testScript).toBe('test')
      expect(result.commonTasks.lintScript).toBe('lint')
      expect(result.commonTasks.buildScript).toBe('build')
    }
    finally {
      rmSync(testDir, { recursive: true, force: true })
    }
  })
})
