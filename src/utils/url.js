/**
 * 用户填写的链接归一化。
 *
 * 日程 / 待办的 link 会直接渲染成 `<a href>`，如果放任 `javascript:`、`data:`
 * 这类协议进来就是一个可点击的注入点（表单校验拦得住，但导入的 JSON 绕得过去）。
 * 这里统一只放行 http / https。
 */
export function sanitizeLink(raw) {
  const value = `${raw ?? ''}`.trim()
  if (!value) return ''

  // 已经写了协议的：只放行 http / https
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    try {
      const { protocol } = new URL(value)
      return protocol === 'http:' || protocol === 'https:' ? value : ''
    } catch {
      return ''
    }
  }

  // 没写协议的裸域名：补上 https，否则浏览器会当成站内相对路径
  if (!value.includes('.') || /\s/.test(value)) return ''
  try {
    return new URL(`https://${value}`).href
  } catch {
    return ''
  }
}
