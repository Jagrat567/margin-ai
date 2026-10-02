import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
    manifest: {
      id: '/', name: 'Margin — Your AI companion', short_name: 'Margin',
      description: 'Your AI companion for questions, writing, ideas, and code.',
      start_url: '/', scope: '/', display: 'standalone',
      theme_color: '#131313', background_color: '#131313',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/_vercel\//],
      cleanupOutdatedCaches: true,
      // Only static build assets are cached. Chat and search always use the network.
    },
  })],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001' } },
});
