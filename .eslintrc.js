module.exports = {
  env: {
    es2022: true,
    browser: true,
    worker: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
    'semi': ['error', 'always'],
    'quotes': ['error', 'single'],
    'indent': ['error', 2],
    'no-trailing-spaces': 'error',
    'eol-last': 'error',
    'comma-dangle': ['error', 'never'],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    'space-before-blocks': 'error',
    'keyword-spacing': 'error',
    'space-infix-ops': 'error',
    'no-multiple-empty-lines': ['error', { max: 2 }],
    'prefer-const': 'error',
    'no-var': 'error',
    'arrow-spacing': 'error'
  },
  globals: {
    'crypto': 'readonly',
    'WebSocketPair': 'readonly',
    'Response': 'readonly',
    'Request': 'readonly',
    'fetch': 'readonly',
    'addEventListener': 'readonly',
    'URL': 'readonly',
    'TextEncoder': 'readonly',
    'TextDecoder': 'readonly'
  }
};