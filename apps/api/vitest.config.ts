import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// O esbuild do Vite não emite metadata de decorators; o SWC emite, e o DI do Nest depende disso.
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
