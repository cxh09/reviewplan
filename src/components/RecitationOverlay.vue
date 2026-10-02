<script setup>
import { computed, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next/es/message'

import recitations from '@/data/recitations'
import { usePlanStore } from '@/stores/plan'
import { RECITE_LEVELS, buildPuzzle, createReciteSession, findRecitation } from '@/utils/recitation'

/**
 * 古诗文挖空背诵全屏遮罩（对应需求截图：难度 / 重背 / 原文 / 关闭 + 候选字 + 状态条）。
 *
 * 引擎在 utils/recitation.js（纯函数，与移动端逐位一致）；这里只管渲染与交互：
 * - 点选模式：点空格选中 → 点底部候选字填入；
 * - 输入模式：点空格弹出内联输入框，敲一个字立即判定并自动跳下一空。
 * 全部填完出现「完成」→ 写入 plan.recite 并标记完成。
 */
const props = defineProps({
  plan: { type: Object, required: true },
})
const emit = defineEmits(['close'])

const planStore = usePlanStore()
const entry = findRecitation(props.plan.link, props.plan.title, recitations)

const levelOptions = RECITE_LEVELS.map((l) => ({ value: l.key, label: `难度(${l.label})` }))
const level = ref('easy')
const showOriginal = ref(false)
const inputMode = ref(false)

const puzzle = ref(null)
const session = ref(null)
const tick = ref(0) // session 是普通对象，改判分后自增触发模板刷新
const filled = reactive({}) // blankId → 已正确填入的字
const activeBlank = ref(-1) // 点选模式下当前选中的空
const inputRef = ref(null)

function rebuild() {
  puzzle.value = buildPuzzle(entry, level.value)
  session.value = createReciteSession(puzzle.value)
  Object.keys(filled).forEach((key) => delete filled[key])
  activeBlank.value = puzzle.value.blanks[0]?.id ?? -1
  tick.value += 1
}
rebuild()

const progress = computed(() => {
  void tick.value
  return session.value.progress()
})
const rate = computed(() => {
  void tick.value
  return session.value.rate()
})
const finished = computed(() => {
  void tick.value
  return session.value.finished()
})

function blankOf(id) {
  return puzzle.value.blanks[id]
}
function blankState(id) {
  void tick.value
  if (session.value.isCorrect(id)) return 'right'
  if (session.value.isWrong(id)) return 'wrong'
  return 'open'
}

function nextOpenBlank(fromId) {
  const blanks = puzzle.value.blanks
  for (let step = 1; step <= blanks.length; step += 1) {
    const candidate = blanks[(fromId + step) % blanks.length]
    if (!session.value.isCorrect(candidate.id)) return candidate.id
  }
  return -1
}

/** 填一个空：正确即锁定并前进；错误标红，可重选 */
function fillBlank(id, ch) {
  if (session.value.isCorrect(id)) return
  const correct = session.value.fill(id, ch)
  if (correct) {
    filled[id] = ch
    activeBlank.value = nextOpenBlank(id)
  }
  tick.value += 1
}

function onChipTap(ch) {
  if (activeBlank.value < 0) return
  fillBlank(activeBlank.value, ch)
}

function onBlankTap(id) {
  if (session.value.isCorrect(id)) return
  activeBlank.value = id
  if (inputMode.value) {
    // 等模板把 input 渲染出来再聚焦
    requestAnimationFrame(() => inputRef.value?.focus())
  }
}

function onInput(id, event) {
  const ch = (event.target.value || '').trim()
  event.target.value = ''
  if (!ch) return
  fillBlank(id, ch)
}

function switchMode(toInput) {
  inputMode.value = toInput
  if (!toInput) return
  if (activeBlank.value < 0) activeBlank.value = puzzle.value.blanks[0]?.id ?? -1
  requestAnimationFrame(() => inputRef.value?.focus())
}

function switchLevel(value) {
  level.value = value
  showOriginal.value = false
  rebuild()
}

function save() {
  const result = session.value.result()
  planStore.updatePlan(props.plan.id, { recite: result, done: true })
  MessagePlugin.success(`背诵完成：正确率 ${result.rate}%${result.wrongChars.length ? '，错题已记入完成详情' : ''}`)
  emit('close')
}
</script>

<template>
  <div class="recite">
    <div class="recite__bar">
      <select class="recite__select" :value="level" @change="switchLevel($event.target.value)">
        <option v-for="opt in levelOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
      <button type="button" class="recite__btn" @click="rebuild">重背</button>
      <button type="button" class="recite__btn" :class="{ 'is-active': showOriginal }" @click="showOriginal = !showOriginal">
        原文
      </button>
      <button
        type="button"
        class="recite__btn"
        :class="{ 'is-active': inputMode }"
        :title="inputMode ? '切换为点选候选字' : '切换为键盘输入'"
        @click="switchMode(!inputMode)"
      >
        {{ inputMode ? '输入模式' : '点选模式' }}
      </button>
      <span class="recite__name">{{ entry.title }}<template v-if="entry.author"> · {{ entry.author }}</template></span>
      <button type="button" class="recite__btn recite__btn--close" aria-label="关闭" @click="emit('close')">
        关闭
      </button>
    </div>

    <div class="recite__body">
      <template v-if="showOriginal">
        <p v-for="(para, i) in entry.paragraphs" :key="i" class="recite__para">{{ para }}</p>
      </template>
      <template v-else>
        <p v-for="(chars, paraIdx) in puzzle.paras" :key="paraIdx" class="recite__para">
          <template v-for="(cell, posIdx) in chars" :key="posIdx">
            <span
              v-if="cell.blankId >= 0 && !inputMode"
              class="recite__blank"
              :class="[`is-${blankState(cell.blankId)}`, { 'is-active': activeBlank === cell.blankId }]"
              @click="onBlankTap(cell.blankId)"
            >{{ blankState(cell.blankId) === 'right' ? filled[cell.blankId] : '' }}</span>
            <span v-else-if="cell.blankId >= 0" class="recite__blank-wrap">
              <span
                class="recite__blank"
                :class="[`is-${blankState(cell.blankId)}`, { 'is-active': activeBlank === cell.blankId }]"
                @click="onBlankTap(cell.blankId)"
              >
                <template v-if="blankState(cell.blankId) === 'right'">{{ filled[cell.blankId] }}</template>
                <input
                  v-else-if="activeBlank === cell.blankId"
                  ref="inputRef"
                  class="recite__input"
                  maxlength="1"
                  @input="onInput(cell.blankId, $event)"
                  @keyup.esc="emit('close')"
                />
              </span>
            </span>
            <span v-else>{{ cell.ch }}</span>
          </template>
        </p>
      </template>
    </div>

    <div class="recite__foot">
      <div v-if="!inputMode && !showOriginal" class="recite__chips">
        <button
          v-for="(ch, i) in activeBlank >= 0 ? blankOf(activeBlank).candidates : []"
          :key="`${activeBlank}-${i}`"
          type="button"
          class="recite__chip"
          @click="onChipTap(ch)"
        >
          {{ ch }}
        </button>
      </div>
      <div class="recite__stat">
        <span>已完成: {{ progress.done }}/{{ progress.total }}</span>
        <span class="recite__stat-sep">|</span>
        <span>正确率: {{ rate }}%</span>
        <button v-if="finished" type="button" class="recite__done-btn" @click="save">完成</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 全屏遮罩：盖住日程表（image-viewer 2600 之上还要看原图，这里取 2500） */
.recite {
  position: fixed;
  inset: 0;
  z-index: 2500;
  display: flex;
  flex-direction: column;
  background: var(--td-bg-color-page);
}

.recite__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--td-component-stroke);
  flex-shrink: 0;
}

.recite__name {
  flex: 1;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 8px;
}

.recite__select,
.recite__btn {
  height: 32px;
  padding: 0 12px;
  font-size: 15px;
  color: var(--td-text-color-primary);
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
  cursor: pointer;
}

.recite__btn.is-active {
  color: var(--td-brand-color);
  border-color: var(--td-brand-color);
}

.recite__btn--close {
  flex-shrink: 0;
}

.recite__body {
  flex: 1;
  overflow-y: auto;
  padding: 24px clamp(16px, 6vw, 96px);
}

.recite__para {
  margin: 0 0 22px;
  font-size: 21px;
  line-height: 2.1;
  color: var(--td-text-color-primary);
}

/* 空格：下划线占位，未填时保持一个字宽 */
.recite__blank,
.recite__blank-wrap {
  display: inline-block;
}

.recite__blank {
  width: 1.2em;
  text-align: center;
  border-bottom: 2px solid var(--td-text-color-secondary);
  color: var(--td-text-color-primary);
  cursor: pointer;
  user-select: none;
}

.recite__blank.is-right {
  color: var(--td-success-color);
  border-bottom-color: var(--td-success-color);
}

.recite__blank.is-wrong {
  background: var(--td-error-color-light);
  border-bottom-color: var(--td-error-color);
}

.recite__blank.is-open.is-active,
.recite__blank.is-wrong.is-active {
  background: var(--td-brand-color-light);
  border-bottom-color: var(--td-brand-color);
}

.recite__input {
  width: 1.2em;
  height: 1.4em;
  border: none;
  outline: none;
  background: transparent;
  text-align: center;
  font-size: inherit;
  color: inherit;
  caret-color: var(--td-brand-color);
}

.recite__foot {
  flex-shrink: 0;
  border-top: 1px solid var(--td-component-stroke);
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.recite__chips {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}

.recite__chip {
  min-width: 44px;
  height: 44px;
  padding: 0 10px;
  font-size: 20px;
  border-radius: 8px;
  border: 1px solid var(--td-component-border);
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  cursor: pointer;
}

.recite__chip:hover {
  border-color: var(--td-brand-color);
  color: var(--td-brand-color);
}

.recite__stat {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  color: var(--td-text-color-secondary);
}

.recite__stat-sep {
  opacity: 0.5;
}

.recite__done-btn {
  height: 34px;
  padding: 0 18px;
  font-size: 15px;
  color: #fff;
  background: var(--td-brand-color);
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
</style>
