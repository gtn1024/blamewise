import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'module',
  target: 'bun',
  ignores: [
    '**/node_modules',
    '**/dist',
    '**/bun.lock',
  ],
  rules: {
    // CLI tool — console output is intentional
    'no-console': 'off',
    // Bun provides `process` as a global
    'node/prefer-global/process': ['error', 'always'],
  },
})
