module.exports = {
  parser: '@typescript-eslint/parser', // Specifies the ESLint parser
  parserOptions: {
    ecmaVersion: 2020, // Allows for the parsing of modern ECMAScript features
    sourceType: 'module', // Allows for the use of imports
  },
  ignorePatterns: ['node_modules/*', '.github/*', '**/lib/*', '**/dist/*'],
  extends: [
    'plugin:@typescript-eslint/recommended', // Uses the recommended rules from the @typescript-eslint/eslint-plugin
    'plugin:prettier/recommended',
    'prettier', // Uses eslint-config-prettier to disable ESLint rules from @typescript-eslint/eslint-plugin that would conflict with prettier
  ],
  plugins: ['prettier', 'unused-imports'],
  rules: {
    '@typescript-eslint/no-unused-expressions': 'off',
    '@typescript-eslint/no-namespace': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-empty-function': 'warn',
    '@typescript-eslint/no-empty-interface': 'warn',
    'no-unused-vars': 'off',
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'warn',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
      },
    ],
    eqeqeq: ['error', 'smart'],
    'guard-for-in': 'off',
    'id-blacklist': 'off',
    'id-match': 'off',
    'no-underscore-dangle': 'off',
    'no-unused-expressions': 'off',
    'no-var': 'error',
    radix: 'error',
    'prettier/prettier': 'warn',
  },
};
