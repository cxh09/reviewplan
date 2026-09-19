<script setup>
import { computed, ref, watch } from 'vue'
import { DialogPlugin } from 'tdesign-vue-next/es/dialog'
import { MessagePlugin } from 'tdesign-vue-next/es/message'
import {
  CloudDownloadIcon,
  DownloadIcon,
  LinkIcon,
  RefreshIcon,
  UploadIcon,
} from 'tdesign-icons-vue-next'

import pkg from '../../package.json'

import { useAppStore } from '@/stores/app'
import { DEFAULT_GAOKAO_DATE, usePlanStore } from '@/stores/plan'
import { usePlazaStore } from '@/stores/plaza'
import { useSyncStore } from '@/stores/sync'
import { formatCN, todayKey, weekdayCN } from '@/utils/date'

const appStore = useAppStore()
const appVersion = pkg.version
const planStore = usePlanStore()
const plazaStore = usePlazaStore()
const syncStore = useSyncStore()

const gaokaoModel = computed({
  get: () => planStore.gaokaoDate,
  set: (value) => planStore.setGaokaoDate(value),
})

const themeModel = computed({
  get: () => appStore.theme,
  set: (value) => appStore.setTheme(value),
})

const daysText = computed(() => {
  const days = planStore.daysToGaokao
  if (days > 0) return `距离高考还有 ${days} 天`
  if (days === 0) return '今天就是高考'
  return `高考已经过去 ${Math.abs(days)} 天`
})

function restoreDefaultDate() {
  planStore.setGaokaoDate(DEFAULT_GAOKAO_DATE)
  if (syncStore.isOnline) MessagePlugin.success('已恢复默认高考日期')
}

// ---------- 服务端同步 ----------

const serverUrlInput = ref(syncStore.serverUrl)
const accessTokenInput = ref(syncStore.accessToken)
/** 当前进行中的操作：test | reconnect | overwrite，用于按钮 loading */
const action = ref('')

watch(
  () => syncStore.serverUrl,
  (value) => {
    serverUrlInput.value = value
  },
)

/** 把输入框里的地址 / 令牌落到 store（内容没变时 store 内部会跳过） */
function applyInputs() {
  syncStore.setServerUrl(serverUrlInput.value)
  syncStore.setAccessToken(accessTokenInput.value)
}

const CONNECTION_LABELS = {
  online: '已连接',
  connecting: '连接中',
  offline: '连接失败',
  unconfigured: '未配置',
}

const connectionLabel = computed(() => CONNECTION_LABELS[syncStore.connectionState] || '未知')

const connectionTheme = computed(() => {
  if (syncStore.connectionState === 'online') return 'success'
  if (syncStore.connectionState === 'connecting') return 'primary'
  if (syncStore.connectionState === 'unconfigured') return 'warning'
  return 'danger'
})

function pad2(value) {
  return `${value}`.padStart(2, '0')
}

const lastSyncText = computed(() => {
  if (!syncStore.lastSyncAt) return '尚未同步'
  const d = new Date(syncStore.lastSyncAt)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
})

function saveServerConfig() {
  applyInputs()
  MessagePlugin.success(
    syncStore.configured ? '已保存配置，正在连接服务端…' : '已清除服务端地址，应用进入只读模式',
  )
}

async function testConnection() {
  applyInputs()
  if (!syncStore.configured) {
    MessagePlugin.warning('请先填写服务端地址')
    return
  }

  action.value = 'test'
  const result = await syncStore.testConnection()
  action.value = ''
  if (result.ok) {
    MessagePlugin.success(
      `连接成功 · 服务端 v${result.version}${result.auth ? ' · 已开启令牌校验' : ''}`,
    )
  } else {
    MessagePlugin.error(result.unauthorized ? '访问令牌不正确' : `连接失败：${result.error}`)
  }
}

/** 重新连接并按云端数据覆盖本地（也会被断线重试复用） */
async function reconnect() {
  applyInputs()
  if (!syncStore.configured) {
    MessagePlugin.warning('请先填写服务端地址')
    return
  }

  action.value = 'reconnect'
  const result = await syncStore.connect()
  action.value = ''
  if (result.ok) {
    MessagePlugin.success('已同步为云端最新数据')
  } else if (result.queued) {
    // 上一次连接还没结束，已经排队重连，不再报错
    MessagePlugin.info('正在连接中，稍后会自动重试')
  } else if (!result.stale) {
    MessagePlugin.error(result.unauthorized ? '访问令牌不正确' : `连接失败：${result.error}`)
  }
}

function refreshFromCloud() {
  applyInputs()
  if (!syncStore.configured) {
    MessagePlugin.warning('请先填写服务端地址')
    return
  }

  const dialog = DialogPlugin.confirm({
    header: '从云端刷新',
    body: '会丢弃本地缓存，用云端的排版计划、高考日期与广场合集重新覆盖。确认继续？',
    theme: 'warning',
    confirmBtn: { content: '确认刷新' },
    cancelBtn: '取消',
    onConfirm: async () => {
      dialog.hide()
      await reconnect()
    },
  })
}

function clearServerConfig() {
  const dialog = DialogPlugin.confirm({
    header: '清除服务端配置',
    body: '只会清除本机保存的服务端地址与访问令牌，云端数据不会被删除。清除后应用进入只读模式。',
    theme: 'warning',
    confirmBtn: { content: '清除' },
    cancelBtn: '取消',
    onConfirm: () => {
      syncStore.resetConfig()
      serverUrlInput.value = ''
      accessTokenInput.value = ''
      MessagePlugin.success('已清除服务端配置')
      dialog.hide()
    },
  })
}

// ---------- 数据导出 / 导入 / 清空 ----------

const fileInput = ref(null)

function exportJson() {
  // version 直接沿用 planStore 的 DATA_VERSION，避免两处各写一个版本号导致对不上
  const payload = {
    ...JSON.parse(planStore.exportData()),
    collections: plazaStore.exportData(),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `reviewplan-${todayKey()}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // 立刻释放会让部分浏览器的下载被中断，延后再回收
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  MessagePlugin.success('数据已导出为 JSON 文件')
}

function triggerImport() {
  if (!syncStore.isOnline) {
    MessagePlugin.warning('未连接服务端，导入需要在线才能写回云端')
    return
  }
  fileInput.value?.click()
}

async function handleFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const data = JSON.parse(text)
    // 先落到本地视图，再整体覆盖云端
    planStore.importData(data)
    plazaStore.importData(data.collections)

    action.value = 'overwrite'
    const result = await syncStore.overwriteCloud()
    action.value = ''
    if (result.ok) MessagePlugin.success('数据导入成功，并已写入云端')
    else MessagePlugin.error(`导入的数据没能写入云端：${result.error || '请稍后重试'}`)
  } catch (error) {
    MessagePlugin.error(`导入失败：${error.message}`)
  } finally {
    event.target.value = ''
  }
}

function confirmReset() {
  const dialog = DialogPlugin.confirm({
    header: '确认清空所有数据',
    body: '会同时清空云端与本地的排版计划、日程广场合集，并把高考日期恢复为默认值。该操作不可撤销，建议先导出备份。',
    theme: 'warning',
    confirmBtn: { content: '确认清空', theme: 'danger' },
    cancelBtn: '再想想',
    onConfirm: async () => {
      dialog.hide()
      if (!syncStore.isOnline) {
        MessagePlugin.warning('未连接服务端，暂时无法清空')
        return
      }

      planStore.resetAll()
      plazaStore.resetAll()
      action.value = 'overwrite'
      const result = await syncStore.overwriteCloud()
      action.value = ''
      if (result.ok) MessagePlugin.success('本地与云端数据已清空')
      else MessagePlugin.error(`清空失败：${result.error || '请稍后重试'}`)
    },
  })
}
</script>

<template>
  <div class="settings">
    <t-card :bordered="false" class="settings__card">
      <template #title>
        <span class="settings__title">高考设置</span>
      </template>

      <div class="settings__row">
        <div class="settings__label">
          <span class="settings__label-main">高考首日</span>
          <span class="settings__label-tip">倒计时会以这一天为终点计算</span>
        </div>
        <div class="settings__control">
          <t-date-picker
            v-model="gaokaoModel"
            value-type="YYYY-MM-DD"
            format="YYYY-MM-DD"
            class="settings__picker"
          />
          <t-button variant="text" @click="restoreDefaultDate">恢复默认</t-button>
        </div>
      </div>

      <div class="settings__preview">
        <div class="settings__preview-number">{{ Math.max(planStore.daysToGaokao, 0) }}</div>
        <div class="settings__preview-text">
          <span>{{ daysText }}</span>
          <span class="settings__preview-sub">
            {{ formatCN(planStore.gaokaoDate) }} · {{ weekdayCN(planStore.gaokaoDate) }}
          </span>
        </div>
      </div>
    </t-card>

    <t-card :bordered="false" class="settings__card">
      <template #title>
        <span class="settings__title">复习偏好</span>
      </template>

      <div class="settings__row">
        <div class="settings__label">
          <span class="settings__label-main">界面主题</span>
          <span class="settings__label-tip">深色模式适合夜间复习</span>
        </div>
        <div class="settings__control">
          <t-radio-group v-model="themeModel" variant="default-filled">
            <t-radio-button value="light">浅色</t-radio-button>
            <t-radio-button value="dark">深色</t-radio-button>
          </t-radio-group>
        </div>
      </div>
    </t-card>

    <t-card :bordered="false" class="settings__card">
      <template #title>
        <span class="settings__title">服务端同步</span>
      </template>

      <t-alert
        v-if="!syncStore.configured"
        class="settings__alert"
        theme="warning"
        message="还没有配置服务端地址。应用采用全在线模式：数据以云端为准，必须连上服务端才能编辑，未配置时只能查看本地缓存。"
      />

      <div class="settings__row">
        <div class="settings__label">
          <span class="settings__label-main">服务端地址</span>
          <span class="settings__label-tip">
            默认与当前网页同源（服务端同时托管页面与 API）；连接其它服务器时再改，例如
            http://192.168.1.10:3000
          </span>
        </div>
        <div class="settings__control settings__control--wide">
          <t-input
            v-model="serverUrlInput"
            class="settings__input"
            placeholder="http://localhost:3000"
            clearable
            @blur="applyInputs"
          />
        </div>
      </div>

      <div class="settings__row">
        <div class="settings__label">
          <span class="settings__label-main">访问令牌</span>
          <span class="settings__label-tip">需要手动填写，与服务端 ACCESS_TOKEN 保持一致</span>
        </div>
        <div class="settings__control settings__control--wide">
          <t-input
            v-model="accessTokenInput"
            class="settings__input"
            type="password"
            placeholder="可选"
            @blur="applyInputs"
          />
        </div>
      </div>

      <div class="settings__sync-status">
        <t-tag :theme="connectionTheme" variant="light">{{ connectionLabel }}</t-tag>
        <span class="settings__sync-text">{{ syncStore.message || '等待操作' }}</span>
        <span class="settings__sync-text">最后同步：{{ lastSyncText }}</span>
        <span class="settings__sync-text">数据版本：{{ syncStore.rev }}</span>
      </div>

      <div class="settings__actions">
        <t-button theme="primary" :disabled="!syncStore.configured" @click="saveServerConfig">
          保存配置
        </t-button>
        <t-button
          theme="success"
          variant="outline"
          :loading="action === 'test'"
          :disabled="!syncStore.configured || action !== ''"
          @click="testConnection"
        >
          <template #icon><LinkIcon /></template>
          测试连接
        </t-button>
        <t-button
          theme="default"
          variant="outline"
          :loading="action === 'reconnect'"
          :disabled="!syncStore.configured || action !== ''"
          @click="refreshFromCloud"
        >
          <template #icon><CloudDownloadIcon /></template>
          从云端刷新
        </t-button>
        <t-button theme="danger" variant="text" :disabled="action !== ''" @click="clearServerConfig">
          清除配置
        </t-button>
      </div>

      <p class="settings__note">
        全在线模式：排版计划、高考日期与日程广场合集都以服务端为准，任何改动都会立即上传；连不上服务端时进入只读并每 3 秒自动重试；多端同时改动会按条目自动合并（同一条谁的时间戳新谁生效），只有在合不上时才退回以云端为准。浏览器里只保留一份用于首屏快速渲染的缓存。
      </p>
    </t-card>

    <t-card :bordered="false" class="settings__card">
      <template #title>
        <span class="settings__title">数据管理</span>
      </template>

      <t-row :gutter="[16, 16]" class="settings__stats">
        <t-col :xs="6" :md="6">
          <div class="settings__stat">
            <span class="settings__stat-value">{{ planStore.planCount - planStore.donePlanCount }}</span>
            <span class="settings__stat-label">未完成</span>
          </div>
        </t-col>
        <t-col :xs="6" :md="6">
          <div class="settings__stat">
            <span class="settings__stat-value">{{ planStore.planCount }}</span>
            <span class="settings__stat-label">排版计划</span>
          </div>
        </t-col>
        <t-col :xs="6" :md="6">
          <div class="settings__stat">
            <span class="settings__stat-value">{{ plazaStore.itemCount }}</span>
            <span class="settings__stat-label">广场日程</span>
          </div>
        </t-col>
        <t-col :xs="6" :md="6">
          <div class="settings__stat">
            <span class="settings__stat-value">{{ planStore.completionRate }}%</span>
            <span class="settings__stat-label">完成率</span>
          </div>
        </t-col>
      </t-row>

      <div class="settings__actions">
        <t-button theme="primary" variant="outline" @click="exportJson">
          <template #icon><DownloadIcon /></template>
          导出数据
        </t-button>
        <t-button theme="default" variant="outline" @click="triggerImport">
          <template #icon><UploadIcon /></template>
          导入数据
        </t-button>
        <t-button theme="danger" variant="outline" @click="confirmReset">
          <template #icon><RefreshIcon /></template>
          清空数据
        </t-button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="settings__file"
          @change="handleFileChange"
        />
      </div>

      <p class="settings__note">
        导出的就是当前云端数据，可作为额外备份；导入会把文件内容直接覆盖写入云端；清空会同时清掉云端数据。日常使用时数据始终由服务端保存，浏览器中的副本仅用于首屏渲染。
      </p>
    </t-card>

    <t-card :bordered="false" class="settings__card">
      <template #title>
        <span class="settings__title">关于</span>
      </template>
      <t-descriptions :column="2" bordered>
        <t-descriptions-item label="应用名称">复习清单</t-descriptions-item>
        <t-descriptions-item label="版本">{{ appVersion }}</t-descriptions-item>
        <t-descriptions-item label="技术栈">Vue 3 · Vite · Pinia · Vue Router</t-descriptions-item>
        <t-descriptions-item label="UI 组件库">TDesign Vue Next</t-descriptions-item>
      </t-descriptions>
    </t-card>
  </div>
</template>

<style scoped>
.settings__card {
  margin-bottom: 16px;
}

.settings__title {
  font-size: 15px;
  font-weight: 600;
}

.settings__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 0;
  flex-wrap: wrap;
}

.settings__label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings__label-main {
  font-size: 14px;
  font-weight: 500;
}

.settings__label-tip {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.settings__control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings__picker {
  width: 180px;
}

.settings__alert {
  margin-bottom: 16px;
}

.settings__control--wide {
  flex: 1;
  min-width: 220px;
  justify-content: flex-end;
}

.settings__input {
  width: 320px;
  max-width: 100%;
}

.settings__sync-status {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin: 16px 0;
  padding: 12px 16px;
  border-radius: var(--td-radius-medium);
  background-color: var(--td-bg-color-secondarycontainer);
}

.settings__sync-text {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.settings__preview {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-radius: var(--td-radius-large);
  background-image: linear-gradient(135deg, rgb(0 82 217 / 8%), rgb(0 168 112 / 6%));
}

.settings__preview-number {
  font-size: 40px;
  font-weight: 700;
  line-height: 1;
  background: linear-gradient(135deg, #0052d9, #00a870);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.settings__preview-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}

.settings__preview-sub {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.settings__stats {
  margin-bottom: 20px;
}

.settings__stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border-radius: var(--td-radius-medium);
  background-color: var(--td-bg-color-secondarycontainer);
}

.settings__stat-value {
  font-size: 22px;
  font-weight: 700;
}

.settings__stat-label {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.settings__actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.settings__file {
  display: none;
}

.settings__note {
  margin: 16px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-placeholder);
}
</style>
