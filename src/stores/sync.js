import { computed, nextTick, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { MessagePlugin } from 'tdesign-vue-next/es/message'

import { DATA_VERSION, usePlanStore } from '@/stores/plan'
import { usePlazaStore } from '@/stores/plaza'
import { fetchHealth, fetchSnapshot, normalizeServerUrl, putSnapshot } from '@/utils/api'
import { connectionState, isOnline, setConnectionState } from '@/utils/connection'
import { mergeSnapshots } from '@/utils/merge'
import { readJSON, writeJSON } from '@/utils/storage'
import { activeTombstones } from '@/utils/tombstone'

const STORAGE_KEY = 'reviewplan:server:v1'

/** 改动合并窗口（毫秒）：拖拽 / 拉伸会以帧频改数据，攒一下再发，避免打满请求 */
const PUSH_DELAY = 300

/** 断线重试间隔（毫秒） */
const RETRY_DELAY = 3000

function loadPersisted() {
  const data = readJSON(STORAGE_KEY, {})
  return data && typeof data === 'object' ? data : {}
}

/**
 * 云端数据源。
 *
 * 全在线模式：待办 / 计划 / 高考日期 / 日程广场合集都以服务端为准。
 * - 启动先按本地缓存渲染，随后 connect() 拉取云端覆盖；
 * - 连不上时进入只读，并每隔几秒自动重试；
 * - 在线期间任何改动都会自动上传（合并 300ms 内的连续改动）；
 * - 版本冲突（409）不丢改动：拉云端快照与本地按条目（last-write-wins）合并后重推，
 *   合并依赖条目上的 updatedAt 与删除标记，见 utils/merge.js、utils/tombstone.js。
 */
export const useSyncStore = defineStore('sync', () => {
  const persisted = loadPersisted()

  const serverUrl = ref(persisted.serverUrl || '')
  const accessToken = ref(persisted.accessToken || '')
  const lastSyncAt = ref(Number(persisted.lastSyncAt) || 0)
  const rev = ref(Number(persisted.rev) || 0)
  const message = ref('')
  const error = ref('')
  const testing = ref(false)

  const normalizedUrl = computed(() => normalizeServerUrl(serverUrl.value))
  const configured = computed(() => Boolean(normalizedUrl.value))

  const connectionMessage = computed(() => {
    switch (connectionState.value) {
      case 'online':
        return ''
      case 'connecting':
        return '正在连接服务端…'
      case 'unconfigured':
        return '尚未配置服务端地址，当前为只读模式'
      default:
        return error.value
          ? `无法连接服务端（${error.value}），正在自动重试…当前为只读模式`
          : '无法连接服务端，正在自动重试…当前为只读模式'
    }
  })

  // ---------- 内部状态 ----------

  /** 最近一次与云端一致的数据指纹：内容没变就跳过推送 */
  let syncedJson = ''
  /** 应用云端数据期间挂起推送，避免把自己的回写当成用户改动 */
  let suppressPush = false
  let pushTimer = null
  let pushInFlight = false
  let pushAgain = false
  let retryTimer = null
  let connecting = false
  /** 连接过程中又被要求连接（改了地址 / 点了刷新）：本次结束后补做一次 */
  let reconnectQueued = false
  /**
   * 上次同步成功时用的服务端地址。
   * 本地缓存只有在地址没变时才和这个服务端对得上，这时才敢做合并，
   * 否则会把上一个服务端的数据混进来。
   */
  let syncedUrl = persisted.lastSyncedUrl || ''

  function persist() {
    writeJSON(STORAGE_KEY, {
      serverUrl: serverUrl.value,
      accessToken: accessToken.value,
      lastSyncAt: lastSyncAt.value,
      rev: rev.value,
      lastSyncedUrl: syncedUrl,
    })
  }

  function clearRetry() {
    if (retryTimer === null) return
    window.clearTimeout(retryTimer)
    retryTimer = null
  }

  function scheduleRetry() {
    if (retryTimer !== null) return
    retryTimer = window.setTimeout(() => {
      retryTimer = null
      void connect()
    }, RETRY_DELAY)
  }

  function clearPushTimer() {
    if (pushTimer === null) return
    window.clearTimeout(pushTimer)
    pushTimer = null
  }

  // ---------- 数据快照 ----------

  function buildPayload() {
    const planStore = usePlanStore()
    const plazaStore = usePlazaStore()
    return {
      gaokaoDate: planStore.gaokaoDate,
      gaokaoDateUpdatedAt: planStore.gaokaoDateUpdatedAt,
      todos: JSON.parse(JSON.stringify(planStore.todos)),
      plans: JSON.parse(JSON.stringify(planStore.plans)),
      collections: plazaStore.exportData(),
      deleted: activeTombstones(),
    }
  }

  /** 把云端数据写进各 store（不经过只读校验，这是权威数据） */
  async function applyRemote(data) {
    suppressPush = true
    try {
      const planStore = usePlanStore()
      const plazaStore = usePlazaStore()
      planStore.importData({
        version: DATA_VERSION,
        gaokaoDate: data?.gaokaoDate,
        gaokaoDateUpdatedAt: data?.gaokaoDateUpdatedAt,
        todos: data?.todos,
        plans: data?.plans,
        deleted: data?.deleted,
      })
      if (Array.isArray(data?.collections)) plazaStore.importData(data.collections)
      // 等 watch 回调跑完再解除挂起，确保这次变更不会被当成用户改动推回去
      await nextTick()
    } finally {
      suppressPush = false
    }
  }

  // ---------- 连接 ----------

  /**
   * 连接并全量拉取云端数据。启动、断线重试、手动刷新都走这里。
   */
  async function connect() {
    if (!configured.value) {
      setConnectionState('unconfigured')
      return { ok: false, error: '未配置服务端地址' }
    }

    // 已有连接在进行：排队补做一次，避免「手动刷新」变成无声的空操作
    if (connecting) {
      reconnectQueued = true
      return { ok: false, queued: true }
    }

    // 记下本次请求用的地址 / 令牌，回来时用它判断结果是否已经过期
    const url = normalizedUrl.value
    const token = accessToken.value

    clearPushTimer()
    connecting = true
    setConnectionState('connecting')

    try {
      const snapshot = await fetchSnapshot(url, token)

      // 请求期间地址或令牌被改过，这次结果作废（排队的那次会用新配置重连）
      if (url !== normalizedUrl.value || token !== accessToken.value) {
        return { ok: false, stale: true }
      }

      // 服务端还没有数据时保留本地缓存，等用户第一次改动再整体上传
      let merged = null
      if (snapshot.data) {
        // 本地缓存还属于这个服务端时做一次合并，把上一次没推上去的改动救回来；
        // 换了服务端就直接以云端为准，免得把上一个服务端的数据混进来
        const canMerge = syncedUrl === url && Number(snapshot.rev) > 0
        merged = canMerge ? mergeSnapshots(buildPayload(), snapshot.data) : snapshot.data
        await applyRemote(merged)
      }

      rev.value = Number(snapshot.rev) || 0
      if (snapshot.updatedAt) lastSyncAt.value = Date.parse(snapshot.updatedAt) || Date.now()
      syncedUrl = url

      // 合并结果比云端新（本地有没推上去的改动）时，把指纹记成云端那份，
      // 让随后的 schedulePush 把合并结果补推上去
      const localJson = JSON.stringify(buildPayload())
      const mergedJson = merged ? JSON.stringify(merged) : ''
      syncedJson =
        mergedJson && mergedJson !== localJson ? JSON.stringify(snapshot.data) : localJson
      persist()

      setConnectionState('online')
      error.value = ''
      message.value = `已连接云端 · 版本 ${rev.value}`
      clearRetry()
      schedulePush()
      return { ok: true, rev: rev.value }
    } catch (err) {
      if (err.isUnauthorized) {
        // 令牌不对时重试没有意义，停掉自动重试，等用户去设置里改
        error.value = '访问令牌不正确，请在「设置 → 服务端同步」里检查'
        message.value = error.value
        setConnectionState('offline')
        clearRetry()
        return { ok: false, error: error.value, unauthorized: true }
      }

      setConnectionState('offline')
      error.value = err.message
      message.value = err.message
      scheduleRetry()
      return { ok: false, error: err.message }
    } finally {
      connecting = false
      if (reconnectQueued) {
        reconnectQueued = false
        // 放到下一个 tick，避免和本次收尾逻辑交错
        window.setTimeout(() => void connect(), 0)
      }
    }
  }

  /** 只探活 + 校验令牌，不改动本地数据 */
  async function testConnection() {
    if (!configured.value) return { ok: false, error: '未配置服务端地址' }

    testing.value = true
    try {
      const health = await fetchHealth(normalizedUrl.value, accessToken.value)
      await fetchSnapshot(normalizedUrl.value, accessToken.value)
      return { ok: true, version: health.version, auth: health.auth }
    } catch (err) {
      return { ok: false, error: err.message, unauthorized: err.isUnauthorized }
    } finally {
      testing.value = false
    }
  }

  // ---------- 推送 ----------

  function schedulePush() {
    if (suppressPush || !isOnline.value) return
    if (pushTimer !== null) return
    pushTimer = window.setTimeout(() => {
      pushTimer = null
      void pushNow()
    }, PUSH_DELAY)
  }

  /**
   * 把当前数据上传到服务端。
   * @param {{ force?: boolean, keepalive?: boolean }} options
   *   force=true 时不做冲突检测，直接覆盖云端（导入 / 清空数据用）
   */
  async function pushNow({ force = false, keepalive = false } = {}) {
    if (!configured.value) return { ok: false, error: '未配置服务端地址' }
    if (!force && !isOnline.value) return { ok: false, error: '当前离线' }

    if (pushInFlight) {
      pushAgain = true
      return { ok: false, busy: true }
    }

    const payload = buildPayload()
    const json = JSON.stringify(payload)
    // 内容与云端一致就不发请求，避免因为拉取后的归一化产生无意义的写入
    if (!force && json === syncedJson) return { ok: true, skipped: true }

    pushInFlight = true
    try {
      const result = await putSnapshot(
        normalizedUrl.value,
        accessToken.value,
        payload,
        force ? null : rev.value,
        { keepalive },
      )

      rev.value = Number(result.rev) || rev.value
      lastSyncAt.value = Date.parse(result.updatedAt) || Date.now()
      syncedJson = json
      setConnectionState('online')
      error.value = ''
      message.value = `已同步到云端 · 版本 ${rev.value}`
      persist()
      return { ok: true, rev: rev.value }
    } catch (err) {
      if (err.isConflict) return resolveConflict()

      error.value = err.isUnauthorized
        ? '访问令牌不正确，请在「设置 → 服务端同步」里检查'
        : err.message
      message.value = error.value
      setConnectionState('offline')
      // 令牌错误重试也没用，等用户改配置；其它错误才自动重连
      if (err.isUnauthorized) clearRetry()
      else scheduleRetry()
      return { ok: false, error: error.value, unauthorized: err.isUnauthorized }
    } finally {
      pushInFlight = false
      if (pushAgain) {
        pushAgain = false
        schedulePush()
      }
    }
  }

  /**
   * 版本冲突：拉云端最新快照，与本地按条目合并后重新上传。
   * 这样两端各改各的都不会互相覆盖；一直合不上才退化为「以云端为准」，保证两端最终一致。
   * @param {number} attempt 已重试次数
   */
  async function resolveConflict(attempt = 0) {
    const url = normalizedUrl.value
    const token = accessToken.value

    try {
      const snapshot = await fetchSnapshot(url, token)
      const remote = snapshot.data

      // 云端空着：直接把本地整份推上去
      if (!remote) {
        const local = buildPayload()
        const result = await putSnapshot(url, token, local, null)
        rev.value = Number(result.rev) || rev.value
        lastSyncAt.value = Date.parse(result.updatedAt) || Date.now()
        syncedJson = JSON.stringify(local)
        syncedUrl = url
        persist()
        return { ok: true, rev: rev.value }
      }

      const merged = mergeSnapshots(buildPayload(), remote)
      await applyRemote(merged)

      const result = await putSnapshot(url, token, merged, Number(snapshot.rev) || 0)
      rev.value = Number(result.rev) || rev.value
      lastSyncAt.value = Date.parse(result.updatedAt) || Date.now()
      syncedJson = JSON.stringify(merged)
      syncedUrl = url
      persist()

      MessagePlugin.info('数据已被其它设备修改，已自动合并双方的改动')
      return { ok: true, rev: rev.value, merged: true }
    } catch (error) {
      // 合并期间又有别的设备提交，再合一次
      if (error.isConflict && attempt < 2) return resolveConflict(attempt + 1)

      // 实在合不上：退回「以云端为准」，至少保证两端一致
      const pulled = await connect()
      if (pulled.ok) MessagePlugin.warning('数据已被其它设备修改，已同步为云端最新版本')
      return { ok: false, conflict: true, error: error.message }
    }
  }

  /** 用本地当前数据强制覆盖云端（不做冲突检测） */
  function overwriteCloud() {
    clearPushTimer()
    return pushNow({ force: true })
  }

  /** 页面关闭 / 切到后台前，把还没发出去的改动补发出去 */
  function flushPending() {
    if (pushTimer === null) return
    clearPushTimer()
    void pushNow({ keepalive: true })
  }

  // ---------- 配置 ----------

  function setServerUrl(value) {
    const next = `${value ?? ''}`.trim()
    if (next === serverUrl.value) return

    serverUrl.value = next
    // 换了服务端，版本号、指纹都作废；本地缓存也不再属于新地址，不能参与合并
    rev.value = 0
    syncedUrl = ''
    syncedJson = ''
    message.value = ''
    error.value = ''
    persist()
    clearRetry()
    clearPushTimer()

    if (next) void connect()
    else setConnectionState('unconfigured')
  }

  function setAccessToken(value) {
    const next = `${value ?? ''}`.trim()
    if (next === accessToken.value) return

    accessToken.value = next
    persist()
    clearRetry()
    // 令牌可能填错了，换完立刻重连一次
    if (serverUrl.value) void connect()
  }

  function resetConfig() {
    serverUrl.value = ''
    accessToken.value = ''
    rev.value = 0
    lastSyncAt.value = 0
    syncedUrl = ''
    syncedJson = ''
    message.value = ''
    error.value = ''
    clearRetry()
    clearPushTimer()
    setConnectionState('unconfigured')
    persist()
  }

  // ---------- 自动同步 ----------

  const planStore = usePlanStore()
  const plazaStore = usePlazaStore()
  watch(
    [() => planStore.gaokaoDate, planStore.todos, planStore.plans, plazaStore.collections],
    schedulePush,
    { deep: true },
  )

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushPending)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushPending()
    })
  }

  return {
    // state
    serverUrl,
    accessToken,
    connectionState,
    lastSyncAt,
    rev,
    message,
    error,
    testing,
    // getters
    normalizedUrl,
    configured,
    isOnline,
    connectionMessage,
    // actions
    connect,
    testConnection,
    pushNow,
    overwriteCloud,
    flushPending,
    setServerUrl,
    setAccessToken,
    resetConfig,
  }
})
