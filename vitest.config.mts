import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    // Build output (standalone servers, isolated dev copies) contains copies of the tests; never run those.
    exclude: [...configDefaults.exclude, '.next/**', '.next-*/**'],
  },
});
