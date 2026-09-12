import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain-JS helper scripts (sprite prep, Playwright skill tooling) live in
    // a mixed world: Node APIs plus browser globals inside page.evaluate
    // callbacks — without this block no-undef flags Buffer/console/document.
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  prettierConfig,
);
