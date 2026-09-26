<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  /** 编辑时传入日程对象，新建时为 null */
  item: { type: Object, default: null },
})

const visible = defineModel('visible', { type: Boolean, default: false })
const emit = defineEmits(['submit'])

const formRef = ref(null)

function createForm() {
  return { title: '', link: '', hours: 0, minutes: 30 }
}

const formData = ref(createForm())

const isEdit = computed(() => Boolean(props.item))

const rules = {
  title: [
    { required: true, message: '请输入日程标题', type: 'error', trigger: 'blur' },
  ],
  link: [{ url: true, message: '看起来不是有效的链接', type: 'warning', trigger: 'blur' }],
}

watch(visible, (value) => {
  if (!value) return
  const source = props.item
  if (source) {
    const total = Number(source.duration) || 0
    formData.value = {
      title: source.title,
      link: source.link || '',
      hours: Math.floor(total / 60),
      minutes: total % 60,
    }
  } else {
    formData.value = createForm()
  }
  formRef.value?.clearValidate?.()
})

async function handleConfirm() {
  const result = await formRef.value?.validate?.()
  if (result !== true) return
  const duration = Math.max(
    (Number(formData.value.hours) || 0) * 60 + (Number(formData.value.minutes) || 0),
    5,
  )
  // 科目、难度不再让用户填：新建时继承合集科目与默认值，编辑时 store 会保留原值
  emit('submit', {
    title: formData.value.title.trim(),
    link: formData.value.link.trim(),
    duration,
  })
  visible.value = false
}
</script>

<template>
  <t-dialog
    v-model:visible="visible"
    :header="isEdit ? '编辑日程' : '添加日程'"
    width="520px"
    :close-on-overlay-click="false"
  >
    <t-form ref="formRef" :data="formData" :rules="rules" label-align="top" @submit.prevent>
      <t-form-item label="日程标题" name="title">
        <t-input v-model="formData.title" placeholder="例如：函数与导数专题刷题" clearable />
      </t-form-item>

      <t-form-item label="预估耗时" name="duration">
        <t-space size="8" align="center">
          <t-input-number
            v-model="formData.hours"
            :min="0"
            :max="23"
            :step="1"
            theme="column"
            style="width: 180px"
          />
          <span>小时</span>
          <t-input-number
            v-model="formData.minutes"
            :min="0"
            :max="55"
            :step="5"
            theme="column"
            style="width: 180px"
          />
          <span>分钟</span>
        </t-space>
      </t-form-item>

      <t-form-item label="附件或链接" name="link">
        <t-input v-model="formData.link" placeholder="粘贴网盘 / 文档链接，选填" clearable />
      </t-form-item>
    </t-form>

    <template #footer>
      <t-button variant="outline" theme="default" @click="visible = false">取消</t-button>
      <t-button theme="primary" @click="handleConfirm">保存</t-button>
    </template>
  </t-dialog>
</template>
