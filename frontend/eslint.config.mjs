import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

// Airbnb TS preset (eslint-config-airbnb-typescript) требует @typescript-eslint v7;
// проект на typescript-eslint v8 — используем airbnb-base + recommended от typescript-eslint.
export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  ...compat.extends('airbnb-base'),
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    languageOptions: {
      globals: { ...globals.browser },
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
      'arrow-body-style': 'off',
      'import/extensions': [
        'error',
        'ignorePackages',
        {
          ts: 'never',
          tsx: 'never',
          js: 'never',
          jsx: 'never',
          vue: 'always',
        },
      ],
      'import/no-extraneous-dependencies': [
        'warn',
        { devDependencies: ['**/*.test.ts', '**/vite.config.ts', '**/*.config.ts'] },
      ],
      'import/prefer-default-export': 'off',
      'no-await-in-loop': 'off',
      'no-continue': 'off',
      'no-param-reassign': [
        'error',
        { props: true, ignorePropertyModificationsFor: ['config', 'state'] },
      ],
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
      'no-underscore-dangle': ['error', { allow: ['_id', '__dirname'] }],
      'no-use-before-define': 'warn',
      'no-void': 'off',
      'prefer-destructuring': 'warn',
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // SFC: идентификаторы из script setup в шаблоне не видны @typescript-eslint/no-unused-vars;
      // блок после глобальных rules, иначе flat-config снова включит правило.
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'vue/script-setup-uses-vars': 'error',
      // Ложные срабатывания: alias из v-for не попадает в scope правила при <script setup>.
      'vue/valid-v-for': 'off',
    },
  },
  eslintConfigPrettier,
);
