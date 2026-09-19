import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { TDesignResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // TDesign 按需引入：模板里用到的组件才会被 import，
    // 每个组件自带的样式也随组件一起注入，未用到的组件不会进产物。
    Components({
      dts: false,
      // 只处理 TDesign，业务组件仍按显式 import 使用
      dirs: [],
      resolvers: [TDesignResolver({ library: 'vue-next' })],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    open: false,
    // 前端默认连「与页面同源」的服务端；开发时把 /api 代理到本地后端，
    // 让 5173 上的默认配置也能直接连上后端。后端换端口时用 API_TARGET 覆盖。
    proxy: {
      '/api': {
        target: process.env.API_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // 框架单独成块，业务代码改动不会让它的缓存失效。
        // TDesign 不再强制合并成一块：交给 Rollup 按路由自然分包，
        // 每个页面只加载自己用到的组件，首屏不会被其它页面的组件拖累。
        // Vite 8 起底层是 rolldown，这里只接受函数形式。
        manualChunks(id) {
          const path = id.replace(/\\/g, '/')
          if (
            path.includes('/node_modules/vue') ||
            path.includes('/node_modules/pinia') ||
            path.includes('/node_modules/@vue')
          ) {
            return 'vue'
          }
          return undefined
        },
      },
    },
  },
})
