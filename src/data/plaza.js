/** 科目（第一项「全部」用于筛选栏） */
export const PLAZA_CATEGORIES = [
  '全部',
  '语文',
  '数学',
  '英语',
  '物理',
  '化学',
  '生物',
  '文综',
  '通用',
]

/** 可选科目（不含「全部」） */
export const CATEGORY_OPTIONS = PLAZA_CATEGORIES.filter((item) => item !== '全部')

/** 新建日程时的默认预计时长（分钟） */
export const DEFAULT_ITEM_DURATION = 30

/** 合集可选主题色 */
export const COLLECTION_COLORS = [
  '#0052d9',
  '#00a870',
  '#ed7b2f',
  '#d54941',
  '#7b4ee0',
  '#0e7a8a',
  '#b8860b',
  '#64748b',
]

/** 科目主题色，用于计划卡片左侧色条与标签 */
export const CATEGORY_COLORS = {
  语文: '#d54941',
  数学: '#0052d9',
  英语: '#7b4ee0',
  物理: '#0e7a8a',
  化学: '#ed7b2f',
  生物: '#00a870',
  文综: '#b8860b',
  通用: '#64748b',
}

/** 难度对应的 TDesign Tag 主题 */
export const LEVEL_THEME = {
  基础: 'primary',
  提升: 'warning',
  冲刺: 'danger',
}

/** 科目展示色，未知科目兜底为「通用」色 */
export function categoryColor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.通用
}

/** 难度对应的 TDesign Tag 主题，未知难度兜底为 default */
export function levelTheme(level) {
  return LEVEL_THEME[level] || 'default'
}
