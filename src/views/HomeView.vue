<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { CheckCircleIcon, ChevronRightIcon } from 'tdesign-icons-vue-next'

import { categoryColor } from '@/data/plaza'
import { usePlanStore } from '@/stores/plan'
import { formatCN, formatHour, isToday, weekdayCN } from '@/utils/date'

const router = useRouter()
const planStore = usePlanStore()

const daysLeft = computed(() => Math.max(planStore.daysToGaokao, 0))

const countdownLabel = computed(() => {
  const days = planStore.daysToGaokao
  if (days > 0) return `距离 ${planStore.gaokaoDate.slice(0, 4)} 年高考还有`
  if (days === 0) return '今天就是高考'
  return '高考已经结束'
})

const motivateText = computed(() => {
  const days = planStore.daysToGaokao
  if (days > 200) return '一轮复习阶段，把每一天的计划落到实处，比什么都重要。'
  if (days > 100) return '基础已经打得差不多了，接下来是查漏补缺的关键期。'
  if (days > 30) return '进入冲刺阶段，稳住节奏比盲目刷更多题更重要。'
  if (days > 0) return '最后阶段，回归错题与课本，保持手感。'
  return '这一段旅程结束了，好好休息。'
})

const statCards = computed(() => [
  { title: '未完成', value: planStore.planCount - planStore.donePlanCount, unit: '项' },
  { title: '已排计划', value: planStore.planCount, unit: '项' },
  { title: '已完成', value: planStore.donePlanCount, unit: '项' },
  { title: '本周完成率', value: planStore.weekStats.rate, unit: '%' },
])
</script>

<template>
  <div class="home">
    <t-card :bordered="false" class="home__hero">
      <p class="home__hero-label">{{ countdownLabel }}</p>
      <div class="home__hero-number">
        <span class="home__hero-value">{{ daysLeft }}</span>
        <span class="home__hero-unit">天</span>
      </div>
      <p class="home__hero-target">
        目标日期 {{ formatCN(planStore.gaokaoDate) }} · {{ weekdayCN(planStore.gaokaoDate) }}
      </p>
      <p class="home__hero-motd">{{ motivateText }}</p>
    </t-card>

    <t-row :gutter="[16, 16]" class="home__section">
      <t-col v-for="item in statCards" :key="item.title" :xs="12" :md="6">
        <t-card :bordered="false" hover-shadow class="home__stat">
          <t-statistic :title="item.title" :value="item.value" :unit="item.unit" />
        </t-card>
      </t-col>
    </t-row>

    <t-card :bordered="false" class="home__section home__plans-card">
      <template #title>
        <div class="home__section-title">
          <span>我的排版计划</span>
          <t-tag size="small" variant="light">未来 7 天</t-tag>
        </div>
      </template>
      <template #actions>
        <t-button variant="text" @click="router.push('/schedule')">
          在日程表中查看
          <template #suffix><ChevronRightIcon /></template>
        </t-button>
      </template>

      <t-empty
        v-if="!planStore.upcomingGroups.length"
        title="还没有排版计划"
        description="点日程表右上角的「+」打开日程广场，挑几条日程直接拖到时间线上排班"
      >
        <template #action>
          <t-button theme="primary" @click="router.push('/schedule')">去日程表排班</t-button>
        </template>
      </t-empty>

      <div v-else class="home__groups">
        <div v-for="group in planStore.upcomingGroups" :key="group.date" class="home__group">
          <div class="home__group-head">
            <span class="home__group-date">{{ formatCN(group.date) }}</span>
            <t-tag
              size="small"
              variant="light"
              :theme="isToday(group.date) ? 'primary' : 'default'"
            >
              {{ isToday(group.date) ? '今天' : weekdayCN(group.date) }}
            </t-tag>
            <span class="home__group-count">{{ group.items.length }} 项</span>
          </div>

          <div class="home__plan-list">
            <div
              v-for="plan in group.items"
              :key="plan.id"
              class="home__plan"
              :class="{ 'is-done': plan.done }"
            >
              <span
                class="home__plan-bar"
                :style="{ backgroundColor: categoryColor(plan.category) }"
              />
              <span class="home__plan-time">{{ formatHour(plan.startHour) }}</span>
              <span class="home__plan-title">{{ plan.title }}</span>
              <t-tag size="small" variant="light" :style="{ color: categoryColor(plan.category) }">
                {{ plan.category }}
              </t-tag>
              <span class="home__plan-duration">{{ plan.duration }} 分钟</span>
              <span v-if="plan.done" class="home__plan-done">
                <CheckCircleIcon />
                已完成
              </span>
            </div>
          </div>
        </div>
      </div>
    </t-card>
  </div>
</template>

<style scoped>
.home__hero {
  background-image: linear-gradient(135deg, rgb(0 82 217 / 8%), rgb(0 168 112 / 6%));
}

.home__hero-label {
  margin: 0;
  font-size: 21px;
  color: var(--td-text-color-secondary);
}

.home__hero-number {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 4px 0 8px;
}

.home__hero-value {
  font-size: 96px;
  font-weight: 700;
  line-height: 1.1;
  background: linear-gradient(135deg, #0052d9, #00a870);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.home__hero-unit {
  font-size: 27px;
  font-weight: 600;
  color: var(--td-text-color-secondary);
}

.home__hero-target {
  margin: 0 0 8px;
  font-size: 20px;
  color: var(--td-text-color-secondary);
}

.home__hero-motd {
  max-width: 520px;
  margin: 0;
  font-size: 20px;
  line-height: 1.8;
  color: var(--td-text-color-placeholder);
}

.home__section {
  margin-top: 16px;
}

.home__stat {
  height: 100%;
}

.home__section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 24px;
  font-weight: 600;
}

.home__groups {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.home__group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.home__group-date {
  font-size: 21px;
  font-weight: 600;
}

.home__group-count {
  font-size: 18px;
  color: var(--td-text-color-placeholder);
}

.home__plan-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.home__plan {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--td-radius-medium);
  background-color: var(--td-bg-color-secondarycontainer);
}

.home__plan.is-done .home__plan-title {
  color: var(--td-text-color-placeholder);
  text-decoration: line-through;
}

.home__plan-bar {
  width: 5px;
  height: 27px;
  border-radius: 2px;
  flex-shrink: 0;
}

.home__plan-time {
  width: 72px;
  flex-shrink: 0;
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  color: var(--td-text-color-secondary);
}

.home__plan-title {
  flex: 1;
  min-width: 0;
  font-size: 21px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home__plan-duration {
  flex-shrink: 0;
  font-size: 18px;
  color: var(--td-text-color-placeholder);
}

.home__plan-done {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: 18px;
  color: var(--td-success-color);
}

@media (max-width: 900px) {
  .home__hero-value {
    font-size: 78px;
  }
}
</style>
