<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { DialogPlugin } from 'tdesign-vue-next/es/dialog'
import { MessagePlugin } from 'tdesign-vue-next/es/message'
import {
  AddIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CloudDownloadIcon,
  DeleteIcon,
  EditIcon,
  SearchIcon,
  StarIcon,
} from 'tdesign-icons-vue-next'

import CollectionDialog from '@/components/CollectionDialog.vue'
import PlazaItemDialog from '@/components/PlazaItemDialog.vue'
import { levelTheme } from '@/data/plaza'
import { usePlanStore } from '@/stores/plan'
import { usePlazaStore } from '@/stores/plaza'

const router = useRouter()
const planStore = usePlanStore()
const plazaStore = usePlazaStore()

const keyword = ref('')
const trimmedKeyword = computed(() => keyword.value.trim().toLowerCase())

// ---------- 搜索 ----------

function includes(text, kw) {
  return `${text || ''}`.toLowerCase().includes(kw)
}

function matchCollection(collection, kw) {
  return (
    includes(collection.name, kw) ||
    includes(collection.desc, kw) ||
    includes(collection.category, kw)
  )
}

function matchItem(item, kw) {
  return includes(item.title, kw) || includes(item.desc, kw) || includes(item.category, kw)
}

/** 页面上直接展示的合集：有关键词时只留下命中的合集与命中的日程 */
const visibleCollections = computed(() => {
  const kw = trimmedKeyword.value
  if (!kw) return plazaStore.collections
  return (
    plazaStore.collections
      .map((collection) => ({
        ...collection,
        items: matchCollection(collection, kw)
          ? collection.items
          : collection.items.filter((item) => matchItem(item, kw)),
      }))
      // 名称命中的空合集也要留下来，否则搜不到它
      .filter((collection) => collection.items.length || matchCollection(collection, kw))
  )
})

// ---------- 展开 / 收起 ----------

/** 默认先展示前几条，剩下的点「展开」再看 */
const PREVIEW_COUNT = 5
/** 已展开的合集 id */
const expandedIds = ref(new Set())

function isExpanded(id) {
  return expandedIds.value.has(id)
}

function toggleExpand(id) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

function visibleItems(collection) {
  if (isExpanded(collection.id) || trimmedKeyword.value) return collection.items
  return collection.items.slice(0, PREVIEW_COUNT)
}

function hiddenCount(collection) {
  return collection.items.length - visibleItems(collection).length
}

// ---------- 弹窗：合集 ----------

const collectionDialogVisible = ref(false)
const editingCollection = ref(null)

function openCreateCollection() {
  editingCollection.value = null
  collectionDialogVisible.value = true
}

function openEditCollection(collection) {
  editingCollection.value = collection
  collectionDialogVisible.value = true
}

function submitCollection(payload) {
  const editing = editingCollection.value
  if (editing) {
    plazaStore.updateCollection(editing.id, payload)
    MessagePlugin.success('合集已更新')
    return
  }
  const collection = plazaStore.addCollection(payload)
  MessagePlugin.success(`合集「${collection.name}」已创建`)
}

function confirmRemoveCollection(collection) {
  const dialog = DialogPlugin.confirm({
    header: '删除系列合集',
    body: `确认删除「${collection.name}」？里面的 ${collection.items.length} 条日程会一并删除，已经加入待办清单的日程不受影响。`,
    theme: 'warning',
    confirmBtn: { content: '删除', theme: 'danger' },
    cancelBtn: '再想想',
    onConfirm: () => {
      plazaStore.removeCollection(collection.id)
      MessagePlugin.success(`合集「${collection.name}」已删除`)
      dialog.hide()
    },
  })
}

// ---------- 弹窗：日程 ----------

const itemDialogVisible = ref(false)
const editingItem = ref(null)
const itemCollectionId = ref('')

function openCreateItem(collectionId) {
  editingItem.value = null
  itemCollectionId.value = collectionId
  itemDialogVisible.value = true
}

function openEditItem(collectionId, item) {
  editingItem.value = item
  itemCollectionId.value = collectionId
  itemDialogVisible.value = true
}

function submitItem(payload) {
  const editing = editingItem.value
  if (editing) {
    plazaStore.updateItem(itemCollectionId.value, editing.id, payload)
    MessagePlugin.success('日程已更新')
    return
  }
  plazaStore.addItem(itemCollectionId.value, payload)
  // 新加的日程在末尾，展开合集免得看起来「没加上」
  if (!expandedIds.value.has(itemCollectionId.value)) {
    expandedIds.value = new Set(expandedIds.value).add(itemCollectionId.value)
  }
  MessagePlugin.success(`「${payload.title}」已加入合集`)
}

function confirmRemoveItem(collection, item) {
  const dialog = DialogPlugin.confirm({
    header: '删除日程',
    body: `确认从「${collection.name}」中删除「${item.title}」？`,
    theme: 'warning',
    confirmBtn: { content: '删除', theme: 'danger' },
    cancelBtn: '取消',
    onConfirm: () => {
      plazaStore.removeItem(collection.id, item.id)
      MessagePlugin.success('日程已删除')
      dialog.hide()
    },
  })
}

// ---------- 加入待办清单 ----------

function isInTodo(item) {
  // 传科目，与 addTodo 的「标题 + 科目」去重口径保持一致
  return planStore.hasTodo(item.title, item.category)
}

/** @returns {boolean} 是否真的新增了一条 */
function addItemSilently(item) {
  const existed = isInTodo(item)
  planStore.addTodo({
    title: item.title,
    category: item.category,
    level: item.level,
    duration: item.duration,
    desc: item.desc,
    source: 'plaza',
  })
  return !existed
}

function addItemToTodo(item) {
  if (!addItemSilently(item)) {
    MessagePlugin.info(`「${item.title}」已经在待办清单里了`)
    return
  }
  MessagePlugin.success(`「${item.title}」已加入待办清单`)
}

function addCollectionToTodo(collection) {
  const pending = collection.items.filter((item) => !isInTodo(item))
  if (!pending.length) {
    MessagePlugin.info(`「${collection.name}」里的日程都已在待办清单中`)
    return
  }
  // 批量加入只弹一条汇总，避免每条各弹一次刷屏
  const added = pending.filter(addItemSilently).length
  MessagePlugin.success(`已加入 ${added} 条日程到待办清单`)
}

// ---------- 内置模板 ----------

function restoreTemplates() {
  const count = plazaStore.restoreTemplates()
  if (!count) {
    MessagePlugin.info('内置系列合集都已经在广场里了')
    return
  }
  MessagePlugin.success(`已载入 ${count} 个内置系列合集`)
}

// ---------- 展示辅助 ----------

function collectionColor(collection) {
  return plazaStore.collectionColor(collection)
}

function goSchedule() {
  router.push('/schedule')
}
</script>

<template>
  <div class="plaza">
    <t-card :bordered="false" class="plaza__header">
      <div class="plaza__header-inner">
        <div>
          <h2 class="plaza__title">日程广场</h2>
          <p class="plaza__subtitle">
            每个系列合集下面直接列出它的日程：可以自己新建合集、往里加日程，也可以一键把整个合集送进待办清单。
          </p>
        </div>
        <t-space size="12" break-line>
          <t-button theme="primary" @click="openCreateCollection">
            <template #icon><AddIcon /></template>
            新建合集
          </t-button>
          <t-button theme="default" variant="outline" @click="restoreTemplates">
            <template #icon><CloudDownloadIcon /></template>
            载入内置模板
          </t-button>
          <t-button theme="default" variant="outline" @click="goSchedule">
            去日程表排班
            <template #suffix><ChevronRightIcon /></template>
          </t-button>
        </t-space>
      </div>

      <div class="plaza__filters">
        <t-input
          v-model="keyword"
          class="plaza__search"
          placeholder="搜索合集名称或日程内容"
          clearable
        >
          <template #prefixIcon><SearchIcon /></template>
        </t-input>
        <div class="plaza__summary">
          <span>{{ plazaStore.collectionCount }} 个系列合集</span>
          <span>{{ plazaStore.itemCount }} 条日程</span>
          <span>待办清单 {{ planStore.todoCount }} 项</span>
        </div>
      </div>
    </t-card>

    <t-empty
      v-if="!visibleCollections.length"
      class="plaza__empty"
      :title="trimmedKeyword ? '没有找到匹配的日程' : '还没有任何系列合集'"
      :description="
        trimmedKeyword
          ? '换个关键词，或者新建一个属于自己的合集'
          : '新建一个合集，把同一类复习日程收在一起'
      "
    >
      <template #action>
        <t-space size="12">
          <t-button theme="primary" @click="openCreateCollection">新建合集</t-button>
          <t-button theme="default" variant="outline" @click="restoreTemplates">
            载入内置模板
          </t-button>
        </t-space>
      </template>
    </t-empty>

    <div v-else class="plaza__list">
      <section v-for="collection in visibleCollections" :key="collection.id" class="col">
        <div class="col__head">
          <span class="col__bar" :style="{ backgroundColor: collectionColor(collection) }" />
          <h3 class="col__name">{{ collection.name }}</h3>
          <t-tag size="small" variant="light" :style="{ color: collectionColor(collection) }">
            {{ collection.category }}
          </t-tag>
          <t-tag v-if="collection.builtin" size="small" variant="outline">内置</t-tag>
          <span class="col__count">{{ collection.items.length }} 条日程</span>

          <div class="col__ops">
            <t-button
              size="small"
              theme="primary"
              variant="outline"
              @click="addCollectionToTodo(collection)"
            >
              <template #icon><StarIcon /></template>
              一键加入待办
            </t-button>
            <t-button
              size="small"
              theme="default"
              variant="outline"
              @click="openCreateItem(collection.id)"
            >
              <template #icon><AddIcon /></template>
              添加日程
            </t-button>
            <t-button
              size="small"
              variant="text"
              shape="square"
              @click="openEditCollection(collection)"
            >
              <template #icon><EditIcon /></template>
            </t-button>
            <t-button
              size="small"
              variant="text"
              shape="square"
              @click="confirmRemoveCollection(collection)"
            >
              <template #icon><DeleteIcon /></template>
            </t-button>
          </div>
        </div>

        <p class="col__desc">{{ collection.desc || '这个合集还没有写简介' }}</p>

        <div v-if="collection.items.length" class="col__items">
          <div v-for="(item, index) in visibleItems(collection)" :key="item.id" class="row">
            <span class="row__index">{{ index + 1 }}</span>

            <div class="row__main">
              <div class="row__title-row">
                <span class="row__title">{{ item.title }}</span>
                <t-tag size="small" variant="light" :theme="levelTheme(item.level)">
                  {{ item.level }}
                </t-tag>
                <t-tag size="small" variant="outline">{{ item.category }}</t-tag>
                <span class="row__duration">{{ item.duration }} 分钟</span>
              </div>
              <p v-if="item.desc" class="row__desc">{{ item.desc }}</p>
            </div>

            <div class="row__ops">
              <t-button
                v-if="!isInTodo(item)"
                size="small"
                theme="primary"
                variant="outline"
                @click="addItemToTodo(item)"
              >
                <template #icon><AddIcon /></template>
                加入待办
              </t-button>
              <t-button v-else size="small" theme="success" variant="outline" disabled>
                <template #icon><CheckCircleIcon /></template>
                已在待办
              </t-button>
              <t-button
                size="small"
                variant="text"
                shape="square"
                @click="openEditItem(collection.id, item)"
              >
                <template #icon><EditIcon /></template>
              </t-button>
              <t-button
                size="small"
                variant="text"
                shape="square"
                @click="confirmRemoveItem(collection, item)"
              >
                <template #icon><DeleteIcon /></template>
              </t-button>
            </div>
          </div>

          <t-button
            v-if="collection.items.length > PREVIEW_COUNT"
            class="col__toggle"
            variant="text"
            size="small"
            @click="toggleExpand(collection.id)"
          >
            {{ isExpanded(collection.id) ? '收起' : `展开剩余 ${hiddenCount(collection)} 条` }}
            <template #suffix>
              <ChevronDownIcon v-if="!isExpanded(collection.id)" />
              <ChevronUpIcon v-else />
            </template>
          </t-button>
        </div>

        <p v-else class="col__empty">这个合集还没有日程，点上面的「添加日程」加一条</p>
      </section>
    </div>

    <CollectionDialog
      v-model:visible="collectionDialogVisible"
      :collection="editingCollection"
      @submit="submitCollection"
    />

    <PlazaItemDialog
      v-model:visible="itemDialogVisible"
      :item="editingItem"
      :default-category="editingItem?.category || '通用'"
      @submit="submitItem"
    />
  </div>
</template>

<style scoped>
.plaza__header {
  margin-bottom: 16px;
}

.plaza__header-inner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.plaza__title {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 700;
}

.plaza__subtitle {
  max-width: 640px;
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--td-text-color-secondary);
}

.plaza__filters {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px dashed var(--td-component-stroke);
  flex-wrap: wrap;
}

.plaza__search {
  width: 280px;
  flex-shrink: 0;
}

.plaza__summary {
  display: flex;
  gap: 20px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.plaza__empty {
  padding: 60px 0;
}

/* 一个合集一块：标题头 + 下面的日程列表 */
.plaza__list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.col {
  padding: 16px 20px 18px;
  border-radius: var(--td-radius-large);
  background-color: var(--td-bg-color-container);
  box-shadow: 0 1px 3px rgb(0 0 0 / 5%);
}

.col__head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.col__bar {
  width: 4px;
  height: 20px;
  border-radius: 2px;
}

.col__name {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.col__count {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.col__ops {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
}

.col__desc {
  margin: 8px 0 14px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.col__items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.col__toggle {
  align-self: flex-start;
  margin-top: 8px;
}

.col__empty {
  margin: 0;
  padding: 18px 0;
  text-align: center;
  font-size: 13px;
  color: var(--td-text-color-placeholder);
  background-color: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-medium);
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: var(--td-radius-medium);
  background-color: var(--td-bg-color-secondarycontainer);
}

.row__index {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  background-color: var(--td-bg-color-component);
}

.row__main {
  flex: 1;
  min-width: 0;
}

.row__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.row__title {
  font-size: 14px;
  font-weight: 600;
}

.row__duration {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.row__desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.row__ops {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

@media (max-width: 700px) {
  .col__ops {
    margin-left: 0;
    width: 100%;
  }

  .row {
    flex-wrap: wrap;
  }
}
</style>
