import { defineConfig } from 'vite';

export default defineConfig({
  // 相对 base，GitHub Pages 的 project site 需要它
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  server: {
    port: 5245,
  },
});
