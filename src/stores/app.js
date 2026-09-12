import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { readText, writeText } from '@/utils/storage'

export const THEME_STORAGE_KEY = 'reviewplan:theme'

/** 读取已保存的主题（在应用挂载前调用，避免首屏闪烁） */
export function readSavedTheme() {
  return readText(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
}

/** 把主题写到 html 标签上，TDesign 的所有 CSS 变量会随之切换 */
export function applyThemeMode(mode) {
  document.documentElement.setAttribute('theme-mode', mode === 'dark' ? 'dark' : 'light')
}

export const useAppStore = defineStore('app', () => {
  const theme = ref(readSavedTheme())

  const isDark = computed(() => theme.value === 'dark')

  function setTheme(mode) {
    theme.value = mode === 'dark' ? 'dark' : 'light'
    writeText(THEME_STORAGE_KEY, theme.value)
    applyThemeMode(theme.value)
  }

  function toggleTheme() {
    setTheme(isDark.value ? 'light' : 'dark')
  }

  return { theme, isDark, setTheme, toggleTheme }
})
