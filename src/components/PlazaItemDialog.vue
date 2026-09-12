<script setup>
import { computed, ref, watch } from 'vue'
import { CATEGORY_OPTIONS, DEFAULT_ITEM_DURATION, LEVEL_OPTIONS } from '@/data/plaza'

const props = defineProps({
  /** 编辑时传入日程对象，新建时为 null */
  item: { type: Object, default: null },
  /** 新建时默认选中的科目 */
  defaultCategory: { type: String, default: '通用' },
})

const visible = defineModel('visible', { type: Boolean, default: false })
const emit = defineEmits(['submit'])

const formRef = ref(null)

function createForm() {
  return {
    title: '',
    category: props.defaultCategory || '通用',
    level: '基础',
    duration: DEFAULT_ITEM_DURATION,
    desc: '',
  }
}

const formData = ref(createForm())

const isEdit = computed(() => Boolean(props.item))

const rules = {
  title: [
    { required: true, message: '请输入日程标题', type: 'error', trigger: 'blur' },
    { max: 30, message: '标题不要超过 30 个字', type: 'error', trigger: 'blur' },
  ],
}

watch(visible, (value) => {
  if (!value) return
  const source = props.item
  formData.value = source
    ? {
        title: source.title,
        category: source.category || props.defaultCategory || '通用',
        level: source.level || '基础',
        duration: Number(source.duration) || DEFAULT_ITEM_DURATION,
        desc: source.desc || '',
      }
    : createForm()
  formRef.value?.clearValidate?.()
})

async function handleConfirm() {
  const result = await formRef.value?.validate?.()
  if (result !== true) return
  emit('submit', {
    title: formData.value.title.trim(),
    category: formData.value.category,
    level: formData.value.level,
    duration: Number(formData.value.duration) || DEFAULT_ITEM_DURATION,
    desc: formData.value.desc.trim(),
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

      <t-form-item label="科目" name="category">
        <t-select
          v-model="formData.category"
          :options="CATEGORY_OPTIONS.map((option) => ({ label: option, value: option }))"
        />
      </t-form-item>

      <t-form-item label="难度" name="level">
        <t-radio-group v-model="formData.level" variant="default-filled">
          <t-radio-button v-for="level in LEVEL_OPTIONS" :key="level" :value="level">
            {{ level }}
          </t-radio-button>
        </t-radio-group>
      </t-form-item>

      <t-form-item label="预计时长" name="duration">
        <t-input-number
          v-model="formData.duration"
          theme="normal"
          :min="5"
          :max="480"
          :step="5"
          suffix="分钟"
          style="width: 160px"
        />
        <span class="item-dialog__tip">只作参考，实际时长在日程表里拖拽决定</span>
      </t-form-item>

      <t-form-item label="日程描述" name="desc">
        <t-textarea
          v-model="formData.desc"
          placeholder="这条日程具体要做什么、做到什么程度"
          :autosize="{ minRows: 2, maxRows: 5 }"
        />
      </t-form-item>
    </t-form>

    <template #footer>
      <t-button variant="outline" theme="default" @click="visible = false">取消</t-button>
      <t-button theme="primary" @click="handleConfirm">保存</t-button>
    </template>
  </t-dialog>
</template>

<style scoped>
.item-dialog__tip {
  margin-left: 12px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
