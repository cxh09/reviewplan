import { createId } from '@/utils/id'

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

/** 可选难度 */
export const LEVEL_OPTIONS = ['基础', '提升', '冲刺']

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

/**
 * 内置系列合集模板：
 * 第一次打开日程广场时会自动写入，之后用户可以随意改名、改内容或删除。
 */
const COLLECTION_TEMPLATES = [
  {
    name: '语文晨读与积累',
    desc: '早读时间段专用的背诵与积累类日程，把硬功夫做扎实。',
    category: '语文',
    items: [
      {
        title: '古诗词默写过关',
        level: '基础',
        duration: 20,
        desc: '默写必背篇目中的高频名句，错别字单独抄写三遍并标记。',
      },
      {
        title: '文言文实词虚词梳理',
        level: '基础',
        duration: 30,
        desc: '整理 120 个常考实词与 18 个虚词的义项，配例句记忆。',
      },
      {
        title: '作文素材积累与仿写',
        level: '提升',
        duration: 40,
        desc: '积累 3 个时政 / 人物素材，各写一段 150 字的论证段落。',
      },
    ],
  },
  {
    name: '数学专题突破',
    desc: '按专题拆分的整块训练，建议在精力最好的时段完成。',
    category: '数学',
    items: [
      {
        title: '三角函数公式默写',
        level: '基础',
        duration: 20,
        desc: '默写诱导公式、和差化积、辅助角公式，限时完成。',
      },
      {
        title: '函数与导数专题刷题',
        level: '提升',
        duration: 60,
        desc: '完成 8 道导数大题，重点复盘单调性与极值点的分类讨论。',
      },
      {
        title: '解析几何错题重做',
        level: '提升',
        duration: 60,
        desc: '从错题本挑 5 道圆锥曲线题重做，整理设而不求的通用步骤。',
      },
      {
        title: '概率统计限时训练',
        level: '提升',
        duration: 45,
        desc: '限时完成一套概率统计小题 + 一道分布列大题。',
      },
    ],
  },
  {
    name: '英语每日训练',
    desc: '每天固定量的词汇、阅读与写作训练，保持语感。',
    category: '英语',
    items: [
      {
        title: '高考核心词汇背诵',
        level: '基础',
        duration: 30,
        desc: '背诵 50 个高频词汇，配套完成一道语法填空。',
      },
      {
        title: '阅读理解限时训练',
        level: '提升',
        duration: 40,
        desc: '限时完成 4 篇阅读，逐题标注原文定位句。',
      },
      {
        title: '完形填空精读',
        level: '提升',
        duration: 30,
        desc: '精读一篇完形，整理上下文的逻辑连接词与固定搭配。',
      },
      {
        title: '英语应用文模板背诵',
        level: '基础',
        duration: 25,
        desc: '背熟申请信、建议信、通知三类模板，各默写一遍。',
      },
    ],
  },
  {
    name: '物理模型与实验',
    desc: '先归纳模型，再攻实验题，答题话术一并整理。',
    category: '物理',
    items: [
      {
        title: '力学模型归纳',
        level: '提升',
        duration: 45,
        desc: '归纳板块、传送带、连接体三大力学模型的处理思路。',
      },
      {
        title: '电磁学实验题专项',
        level: '提升',
        duration: 45,
        desc: '专攻伏安特性曲线与电表改装，整理误差分析的答题话术。',
      },
    ],
  },
  {
    name: '化学方程式与推断',
    desc: '方程式是基本功，有机推断靠官能团转化关系熟练度。',
    category: '化学',
    items: [
      {
        title: '化学方程式默写',
        level: '基础',
        duration: 20,
        desc: '默写元素化合物主干方程式，标注反应条件与现象。',
      },
      {
        title: '有机推断题突破',
        level: '提升',
        duration: 50,
        desc: '完成 3 道有机推断，梳理官能团转化的顺时针 / 逆时针推断法。',
      },
    ],
  },
  {
    name: '生物概念与遗传',
    desc: '课本回读打底，遗传计算专项提分。',
    category: '生物',
    items: [
      {
        title: '课本基础概念回读',
        level: '基础',
        duration: 30,
        desc: '回读必修二、必修三重点章节，用思维导图整理核心概念。',
      },
      {
        title: '遗传规律计算专项',
        level: '提升',
        duration: 45,
        desc: '针对自由组合与伴性遗传的计算题做 10 道专项训练。',
      },
    ],
  },
  {
    name: '文综热点与框架',
    desc: '时政热点对应学科原理，形成自己的答题框架。',
    category: '文综',
    items: [
      {
        title: '时政热点整理',
        level: '提升',
        duration: 40,
        desc: '整理近一个月时政热点，每个热点对应学科原理做三点分析。',
      },
    ],
  },
  {
    name: '通用复习习惯',
    desc: '不分科目的日常动作，建议固定到每天的固定时段。',
    category: '通用',
    items: [
      {
        title: '错题本复盘',
        level: '提升',
        duration: 30,
        desc: '复盘本周所有错题，按「概念不清 / 审题失误 / 计算错误」归类。',
      },
      {
        title: '限时套卷模拟',
        level: '冲刺',
        duration: 120,
        desc: '按高考时间完成一整套真题，严格计时并批改打分。',
      },
      {
        title: '睡前知识框架回忆',
        level: '基础',
        duration: 15,
        desc: '睡前不看笔记，在脑中回忆当天复习的学科知识框架。',
      },
    ],
  },
]

/** 生成一份全新的内置系列合集（带 id，可直接写入 store） */
export function createTemplateCollections() {
  return COLLECTION_TEMPLATES.map((template) => ({
    id: createId('col'),
    name: template.name,
    desc: template.desc,
    category: template.category,
    color: CATEGORY_COLORS[template.category] || COLLECTION_COLORS[0],
    builtin: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    items: template.items.map((item) => ({
      id: createId('item'),
      title: item.title,
      category: template.category,
      level: item.level,
      duration: item.duration || DEFAULT_ITEM_DURATION,
      desc: item.desc || '',
    })),
  }))
}
