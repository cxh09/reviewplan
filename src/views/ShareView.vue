<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { CheckIcon } from 'tdesign-icons-vue-next'

import { categoryColor } from '@/data/plaza'
import { TIMELINE_HOURS } from '@/stores/plan'
import { fetchShare } from '@/utils/api'
import { dateRange, diffDays, formatHour, formatMD, isToday, parseDateKey, weekdayShortCN } from '@/utils/date'

const route = useRoute()

/** 时间轴范围：06:00 ~ 24:00，共 18 个整点列 */
const FIRST_HOUR = TIMELINE_HOURS[0]
const END_HOUR = TIMELINE_HOURS[TIMELINE_HOURS.length - 1] + 1
const HOURS_COUNT = TIMELINE_HOURS.length
/** 同一时间段重叠时上下分层，每层高度 */
const LANE_HEIGHT = 60

const loading = ref(true)
const error = ref('')
const dateStart = ref('')
const dateEnd = ref('')
const plans = ref([])

async function load() {
  const code = route.params.code
  if (!code) {
    error.value = '分享链接无效'
    loading.value = false
    return
  }
  loading.value = true
  try {
    const res = await fetchShare(window.location.origin, code)
    dateStart.value = res.dateStart
    dateEnd.value = res.dateEnd
    plans.value = Array.isArray(res.plans) ? res.plans : []
  } catch (err) {
    error.value = err?.message || '分享链接不存在或已失效'
  } finally {
    loading.value = false
  }
}

onMounted(load)

/** 分享范围内的全部日期（含首尾） */
const days = computed(() => {
  if (!dateStart.value || !dateEnd.value) return []
  return dateRange(dateStart.value, diffDays(dateStart.value, dateEnd.value) + 1)
})

const plansByDate = computed(() => {
  const map = new Map()
  plans.value.forEach((plan) => {
    const list = map.get(plan.date)
    if (list) list.push(plan)
    else map.set(plan.date, [plan])
  })
  return map
})

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/** 把小数小时格式化成 `07:30` */
function formatClock(hourValue) {
  const total = Math.round(hourValue * 60)
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${`${h}`.padStart(2, '0')}:${`${m}`.padStart(2, '0')}`
}

function isWeekend(date) {
  const day = parseDateKey(date).getDay()
  return day === 0 || day === 6
}

/**
 * 单日布局：横向按时间轴百分比定位（宽度＝时长），重叠的上下分层。
 * 与日程表同源，但去掉所有交互，纯展示。
 */
function layoutDay(rawItems) {
  const items = rawItems
    .map((plan) => {
      const start = clamp(Number(plan.startHour) || FIRST_HOUR, FIRST_HOUR, END_HOUR - 0.25)
      const hours = Math.max(Number(plan.duration) || 60, 15) / 60
      const end = Math.min(start + hours, END_HOUR)
      return { plan, start, end }
    })
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const laneEnds = []
  items.forEach((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(0)
    }
    laneEnds[lane] = item.end
    item.lane = lane
  })

  return {
    lanes: Math.max(laneEnds.length, 1),
    blocks: items.map((item) => ({
      plan: item.plan,
      lane: item.lane,
      start: item.start,
      end: item.end,
      left: ((item.start - FIRST_HOUR) / HOURS_COUNT) * 100,
      width: ((item.end - item.start) / HOURS_COUNT) * 100,
    })),
  }
}

function dayLayout(date) {
  return layoutDay(plansByDate.value.get(date) || [])
}

function rowHeight(date) {
  return `${dayLayout(date).lanes * LANE_HEIGHT}px`
}

const rangeLabel = computed(() => {
  if (!dateStart.value || !dateEnd.value) return ''
  if (dateStart.value === dateEnd.value) return formatMD(dateStart.value)
  return `${formatMD(dateStart.value)} - ${formatMD(dateEnd.value)}`
})
</script>

<template>
  <div class="share">
    <header class="share__head">
      <div class="share__brand">复习清单 · 共享日程</div>
      <div v-if="!loading && !error" class="share__range">{{ rangeLabel }}</div>
    </header>

    <main class="share__body">
      <div v-if="loading" class="share__state">加载中…</div>
      <div v-else-if="error" class="share__state share__state--error">{{ error }}</div>
      <div v-else-if="!plans.length" class="share__state">这个范围内暂时没有排好的日程。</div>

      <div v-else class="calendar" :style="{ '--calendar-hours-count': HOURS_COUNT }">
        <div class="calendar__head">
          <div class="calendar__corner">日期 / 时间</div>
          <div class="calendar__hours">
            <div v-for="hour in TIMELINE_HOURS" :key="`hour-${hour}`" class="calendar__hour">
              {{ formatHour(hour) }}
            </div>
          </div>
        </div>

        <div class="calendar__body">
          <div
            v-for="date in days"
            :key="date"
            class="calendar__row"
            :class="{ 'is-weekend': isWeekend(date), 'is-today': isToday(date) }"
          >
            <div class="calendar__date" :class="{ 'is-today': isToday(date) }">
              <div class="calendar__date-line">
                <span class="calendar__date-week">{{ weekdayShortCN(date) }}</span>
              </div>
              <span class="calendar__date-md">{{ formatMD(date) }}</span>
            </div>

            <div class="calendar__row-body" :style="{ minHeight: rowHeight(date) }">
              <div class="calendar__cells">
                <div
                  v-for="hour in TIMELINE_HOURS"
                  :key="`${date}-${hour}`"
                  class="calendar__cell"
                />
              </div>

              <div class="plan-layer">
                <div
                  v-for="block in dayLayout(date).blocks"
                  :key="`${date}-${block.plan.title}-${block.start}`"
                  class="plan-block"
                  :class="{ 'is-done': block.plan.done }"
                  :style="{
                    left: `${block.left}%`,
                    width: `${block.width}%`,
                    top: `${block.lane * LANE_HEIGHT + 4}px`,
                    height: `${LANE_HEIGHT - 8}px`,
                    borderLeftColor: categoryColor(block.plan.category),
                  }"
                >
                  <div class="plan-block__main">
                    <div class="plan-block__title">{{ block.plan.title }}</div>
                    <div class="plan-block__meta">
                      <span>{{ formatClock(block.start) }} - {{ formatClock(block.end) }}</span>
                      <span v-if="block.plan.done" class="plan-block__done">
                        <CheckIcon />
                        已完成
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <footer class="share__foot">本页面为只读分享，内容随作者的最新日程实时更新。</footer>
  </div>
</template>

<style scoped>
.share {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--td-bg-color-page);
}

.share__head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--td-component-stroke);
  background-color: var(--td-bg-color-container);
}

.share__brand {
  font-size: 16px;
  font-weight: 700;
}

.share__range {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.share__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 20px;
}

.share__state {
  padding: 48px 0;
  text-align: center;
  font-size: 14px;
  color: var(--td-text-color-secondary);
}

.share__state--error {
  color: var(--td-error-color);
}

.share__foot {
  padding: 12px 20px;
  text-align: center;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  border-top: 1px solid var(--td-component-stroke);
}

/* ---------- 只读日历网格 ---------- */

.calendar {
  --calendar-date-width: 96px;
  --calendar-hour-width: 120px;
  position: relative;
  overflow: auto;
  border-top: 1px solid var(--td-component-stroke);
  border-left: 1px solid var(--td-component-stroke);
}

.calendar__head,
.calendar__row {
  display: grid;
  grid-template-columns: var(--calendar-date-width) 1fr;
  min-width: calc(
    var(--calendar-date-width) + var(--calendar-hours-count, 18) * var(--calendar-hour-width)
  );
}

.calendar__head {
  position: sticky;
  top: 0;
  z-index: 5;
}

.calendar__body {
  position: relative;
}

.calendar__corner {
  position: sticky;
  left: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-right: 1px solid var(--td-component-stroke);
  border-bottom: 1px solid var(--td-component-stroke);
  font-size: 12px;
  font-weight: 600;
  color: var(--td-text-color-secondary);
  background-color: var(--td-bg-color-secondarycontainer);
}

.calendar__hours {
  display: grid;
  grid-template-columns: repeat(var(--calendar-hours-count, 18), 1fr);
}

.calendar__hour {
  padding: 10px 6px;
  text-align: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--td-text-color-secondary);
  border-right: 1px solid var(--td-component-stroke);
  border-bottom: 1px solid var(--td-component-stroke);
  background-color: var(--td-bg-color-secondarycontainer);
}

.calendar__date {
  position: sticky;
  left: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
  padding: 6px 12px;
  border-right: 1px solid var(--td-component-stroke);
  border-bottom: 1px solid var(--td-component-stroke);
  background-color: var(--td-bg-color-container);
}

.calendar__date-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.calendar__date.is-today {
  background-color: var(--td-brand-color-light);
}

.calendar__date-week {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.calendar__date-md {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.calendar__row-body {
  position: relative;
  border-bottom: 1px solid var(--td-component-stroke);
}

.calendar__cells {
  display: grid;
  grid-template-columns: repeat(var(--calendar-hours-count, 18), 1fr);
  height: 100%;
}

.calendar__cell {
  border-right: 1px solid var(--td-component-stroke);
  background-color: var(--td-bg-color-container);
}

.calendar__row.is-weekend .calendar__cell {
  background-color: var(--td-bg-color-secondarycontainer);
}

.calendar__row.is-today .calendar__cell {
  background-color: var(--td-brand-color-light);
}

.plan-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.plan-block {
  position: absolute;
  display: flex;
  gap: 6px;
  padding: 6px 8px;
  overflow: hidden;
  border-left: 3px solid var(--td-brand-color);
  border-radius: 5px;
  background-color: var(--td-bg-color-container);
  box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
}

.plan-block.is-done .plan-block__title {
  color: var(--td-text-color-placeholder);
  text-decoration: line-through;
}

.plan-block__main {
  flex: 1;
  min-width: 0;
}

.plan-block__title {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-block__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  overflow: hidden;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
  white-space: nowrap;
}

.plan-block__done {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  color: var(--td-success-color);
}

@media (max-width: 768px) {
  .calendar {
    --calendar-date-width: 76px;
    --calendar-hour-width: 92px;
  }
}
</style>
