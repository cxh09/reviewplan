import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { ensureWritable } from '@/utils/connection'
import { addDays, diffDays, parseDateKey, todayKey, toDateKey } from '@/utils/date'
import { createId } from '@/utils/id'
import {
  activeTombstones,
  markDeleted,
  markDeletedMany,
  setTombstones,
} from '@/utils/tombstone'
import { sanitizeLink } from '@/utils/url'

/**
 * 导出数据的格式版本；导入时用它判断备份是否来自更新的版本。
 * v2：导出内容在待办 / 计划之外额外带上了日程广场的系列合集。
 * v3：条目带上 updatedAt、快照带上 gaokaoDateUpdatedAt 与删除标记，用于两端按条目合并。
 */
export const DATA_VERSION = 3

/** 默认高考日期（2027 年高考首日） */
export const DEFAULT_GAOKAO_DATE = '2027-06-07'

/** 时间线可选时段 */
export const TIMELINE_HOURS = Array.from({ length: 18 }, (_, index) => index + 6) // 06:00 ~ 23:00

/** 时间轴起止小时，用于把导入数据里的开始时间夹回可视范围 */
const FIRST_HOUR = TIMELINE_HOURS[0]
const END_HOUR = TIMELINE_HOURS[TIMELINE_HOURS.length - 1] + 1

/** 排到时间线上时默认占用的时长（分钟）：先占满拖进去的那一小时，之后再拖块边缘调整 */
export const DEFAULT_SLOT_MINUTES = 60

/** 时长允许范围，与「添加日程 / 详情」里的 5 ~ 600 分钟保持一致 */
const MIN_DURATION = 5
const MAX_DURATION = 600

function toNumber(value, fallback) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/** 形如 `YYYY-MM-DD` 且是真实存在的日期（能原样往返），用来挡住导入的脏日期 */
function isValidDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  return toDateKey(parseDateKey(key)) === key
}

/** 兼容旧数据与导入数据：补齐待办缺失字段 */
function normalizeTodo(raw) {
  return {
    id: raw?.id || createId('todo'),
    title: `${raw?.title || ''}`.trim() || '未命名待办',
    category: raw?.category || '通用',
    level: raw?.level || '基础',
    duration: Math.round(clamp(toNumber(raw?.duration, 30), MIN_DURATION, MAX_DURATION)),
    desc: raw?.desc || '',
    link: sanitizeLink(raw?.link),
    source: raw?.source || 'manual',
    createdAt: toNumber(raw?.createdAt, Date.now()),
    // 0 表示历史数据（没有时间戳），合并时视为最旧
    updatedAt: toNumber(raw?.updatedAt, 0),
  }
}

/** 兼容旧数据与导入数据：在待办字段基础上补齐排班字段并夹回合法范围 */
function normalizePlan(raw) {
  return {
    ...normalizeTodo(raw),
    id: raw?.id || createId('plan'),
    todoId: raw?.todoId ?? null,
    date: isValidDateKey(raw?.date) ? raw.date : todayKey(),
    startHour: clamp(toNumber(raw?.startHour, FIRST_HOUR), FIRST_HOUR, END_HOUR - 0.25),
    duration: Math.round(
      clamp(toNumber(raw?.duration, DEFAULT_SLOT_MINUTES), MIN_DURATION, MAX_DURATION),
    ),
    originDuration: Number.isFinite(Number(raw?.originDuration))
      ? Number(raw.originDuration)
      : null,
    note: raw?.note || '',
    done: Boolean(raw?.done),
  }
}

/**
 * 复习清单的核心数据（全在线模式：数据以云端为唯一来源，本地不再落盘）：
 * - todos  待办清单（还没安排具体时间的复习任务）
 * - plans  排版计划（已安排到某天某个时段的复习任务）
 *
 * 初始为空，启动后由 sync store 拉取云端快照填充；任何改动经 sync 推回云端。
 */
export const usePlanStore = defineStore('plan', () => {
  const gaokaoDate = ref(DEFAULT_GAOKAO_DATE)
  const todos = ref([])
  const plans = ref([])
  /** 高考日期自身的修改时间：合并两端快照时用来判断该用谁的日期 */
  const gaokaoDateUpdatedAt = ref(0)

  // ---------- 派生数据 ----------

  const daysToGaokao = computed(() => diffDays(todayKey(), gaokaoDate.value))
  const todoCount = computed(() => todos.value.length)
  const planCount = computed(() => plans.value.length)
  const donePlanCount = computed(() => plans.value.filter((plan) => plan.done).length)
  const completionRate = computed(() =>
    planCount.value ? Math.round((donePlanCount.value / planCount.value) * 100) : 0,
  )

  function plansOfDate(date) {
    return plans.value
      .filter((plan) => plan.date === date)
      .sort((a, b) => a.startHour - b.startHour)
  }

  /** 未来 7 天里已经排过班的日子 */
  const upcomingGroups = computed(() => {
    const base = todayKey()
    const groups = []
    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDays(base, offset)
      const items = plansOfDate(date)
      if (items.length) groups.push({ date, items })
    }
    return groups
  })

  const weekStats = computed(() => {
    let total = 0
    let done = 0
    upcomingGroups.value.forEach((group) => {
      total += group.items.length
      done += group.items.filter((item) => item.done).length
    })
    return { total, done, rate: total ? Math.round((done / total) * 100) : 0 }
  })

  // ---------- 待办清单 ----------

  /** 加入待办清单，同标题同科目视为同一条 */
  function addTodo({
    title,
    category = '通用',
    duration = 30,
    level = '基础',
    desc = '',
    link = '',
    source = 'manual',
  }) {
    if (!ensureWritable()) return null

    const trimmed = `${title || ''}`.trim()
    if (!trimmed) return null

    const existing = todos.value.find(
      (todo) => todo.title === trimmed && todo.category === category,
    )
    if (existing) return existing

    const todo = {
      id: createId('todo'),
      title: trimmed,
      category,
      duration: Number(duration) || 30,
      level,
      desc,
      link: sanitizeLink(link),
      source,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    todos.value.push(todo)
    return todo
  }

  function removeTodo(id) {
    if (!ensureWritable()) return
    markDeleted(id)
    todos.value = todos.value.filter((todo) => todo.id !== id)
  }

  /**
   * 待办里是否已有这条日程。
   * 传了 category 时按「标题 + 科目」判断，与 addTodo 的去重口径保持一致；
   * 不传时只按标题判断。
   */
  function hasTodo(title, category) {
    const trimmed = `${title || ''}`.trim()
    if (!trimmed) return false
    return todos.value.some(
      (todo) => todo.title === trimmed && (category === undefined || todo.category === category),
    )
  }

  // ---------- 排版计划 ----------

  function addPlan({
    title,
    category = '通用',
    duration = DEFAULT_SLOT_MINUTES,
    level = '基础',
    desc = '',
    link = '',
    source = 'manual',
    date,
    startHour,
    note = '',
    todoId = null,
    originDuration = null,
  }) {
    if (!ensureWritable()) return null

    const plan = {
      id: createId('plan'),
      todoId,
      title,
      category,
      duration: Number(duration) || DEFAULT_SLOT_MINUTES,
      originDuration,
      level,
      desc,
      link: sanitizeLink(link),
      source,
      date,
      startHour,
      note,
      done: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    plans.value.push(plan)
    return plan
  }

  /** 把待办清单里的条目拖到时间线上：从待办移到计划 */
  function scheduleFromTodo(todoId, date, startHour, duration, note = '') {
    if (!ensureWritable()) return null

    const index = todos.value.findIndex((todo) => todo.id === todoId)
    if (index === -1) return null

    const [todo] = todos.value.splice(index, 1)
    // 待办被「消耗」成计划：记一笔删除，否则合并时会被另一端的副本复活
    markDeleted(todo.id)
    // 没指定时长时默认用待办的预估耗时，之后再拖块边缘调整跨度
    return addPlan({
      ...todo,
      todoId: todo.id,
      date,
      startHour,
      duration: Number(duration) || todo.duration || DEFAULT_SLOT_MINUTES,
      originDuration: todo.duration,
      note,
    })
  }

  /** 把计划退回到待办清单 */
  function unschedulePlan(planId) {
    if (!ensureWritable()) return

    const index = plans.value.findIndex((plan) => plan.id === planId)
    if (index === -1) return

    const [plan] = plans.value.splice(index, 1)
    markDeleted(plan.id)
    todos.value.push({
      id: createId('todo'),
      title: plan.title,
      category: plan.category,
      // 排班时可能被改成了一小时，退回待办还原成条目原本的时长
      duration: Number(plan.originDuration) || plan.duration,
      level: plan.level,
      desc: plan.desc,
      link: plan.link || '',
      source: plan.source || 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  }

  function movePlan(planId, date, startHour) {
    if (!ensureWritable()) return

    const plan = plans.value.find((item) => item.id === planId)
    if (!plan) return
    plan.date = date
    plan.startHour = startHour
    plan.updatedAt = Date.now()
  }

  /** 横向拉伸计划块：调整开始时间 / 时长（时间跨度） */
  function resizePlan(planId, { startHour, duration }) {
    if (!ensureWritable()) return

    const plan = plans.value.find((item) => item.id === planId)
    if (!plan) return
    if (Number.isFinite(startHour)) plan.startHour = startHour
    if (Number.isFinite(duration)) plan.duration = Math.max(Math.round(duration), 15)
    plan.updatedAt = Date.now()
  }

  /**
   * 详情面板的批量更新。所有字段都会先归一化，
   * 空标题、非法日期这类值不会覆盖原值，避免计划被改成空后从日历上消失。
   */
  function updatePlan(planId, patch) {
    if (!ensureWritable()) return null

    const plan = plans.value.find((item) => item.id === planId)
    if (!plan) return null

    if (patch.title !== undefined) {
      const title = `${patch.title || ''}`.trim()
      if (title) plan.title = title
    }
    if (patch.category !== undefined && patch.category) plan.category = patch.category
    if (patch.level !== undefined && patch.level) plan.level = patch.level
    if (patch.desc !== undefined) plan.desc = patch.desc
    if (patch.link !== undefined) plan.link = sanitizeLink(patch.link)
    if (patch.note !== undefined) plan.note = patch.note
    if (patch.date !== undefined && isValidDateKey(patch.date)) plan.date = patch.date
    if (patch.startHour !== undefined) {
      plan.startHour = clamp(toNumber(patch.startHour, plan.startHour), FIRST_HOUR, END_HOUR - 0.25)
    }
    if (patch.duration !== undefined) {
      plan.duration = Math.round(
        clamp(toNumber(patch.duration, plan.duration), MIN_DURATION, MAX_DURATION),
      )
    }

    plan.updatedAt = Date.now()
    return plan
  }

  function togglePlanDone(planId) {
    if (!ensureWritable()) return
    const plan = plans.value.find((item) => item.id === planId)
    if (!plan) return
    plan.done = !plan.done
    plan.updatedAt = Date.now()
  }

  function removePlan(planId) {
    if (!ensureWritable()) return
    markDeleted(planId)
    plans.value = plans.value.filter((plan) => plan.id !== planId)
  }

  // ---------- 设置与数据管理 ----------

  function setGaokaoDate(date) {
    if (!ensureWritable()) return
    if (!date) return
    gaokaoDate.value = date
    gaokaoDateUpdatedAt.value = Date.now()
  }

  function exportData() {
    return JSON.stringify(
      {
        version: DATA_VERSION,
        exportedAt: new Date().toISOString(),
        gaokaoDate: gaokaoDate.value,
        gaokaoDateUpdatedAt: gaokaoDateUpdatedAt.value,
        todos: todos.value,
        plans: plans.value,
        deleted: activeTombstones(),
      },
      null,
      2,
    )
  }

  function importData(payload) {
    const data = typeof payload === 'string' ? JSON.parse(payload) : payload
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('数据格式不正确')
    }

    // 备份来自更新版本时，按旧结构解析可能丢字段，直接拒绝并给出明确提示
    const version = Number(data.version)
    if (Number.isFinite(version) && version > DATA_VERSION) {
      throw new Error('备份文件来自更新的版本，请升级应用后再导入')
    }

    // 逐条归一化：缺 id / 非法日期 / 越界时长都会被修正，不会写进脏数据
    if (Array.isArray(data.todos)) todos.value = data.todos.map(normalizeTodo)
    if (Array.isArray(data.plans)) plans.value = data.plans.map(normalizePlan)
    if (isValidDateKey(data.gaokaoDate)) {
      gaokaoDate.value = data.gaokaoDate
      // 快照没带时间戳（历史数据）就记 0，避免本地旧时间戳让后续合并判断失真
      gaokaoDateUpdatedAt.value = toNumber(data.gaokaoDateUpdatedAt, 0)
    }
    if (Array.isArray(data.deleted)) setTombstones(data.deleted)
  }

  function resetAll() {
    if (!ensureWritable()) return
    // 清空也是一次删除：不记标记的话，另一端残留的副本会把数据带回来
    markDeletedMany([...todos.value.map((item) => item.id), ...plans.value.map((item) => item.id)])
    todos.value = []
    plans.value = []
    gaokaoDate.value = DEFAULT_GAOKAO_DATE
    gaokaoDateUpdatedAt.value = Date.now()
  }

  return {
    // state
    gaokaoDate,
    gaokaoDateUpdatedAt,
    todos,
    plans,
    // getters
    daysToGaokao,
    todoCount,
    planCount,
    donePlanCount,
    completionRate,
    upcomingGroups,
    weekStats,
    plansOfDate,
    hasTodo,
    // actions
    addTodo,
    removeTodo,
    scheduleFromTodo,
    unschedulePlan,
    movePlan,
    resizePlan,
    updatePlan,
    togglePlanDone,
    removePlan,
    setGaokaoDate,
    exportData,
    importData,
    resetAll,
  }
})
