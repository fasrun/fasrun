import { configDefaults, defineConfig } from 'vitest/config';

// The scaffold fixtures contain the generated example test; they are compared, not run (SF-1 T021).
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'test/fixtures/**'],
  },
});
