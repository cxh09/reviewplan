<script setup>
import { computed, ref } from 'vue'
import { DialogPlugin } from 'tdesign-vue-next/es/dialog'
import { MessagePlugin } from 'tdesign-vue-next/es/message'
import { DownloadIcon, RefreshIcon, UploadIcon } from 'tdesign-icons-vue-next'

import pkg from '../../package.json'

import { useAppStore } from '@/stores/app'
import { DEFAULT_GAOKAO_DATE, usePlanStore } from '@/stores/plan'
import { usePlazaStore } from '@/stores/plaza'
import { formatCN, todayKey, weekdayCN } from '@/utils/date'

const appStore = useAppStore()
const appVersion = pkg.version
const planStore = usePlanStore()
const plazaStore = usePlazaStore()

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
  MessagePlugin.success('已恢复默认高考日期')
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
  fileInput.value?.click()
}

async function handleFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const data = JSON.parse(text)
    planStore.importData(data)
    plazaStore.importData(data.collections)
    MessagePlugin.success('数据导入成功')
  } catch (error) {
    MessagePlugin.error(`导入失败：${error.message}`)
  } finally {
    event.target.value = ''
  }
}

function confirmReset() {
  const dialog = DialogPlugin.confirm({
    header: '确认清空所有数据',
    body: '将删除全部待办清单、排版计划与日程广场的系列合集，并把高考日期恢复为默认值。该操作不可撤销，建议先导出备份。',
    theme: 'warning',
    confirmBtn: { content: '确认清空', theme: 'danger' },
    cancelBtn: '再想想',
    onConfirm: () => {
      planStore.resetAll()
      plazaStore.resetAll()
      MessagePlugin.success('数据已清空')
      dialog.hide()
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
        <span class="settings__title">数据管理</span>
      </template>

      <t-row :gutter="[16, 16]" class="settings__stats">
        <t-col :xs="6" :md="6">
          <div class="settings__stat">
            <span class="settings__stat-value">{{ planStore.todoCount }}</span>
            <span class="settings__stat-label">待办清单</span>
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
        数据保存在浏览器的 localStorage 中，换设备或清理浏览器数据前请先导出备份。
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
