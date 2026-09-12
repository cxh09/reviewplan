/**
 * localStorage 安全读写。
 * 浏览器禁用存储（Safari 隐私模式、无痕窗口）或配额超限时，
 * 读写一律静默降级到 fallback，不向上抛错，避免整个应用白屏。
 */

/** 缓存探测结果，避免每次读写都做一次写入探测 */
let cached = null
let probed = false

function getStorage() {
  if (probed) return cached
  probed = true

  try {
    const storage = window.localStorage
    // 有些环境下 localStorage 存在但 setItem 会直接抛错，必须实际写一次才算可用
    const probeKey = '__reviewplan_probe__'
    storage.setItem(probeKey, '1')
    storage.removeItem(probeKey)
    cached = storage
  } catch {
    cached = null
  }

  return cached
}

/** 存储是否可用（不可用时应用退化为「仅内存」模式） */
export function isStorageAvailable() {
  return Boolean(getStorage())
}

export function readText(key, fallback = '') {
  const storage = getStorage()
  if (!storage) return fallback

  try {
    const value = storage.getItem(key)
    return value === null ? fallback : value
  } catch {
    return fallback
  }
}

export function writeText(key, value) {
  const storage = getStorage()
  if (!storage) return false

  try {
    storage.setItem(key, value)
    return true
  } catch {
    // 配额超限等：忽略，应用继续可用，只是这次没有落盘
    return false
  }
}

export function readJSON(key, fallback = null) {
  const raw = readText(key, '')
  if (!raw) return fallback

  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeJSON(key, value) {
  try {
    return writeText(key, JSON.stringify(value))
  } catch {
    // 存在循环引用等无法序列化的情况
    return false
  }
}

export function removeItem(key) {
  const storage = getStorage()
  if (!storage) return false

  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}
