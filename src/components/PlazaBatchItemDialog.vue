<script setup>
import { nextTick, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next/es/message'

const props = defineProps({
  /** 父组件提供的写入函数：返回 true 表示本条已成功入集 */
  add: { type: Function, required: true },
})

const visible = defineModel('visible', { type: Boolean, default: false })

const nameRef = ref(null)
const timeRef = ref(null)
const remarkRef = ref(null)

const name = ref('')
const time = ref('')
const remark = ref('')
const addedCount = ref(0)

// 每次打开都重置为一轮新的批量录入，并聚焦名称
watch(visible, (open) => {
  if (!open) return
  name.value = ''
  time.value = ''
  remark.value = ''
  addedCount.value = 0
  nextTick(() => nameRef.value?.focus?.())
})

function focusField(fieldRef) {
  nextTick(() => fieldRef.value?.focus?.())
}

function addCurrent() {
  const title = name.value.trim()
  if (!title) {
    MessagePlugin.warning('请先填写日程名称')
    focusField(nameRef)
    return
  }
  const payload = { title }
  const mins = Number.parseInt(time.value, 10)
  if (Number.isFinite(mins) && mins > 0) payload.duration = Math.max(mins, 5)
  const desc = remark.value.trim()
  if (desc) payload.desc = desc

  // 写入失败（只读 / 离线）时保留已填内容，方便用户重试
  if (!props.add(payload)) return
  addedCount.value += 1
  name.value = ''
  time.value = ''
  remark.value = ''
  focusField(nameRef)
}

// Tab 在「名称 → 时间 → 备注 → 名称」间循环，避免被组件内部控件打乱顺序
function handleTab(event, nextRef) {
  event.preventDefault()
  focusField(nextRef)
}
</script>

<template>
  <t-dialog
    v-model:visible="visible"
    header="批量添加日程"
    width="520px"
    :close-on-overlay-click="false"
  >
    <p class="batch__tip">
      填好一项按 <b>回车</b> 立即入集并清空，<b>Tab</b> 在「名称 / 时间 / 备注」间快速切换。
    </p>

    <t-form label-align="top" @submit.prevent>
      <t-form-item label="日程名称">
        <t-input
          ref="nameRef"
          v-model="name"
          placeholder="例如：语文套卷3"
          clearable
          @keydown.tab="handleTab($event, timeRef)"
          @keydown.enter.prevent="addCurrent"
        />
      </t-form-item>

      <t-form-item label="预估耗时（分钟）">
        <t-input
          ref="timeRef"
          v-model="time"
          type="number"
          :min="0"
          placeholder="如 90，留空默认 30 分钟"
          @keydown.tab="handleTab($event, remarkRef)"
          @keydown.enter.prevent="addCurrent"
        />
      </t-form-item>

      <t-form-item label="备注">
        <t-input
          ref="remarkRef"
          v-model="remark"
          placeholder="选填，回车即添加"
          clearable
          @keydown.tab="handleTab($event, nameRef)"
          @keydown.enter.prevent="addCurrent"
        />
      </t-form-item>
    </t-form>

    <template #footer>
      <span class="batch__count">本次已添加 {{ addedCount }} 条</span>
      <t-button theme="primary" @click="visible = false">完成</t-button>
    </template>
  </t-dialog>
</template>

<style scoped>
.batch__tip {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--td-text-color-secondary);
}

.batch__count {
  margin-right: auto;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}
</style>
