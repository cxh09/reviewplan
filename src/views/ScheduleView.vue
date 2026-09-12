<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next/es/message'
import {
  AddIcon,
  CalendarIcon,
  CheckIcon,
  CloseIcon,
  DeleteIcon,
  DragMoveIcon,
  QueueIcon,
} from 'tdesign-icons-vue-next'

import { CATEGORY_OPTIONS, categoryColor, levelTheme } from '@/data/plaza'
import { DEFAULT_SLOT_MINUTES, TIMELINE_HOURS, usePlanStore } from '@/stores/plan'
import {
  addDays,
  dateRange,
  diffDays,
  formatHour,
  formatMD,
  isToday,
  parseDateKey,
  todayKey,
  weekdayShortCN,
} from '@/utils/date'

const planStore = usePlanStore()

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/** 时间轴范围：06:00 ~ 24:00，共 18 个整点列 */
const FIRST_HOUR = TIMELINE_HOURS[0]
const END_HOUR = TIMELINE_HOURS[TIMELINE_HOURS.length - 1] + 1
const HOURS_COUNT = TIMELINE_HOURS.length
/** 同一时间段重叠时上下分层，每层高度 */
const LANE_HEIGHT = 60
/** 拉伸时的时间吸附步长（分钟），左右两个边缘都按这个粒度走 */
const SNAP_MINUTES = 15
/** 吸附步长换算成小时（0.25h），开始时间也按它取整 */
const SNAP_HOURS = SNAP_MINUTES / 60

/** 正在拖拽的内容：{ kind: 'todo' | 'plan', id, title } */
const dragging = ref(null)
/** 悬停的单元格，key 为 `日期#小时` */
const dragOverCell = ref(null)
/** 是否悬停在待办面板上（把计划拖回来 = 取消排班） */
const dragOverTodoPool = ref(false)
/** 右下角待办清单是否展开 */
const todoOpen = ref(false)

// ---------- 连续日程：按需扩展日期 ----------

/** 首次渲染覆盖的范围：今天往前几天、往后若干天 */
const INITIAL_PAST_DAYS = 7
const INITIAL_FUTURE_DAYS = 21
/** 滚动到边缘时每次追加的天数 */
const DAY_CHUNK = 14
/** 距离边缘多少像素内触发加载 */
const SCROLL_THRESHOLD = 240
/** 日期数组上限，避免长距离滚动后要维护的日期过多（DOM 数量由虚拟滚动兜底） */
const MAX_DAYS = 400

const days = ref(
  dateRange(addDays(todayKey(), -INITIAL_PAST_DAYS), INITIAL_PAST_DAYS + INITIAL_FUTURE_DAYS + 1),
)

const calendarRef = ref(null)
const loadingMore = ref(false)
/** 上一次的纵向滚动位置，用于忽略纯横向滚动 */
let lastScrollTop = 0

// 虚拟滚动状态：只渲染可视区内的日期行，滚到很远的日期也不会堆 DOM
const scrollTop = ref(0)
const viewportHeight = ref(0)
/** 表头（sticky）高度，用于把滚动位置换算成「日期行内部」的坐标 */
const headHeight = ref(0)

/** 滚到顶部/底部就继续往外扩展日期，形成没有尽头的日程列表 */
async function handleScroll() {
  const el = calendarRef.value
  if (!el) return

  // 每一帧都同步一次，虚拟窗口才能跟着滚动实时更新
  scrollTop.value = el.scrollTop
  viewportHeight.value = el.clientHeight

  if (loadingMore.value) return

  const movedVertically = el.scrollTop !== lastScrollTop
  lastScrollTop = el.scrollTop
  // 只横向滚动时 scrollTop 恒为 0，不能当成「滚到顶部」
  if (!movedVertically) return

  const nearTop = el.scrollTop < SCROLL_THRESHOLD
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD
  const canPrepend = nearTop && days.value.length < MAX_DAYS
  const canAppend = nearBottom && days.value.length < MAX_DAYS
  if (!canPrepend && !canAppend) return

  loadingMore.value = true
  // 行高在数据层面就能算出来，前后插入带来的高度差可以提前预知
  const heightBefore = totalHeight.value

  if (canPrepend) {
    const first = days.value[0]
    days.value = [...dateRange(addDays(first, -DAY_CHUNK), DAY_CHUNK), ...days.value]
  }
  if (canAppend) {
    const last = days.value[days.value.length - 1]
    days.value = [...days.value, ...dateRange(addDays(last, 1), DAY_CHUNK)]
  }

  // 向前插入会让内容整体下移，同步补偿滚动位置，避免画面跳动
  if (canPrepend) {
    const added = totalHeight.value - heightBefore
    if (added) {
      el.scrollTop += added
      scrollTop.value = el.scrollTop
      lastScrollTop = el.scrollTop
    }
  }

  await nextTick()
  loadingMore.value = false
}

/** 把某一天那一行定位到可视区顶部（表头下方） */
function scrollToDate(date) {
  const el = calendarRef.value
  if (!el) return

  const index = days.value.indexOf(date)
  if (index === -1) return

  // 表头是 sticky，不占滚动内容：第 index 行的顶端就是 rowOffsets[index]，
  // 再减去 8px 让它在表头下方留出一点空隙
  const nextTop = Math.max((rowOffsets.value[index] || 0) - 8, 0)
  el.scrollTop = nextTop
  scrollTop.value = el.scrollTop
  lastScrollTop = el.scrollTop
}

// ---------- 当前时间 ----------

/** 默认加载时，把「当前时间」横向对齐到可视区左侧 30% 的位置 */
const NOW_ANCHOR_RATIO = 0.3

/** 当前时刻，用小数小时表示，例如 9:45 → 9.75 */
const nowHour = ref(0)
/** 时间轴的实测像素尺寸：日期列宽 + 时间轴宽（列宽由 CSS 变量控制，只能实测） */
const timelineMetrics = ref({ dateWidth: 0, timelineWidth: 0 })
/** 每分钟更新一次当前时刻 */
let nowTimer = null

const nowRatio = computed(() => clamp((nowHour.value - FIRST_HOUR) / HOURS_COUNT, 0, 1))

/** 当前时间在日历内容里的横向像素坐标 */
const nowOffsetX = computed(
  () => timelineMetrics.value.dateWidth + nowRatio.value * timelineMetrics.value.timelineWidth,
)

/** 当前时刻落在时间轴范围内才画指示线（06:00 ~ 24:00） */
const nowLineVisible = computed(() => nowHour.value >= FIRST_HOUR && nowHour.value <= END_HOUR)

function updateNowHour() {
  const now = new Date()
  nowHour.value = now.getHours() + now.getMinutes() / 60
}

function measureTimeline() {
  const el = calendarRef.value
  if (!el) return

  const hours = el.querySelector('.calendar__hours')
  const dateCell = el.querySelector('.calendar__date')
  const head = el.querySelector('.calendar__head')
  timelineMetrics.value = {
    dateWidth: dateCell ? dateCell.getBoundingClientRect().width : 0,
    timelineWidth: hours ? hours.getBoundingClientRect().width : 0,
  }
  // 虚拟窗口依赖这两项，尺寸变化时要一起更新
  headHeight.value = head ? head.getBoundingClientRect().height : 0
  viewportHeight.value = el.clientHeight
}

/** 横向滚动，让当前时间落在可视区左侧 30% 处 */
function scrollToNow() {
  const el = calendarRef.value
  if (!el) return

  measureTimeline()
  el.scrollLeft = Math.max(nowOffsetX.value - el.clientWidth * NOW_ANCHOR_RATIO, 0)
}

/** 窗口尺寸变化后列宽会变，重新量一次 */
function handleWindowResize() {
  measureTimeline()
}

/** 保证目标日期已经在渲染范围内，必要时向对应方向补齐 */
async function ensureDateRendered(date) {
  if (days.value.includes(date)) return

  const first = days.value[0]
  const last = days.value[days.value.length - 1]

  if (diffDays(first, date) < 0) {
    days.value = [...dateRange(date, diffDays(date, first)), ...days.value]
  } else {
    days.value = [...days.value, ...dateRange(addDays(last, 1), diffDays(last, date))]
  }

  await nextTick()
}

onMounted(async () => {
  await nextTick()
  // 先量出可视区尺寸，虚拟窗口才知道该渲染多少行
  measureTimeline()
  await nextTick()
  // 纵向定位到今天
  scrollToDate(todayKey())
  // 横向把当前时间对齐到可视区左侧 30%
  updateNowHour()
  scrollToNow()

  nowTimer = window.setInterval(updateNowHour, 60 * 1000)
  window.addEventListener('resize', handleWindowResize)
})

/**
 * 按日期把计划分一次组，供下面的格子索引与布局计算复用。
 * 之前是「每一行各 filter 一次 plans」，天数上限 400 时会退化成 O(天数 × 计划数)。
 */
const plansByDate = computed(() => {
  const map = new Map()
  planStore.plans.forEach((plan) => {
    const list = map.get(plan.date)
    if (list) list.push(plan)
    else map.set(plan.date, [plan])
  })
  return map
})

/** 按 `日期#整点小时` 建立索引，用于判断某个格子是否已经排了日程 */
const planIndex = computed(() => {
  const map = new Map()
  plansByDate.value.forEach((list, date) => {
    list.forEach((plan) => {
      const start = Math.floor(Number(plan.startHour) || FIRST_HOUR)
      const key = `${date}#${start}`
      const bucket = map.get(key)
      if (bucket) bucket.push(plan)
      else map.set(key, [plan])
    })
  })
  return map
})

function plansAt(date, hour) {
  return planIndex.value.get(`${date}#${hour}`) || []
}

/**
 * 每一天的计划块布局：横向按时间轴百分比定位（宽度＝时长），
 * 同一时间段重叠的计划上下分层，避免互相遮挡。
 */
const dayLayouts = computed(() => {
  const map = new Map()

  days.value.forEach((date) => {
    const items = (plansByDate.value.get(date) || [])
      .map((plan) => {
        const start = Math.min(
          Math.max(Number(plan.startHour) || FIRST_HOUR, FIRST_HOUR),
          END_HOUR - SNAP_MINUTES / 60,
        )
        const hours = Math.max(Number(plan.duration) || 60, SNAP_MINUTES) / 60
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

    map.set(date, {
      lanes: Math.max(laneEnds.length, 1),
      blocks: items.map((item) => ({
        plan: item.plan,
        lane: item.lane,
        start: item.start,
        end: item.end,
        left: ((item.start - FIRST_HOUR) / HOURS_COUNT) * 100,
        width: ((item.end - item.start) / HOURS_COUNT) * 100,
      })),
    })
  })

  return map
})

function blocksOf(date) {
  return dayLayouts.value.get(date)?.blocks || []
}

/** 每行的像素高度（和 rowHeight 同源，这里要的是数字，供虚拟滚动算偏移） */
function rowHeightPx(date) {
  const lanes = dayLayouts.value.get(date)?.lanes || 1
  return lanes * LANE_HEIGHT
}

function rowHeight(date) {
  return `${rowHeightPx(date)}px`
}

// ---------- 虚拟滚动：只渲染可视区内的日期行 ----------
// 行高由「该天计划占用的层数」决定，在数据层面就能算出来，
// 所以可以直接用累计偏移定位窗口，不需要逐行实测 DOM。

/** 每一行顶部的偏移：第 i 行顶端 = rowOffsets[i]，最后一个元素是总高度 */
const rowOffsets = computed(() => {
  const list = days.value
  const offsets = new Array(list.length + 1)
  offsets[0] = 0
  for (let i = 0; i < list.length; i += 1) {
    offsets[i + 1] = offsets[i] + rowHeightPx(list[i])
  }
  return offsets
})

const totalHeight = computed(() => rowOffsets.value[days.value.length] || 0)

/** 可视区上下各多渲染几行，快速滚动时不会露白 */
const OVERSCAN = 4

/** 在升序数组里找第一个 >= target 的下标 */
function lowerBound(arr, target) {
  let low = 0
  let high = arr.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (arr[mid] < target) low = mid + 1
    else high = mid
  }
  return low
}

/** 可视区第一个日期行的下标 */
const visibleStart = computed(() => {
  const top = scrollTop.value - headHeight.value
  const first = lowerBound(rowOffsets.value, top) - 1 - OVERSCAN
  return clamp(first, 0, Math.max(days.value.length - 1, 0))
})

/** 可视区最后一个日期行的下标（不含） */
const visibleEnd = computed(() => {
  const bottom = scrollTop.value - headHeight.value + viewportHeight.value
  const last = lowerBound(rowOffsets.value, bottom) + OVERSCAN
  return clamp(last, visibleStart.value + 1, days.value.length)
})

const visibleDays = computed(() => days.value.slice(visibleStart.value, visibleEnd.value))
/** 顶部占位块高度：撑起没渲染的前几行 */
const paddingTop = computed(() => rowOffsets.value[visibleStart.value] || 0)
/** 底部占位块高度：撑起没渲染的后几行 */
const paddingBottom = computed(
  () => totalHeight.value - (rowOffsets.value[visibleEnd.value] ?? totalHeight.value),
)

/** 把小数小时格式化成 `07:30` */
function formatClock(hourValue) {
  const total = Math.round(hourValue * 60)
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${`${h}`.padStart(2, '0')}:${`${m}`.padStart(2, '0')}`
}

const categoryOptions = CATEGORY_OPTIONS.map((item) => ({ label: item, value: item }))

const hourOptions = TIMELINE_HOURS.map((hour) => ({
  label: `${formatHour(hour)} - ${formatHour((hour + 1) % 24)}`,
  value: hour,
}))

/** 开始时间：15 分钟一档，和拖边缘的吸附粒度保持一致 */
const startOptions = Array.from({ length: HOURS_COUNT * 4 }, (_, index) => {
  const value = FIRST_HOUR + index * SNAP_HOURS
  return { label: formatClock(value), value }
})

function isWeekend(date) {
  const day = parseDateKey(date).getDay()
  return day === 0 || day === 6
}

// ---------- 拖拽：用指针事件自己实现，不依赖浏览器原生 drag ----------

/** 位移超过这个像素才算拖动，避免和点击、边缘拉伸冲突 */
const DRAG_THRESHOLD = 4
/** 指针进入日历边缘多少像素内开始自动滚动 */
const EDGE_SIZE = 64
/** 自动滚动的最大速度（像素 / 帧） */
const EDGE_SPEED = 18

/** 按下但还没越过阈值时暂存的拖拽信息 */
let pendingDrag = null
/** 最近一次的指针位置 */
let lastPointer = { x: 0, y: 0 }
/** 当前的自动滚动速度 */
let scrollSpeed = { x: 0, y: 0 }
let autoScrollFrame = null

function beginPointerTracking(event, payload) {
  pendingDrag = { ...payload, startX: event.clientX, startY: event.clientY }
  lastPointer = { x: event.clientX, y: event.clientY }
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointercancel', resetPointerDrag)
}

/** 日历上的计划卡片：按住卡片主体就能拖走 */
function onBlockPointerDown(event, plan) {
  if (event.button !== 0) return
  // 左右边缘的拉伸手柄和右上角的操作按钮不触发移动
  if (event.target.closest?.('.plan-block__handle, .plan-block__action')) return
  beginPointerTracking(event, { kind: 'plan', id: plan.id, title: plan.title })
}

/** 待办清单里的卡片 */
function onTodoPointerDown(event, todo) {
  if (event.button !== 0) return
  beginPointerTracking(event, { kind: 'todo', id: todo.id, title: todo.title })
}

function handlePointerMove(event) {
  lastPointer = { x: event.clientX, y: event.clientY }

  if (!dragging.value) {
    if (!pendingDrag) return
    const dx = event.clientX - pendingDrag.startX
    const dy = event.clientY - pendingDrag.startY
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    dragging.value = { kind: pendingDrag.kind, id: pendingDrag.id, title: pendingDrag.title }
  }

  event.preventDefault()
  updateAutoScroll(event)
  updateDragTarget()
}

/** 用指针坐标反查落点：日历格子 / 待办面板 / 都不是 */
function resolveDropTarget(x, y) {
  const el = document.elementFromPoint(x, y)
  const cell = el?.closest?.('.calendar__cell')
  if (cell?.dataset.date) {
    const hour = Number(cell.dataset.hour)
    // 用落点在格子里的横向比例换算分钟并按 15 分钟吸附，
    // 这样 9:30 这样的开始时间被拖动后不会被强行抹成整点
    const rect = cell.getBoundingClientRect()
    const ratio = rect.width ? clamp((x - rect.left) / rect.width, 0, 1) : 0
    const offsetMinutes = Math.round((ratio * 60) / SNAP_MINUTES) * SNAP_MINUTES
    const startHour = clamp(hour + offsetMinutes / 60, FIRST_HOUR, END_HOUR - SNAP_HOURS)
    return { type: 'cell', date: cell.dataset.date, hour, startHour }
  }
  // 认整个 dock 而不是展开后的面板：待办收起时也要能把计划拖回来
  if (el?.closest?.('.todo-dock')) return { type: 'pool' }
  return null
}

function updateDragTarget() {
  const target = resolveDropTarget(lastPointer.x, lastPointer.y)
  dragOverCell.value = target?.type === 'cell' ? `${target.date}#${target.hour}` : null
  dragOverTodoPool.value = target?.type === 'pool'
}

/** 拖到日历边缘时自动滚动，方便把卡片拖到屏幕外的时间 */
function updateAutoScroll(event) {
  const el = calendarRef.value
  if (!el) return

  const rect = el.getBoundingClientRect()
  let x = 0
  let y = 0

  if (event.clientX < rect.left + EDGE_SIZE) {
    x = -EDGE_SPEED * ((rect.left + EDGE_SIZE - event.clientX) / EDGE_SIZE)
  } else if (event.clientX > rect.right - EDGE_SIZE) {
    x = EDGE_SPEED * ((event.clientX - (rect.right - EDGE_SIZE)) / EDGE_SIZE)
  }

  if (event.clientY < rect.top + EDGE_SIZE) {
    y = -EDGE_SPEED * ((rect.top + EDGE_SIZE - event.clientY) / EDGE_SIZE)
  } else if (event.clientY > rect.bottom - EDGE_SIZE) {
    y = EDGE_SPEED * ((event.clientY - (rect.bottom - EDGE_SIZE)) / EDGE_SIZE)
  }

  scrollSpeed = { x: Math.round(x), y: Math.round(y) }
  if ((scrollSpeed.x || scrollSpeed.y) && autoScrollFrame === null) {
    autoScrollFrame = requestAnimationFrame(autoScrollStep)
  }
}

function autoScrollStep() {
  autoScrollFrame = null
  const el = calendarRef.value
  if (!el || !dragging.value) return
  if (!scrollSpeed.x && !scrollSpeed.y) return

  el.scrollLeft += scrollSpeed.x
  el.scrollTop += scrollSpeed.y
  updateDragTarget()
  autoScrollFrame = requestAnimationFrame(autoScrollStep)
}

function handlePointerUp(event) {
  // 先按当前坐标算落点，再清状态：清空后卡片会重新接收指针事件，就查不到格子了
  const payload = dragging.value
  const target = payload ? resolveDropTarget(event.clientX, event.clientY) : null
  // 没越过拖动阈值就是一次点击
  const clicked = payload ? null : pendingDrag
  resetPointerDrag()

  // 点一下日程卡片 → 打开右侧详情
  if (clicked?.kind === 'plan') {
    openDetail(clicked.id)
    return
  }

  if (!payload || !target) return

  // 拖动结束后卡片本身就会落到新位置，不再弹提示
  if (target.type === 'pool') {
    if (payload.kind === 'plan') planStore.unschedulePlan(payload.id)
    return
  }

  const { date, startHour } = target

  if (payload.kind === 'todo') {
    planStore.scheduleFromTodo(payload.id, date, startHour)
  } else {
    planStore.movePlan(payload.id, date, startHour)
  }
}

function resetPointerDrag() {
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
  window.removeEventListener('pointercancel', resetPointerDrag)

  pendingDrag = null
  dragging.value = null
  dragOverCell.value = null
  dragOverTodoPool.value = false
  scrollSpeed = { x: 0, y: 0 }

  if (autoScrollFrame !== null) {
    cancelAnimationFrame(autoScrollFrame)
    autoScrollFrame = null
  }
}

// ---------- 横向拉伸：调整任务的时间跨度 ----------

const resizing = ref(null)

function startResize(event, plan, edge) {
  const body = event.currentTarget.closest('.calendar__row-body')
  if (!body) return

  const width = body.getBoundingClientRect().width
  if (!width) return

  resizing.value = {
    planId: plan.id,
    edge,
    startX: event.clientX,
    startHour: Number(plan.startHour) || FIRST_HOUR,
    startDuration: Math.max(Number(plan.duration) || 60, SNAP_MINUTES),
    hoursPerPx: HOURS_COUNT / width,
  }

  window.addEventListener('mousemove', handleResizeMove)
  window.addEventListener('mouseup', stopResize)
}

function handleResizeMove(event) {
  const state = resizing.value
  if (!state) return

  const deltaHours = (event.clientX - state.startX) * state.hoursPerPx
  const endHour = state.startHour + state.startDuration / 60

  if (state.edge === 'end') {
    // 拖右边缘：开始时间不变，只改时长
    const snapped =
      Math.round((state.startDuration + deltaHours * 60) / SNAP_MINUTES) * SNAP_MINUTES
    planStore.resizePlan(state.planId, {
      duration: clamp(snapped, SNAP_MINUTES, (END_HOUR - state.startHour) * 60),
    })
    return
  }

  // 拖左边缘：结束时间保持不变，开始时间同样按 15 分钟吸附
  const nextStart = clamp(
    Math.round((state.startHour + deltaHours) / SNAP_HOURS) * SNAP_HOURS,
    FIRST_HOUR,
    endHour - SNAP_HOURS,
  )
  const duration = Math.round(((endHour - nextStart) * 60) / SNAP_MINUTES) * SNAP_MINUTES
  planStore.resizePlan(state.planId, {
    startHour: nextStart,
    duration: clamp(duration, SNAP_MINUTES, (END_HOUR - nextStart) * 60),
  })
}

function stopResize() {
  resizing.value = null
  window.removeEventListener('mousemove', handleResizeMove)
  window.removeEventListener('mouseup', stopResize)
}

onBeforeUnmount(() => {
  stopResize()
  resetPointerDrag()
  if (nowTimer) window.clearInterval(nowTimer)
  window.removeEventListener('resize', handleWindowResize)
  if (autoScrollFrame !== null) cancelAnimationFrame(autoScrollFrame)
})

// ---------- 添加日程 ----------

const addVisible = ref(false)
const addForm = ref({
  title: '',
  category: '通用',
  duration: 60,
  date: todayKey(),
  startHour: 19,
  note: '',
  todoId: null,
})

function openAddDialog(prefill) {
  addForm.value = {
    title: '',
    category: '通用',
    duration: 60,
    date: todayKey(),
    startHour: 19,
    note: '',
    todoId: null,
    ...(prefill || {}),
  }
  addVisible.value = true
}

async function confirmAdd() {
  const title = `${addForm.value.title || ''}`.trim()
  if (!title) {
    MessagePlugin.warning('请先填写日程名称')
    return
  }

  const targetDate = addForm.value.date

  if (addForm.value.todoId) {
    planStore.scheduleFromTodo(
      addForm.value.todoId,
      targetDate,
      addForm.value.startHour,
      addForm.value.duration,
      addForm.value.note,
    )
  } else {
    planStore.addPlan({
      title,
      category: addForm.value.category,
      duration: addForm.value.duration,
      date: targetDate,
      startHour: addForm.value.startHour,
      note: addForm.value.note,
    })
  }

  addVisible.value = false

  // 目标日期可能还没被渲染出来，补齐后滚动过去，保证能看到结果
  await ensureDateRendered(targetDate)
  await nextTick()
  scrollToDate(targetDate)

  MessagePlugin.success('已添加到排版计划')
}

// ---------- 日程详情（点卡片后从右侧滑出） ----------

const detailVisible = ref(false)
const detailId = ref(null)
/** store 里的原始计划，用于读取 done 状态以及退回 / 删除等操作 */
const detailPlan = computed(
  () => planStore.plans.find((plan) => plan.id === detailId.value) || null,
)

/**
 * 详情表单的本地副本：编辑先落在这里，再由 store 归一化后写回。
 * 直接 v-model 绑 store 对象时，日期被清空会让计划从日历上消失。
 */
const detailForm = ref(null)

function createDetailForm(plan) {
  return {
    title: plan.title || '',
    category: plan.category || '通用',
    date: plan.date,
    startHour: Number(plan.startHour) || FIRST_HOUR,
    duration: Number(plan.duration) || DEFAULT_SLOT_MINUTES,
    note: plan.note || '',
  }
}

// 打开抽屉或切换目标计划时重建副本
watch(
  [detailVisible, detailId],
  () => {
    detailForm.value =
      detailVisible.value && detailPlan.value ? createDetailForm(detailPlan.value) : null
  },
  { immediate: true },
)

// 副本一变就提交，由 store 负责归一化（空标题、非法日期不会覆盖原值）
watch(
  detailForm,
  (form) => {
    if (!form || !detailId.value) return
    planStore.updatePlan(detailId.value, form)
  },
  { deep: true },
)

const detailRange = computed(() => {
  const form = detailForm.value
  if (!form) return ''

  const start = Number(form.startHour) || FIRST_HOUR
  const end = start + (Number(form.duration) || 60) / 60
  return `${formatClock(start)} - ${formatClock(end)}`
})

function openDetail(planId) {
  detailId.value = planId
  detailVisible.value = true
}

function closeDetail() {
  // 不清 detailId：收起动画期间内容还在，免得卡片先空掉再缩回去
  detailVisible.value = false
}

function detailToggleDone() {
  if (detailPlan.value) planStore.togglePlanDone(detailPlan.value.id)
}

function detailRollback() {
  const plan = detailPlan.value
  if (!plan) return

  planStore.unschedulePlan(plan.id)
  MessagePlugin.info(`「${plan.title}」已退回待办清单`)
  closeDetail()
}

function detailRemove() {
  const plan = detailPlan.value
  if (!plan) return

  planStore.removePlan(plan.id)
  MessagePlugin.success(`「${plan.title}」已删除`)
  closeDetail()
}

/** 在详情里改了日期后，保证那一日已经渲染出来并滚动过去 */
watch(
  () => detailForm.value?.date,
  async (date, prevDate) => {
    // prevDate 为空说明是刚打开抽屉，不是用户改了日期
    if (!date || !prevDate || date === prevDate) return
    await ensureDateRendered(date)
    await nextTick()
    scrollToDate(date)
  },
)
</script>

<template>
  <div class="schedule">
    <t-card :bordered="false" class="schedule__calendar-card">
      <div
        ref="calendarRef"
        class="calendar"
        :class="{ 'is-pointer-dragging': !!dragging }"
        :style="{ '--calendar-hours-count': HOURS_COUNT }"
        @scroll.passive="handleScroll"
      >
        <div class="calendar__head">
          <div class="calendar__corner">日期 / 时间</div>
          <div class="calendar__hours">
            <div v-for="hour in TIMELINE_HOURS" :key="`hour-${hour}`" class="calendar__hour">
              {{ formatHour(hour) }}
            </div>
          </div>
        </div>

        <div class="calendar__body">
          <!-- 虚拟滚动：上方占位块撑起未渲染的日期行 -->
          <div class="calendar__spacer" :style="{ height: `${paddingTop}px` }" aria-hidden="true" />

          <div
            v-for="date in visibleDays"
            :key="date"
            class="calendar__row"
            :class="{ 'is-weekend': isWeekend(date), 'is-today': isToday(date) }"
          >
            <div class="calendar__date" :class="{ 'is-today': isToday(date) }" :data-date="date">
              <div class="calendar__date-line">
                <span class="calendar__date-week">{{ weekdayShortCN(date) }}</span>
                <t-tag v-if="isToday(date)" size="small" variant="light" theme="primary"
                  >今天</t-tag
                >
              </div>
              <span class="calendar__date-md">{{ formatMD(date) }}</span>
            </div>

            <!-- 用 min-height 而不是 height：这样日期列和时间轴区都靠网格拉伸对齐，
               不会出现一边被内容撑高、另一边固定高度导致横线错位 -->
            <div class="calendar__row-body" :style="{ minHeight: rowHeight(date) }">
              <div class="calendar__cells">
                <div
                  v-for="hour in TIMELINE_HOURS"
                  :key="`${date}-${hour}`"
                  class="calendar__cell"
                  :class="{ 'is-over': dragOverCell === `${date}#${hour}` }"
                  :data-date="date"
                  :data-hour="hour"
                >
                  <span
                    v-if="dragOverCell === `${date}#${hour}`"
                    class="calendar__placeholder-text"
                  >
                    排到这里
                  </span>
                  <button
                    v-else-if="!plansAt(date, hour).length"
                    type="button"
                    class="calendar__add"
                    title="在此添加日程"
                    aria-label="在此添加日程"
                    @click="openAddDialog({ date, startHour: hour })"
                  >
                    <AddIcon />
                  </button>
                </div>
              </div>

              <div class="plan-layer">
                <div
                  v-for="block in blocksOf(date)"
                  :key="block.plan.id"
                  class="plan-block"
                  :class="{
                    'is-done': block.plan.done,
                    'is-resizing': resizing?.planId === block.plan.id,
                    'is-drag-source': dragging?.id === block.plan.id,
                  }"
                  :style="{
                    left: `${block.left}%`,
                    width: `${block.width}%`,
                    top: `${block.lane * LANE_HEIGHT + 4}px`,
                    height: `${LANE_HEIGHT - 8}px`,
                    borderLeftColor: categoryColor(block.plan.category),
                  }"
                  @pointerdown="onBlockPointerDown($event, block.plan)"
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

                  <span
                    class="plan-block__handle plan-block__handle--start"
                    title="拖动调整开始时间（结束时间不变）"
                    draggable="false"
                    @mousedown.stop.prevent="startResize($event, block.plan, 'start')"
                  />
                  <span
                    class="plan-block__handle plan-block__handle--end"
                    title="拖动调整时间跨度"
                    draggable="false"
                    @mousedown.stop.prevent="startResize($event, block.plan, 'end')"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 虚拟滚动：下方占位块撑起未渲染的日期行 -->
          <div
            class="calendar__spacer"
            :style="{ height: `${paddingBottom}px` }"
            aria-hidden="true"
          />

          <div
            v-if="nowLineVisible"
            class="calendar__now-line"
            :style="{ left: `${nowOffsetX}px` }"
          />
        </div>
      </div>
    </t-card>

    <!-- 日程详情：把日程表往左挤压，从右侧展开 -->
    <div class="detail-panel" :class="{ 'is-open': detailVisible }">
      <div class="detail-panel__inner">
        <t-card :bordered="false" class="detail-card">
          <template #title>
            <span class="detail-card__title">日程详情</span>
          </template>
          <template #actions>
            <button
              type="button"
              class="detail__close"
              title="关闭"
              aria-label="关闭详情"
              @click="closeDetail"
            >
              <CloseIcon />
            </button>
          </template>

          <div v-if="detailForm && detailPlan" class="detail">
            <div class="detail__head">
              <span
                class="detail__bar"
                :style="{ backgroundColor: categoryColor(detailForm.category) }"
              />
              <div class="detail__head-main">
                <div class="detail__title">{{ detailForm.title }}</div>
                <div class="detail__meta">{{ formatMD(detailForm.date) }} · {{ detailRange }}</div>
              </div>
              <t-tag v-if="detailPlan.done" size="small" variant="light" theme="success">
                已完成
              </t-tag>
            </div>

            <div class="form-item">
              <label class="form-label">日程名称</label>
              <t-input v-model="detailForm.title" />
            </div>

            <div class="form-item">
              <label class="form-label">科目</label>
              <t-select v-model="detailForm.category" :options="categoryOptions" />
            </div>

            <div class="form-item">
              <label class="form-label">日期</label>
              <t-date-picker
                v-model="detailForm.date"
                value-type="YYYY-MM-DD"
                format="YYYY-MM-DD"
                style="width: 100%"
              />
            </div>

            <div class="form-row">
              <div class="form-item">
                <label class="form-label">开始时间</label>
                <t-select v-model="detailForm.startHour" :options="startOptions" />
              </div>
              <div class="form-item">
                <label class="form-label">时长（分钟）</label>
                <t-input-number v-model="detailForm.duration" :min="15" :max="600" :step="15" />
              </div>
            </div>

            <div class="form-item">
              <label class="form-label">备注</label>
              <t-textarea
                v-model="detailForm.note"
                placeholder="选填，例如：重点复盘第 3 题"
                :autosize="{ minRows: 3, maxRows: 6 }"
              />
            </div>

            <div class="detail__actions">
              <t-button block variant="outline" @click="detailToggleDone">
                {{ detailPlan.done ? '标记为未完成' : '标记为已完成' }}
              </t-button>
              <t-button block variant="outline" @click="detailRollback">退回待办清单</t-button>
              <t-button block theme="danger" variant="outline" @click="detailRemove">
                删除日程
              </t-button>
            </div>
          </div>
        </t-card>
      </div>
    </div>

    <!-- 右下角待办清单 -->
    <div v-show="!detailVisible" class="todo-dock" :class="{ 'is-drop-target': dragOverTodoPool }">
      <transition name="dock-fade">
        <div
          v-if="todoOpen"
          class="todo-dock__panel"
          :class="{ 'is-drop-target': dragOverTodoPool }"
        >
          <div class="todo-dock__head">
            <div class="todo-dock__title">
              <span>待办清单</span>
              <t-tag size="small" variant="light">{{ planStore.todoCount }}</t-tag>
            </div>
            <button
              type="button"
              class="todo-dock__close"
              title="收起"
              aria-label="收起待办清单"
              @click="todoOpen = false"
            >
              <CloseIcon />
            </button>
          </div>

          <p class="todo-dock__hint">
            <DragMoveIcon />
            拖到日历上任意位置即可排班；把计划拖回这里可以取消排班。
          </p>

          <div class="todo-dock__body">
            <t-empty v-if="!planStore.todos.length" description="暂无待办，去日程广场添加">
              <template #action>
                <t-button
                  size="small"
                  theme="primary"
                  variant="outline"
                  @click="$router.push('/plaza')"
                >
                  去日程广场
                </t-button>
              </template>
            </t-empty>

            <div v-else class="todo-dock__list">
              <div
                v-for="todo in planStore.todos"
                :key="todo.id"
                class="todo-chip"
                :class="{ 'is-drag-source': dragging?.id === todo.id }"
                @pointerdown="onTodoPointerDown($event, todo)"
              >
                <span
                  class="todo-chip__bar"
                  :style="{ backgroundColor: categoryColor(todo.category) }"
                />
                <div class="todo-chip__body">
                  <div class="todo-chip__title">{{ todo.title }}</div>
                  <div class="todo-chip__meta">
                    <t-tag size="small" variant="light" :theme="levelTheme(todo.level)">
                      {{ todo.level }}
                    </t-tag>
                    <span>{{ todo.category }}</span>
                    <span>{{ todo.duration }} 分钟</span>
                  </div>
                </div>
                <div class="todo-chip__actions">
                  <span
                    class="todo-chip__action"
                    title="直接排班"
                    @click.stop="
                      openAddDialog({
                        title: todo.title,
                        category: todo.category,
                        duration: todo.duration,
                        todoId: todo.id,
                      })
                    "
                  >
                    <CalendarIcon />
                  </span>
                  <span
                    class="todo-chip__action todo-chip__action--danger"
                    title="移出待办"
                    @click.stop="planStore.removeTodo(todo.id)"
                  >
                    <DeleteIcon />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </transition>

      <t-button class="todo-dock__trigger" theme="primary" @click="todoOpen = !todoOpen">
        <template #icon>
          <CloseIcon v-if="todoOpen" />
          <QueueIcon v-else />
        </template>
        {{ todoOpen ? '收起待办' : '待办清单' }}
        <span v-if="planStore.todoCount" class="todo-dock__count">{{ planStore.todoCount }}</span>
      </t-button>
    </div>

    <!-- 添加日程 -->
    <t-dialog
      v-model:visible="addVisible"
      header="添加日程"
      width="520px"
      :confirm-btn="{ content: '加入排版计划' }"
      @confirm="confirmAdd"
    >
      <div class="form-item">
        <label class="form-label">日程名称</label>
        <t-input v-model="addForm.title" placeholder="例如：数学导数专题突破" clearable />
      </div>

      <div class="form-row">
        <div class="form-item">
          <label class="form-label">科目</label>
          <t-select v-model="addForm.category" :options="categoryOptions" />
        </div>
        <div class="form-item">
          <label class="form-label">时长（分钟）</label>
          <t-input-number v-model="addForm.duration" :min="5" :max="600" :step="5" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-item">
          <label class="form-label">日期</label>
          <t-date-picker
            v-model="addForm.date"
            value-type="YYYY-MM-DD"
            format="YYYY-MM-DD"
            style="width: 100%"
          />
        </div>
        <div class="form-item">
          <label class="form-label">开始时间</label>
          <t-select v-model="addForm.startHour" :options="hourOptions" />
        </div>
      </div>

      <div class="form-item">
        <label class="form-label">备注</label>
        <t-textarea
          v-model="addForm.note"
          placeholder="选填，例如：重点复盘第 3 题"
          :autosize="{ minRows: 2, maxRows: 4 }"
        />
      </div>
    </t-dialog>
  </div>
</template>

<style scoped>
/* 日程表与详情面板并排：面板展开时把日程表往左挤 */
.schedule {
  display: flex;
  align-items: flex-start;
}

.schedule__calendar-card {
  flex: 1;
  min-width: 0;
}

/* ---------- 日历网格 ---------- */

.calendar {
  --calendar-date-width: 118px;
  --calendar-hour-width: 124px;
  position: relative;
  max-height: 68vh;
  overflow: auto;
  overscroll-behavior: contain;
  /* 向前插入日期时由代码自己补偿滚动位置，关掉浏览器滚动锚定避免双重补偿 */
  overflow-anchor: none;
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

/* 所有日期行的容器：当前时间指示线按它的高度铺满 */
.calendar__body {
  position: relative;
}

/* 虚拟滚动的占位块：撑起未渲染日期行的高度，保证滚动条长度正确 */
.calendar__spacer {
  width: 100%;
  pointer-events: none;
}

.calendar__now-line {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 2;
  width: 2px;
  margin-left: -1px;
  background-color: var(--td-error-color);
  pointer-events: none;
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
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--td-component-stroke);
  background-color: var(--td-bg-color-container);
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

.calendar__row.is-weekend .calendar__cell {
  background-color: var(--td-bg-color-secondarycontainer);
}

.calendar__row.is-today .calendar__cell {
  background-color: var(--td-brand-color-light);
}

.calendar__cell.is-over {
  background-color: var(--td-brand-color-focus);
  box-shadow: inset 0 0 0 2px var(--td-brand-color);
}

.calendar__placeholder-text {
  font-size: 11px;
  color: var(--td-brand-color);
}

.calendar__add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  font-size: 14px;
  color: var(--td-text-color-placeholder);
  background-color: transparent;
  opacity: 0;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;
}

.calendar__cell:hover .calendar__add {
  opacity: 1;
}

.calendar__add:hover {
  color: #fff;
  background-color: var(--td-brand-color);
}

/* ---------- 计划块（宽度＝时间跨度，可左右拉伸） ---------- */

.plan-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* 拖动过程中禁止选中文字 */
.calendar.is-pointer-dragging {
  user-select: none;
}

/* 拖动投放的过程中让事件穿透到格子，才能用坐标反查落点 */
.calendar.is-pointer-dragging .plan-block {
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
  pointer-events: auto;
  cursor: grab;
  user-select: none;
  transition: box-shadow 0.15s ease;
}

.plan-block:hover {
  box-shadow: 0 3px 10px rgb(0 0 0 / 16%);
}

.plan-block:active {
  cursor: grabbing;
}

.plan-block.is-resizing {
  box-shadow: 0 0 0 2px var(--td-brand-color);
}

.plan-block.is-drag-source {
  opacity: 0.4;
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

.plan-block__handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 7px;
  cursor: col-resize;
  transition: background-color 0.15s ease;
}

.plan-block__handle--start {
  left: 0;
  border-radius: 5px 0 0 5px;
}

.plan-block__handle--end {
  right: 0;
  border-radius: 0 5px 5px 0;
}

.plan-block__handle:hover {
  background-color: rgb(0 82 217 / 28%);
}

/* ---------- 右下角待办清单 ---------- */

.todo-dock {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.todo-dock__panel {
  display: flex;
  flex-direction: column;
  width: 320px;
  max-height: 62vh;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--td-radius-large);
  background-color: var(--td-bg-color-container);
  box-shadow: 0 8px 28px rgb(0 0 0 / 14%);
  overflow: hidden;
  transition: border-color 0.2s ease;
}

.todo-dock__panel.is-drop-target {
  border-color: var(--td-brand-color);
  box-shadow: 0 8px 28px rgb(0 82 217 / 24%);
}

/* 待办收起时也要给出「松手就退回待办」的反馈 */
.todo-dock.is-drop-target .todo-dock__trigger {
  box-shadow:
    0 0 0 2px var(--td-brand-color),
    0 6px 20px rgb(0 82 217 / 32%);
}

.todo-dock__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px 10px;
}

.todo-dock__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
}

.todo-dock__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  font-size: 15px;
  color: var(--td-text-color-placeholder);
  background-color: transparent;
  cursor: pointer;
}

.todo-dock__close:hover {
  color: var(--td-text-color-primary);
  background-color: var(--td-bg-color-secondarycontainer);
}

.todo-dock__hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0 16px 12px;
  padding: 8px 10px;
  border-radius: var(--td-radius-medium);
  font-size: 12px;
  line-height: 1.65;
  color: var(--td-text-color-secondary);
  background-color: var(--td-bg-color-secondarycontainer);
}

.todo-dock__hint svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.todo-dock__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px 16px;
}

.todo-dock__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.todo-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--td-radius-medium);
  background-color: var(--td-bg-color-container);
  cursor: grab;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.todo-chip:hover {
  border-color: var(--td-brand-color);
  box-shadow: 0 2px 8px rgb(0 0 0 / 8%);
}

.todo-chip:active {
  cursor: grabbing;
}

.todo-chip.is-drag-source {
  opacity: 0.4;
}

.todo-chip__bar {
  width: 3px;
  align-self: stretch;
  border-radius: 2px;
  flex-shrink: 0;
}

.todo-chip__body {
  flex: 1;
  min-width: 0;
}

.todo-chip__title {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
}

.todo-chip__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}

.todo-chip__actions {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}

.todo-chip__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  font-size: 14px;
  color: var(--td-text-color-secondary);
  cursor: pointer;
}

.todo-chip__action:hover {
  color: var(--td-brand-color);
  background-color: var(--td-bg-color-secondarycontainer);
}

.todo-chip__action--danger:hover {
  color: var(--td-error-color);
}

.todo-dock__trigger {
  align-self: flex-end;
  box-shadow: 0 6px 20px rgb(0 82 217 / 32%);
}

.todo-dock__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--td-brand-color);
  background-color: #fff;
}

.dock-fade-enter-active,
.dock-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.dock-fade-enter-from,
.dock-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* ---------- 日程详情面板 ---------- */

/* 外层负责宽度过渡，内层保持固定宽度，这样展开时内容不会被挤变形 */
.detail-panel {
  flex: none;
  width: 0;
  overflow: hidden;
  transition:
    width 0.25s ease,
    margin-left 0.25s ease;
}

.detail-panel.is-open {
  width: 380px;
  margin-left: 16px;
}

.detail-panel__inner {
  width: 380px;
}

.detail-card__title {
  font-size: 15px;
  font-weight: 600;
}

.detail__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  color: var(--td-text-color-placeholder);
  background-color: transparent;
  cursor: pointer;
}

.detail__close:hover {
  color: var(--td-text-color-primary);
  background-color: var(--td-bg-color-secondarycontainer);
}

.detail__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 22px;
}

.detail__bar {
  width: 4px;
  min-height: 36px;
  align-self: stretch;
  border-radius: 2px;
  flex-shrink: 0;
}

.detail__head-main {
  flex: 1;
  min-width: 0;
}

.detail__title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
}

.detail__meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.detail__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ---------- 弹窗表单 ---------- */

.form-item {
  flex: 1;
  min-width: 0;
  margin-bottom: 16px;
}

.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--td-text-color-secondary);
}

.form-row {
  display: flex;
  gap: 16px;
}

@media (max-width: 1100px) {
  .detail-panel.is-open {
    width: 300px;
  }

  .detail-panel__inner {
    width: 300px;
  }
}

@media (max-width: 768px) {
  /* 小屏收窄列宽，18 列才不至于要横向拖很久 */
  .calendar {
    --calendar-date-width: 84px;
    --calendar-hour-width: 92px;
  }

  .todo-dock {
    right: 16px;
    bottom: 16px;
  }

  .todo-dock__panel {
    width: calc(100vw - 32px);
    max-height: 56vh;
  }

  .form-row {
    flex-direction: column;
    gap: 0;
  }
}
</style>
