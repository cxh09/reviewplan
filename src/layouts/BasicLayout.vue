<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  CalendarIcon,
  HomeIcon,
  MoonIcon,
  QueueIcon,
  SettingIcon,
  SunnyIcon,
} from 'tdesign-icons-vue-next'

import { useAppStore } from '@/stores/app'
import { usePlanStore } from '@/stores/plan'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const planStore = usePlanStore()

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
          <span class="basic-layout__logo">复</span>
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #0052d9, #00a870);
}

.basic-layout__title {
  font-size: 16px;
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
  font-size: 18px;
}

.basic-layout__countdown {
  margin-right: 4px;
  font-size: 13px;
}

.basic-layout__content {
  flex: 1;
  padding: 24px 0 40px;
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
