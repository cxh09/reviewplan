import { createApp } from 'vue'
import { createPinia } from 'pinia'

// TDesign 主题变量 + 基础样式（组件样式由 unplugin-vue-components 按需注入）
import 'tdesign-vue-next/es/style/index.css'
// 全局基础样式
import '@/styles/main.css'

import App from './App.vue'
import router from './router'
import { applyThemeMode, readSavedTheme } from '@/stores/app'

// 在挂载前同步主题，避免首屏闪白
applyThemeMode(readSavedTheme())

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
