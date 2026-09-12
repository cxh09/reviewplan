import { writeJSON } from './storage'

/**
 * 带防抖的持久化写入器。
 *
 * 拖拽拉伸这类操作会以帧频修改数据，如果每次变更都全量序列化并同步写 localStorage，
 * 主线程会被拖垮。这里统一按 delay 合并写入；同时模块级注册一次
 * beforeunload / pagehide / visibilitychange 钩子，在页面关闭或切到后台前
 * 把还没落盘的变更补写出去，避免「改完立刻关页面丢数据」。
 */

const DEFAULT_DELAY = 300

/** 所有创建过的写入器，flush 时统一遍历 */
const writers = new Set()
let hooksBound = false

function flushAll() {
  writers.forEach((writer) => writer.flush())
}

function bindGlobalFlush() {
  if (hooksBound || typeof window === 'undefined') return
  hooksBound = true

  window.addEventListener('beforeunload', flushAll)
  // iOS Safari 等环境下 beforeunload 不触发，pagehide 更可靠
  window.addEventListener('pagehide', flushAll)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll()
  })
}

/**
 * @param {string} key 存储键
 * @param {() => any} snapshotFn 取当前数据快照的函数，延迟到真正写入时才调用
 * @param {number} delay 防抖时间（毫秒）
 */
export function createDebouncedWriter(key, snapshotFn, delay = DEFAULT_DELAY) {
  let timer = null

  function writeNow() {
    // 先清 timer，即便写入失败也不会留下一个永不触发的定时器
    timer = null
    writeJSON(key, snapshotFn())
  }

  const writer = {
    /** 调度一次写入，delay 内的重复调用会被合并 */
    schedule() {
      if (timer !== null) return
      timer = window.setTimeout(writeNow, delay)
    },
    /** 立即落盘（有挂起的写入才执行） */
    flush() {
      if (timer === null) return
      window.clearTimeout(timer)
      writeNow()
    },
  }

  writers.add(writer)
  bindGlobalFlush()

  return writer
}
