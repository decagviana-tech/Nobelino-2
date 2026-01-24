import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Isso garante que o Netlify consiga "carimbar" a chave no site
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || "")
  },
  build: {
    chunkSizeWarningLimit: 1000
  }
});