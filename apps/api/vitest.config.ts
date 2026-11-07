import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// O esbuild do Vite não emite metadata de decorators; o SWC emite, e o DI do Nest depende disso.
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    // Os testes de banco compartilham o reconcilia_test e esvaziam as tabelas: um arquivo por vez.
    fileParallelism: false,
  },
});
