import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.GITHUB_ACTIONS ? '/kaoyan-vocab/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png', 'robots.txt'],
      manifest: {
        name: '考研单词',
        short_name: '考研单词',
        description: '每天快速过 300 个考研词汇，只把不熟的词留到下一轮。',
        lang: 'zh-CN',
        theme_color: '#f3efe5',
        background_color: '#f3efe5',
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
        cleanupOutdatedCaches: true,
        navigateFallback: `${base}index.html`
      }
    })
  ]
})
