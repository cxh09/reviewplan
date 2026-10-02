/**
 * 古诗文挖空背诵引擎（纯函数，无框架依赖）。
 *
 * 与移动端 `lib/services/recitation.dart` 是同一算法的两份实现：
 * 相同的哈希（FNV-1a）、相同的随机流（mulberry32）、相同的遍历顺序，
 * 保证「同一篇目 + 同一难度」在双端挖出的空位与候选字完全一致。
 * 任何算法改动都必须同步另一端，并用双端单测的固定期望值锁死
 * （parity 验证：node scripts/check_recitation_parity.mjs）。
 *
 * 文本库 JSON 由调用方注入（src/data/recitations.js），这里不直接 import，
 * 保证 Node 脚本可以无转换直接复用本模块。
 */

/** 合集条目 link 形如 https://www.gushiwenku.cn/shiwen/<slug>/ */
const SLUG_RE = /gushiwenku\.cn\/shiwen\/([0-9a-f]+)\/?/

/** 难度分档：挖空比例（只挖汉字，标点与【】序号保留） */
export const RECITE_LEVELS = [
  { key: 'easy', label: '简单', ratio: 0.2 },
  { key: 'medium', label: '中等', ratio: 0.35 },
  { key: 'hard', label: '困难', ratio: 0.55 },
]

/** 每空候选字数（1 个正确 + 7 个干扰） */
export const CANDIDATE_COUNT = 8

/** 句末标点：用于「不会的句子」归属与断句展示 */
const SENTENCE_END = '。！？；'

/** 汉字判定（CJK 统一表意文字 + 扩展 A），与 Dart 侧一致 */
export function isHanChar(ch) {
  const code = ch.codePointAt(0)
  return code >= 0x3400 && code <= 0x9fff
}

/** 标题归一化：去《》〈〉()（）·、空白，用于 slug 匹配失败时的标题兜底 */
export function normalizeTitle(text) {
  return `${text || ''}`.replace(/[《》〈〉()（）·、\s]/g, '')
}

/** 标题索引（按库实例懒建缓存）：归一化标题 → 篇目条目 */
const titleIndexCache = new WeakMap()
function getTitleIndex(recitations) {
  let index = titleIndexCache.get(recitations)
  if (!index) {
    index = new Map()
    for (const [slug, entry] of Object.entries(recitations)) {
      index.set(normalizeTitle(entry.title), { slug, ...entry })
    }
    titleIndexCache.set(recitations, index)
  }
  return index
}

/**
 * 按计划的 link（优先）或标题（兜底）查找背诵篇目；
 * 返回 null 表示该计划不是古诗文条目，不应显示背诵入口。
 */
export function findRecitation(link, title, recitations) {
  const m = SLUG_RE.exec(`${link || ''}`)
  if (m && recitations[m[1]]) {
    return { slug: m[1], ...recitations[m[1]] }
  }
  return getTitleIndex(recitations).get(normalizeTitle(title)) || null
}

/** FNV-1a 32 位哈希；输入按 UTF-16 code unit 遍历，与 Dart 实现一致 */
export function hashSeed(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** mulberry32 种子随机数：每次调用返回 [0,1) */
export function createRng(seed) {
  let state = seed >>> 0
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates：从尾到头，j = floor(rng * (i + 1))；双端必须同序 */
function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = list[i]
    list[i] = list[j]
    list[j] = tmp
  }
  return list
}

/**
 * 生成一篇挖空谜题。
 *
 * 返回：
 * - paras：逐段字符数组，元素 { ch, blankId(-1 表示不挖), sentence }
 * - blanks：按文本顺序的空列表 { id, char, para, pos, sentenceText, candidates }
 * - total / level
 */
export function buildPuzzle(entry, levelKey) {
  const level = RECITE_LEVELS.find((l) => l.key === levelKey) || RECITE_LEVELS[0]
  const rng = createRng(hashSeed(`${entry.slug}:${level.key}`))

  // 1) 逐段拆字符，标出句子号与句内文本
  const paras = []
  const hanPositions = [] // 每个汉字在「全篇汉字序列」中的序号 → { para, pos }
  const sentenceTexts = [] // [para][sentenceIdx] → 句子原文
  entry.paragraphs.forEach((text, paraIdx) => {
    const chars = []
    let sentenceIdx = 0
    let sentenceBuf = ''
    sentenceTexts.push([])
    for (const ch of text) {
      chars.push({ ch, blankId: -1, sentence: sentenceIdx })
      sentenceBuf += ch
      if (isHanChar(ch)) {
        hanPositions.push({ para: paraIdx, pos: chars.length - 1 })
      }
      if (SENTENCE_END.includes(ch)) {
        sentenceTexts[paraIdx][sentenceIdx] = sentenceBuf
        sentenceBuf = ''
        sentenceIdx += 1
      }
    }
    if (sentenceBuf) sentenceTexts[paraIdx][sentenceIdx] = sentenceBuf
    paras.push(chars)
  })

  // 2) 种子洗牌选空位（按文本顺序编号）
  const total = Math.max(1, Math.round(hanPositions.length * level.ratio))
  const order = shuffle(
    hanPositions.map((_, i) => i),
    rng,
  ).slice(0, total)
  order.sort((a, b) => a - b)

  const blanks = []
  const uniqueChars = []
  const seenChar = new Set()
  for (const { para, pos } of hanPositions) {
    const ch = paras[para][pos].ch
    if (!seenChar.has(ch)) {
      seenChar.add(ch)
      uniqueChars.push(ch)
    }
  }
  order.forEach((hanIdx, blankId) => {
    const { para, pos } = hanPositions[hanIdx]
    const answer = paras[para][pos].ch
    // 干扰字：唯一字池种子洗牌后取 7 个非答案；再与答案一起洗乱
    const pool = shuffle([...uniqueChars], rng)
    const distractors = []
    for (const ch of pool) {
      if (ch !== answer) distractors.push(ch)
      if (distractors.length >= CANDIDATE_COUNT - 1) break
    }
    const candidates = shuffle([answer, ...distractors], rng)
    paras[para][pos].blankId = blankId
    const sentence = paras[para][pos].sentence
    blanks.push({
      id: blankId,
      char: answer,
      para,
      pos,
      sentence,
      sentenceText: sentenceTexts[para][sentence] || '',
      candidates,
    })
  })

  return { level: level.key, total: blanks.length, paras, blanks }
}

/**
 * 一次背诵会话：判定、首次对错记录与结果汇总。
 * 正确率 = 首次答对的空数 / 总空数；答错后可重填，但不改判分。
 */
export function createReciteSession(puzzle) {
  const filled = new Array(puzzle.total).fill('')
  const firstTry = new Array(puzzle.total).fill(0) // 0 未填 / 1 首对 / 2 首错
  const wrongCharSet = new Set()
  const wrongSentenceSet = new Set()

  return {
    /** 填第 id 个空，返回本次是否正确；已首对的空拒绝再改 */
    fill(id, ch) {
      if (id < 0 || id >= puzzle.total) return false
      if (firstTry[id] === 1) return filled[id] === ch
      const blank = puzzle.blanks[id]
      const correct = ch === blank.char
      filled[id] = correct ? ch : ''
      if (firstTry[id] === 0) {
        firstTry[id] = correct ? 1 : 2
        if (!correct) {
          wrongCharSet.add(blank.char)
          if (blank.sentenceText) wrongSentenceSet.add(blank.sentenceText)
        }
      } else if (correct) {
        // 首错后重对：wrong 记录保留，仅更新填充
      }
      return correct
    },
    isCorrect(id) {
      return firstTry[id] === 1 && filled[id] !== ''
    },
    isWrong(id) {
      return firstTry[id] === 2 && filled[id] === ''
    },
    progress() {
      let done = 0
      let right = 0
      for (let i = 0; i < puzzle.total; i += 1) {
        if (filled[i]) done += 1
        if (firstTry[i] === 1) right += 1
      }
      return { done, right, total: puzzle.total }
    },
    /** 当前正确率（0-100），按首次判定 */
    rate() {
      const { right, total } = this.progress()
      return total ? Math.round((right / total) * 100) : 0
    },
    finished() {
      return this.progress().done >= puzzle.total
    },
    /** 落库结果（与 plan.recite 结构一致） */
    result() {
      const { total } = this.progress()
      return {
        at: Date.now(),
        rate: this.rate(),
        total,
        wrongChars: [...wrongCharSet].slice(0, 50),
        wrongSentences: [...wrongSentenceSet].slice(0, 10),
      }
    },
  }
}

/** 清洗任意来源的 recite 结果（快照/导入兜底）；非法返回 null */
export function normalizeRecite(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rate = Math.min(100, Math.max(0, Number(raw.rate) || 0))
  const total = Math.max(0, Math.round(Number(raw.total) || 0))
  const at = Number(raw.at) || 0
  const strList = (list, max, cap) =>
    Array.isArray(list)
      ? list.map((x) => `${x}`.slice(0, cap)).filter(Boolean).slice(0, max)
      : []
  return {
    at,
    rate,
    total,
    wrongChars: strList(raw.wrongChars, 50, 4),
    wrongSentences: strList(raw.wrongSentences, 10, 120),
  }
}
