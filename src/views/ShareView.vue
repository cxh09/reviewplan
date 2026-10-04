<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { CheckIcon } from 'tdesign-icons-vue-next'

import { categoryColor } from '@/data/plaza'
import { TIMELINE_HOURS } from '@/stores/plan'
import { defaultApiBase, fetchShare, resolveFileUrl } from '@/utils/api'
import ImageViewer from '@/components/ImageViewer.vue'
import {
  dateRange,
  diffDays,
  formatHour,
  formatMD,
  isToday,
  parseDateKey,
  weekdayShortCN,
} from '@/utils/date'

const route = useRoute()

/** 时间轴范围：06:00 ~ 24:00，共 18 个整点列 */
const FIRST_HOUR = TIMELINE_HOURS[0]
const END_HOUR = TIMELINE_HOURS[TIMELINE_HOURS.length - 1] + 1
const HOURS_COUNT = TIMELINE_HOURS.length
/** 同一时间段重叠时上下分层，每层高度（需容纳两行标题 + 时间行） */
const LANE_HEIGHT = 76
/** 短日程的最小显示宽度（小时）：与日程表一致，窄块向右撑到 1.5 小时格，止于同车道下一块 */
const MIN_DISPLAY_HOURS = 1.5

const loading = ref(true)
const error = ref('')
const dateStart = ref('')
const dateEnd = ref('')
const plans = ref([])
/** 分享者资料（由服务端随快照实时透出，旧数据为 null） */
const profile = ref(null)

/**
 * 分享页没有登录态与设置项，接口与附件都打到构建期注入的默认服务端
 * （前后端分离时为 api 域名，一体化部署时回退为当前页面同源）。
 */
const apiBase = defaultApiBase()
const fileUrl = (url) => resolveFileUrl(url, apiBase)

async function load() {
  const code = route.params.code
  if (!code) {
    error.value = '分享链接无效'
    loading.value = false
    return
  }
  loading.value = true
  try {
    const res = await fetchShare(apiBase, code)
    dateStart.value = res.dateStart
    dateEnd.value = res.dateEnd
    plans.value = Array.isArray(res.plans) ? res.plans : []
    profile.value = res.profile && res.profile.name ? res.profile : null
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

  const blocks = items.map((item) => ({
    plan: item.plan,
    lane: item.lane,
    start: item.start,
    end: item.end,
  }))

  const laneGroups = new Map()
  blocks.forEach((block) => {
    const list = laneGroups.get(block.lane)
    if (list) list.push(block)
    else laneGroups.set(block.lane, [block])
  })
  laneGroups.forEach((list) => {
    list.forEach((block, index) => {
      const next = list[index + 1]
      const displayEnd = Math.min(
        Math.max(block.end, block.start + MIN_DISPLAY_HOURS),
        next ? next.start : END_HOUR,
      )
      block.left = ((block.start - FIRST_HOUR) / HOURS_COUNT) * 100
      block.width = ((displayEnd - block.start) / HOURS_COUNT) * 100
    })
  })

  return {
    lanes: Math.max(laneEnds.length, 1),
    blocks,
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
  return `${formatMD(dateStart.value)}~${formatMD(dateEnd.value)}`
})

// ---------- 完成详情：点已完成的块弹只读弹窗 ----------

/** 当前弹窗展示的计划（null 关闭） */
const completionPlan = ref(null)
/** 关闭动画进行中：动画播完才真正移除 DOM */
const completionClosing = ref(false)
/** 图片预览：自实现 ImageViewer（跟手缩放/拖拽/左右滑动切图），默认展示压缩预览，可切原图 */
const viewerVisible = ref(false)
const viewerSource = ref([])
const viewerIndex = ref(0)
/** 传给预览组件的条目：src=压缩预览地址，original=原图地址，name=文件名 */
const viewerItems = computed(() =>
  viewerSource.value.map((img) => ({
    src: fileUrl(img.preview || img.url),
    original: fileUrl(img.url),
    name: img.name || '',
  })),
)

function hasCompletion(plan) {
  return Boolean(
    plan.done &&
      (plan.doneNote || plan.doneImages?.length || plan.doneFiles?.length || plan.recite),
  )
}

function openCompletion(plan) {
  if (!hasCompletion(plan)) return
  completionPlan.value = plan
  completionClosing.value = false
}

function closeCompletion() {
  if (!completionPlan.value || completionClosing.value) return
  completionClosing.value = true
  // 兜底：万一 animationend 没触发（如动画被禁用），超时后也要收尾
  setTimeout(finishCompletionClose, 400)
}

function finishCompletionClose() {
  if (!completionClosing.value) return
  completionPlan.value = null
  completionClosing.value = false
}

/** 打开预览：传入整组图片与当前点击的下标，支持左右切换 */
function openViewer(list, index) {
  viewerSource.value = list
  viewerIndex.value = index
  viewerVisible.value = true
}
</script>

<template>
  <div class="share">
    <header class="share__head">
      <div class="share__brand">
        复习日程<template v-if="!loading && !error && rangeLabel">（{{ rangeLabel }}）</template>
      </div>
      <div v-if="!loading && !error && profile" class="share__author">
        <img v-if="profile.avatar" class="share__author-avatar" :src="profile.avatar" alt="头像" />
        <span>由 {{ profile.name }} 分享</span>
      </div>
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
                  :class="{
                    'is-done': block.plan.done,
                    'has-completion': hasCompletion(block.plan),
                  }"
                  :style="{
                    left: `${block.left}%`,
                    width: `${block.width}%`,
                    top: `${block.lane * LANE_HEIGHT + 4}px`,
                    height: `${LANE_HEIGHT - 8}px`,
                    borderLeftColor: categoryColor(block.plan.category),
                  }"
                  @click="openCompletion(block.plan)"
                >
                  <div class="plan-block__main">
                    <div class="plan-block__title" :title="block.plan.title">
                      {{ block.plan.title }}
                    </div>
                    <div class="plan-block__meta">
                      <span>{{ formatClock(block.start) }} - {{ formatClock(block.end) }}</span>
                      <span v-if="block.plan.done" class="plan-block__done">
                        <CheckIcon />
                        已完成
                      </span>
                    </div>
                  </div>
                  <span v-if="hasCompletion(block.plan)" class="plan-block__evidence">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"
                      />
                    </svg>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <footer class="share__foot">本页面为只读分享，内容随作者的最新日程实时更新。</footer>

    <!-- 完成详情只读弹窗：文字 + 图片（点击放大）+ 附件直链 -->
    <div
      v-if="completionPlan"
      class="completion-dialog"
      :class="{ 'completion-dialog--closing': completionClosing }"
      @click.self="closeCompletion"
    >
      <div class="completion-card" @animationend="finishCompletionClose">
        <div class="completion-card__head">
          <span class="completion-card__title">完成详情 · {{ completionPlan.title }}</span>
          <button
            type="button"
            class="completion-card__close"
            aria-label="关闭"
            @click="closeCompletion"
          >
            ×
          </button>
        </div>
        <!-- 背诵结果：正确率 + 不会的字 / 句子（只读，与日程表详情面板同步维护） -->
        <div v-if="completionPlan.recite" class="recite-result">
          <div class="recite-result__head">
            <span class="recite-result__rate">背诵正确率 {{ completionPlan.recite.rate }}%</span>
            <span class="recite-result__total">共 {{ completionPlan.recite.total }} 空</span>
          </div>
          <div v-if="completionPlan.recite.wrongChars?.length" class="recite-result__chars">
            <span v-for="(ch, i) in completionPlan.recite.wrongChars" :key="i" class="recite-result__char">
              {{ ch }}
            </span>
          </div>
          <ul v-if="completionPlan.recite.wrongSentences?.length" class="recite-result__sents">
            <li v-for="(sent, i) in completionPlan.recite.wrongSentences" :key="i">{{ sent }}</li>
          </ul>
        </div>
        <p v-if="completionPlan.doneNote" class="completion-card__note">
          {{ completionPlan.doneNote }}
        </p>
        <div v-if="completionPlan.doneImages?.length" class="completion-card__images">
          <img
            v-for="(img, idx) in completionPlan.doneImages"
            :key="img.url"
            :src="fileUrl(img.preview || img.url)"
            :alt="img.name"
            @click="openViewer(completionPlan.doneImages, idx)"
          />
        </div>
        <div v-if="completionPlan.doneFiles?.length" class="completion-card__files">
          <a
            v-for="file in completionPlan.doneFiles"
            :key="file.url"
            :href="fileUrl(file.url)"
            target="_blank"
            rel="noopener noreferrer"
          >
            📎 {{ file.name || file.url.split('/').pop() }}
          </a>
        </div>
      </div>
    </div>

    <!-- 图片预览：自实现 ImageViewer（跟手缩放/拖拽/滑动切图 + 查看原图/下载/关闭） -->
    <ImageViewer v-model:visible="viewerVisible" v-model:index="viewerIndex" :items="viewerItems" />
  </div>
</template>

<style scoped>
.share {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--td-bg-color-page);
  animation: rp-fade-in var(--rp-duration-base) ease;
}

.share__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--td-component-stroke);
  background-color: var(--td-bg-color-container);
}

.share__brand {
  font-size: 16px;
  font-weight: 700;
}

.share__author {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.share__author-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--td-component-stroke);
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
  /* 标题最多折两行完整展示，超出部分省略并用 title 属性兼容全名 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
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

/* 有完成详情的块可点击（其余块保持穿透，不影响网格滚动） */
.plan-block.has-completion {
  pointer-events: auto;
  cursor: pointer;
}

.plan-block__evidence {
  position: absolute;
  right: 4px;
  bottom: 2px;
  font-size: 10px;
  line-height: 1;
  pointer-events: none;
  color: var(--td-text-color-secondary);
}

.plan-block__evidence svg {
  display: block;
  width: 12px;
  height: 12px;
}

.completion-dialog {
  position: fixed;
  inset: 0;
  z-index: 2500;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background-color: rgb(0 0 0 / 55%);
  animation: completion-fade-in var(--rp-duration-base) ease;
}

/* 关闭中：遮罩淡出 + 卡片下滑，与弹入动画对称 */
.completion-dialog--closing {
  animation: completion-fade-out var(--rp-duration-base) ease forwards;
}

.completion-dialog--closing .completion-card {
  animation: completion-slide-down var(--rp-duration-base) var(--rp-ease-in-strong) forwards;
}

/* 底部弹层：贴底、顶部圆角、从下方滑入；桌面窄屏下限宽居中 */
.completion-card {
  width: 100%;
  max-width: 640px;
  max-height: 80vh;
  overflow: auto;
  padding: 18px 20px calc(18px + env(safe-area-inset-bottom));
  border-radius: var(--td-radius-large) var(--td-radius-large) 0 0;
  background-color: var(--td-bg-color-container);
  animation: completion-slide-up var(--rp-duration-base) var(--rp-ease-out);
}

@keyframes completion-slide-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes completion-slide-down {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(100%);
  }
}

@keyframes completion-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes completion-fade-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.completion-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.completion-card__title {
  font-size: 15px;
  font-weight: 700;
}

.completion-card__close {
  border: none;
  background: none;
  font-size: 20px;
  line-height: 1;
  color: var(--td-text-color-placeholder);
  cursor: pointer;
}

/* 背诵结果块：与 ScheduleView 同款结构，字号随分享页整体放大 */
.recite-result {
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 8px;
  background: var(--td-bg-color-secondarycontainer);
}

.recite-result__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 20px;
}

.recite-result__rate {
  font-weight: 700;
  color: var(--td-brand-color);
}

.recite-result__total {
  color: var(--td-text-color-secondary);
}

.recite-result__chars {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.recite-result__char {
  min-width: 32px;
  padding: 2px 8px;
  text-align: center;
  font-size: 20px;
  color: var(--td-error-color);
  background: var(--td-error-color-light);
  border-radius: 4px;
}

.recite-result__sents {
  margin: 10px 0 0;
  padding-left: 22px;
  font-size: 18px;
  line-height: 1.8;
  color: var(--td-text-color-secondary);
}

.completion-card__note {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--td-text-color-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.completion-card__images {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.completion-card__images img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: var(--td-radius-medium);
  border: 1px solid var(--td-component-stroke);
  cursor: zoom-in;
}

.completion-card__files {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.completion-card__files a {
  font-size: 13px;
  color: var(--td-brand-color);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .calendar {
    --calendar-date-width: 76px;
    --calendar-hour-width: 92px;
  }
}
</style>
