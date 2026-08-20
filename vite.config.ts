import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    rollupOptions: {
      // Zwei Einstiegsseiten mit derselben React-App:
      //  • index.html  → öffentliche Website + Backoffice
      //  • chat.html   → Team-App (/chat), eigene feste App-Identität fürs iPhone
      input: {
        main: path.resolve(__dirname, 'index.html'),
        chat: path.resolve(__dirname, 'chat.html'),
      },
    },
  },
});
