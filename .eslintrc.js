/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    project: './server/tsconfig.json',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // Strapi interne utilise beaucoup de `any` — on assouplit pour la V1
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',

    // Retours de fonctions typés — désactivé V1
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',

    // Variables non utilisées
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

    // Imports — require() utilisé dans les dynamic imports Strapi
    '@typescript-eslint/no-require-imports': 'off',
    '@typescript-eslint/no-var-requires': 'off',

    // Console autorisé dans les services Strapi (logs structurés)
    'no-console': 'off',
    eqeqeq: ['error', 'always'],
    'no-var': 'error',
    'prefer-const': 'error',
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js', '!.eslintrc.js', '__tests__/'],
};
