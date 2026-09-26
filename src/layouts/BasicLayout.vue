<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  CalendarIcon,
  ErrorCircleIcon,
  HomeIcon,
  InfoCircleIcon,
  LoadingIcon,
  MoonIcon,
  QueueIcon,
  SettingIcon,
  SunnyIcon,
} from 'tdesign-icons-vue-next'

import { useAppStore } from '@/stores/app'
import { usePlanStore } from '@/stores/plan'
import { useSyncStore } from '@/stores/sync'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const planStore = usePlanStore()
const syncStore = useSyncStore()

// 启动即连接云端：拿到权威数据后才允许编辑，连不上会进入只读并自动重试
void syncStore.connect()

const noticeTheme = computed(() => {
  if (syncStore.connectionState === 'unconfigured') return 'warning'
  if (syncStore.connectionState === 'connecting') return 'info'
  return 'danger'
})

const noticeActionText = computed(() => {
  if (syncStore.connectionState === 'unconfigured') return '去设置'
  if (syncStore.connectionState === 'offline') return '立即重试'
  return ''
})

function handleNoticeAction() {
  if (syncStore.connectionState === 'unconfigured') {
    router.push('/settings')
    return
  }
  void syncStore.connect()
}

const menus = [
  { value: '/home', label: '首页', icon: HomeIcon },
  { value: '/schedule', label: '日程表', icon: CalendarIcon },
  { value: '/plaza', label: '日程广场', icon: QueueIcon },
  { value: '/settings', label: '设置', icon: SettingIcon },
]

const activeMenu = computed(() => route.path)

const countdownText = computed(() => {
  const days = planStore.daysToGaokao
  if (days > 0) return `距高考 ${days} 天`
  if (days === 0) return '高考就在今天'
  return `高考已过 ${Math.abs(days)} 天`
})

function handleMenuChange(value) {
  if (value !== route.path) {
    router.push(value)
  }
}
</script>

<template>
  <t-layout class="basic-layout">
    <t-header class="basic-layout__header">
      <div class="page-container basic-layout__bar">
        <div class="basic-layout__brand" @click="router.push('/home')">
          <img class="basic-layout__logo" src="/favicon.svg" alt="复习清单图标" />
          <span class="basic-layout__title">复习清单</span>
        </div>

        <t-head-menu
          :value="activeMenu"
          :theme="appStore.isDark ? 'dark' : 'light'"
          class="basic-layout__menu"
          @change="handleMenuChange"
        >
          <t-menu-item v-for="item in menus" :key="item.value" :value="item.value">
            <template #icon>
              <component :is="item.icon" />
            </template>
            {{ item.label }}
          </t-menu-item>
        </t-head-menu>

        <div class="basic-layout__actions">
          <t-tag theme="primary" variant="light" class="basic-layout__countdown">
            {{ countdownText }}
          </t-tag>

          <t-tooltip :content="appStore.isDark ? '切换到浅色模式' : '切换到深色模式'">
            <t-button variant="text" shape="square" @click="appStore.toggleTheme()">
              <template #icon>
                <MoonIcon v-if="!appStore.isDark" />
                <SunnyIcon v-else />
              </template>
            </t-button>
          </t-tooltip>
        </div>
      </div>
    </t-header>

    <div
      v-if="syncStore.connectionState !== 'online'"
      class="basic-layout__notice"
      :class="`basic-layout__notice--${noticeTheme}`"
    >
      <div class="page-container basic-layout__notice-inner">
        <LoadingIcon
          v-if="syncStore.connectionState === 'connecting'"
          class="basic-layout__spin"
        />
        <ErrorCircleIcon v-else-if="syncStore.connectionState === 'offline'" />
        <InfoCircleIcon v-else />
        <span class="basic-layout__notice-text">{{ syncStore.connectionMessage }}</span>
        <t-button
          v-if="noticeActionText"
          size="small"
          variant="text"
          theme="primary"
          @click="handleNoticeAction"
        >
          {{ noticeActionText }}
        </t-button>
      </div>
    </div>

    <t-content class="basic-layout__content">
      <div class="page-container">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </t-content>
  </t-layout>
</template>

<style scoped>
.basic-layout {
  min-height: 100vh;
  background-color: var(--td-bg-color-page);
}

.basic-layout__header {
  height: 64px;
  padding: 0;
  background-color: var(--td-bg-color-container);
  border-bottom: 1px solid var(--td-component-stroke);
  box-shadow: 0 1px 2px rgb(0 0 0 / 3%);
}

.basic-layout__bar {
  display: flex;
  align-items: center;
  height: 64px;
  gap: 24px;
}

.basic-layout__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  flex-shrink: 0;
}

.basic-layout__logo {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
  display: block;
}

.basic-layout__title {
  font-size: 24px;
  font-weight: 600;
  white-space: nowrap;
}

.basic-layout__menu {
  flex: 1;
  min-width: 0;
  background-color: transparent;
}

.basic-layout__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: 27px;
}

.basic-layout__countdown {
  margin-right: 4px;
  font-size: 20px;
}

.basic-layout__content {
  flex: 1;
  padding: 24px 0 40px;
}

.basic-layout__notice {
  font-size: 20px;
  border-bottom: 1px solid var(--td-component-stroke);
}

.basic-layout__notice-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 9px;
  padding-bottom: 9px;
}

.basic-layout__notice-text {
  flex: 1;
  min-width: 0;
}

.basic-layout__notice--info {
  color: var(--td-brand-color);
  background-color: var(--td-brand-color-light);
}

.basic-layout__notice--warning {
  color: var(--td-warning-color);
  background-color: var(--td-warning-color-light);
}

.basic-layout__notice--danger {
  color: var(--td-error-color);
  background-color: var(--td-error-color-light);
}

.basic-layout__spin {
  animation: basic-layout-spin 1s linear infinite;
}

@keyframes basic-layout-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .basic-layout__title,
  .basic-layout__countdown {
    display: none;
  }

  .basic-layout__bar {
    gap: 12px;
  }
}
</style>
