import { computed, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next/es/message'

/**
 * 全局连接状态（全在线模式）。
 *
 * 应用以云端数据为唯一数据源，只有「已连上服务端」时才允许编辑，
 * 其余状态一律只读。
 *
 * - connecting   正在连接（启动 / 重试中）
 * - online       已连上，可编辑，改动会自动同步
 * - offline      连不上（网络问题或令牌错误），只读并自动重试
 * - unconfigured 还没填服务端地址，只读
 *
 * 放在普通模块而不是 Pinia store，是为了让 plan / plaza store 能直接读取状态，
 * 又不会和 sync store 形成循环依赖。
 */
export const connectionState = ref('connecting')

export const isOnline = computed(() => connectionState.value === 'online')

/** 非在线状态一律只读 */
export const isReadOnly = computed(() => connectionState.value !== 'online')

export function setConnectionState(next) {
  connectionState.value = next
}

let lastWarnAt = 0
/** 提示节流间隔（毫秒）：拖拽会以帧频触发写操作，不能每次都弹提示 */
const WARN_INTERVAL = 2500

/** 只读状态下尝试编辑时给出提示 */
export function warnReadOnly() {
  const now = Date.now()
  if (now - lastWarnAt < WARN_INTERVAL) return
  lastWarnAt = now

  MessagePlugin.warning(
    connectionState.value === 'unconfigured'
      ? '尚未配置服务端地址，请先到「设置 → 服务端同步」完成配置'
      : '未连接服务端，当前为只读模式，正在自动重试…',
  )
}

/**
 * 所有写操作的统一入口：在线才放行。
 * @returns {boolean} 是否允许写入
 */
export function ensureWritable() {
  if (isOnline.value) return true
  warnReadOnly()
  return false
}
