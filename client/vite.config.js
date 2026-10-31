import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Polling picks up file changes made outside the editor (e.g. synced files)
    watch: { usePolling: true, interval: 500 },
    // Forward /api calls to the Express server, so no CORS setup is needed in development
    proxy: { '/api': 'http://localhost:4000' },
  },
});
