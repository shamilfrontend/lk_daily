import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

// Airbnb TS preset требует @typescript-eslint v7; с typescript-eslint v8 — airbnb-base + recommended.
export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  ...compat.extends('airbnb-base'),
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
        node: true,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'import/extensions': [
        'error',
        'ignorePackages',
        {
          ts: 'never',
          tsx: 'never',
          js: 'never',
          jsx: 'never',
          mjs: 'never',
          cjs: 'never',
        },
      ],
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: [
            'src/**/*.test.ts',
            'src/**/*.integration.test.ts',
            'src/**/test/**/*.ts',
          ],
        },
      ],
      'import/prefer-default-export': 'off',
      'no-param-reassign': [
        'error',
        { props: true, ignorePropertyModificationsFor: ['config', 'ctx', 'req', 'res'] },
      ],
      'no-underscore-dangle': ['error', { allow: ['_id', '__dirname'] }],
      'no-use-before-define': 'warn',
      'prefer-destructuring': 'warn',
      'no-await-in-loop': 'off',
      'no-continue': 'off',
      'no-plusplus': 'off',
      'no-void': 'off',
      // Airbnb запрещает for..of (legacy); в TS/Node for..of нативный.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ForInStatement',
          message:
            'for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.',
        },
        {
          selector: 'LabeledStatement',
          message:
            'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
        },
        {
          selector: 'WithStatement',
          message:
            '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
        },
      ],
    },
  },
  eslintConfigPrettier,
);
