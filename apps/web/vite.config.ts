import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const backend = process.env['BACKEND_URL'] ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': backend,
      '/tables': backend,
      '/ws': { target: backend, ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
