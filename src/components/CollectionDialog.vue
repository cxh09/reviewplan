<script setup>
import { computed, ref, watch } from 'vue'
import { CATEGORY_COLORS, CATEGORY_OPTIONS, COLLECTION_COLORS } from '@/data/plaza'

const props = defineProps({
  /** 编辑时传入合集对象，新建时为 null */
  collection: { type: Object, default: null },
})

const visible = defineModel('visible', { type: Boolean, default: false })
const emit = defineEmits(['submit'])

const formRef = ref(null)

function createForm() {
  return { name: '', category: '通用', color: COLLECTION_COLORS[0], desc: '' }
}

const formData = ref(createForm())

const isEdit = computed(() => Boolean(props.collection))

const rules = {
  name: [
    { required: true, message: '请输入合集名称', type: 'error', trigger: 'blur' },
    { max: 20, message: '名称不要超过 20 个字', type: 'error', trigger: 'blur' },
  ],
}

watch(visible, (value) => {
  if (!value) return
  const source = props.collection
  formData.value = source
    ? {
        name: source.name,
        category: source.category,
        color: source.color || CATEGORY_COLORS[source.category] || COLLECTION_COLORS[0],
        desc: source.desc,
      }
    : createForm()
  formRef.value?.clearValidate?.()
})

function handleCategoryChange(category) {
  // 没手动改过颜色时跟随科目的主题色
  formData.value.color = CATEGORY_COLORS[category] || COLLECTION_COLORS[0]
}

async function handleConfirm() {
  const result = await formRef.value?.validate?.()
  if (result !== true) return
  emit('submit', {
    name: formData.value.name.trim(),
    category: formData.value.category,
    color: formData.value.color,
    desc: formData.value.desc.trim(),
  })
  visible.value = false
}
</script>

<template>
  <t-dialog
    v-model:visible="visible"
    :header="isEdit ? '编辑系列合集' : '新建系列合集'"
    width="520px"
    :close-on-overlay-click="false"
  >
    <t-form ref="formRef" :data="formData" :rules="rules" label-align="top" @submit.prevent>
      <t-form-item label="合集名称" name="name">
        <t-input v-model="formData.name" placeholder="例如：数学专题突破" clearable />
      </t-form-item>

      <t-form-item label="主攻科目" name="category">
        <t-select
          v-model="formData.category"
          :options="CATEGORY_OPTIONS.map((item) => ({ label: item, value: item }))"
          @change="handleCategoryChange"
        />
      </t-form-item>

      <t-form-item label="主题色" name="color">
        <div class="color-picker">
          <button
            v-for="color in COLLECTION_COLORS"
            :key="color"
            type="button"
            class="color-picker__dot"
            :class="{ 'is-active': formData.color === color }"
            :style="{ backgroundColor: color }"
            :title="color"
            @click="formData.color = color"
          />
        </div>
      </t-form-item>

      <t-form-item label="合集简介" name="desc">
        <t-textarea
          v-model="formData.desc"
          placeholder="这个合集适合什么时候做、想达到什么效果"
          :autosize="{ minRows: 2, maxRows: 4 }"
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
.color-picker {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.color-picker__dot {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.color-picker__dot:hover {
  transform: scale(1.12);
}

.color-picker__dot.is-active {
  border-color: var(--td-bg-color-container);
  box-shadow: 0 0 0 2px currentcolor;
  outline: 1px solid var(--td-component-border);
}
</style>
