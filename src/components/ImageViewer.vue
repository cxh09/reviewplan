<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * 自实现的全屏图片预览（替换 TDesign ImageViewer）。
 * 手势全部走 Pointer Events，拖拽/缩放期间直接写元素 transform（不经过响应式、不加过渡），
 * 松手后才用过渡回弹，保证「跟手流畅」。
 * 功能只保留三个：查看原图、下载、关闭。
 *
 * items: [{ src, original, name }] —— src 默认展示（压缩预览），original 为原图地址。
 */
const props = defineProps({
  visible: { type: Boolean, default: false },
  index: { type: Number, default: 0 },
  items: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:visible', 'update:index'])

const viewport = ref(null)
const imgEl = ref(null)
const upgraded = ref([]) // 每张是否已切到原图

const current = computed(() => props.items[props.index] || null)
const currentSrc = computed(() => {
  const it = current.value
  if (!it) return ''
  return upgraded.value[props.index] ? it.original || it.src : it.src
})
const canViewOriginal = computed(() => {
  const it = current.value
  return Boolean(it && it.original && it.original !== it.src && !upgraded.value[props.index])
})

function viewOriginal() {
  upgraded.value[props.index] = true
}

function close() {
  emit('update:visible', false)
}

function go(delta) {
  const next = props.index + delta
  if (next >= 0 && next < props.items.length) emit('update:index', next)
}

function download() {
  const url = currentSrc.value
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = current.value?.name || url.split('/').pop().split('?')[0] || 'image'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// ---------- 变换状态（非响应式，直接操作 DOM 保证跟手） ----------
const view = { scale: 1, x: 0, y: 0 }

function applyTransform(animate) {
  const el = imgEl.value
  if (!el) return
  el.style.transition = animate ? 'transform 0.26s cubic-bezier(0.22, 1, 0.36, 1)' : 'none'
  el.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`
}

function resetView() {
  view.scale = 1
  view.x = 0
  view.y = 0
  nextTick(() => applyTransform(false))
}

function rectOf() {
  return viewport.value?.getBoundingClientRect() || { left: 0, top: 0, width: 0, height: 0 }
}
function centerRelative(px, py) {
  const r = rectOf()
  return { x: px - (r.left + r.width / 2), y: py - (r.top + r.height / 2) }
}
function clampScale(s) {
  return Math.min(5, Math.max(1, s))
}
function clampPan() {
  const el = imgEl.value
  const r = rectOf()
  if (!el) return
  const maxX = Math.max(0, (el.offsetWidth * view.scale - r.width) / 2)
  const maxY = Math.max(0, (el.offsetHeight * view.scale - r.height) / 2)
  view.x = Math.min(maxX, Math.max(-maxX, view.x))
  view.y = Math.min(maxY, Math.max(-maxY, view.y))
}

// ---------- 指针手势 ----------
const pointers = new Map()
let mode = '' // pan | pinch | swipe
let moved = false
let downTarget = null
let downX = 0
let downY = 0
let downTime = 0
let startViewX = 0
let startViewY = 0
let pinchStartDist = 1
let pinchStartScale = 1
let pinchStartMid = { x: 0, y: 0 }
let lastTap = 0

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function onPointerDown(e) {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  viewport.value?.setPointerCapture?.(e.pointerId)
  moved = false
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    const m = mid(a, b)
    mode = 'pinch'
    pinchStartDist = dist(a, b) || 1
    pinchStartScale = view.scale
    pinchStartMid = centerRelative(m.x, m.y)
    startViewX = view.x
    startViewY = view.y
  } else if (pointers.size === 1) {
    downX = e.clientX
    downY = e.clientY
    downTime = performance.now()
    downTarget = e.target
    startViewX = view.x
    startViewY = view.y
    mode = view.scale > 1 ? 'pan' : 'swipe'
  }
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (mode === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()]
    const s1 = clampScale(pinchStartScale * (dist(a, b) / pinchStartDist))
    const m = mid(a, b)
    const F1 = centerRelative(m.x, m.y)
    const ratio = s1 / pinchStartScale
    view.scale = s1
    view.x = F1.x - (pinchStartMid.x - startViewX) * ratio
    view.y = F1.y - (pinchStartMid.y - startViewY) * ratio
    moved = true
    applyTransform(false)
  } else if (mode === 'pan') {
    view.x = startViewX + (e.clientX - downX)
    view.y = startViewY + (e.clientY - downY)
    moved = true
    clampPan()
    applyTransform(false)
  } else if (mode === 'swipe') {
    const dx = e.clientX - downX
    const dy = e.clientY - downY
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true
    view.x = startViewX + dx // 横向跟手，纵向不跟（避免误以为能上下拖）
    applyTransform(false)
  }
}

function onPointerUp(e) {
  pointers.delete(e.pointerId)
  viewport.value?.releasePointerCapture?.(e.pointerId)

  if (mode === 'pinch') {
    if (pointers.size === 1) {
      const [p] = [...pointers.values()]
      downX = p.x
      downY = p.y
      startViewX = view.x
      startViewY = view.y
      mode = view.scale > 1 ? 'pan' : 'swipe'
    } else if (pointers.size === 0) {
      settle()
      mode = ''
    }
    return
  }

  const dt = performance.now() - downTime
  const isTap = !moved && dt < 260

  if (mode === 'swipe') {
    const dx = e.clientX - downX
    const dy = e.clientY - downY
    if (isTap) {
      handleTap(e)
    } else if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      go(dx < 0 ? 1 : -1)
    }
    if (view.scale <= 1) {
      view.x = 0
      applyTransform(true)
    }
    mode = ''
    return
  }

  if (mode === 'pan') {
    if (isTap) handleTap(e)
    settle()
    mode = ''
  }
}

function settle() {
  if (view.scale <= 1.02) {
    view.scale = 1
    view.x = 0
    view.y = 0
  } else {
    clampPan()
  }
  applyTransform(true)
}

function handleTap(e) {
  const now = performance.now()
  if (now - lastTap < 300) {
    lastTap = 0
    if (view.scale > 1) {
      view.scale = 1
      view.x = 0
      view.y = 0
    } else {
      const target = 2.6
      const F = centerRelative(e.clientX, e.clientY)
      view.scale = target
      view.x = F.x * (1 - target)
      view.y = F.y * (1 - target)
      clampPan()
    }
    applyTransform(true)
  } else {
    lastTap = now
    // 单击：只有点在图片外留白（背景/舞台）才关闭；点在图片上不关，留给双击缩放。
    // 用 pointerdown 记录的原始 target 判断（不能用 click 的 target：setPointerCapture 会把它重定向到视口）。
    const t = downTarget
    if (t === viewport.value || t?.classList?.contains('imgv__stage')) close()
  }
}

function onKey(e) {
  // 预览在最上层：处理掉的按键要 stopPropagation，避免冒泡到 window 上
  // 详情面板等下层的 Esc/方向键监听（document 比 window 先触发，若不拦截会连带关掉下层）。
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
  } else if (e.key === 'ArrowLeft') {
    e.stopPropagation()
    go(-1)
  } else if (e.key === 'ArrowRight') {
    e.stopPropagation()
    go(1)
  }
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      upgraded.value = props.items.map(() => false)
      resetView()
      document.addEventListener('keydown', onKey)
      document.body.style.overflow = 'hidden'
    } else {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  },
)

// 切换图片时复位缩放
watch(
  () => props.index,
  () => resetView(),
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="imgv">
      <div
        v-if="visible"
        ref="viewport"
        class="imgv"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <div class="imgv__stage">
          <img
            v-if="currentSrc"
            ref="imgEl"
            class="imgv__img"
            :src="currentSrc"
            :alt="current?.name || '预览图片'"
            draggable="false"
            @load="resetView"
          />
        </div>

        <div class="imgv__top" @pointerdown.stop>
          <span v-if="items.length > 1" class="imgv__count"
            >{{ index + 1 }} / {{ items.length }}</span
          >
          <button
            type="button"
            class="imgv__btn imgv__btn--close"
            aria-label="关闭"
            @click.stop="close"
          >
            ✕
          </button>
        </div>

        <button
          v-if="index > 0"
          type="button"
          class="imgv__nav imgv__nav--prev"
          aria-label="上一张"
          @pointerdown.stop
          @click.stop="go(-1)"
        >
          ‹
        </button>
        <button
          v-if="index < items.length - 1"
          type="button"
          class="imgv__nav imgv__nav--next"
          aria-label="下一张"
          @pointerdown.stop
          @click.stop="go(1)"
        >
          ›
        </button>

        <div class="imgv__bar" @pointerdown.stop>
          <button v-if="canViewOriginal" type="button" class="imgv__btn" @click.stop="viewOriginal">
            查看原图
          </button>
          <button type="button" class="imgv__btn" @click.stop="download">下载</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.imgv {
  position: fixed;
  inset: 0;
  z-index: 2600;
  background: rgba(0, 0, 0, 0.92);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

/* 开/关动画：背景淡入淡出 + 舞台轻微缩放（不动 img 的 transform，避免与手势拖拽/缩放冲突） */
.imgv-enter-active,
.imgv-leave-active {
  transition: opacity 0.24s ease;
}
.imgv-enter-from,
.imgv-leave-to {
  opacity: 0;
}
.imgv-enter-active .imgv__stage,
.imgv-leave-active .imgv__stage {
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.imgv-enter-from .imgv__stage,
.imgv-leave-to .imgv__stage {
  transform: scale(0.92);
}

.imgv__stage {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.imgv__img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  will-change: transform;
  transform-origin: center center;
  backface-visibility: hidden;
}

.imgv__top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(12px + env(safe-area-inset-top)) 16px 12px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0));
}

.imgv__count {
  color: rgba(255, 255, 255, 0.85);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.imgv__bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px 16px calc(16px + env(safe-area-inset-bottom));
  background: linear-gradient(to top, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0));
}

.imgv__btn {
  height: 40px;
  padding: 0 18px;
  border: none;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 15px;
  cursor: pointer;
  backdrop-filter: blur(6px);
}

.imgv__btn:active {
  background: rgba(255, 255, 255, 0.28);
}

.imgv__btn--close {
  width: 40px;
  padding: 0;
  font-size: 18px;
  line-height: 1;
}

.imgv__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 64px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 30px;
  line-height: 1;
  cursor: pointer;
}

.imgv__nav:active {
  background: rgba(255, 255, 255, 0.22);
}

.imgv__nav--prev {
  left: 8px;
}

.imgv__nav--next {
  right: 8px;
}

@media (max-width: 600px) {
  .imgv__nav {
    display: none; /* 移动端用左右滑动切图，隐藏箭头 */
  }
}
</style>
