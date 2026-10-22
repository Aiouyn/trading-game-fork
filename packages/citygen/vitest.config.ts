import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The narrow subpath aliases, not the `@tycoon/engine-core` barrel: the barrel re-exports
// `./module`, which imports zod, and zod is a dependency of packages/engine/core and of
// nothing else. A barrel import would make this package depend on engine/core having been
// installed first, and the engine-check matrix runs the packages in an arbitrary order.
// `canon.ts` and `order.ts` have no zod in their transitive imports, so the narrow alias is
// self-contained (T10A-12 card, Tree check 1, correction 3).
export default defineConfig({
  resolve: {
    alias: {
      '@tycoon/engine-core/canon': fileURLToPath(new URL('../engine/core/canon.ts', import.meta.url)),
      '@tycoon/engine-core/order': fileURLToPath(new URL('../engine/core/order.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules/**'],
    environment: 'node',
    // U0 ships the skeleton before any test file exists; vitest's default is to fail on
    // "no test files found", which would fail `npm test` in engine-check.mjs. The root
    // vitest.config.ts sets the same flag, so this is the house pattern.
    passWithNoTests: true,
  },
});
