const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

/** 转成 `YYYY-MM-DD` 字符串（本地时区） */
export function toDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const year = d.getFullYear()
  const month = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 今天 */
export function todayKey() {
  return toDateKey(new Date())
}

/** `YYYY-MM-DD` 字符串转本地 0 点的 Date */
export function parseDateKey(key) {
  if (!key) return new Date()
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** 在日期上加减天数 */
export function addDays(key, days) {
  const d = parseDateKey(key)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

/** 两个日期相差的天数（to - from） */
export function diffDays(fromKey, toKey) {
  const from = parseDateKey(fromKey)
  const to = parseDateKey(toKey)
  return Math.round((to.getTime() - from.getTime()) / 86400000)
}

/** `2026 年 9 月 11 日` */
export function formatCN(key) {
  const d = parseDateKey(key)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

/** `星期五` */
export function weekdayCN(key) {
  return WEEKDAYS[parseDateKey(key).getDay()]
}

/** 是否是今天 */
export function isToday(key) {
  return key === todayKey()
}

/** 是否是过去 */
export function isPast(key) {
  return diffDays(todayKey(), key) < 0
}

/** 把小时数字格式化成 `09:00` */
export function formatHour(hour) {
  return `${`${hour}`.padStart(2, '0')}:00`
}

const WEEKDAY_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** `周一` */
export function weekdayShortCN(key) {
  return WEEKDAY_SHORT[parseDateKey(key).getDay()]
}

/** `9月11日` */
export function formatMD(key) {
  const d = parseDateKey(key)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

/** 从 startKey 开始连续 days 天的日期数组 */
export function dateRange(startKey, days) {
  return Array.from({ length: days }, (_, index) => addDays(startKey, index))
}
