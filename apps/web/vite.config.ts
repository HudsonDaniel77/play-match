import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Aligns with server's configured CLIENT_WEB_URL
    port: 3000,
    strictPort: true,
  },
});
