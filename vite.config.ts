import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.GITHUB_ACTIONS ? '/kaoyan-vocab/' : '/'

export default defineConfig({
  base,
  server: {
    host: '0.0.0.0',
    allowedHosts: ['terminal.local']
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png', 'robots.txt'],
      manifest: {
        name: '考研单词',
        short_name: '考研单词',
        description: '每天十五组考研词汇，只让明确标熟的词退出下一轮。',
        lang: 'zh-CN',
        theme_color: '#f4f0e8',
        background_color: '#f4f0e8',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: base,
        scope: base,
        icons: [
          { src: `${base}pwa-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}pwa-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${base}pwa-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,png,ico}'],
        maximumFileSizeToCacheInBytes: 7 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: `${base}index.html`
      }
    })
  ]
})
