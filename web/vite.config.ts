import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // o navegador fala com /ws e o Vite repassa para o gateway Java
      '/ws': { target: 'ws://localhost:8090', ws: true, rewrite: () => '/' },
    },
  },
});
