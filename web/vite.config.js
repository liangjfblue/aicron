import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import rootPackage from '../package.json' with { type: 'json' };

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(rootPackage.version),
  },
  plugins: [react()],
  server: {
    port: 5180,
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
