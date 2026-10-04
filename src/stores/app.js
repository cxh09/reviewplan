import { computed, onScopeDispose, ref, watchEffect } from 'vue'
import { defineStore } from 'pinia'

import { readText, writeText } from '@/utils/storage'

/**
 * 主题偏好三态：跟随系统 / 浅色 / 深色。
 * 默认「跟随系统」——直接读取设备/浏览器的 prefers-color-scheme，并实时跟随其变化。
 * 用户手动选浅色/深色即成为覆盖项（落盘，不再跟随系统）。
 * 键名带 v2：老版本存的是纯 light/dark，这里作废，让所有人重新回到「跟随系统」默认。
 */
export const THEME_STORAGE_KEY = 'reviewplan:theme:v2'

const SYSTEM = 'system'
const LIGHT = 'light'
const DARK = 'dark'

/** 系统当前是否偏好深色 */
function systemDark() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

/** 归一化任意存储值为合法选项，缺省/非法都回到「跟随系统」 */
export function normalizeThemeChoice(raw) {
  return raw === LIGHT || raw === DARK ? raw : SYSTEM
}

/** 把选项解析为实际生效的 light/dark */
export function resolveTheme(choice) {
  const c = normalizeThemeChoice(choice)
  if (c === SYSTEM) return systemDark() ? DARK : LIGHT
  return c
}

/** 读取初始生效主题（应用挂载前调用，避免首屏闪烁） */
export function readSavedTheme() {
  return resolveTheme(normalizeThemeChoice(readText(THEME_STORAGE_KEY)))
}

/** 把生效主题写到 html 标签上，TDesign 的 CSS 变量随之切换 */
export function applyThemeMode(mode) {
  document.documentElement.setAttribute('theme-mode', mode === DARK ? DARK : LIGHT)
}

export const useAppStore = defineStore('app', () => {
  // theme 是用户「选择」（system/light/dark）；isDark 是实际生效的深浅色
  const theme = ref(normalizeThemeChoice(readText(THEME_STORAGE_KEY)))
  const sysDark = ref(systemDark())

  const isDark = computed(() =>
    theme.value === SYSTEM ? sysDark.value : theme.value === DARK,
  )

  // theme / 系统偏好任一变化都重新落到 DOM
  watchEffect(() => {
    applyThemeMode(isDark.value ? DARK : LIGHT)
  })

  function setTheme(choice) {
    theme.value = normalizeThemeChoice(choice)
    writeText(THEME_STORAGE_KEY, theme.value)
  }

  /** 快捷切换：在当前生效色的基础上强制切到另一色（会覆盖「跟随系统」） */
  function toggleTheme() {
    setTheme(isDark.value ? LIGHT : DARK)
  }

  // 跟随系统：监听 prefers-color-scheme 变化，实时切换
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => {
      sysDark.value = e.matches
    }
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      onScopeDispose(() => mq.removeEventListener('change', onChange))
    } else if (typeof mq.addListener === 'function') {
      // 兼容极老浏览器
      mq.addListener(onChange)
      onScopeDispose(() => mq.removeListener(onChange))
    }
  }

  return { theme, isDark, setTheme, toggleTheme }
})
