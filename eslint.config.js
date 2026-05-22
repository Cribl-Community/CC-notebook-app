import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'playwright-report', 'test-results', 'blob-report']),
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['e2e/**'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ['src/ports/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@platform/*', '@features/*'],
              message: 'Ports must stay adapter-agnostic. Import from domain/ports types instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['e2e/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@app/styles/*'],
              message: 'Import notebook style metadata via @app/providers (re-exported from ThemeProvider barrel).',
            },
            {
              group: ['@app/riptideAiCodeAdapter'],
              message: 'Use AiCodeProvider / useAiCodeService — do not import the Riptide adapter directly from features.',
            },
            {
              group: ['@platform/*'],
              message:
                'Features should depend on ports/domain and composition-root providers — not platform I/O directly (see docs/ARCHITECTURE.md). Kernel DTOs belong in @/domain/kernel.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
])
