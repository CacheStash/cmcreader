import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      // TAMBAHAN BARU UNTUK MENGATASI WARNING SIZE
      build: {
        chunkSizeWarningLimit: 1000, // Naikkan batas warning jadi 1MB
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        // Pisahkan PDF.js karena dia paling besar
                        if (id.includes('pdfjs-dist')) {
                            return 'pdf-lib';
                        }
                        // Pisahkan library UI lainnya
                        if (id.includes('react') || id.includes('framer-motion')) {
                            return 'vendor-ui';
                        }
                    }
                }
            }
        }
      }
    };
});