/**
 * 服务端同步的 HTTP 客户端。
 * 所有请求都基于「设置」里填写的服务端地址拼出，地址为空时直接抛错，
 * 由调用方提示用户先配置。
 */

/** 请求超时时间（毫秒） */
const DEFAULT_TIMEOUT = 10000

/**
 * 归一化服务端地址：
 * - 去掉首尾空白
 * - 没写协议时默认补 http://
 * - 去掉结尾多余的斜杠
 * @returns {string} 空字符串表示未配置
 */
export function normalizeServerUrl(raw) {
  const trimmed = `${raw ?? ''}`.trim()
  if (!trimmed) return ''

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  return withProtocol.replace(/\/+$/, '')
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'ERROR', payload = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.payload = payload
  }

  /** 版本冲突（上传时服务端已有更新的数据） */
  get isConflict() {
    return this.status === 409 || this.code === 'CONFLICT'
  }

  /** 访问令牌无效 / 未提供 */
  get isUnauthorized() {
    return this.status === 401
  }

  /** 连不上服务端 */
  get isNetworkError() {
    return this.status === 0
  }
}

/**
 * 统一的请求封装：超时、JSON 解析、错误转换。
 * @returns {Promise<any>} 服务端返回的 JSON（无内容时为 null）
 */
export async function request(
  baseUrl,
  path,
  { method = 'GET', body, token, timeout = DEFAULT_TIMEOUT, keepalive = false } = {},
) {
  const base = normalizeServerUrl(baseUrl)
  if (!base) throw new ApiError('未配置服务端地址', { code: 'NO_SERVER' })

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)

  let response
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      // keepalive 用于页面关闭前把最后一次改动送出去
      keepalive,
      signal: controller.signal,
    })
  } catch (error) {
    const aborted = error?.name === 'AbortError'
    throw new ApiError(
      aborted ? '请求超时，请检查服务端地址与网络' : '无法连接服务端，请检查地址与网络',
      { code: aborted ? 'TIMEOUT' : 'NETWORK' },
    )
  } finally {
    window.clearTimeout(timer)
  }

  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    throw new ApiError(payload?.error || `服务端返回 ${response.status}`, {
      status: response.status,
      code: payload?.code || 'HTTP_ERROR',
      payload,
    })
  }

  return payload
}

/** 健康检查 */
export function fetchHealth(baseUrl, token) {
  return request(baseUrl, '/api/health', { token })
}

/** 拉取整份快照 */
export function fetchSnapshot(baseUrl, token) {
  return request(baseUrl, '/api/data', { token })
}

/**
 * 上传整份快照。
 * rev 传数字时做乐观锁冲突检测；传 null 表示强制覆盖（不做校验）。
 */
export function putSnapshot(baseUrl, token, data, rev, { keepalive = false } = {}) {
  return request(baseUrl, '/api/data', {
    method: 'PUT',
    body: { data, rev },
    token,
    keepalive,
  })
}
