import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'app',
  ignores: [
    '**/node_modules',
    '**/dist',
    '**/bun.lock',
  ],
  rules: {
    // Bun provides `process` as a global
    'node/prefer-global/process': ['error', 'always'],
  },
})
