import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import {
  CATEGORY_COLORS,
  COLLECTION_COLORS,
  DEFAULT_ITEM_DURATION,
} from '@/data/plaza'
import { ensureWritable } from '@/utils/connection'
import { createId } from '@/utils/id'
import { createDebouncedWriter } from '@/utils/persist'
import { readJSON } from '@/utils/storage'
import { sanitizeLink } from '@/utils/url'

const STORAGE_KEY = 'reviewplan:plaza:v1'

function loadPersisted() {
  const data = readJSON(STORAGE_KEY, {})
  return data && typeof data === 'object' ? data : {}
}

function normalizeItem(raw) {
  return {
    id: raw?.id || createId('item'),
    title: `${raw?.title || ''}`.trim() || '未命名日程',
    category: raw?.category || '通用',
    level: raw?.level || '基础',
    duration: Number(raw?.duration) || DEFAULT_ITEM_DURATION,
    desc: raw?.desc || '',
    link: sanitizeLink(raw?.link),
  }
}

/** 兼容旧数据 / 导入数据，补齐缺失字段 */
function normalizeCollection(raw) {
  const category = raw?.category || '通用'
  return {
    id: raw?.id || createId('col'),
    name: `${raw?.name || ''}`.trim() || '未命名合集',
    desc: raw?.desc || '',
    category,
    color: raw?.color || CATEGORY_COLORS[category] || COLLECTION_COLORS[0],
    createdAt: raw?.createdAt || Date.now(),
    updatedAt: raw?.updatedAt || Date.now(),
    items: Array.isArray(raw?.items) ? raw.items.map(normalizeItem) : [],
  }
}

/**
 * 日程广场：用户自己维护的「系列合集」以及合集里的日程。
 * 合集中的日程可以一键加入待办清单，再到日程表拖到时间线上排班。
 */
export const usePlazaStore = defineStore('plaza', () => {
  const persisted = loadPersisted()

  // 默认不预置任何合集，广场从空开始
  const collections = ref(
    Array.isArray(persisted.collections) ? persisted.collections.map(normalizeCollection) : [],
  )

  // ---------- 派生数据 ----------

  const collectionCount = computed(() => collections.value.length)

  const itemCount = computed(() =>
    collections.value.reduce((sum, collection) => sum + collection.items.length, 0),
  )

  function collectionColor(collection) {
    return collection?.color || CATEGORY_COLORS[collection?.category] || CATEGORY_COLORS.通用
  }

  function findCollection(id) {
    return collections.value.find((collection) => collection.id === id) || null
  }

  function findItem(collectionId, itemId) {
    const collection = findCollection(collectionId)
    if (!collection) return null
    return collection.items.find((item) => item.id === itemId) || null
  }

  // ---------- 合集 ----------

  function addCollection({ name, category = '通用', desc = '', color = '' }) {
    if (!ensureWritable()) return null

    const collection = normalizeCollection({
      id: createId('col'),
      name,
      category,
      desc,
      color: color || CATEGORY_COLORS[category] || COLLECTION_COLORS[0],
    })
    collections.value.push(collection)
    return collection
  }

  function updateCollection(id, patch) {
    if (!ensureWritable()) return null

    const collection = findCollection(id)
    if (!collection) return null
    Object.assign(collection, {
      name: patch.name?.trim() || collection.name,
      desc: patch.desc ?? '',
      category: patch.category || collection.category,
      color: patch.color || collection.color,
      updatedAt: Date.now(),
    })
    return collection
  }

  function removeCollection(id) {
    collections.value = collections.value.filter((collection) => collection.id !== id)
  }

  // ---------- 合集里的日程 ----------

  function addItem(collectionId, { title, category, level, duration, desc, link }) {
    if (!ensureWritable()) return null

    const collection = findCollection(collectionId)
    if (!collection) return null
    const item = normalizeItem({
      id: createId('item'),
      title,
      category: category || collection.category,
      level: level || '基础',
      duration: Number(duration) || DEFAULT_ITEM_DURATION,
      desc: desc || '',
      link: sanitizeLink(link),
    })
    collection.items.push(item)
    collection.updatedAt = Date.now()
    return item
  }

  function updateItem(collectionId, itemId, patch) {
    if (!ensureWritable()) return null

    const item = findItem(collectionId, itemId)
    if (!item) return null
    Object.assign(item, {
      title: patch.title?.trim() || item.title,
      category: patch.category || item.category,
      level: patch.level || item.level,
      duration: Number(patch.duration) || item.duration,
      desc: patch.desc ?? item.desc,
      link: patch.link === undefined ? item.link : sanitizeLink(patch.link),
    })
    return item
  }

  function removeItem(collectionId, itemId) {
    if (!ensureWritable()) return

    const collection = findCollection(collectionId)
    if (!collection) return
    collection.items = collection.items.filter((item) => item.id !== itemId)
    collection.updatedAt = Date.now()
  }

  // ---------- 数据管理 ----------

  function exportData() {
    return JSON.parse(JSON.stringify(collections.value))
  }

  /** 导入：老备份里没有 collections 时保持现有数据不变 */
  function importData(list) {
    if (!Array.isArray(list)) return
    collections.value = list.map(normalizeCollection)
  }

  function resetAll() {
    if (!ensureWritable()) return
    collections.value = []
  }

  // ---------- 持久化 ----------

  const persistWriter = createDebouncedWriter(STORAGE_KEY, () => ({
    collections: collections.value,
  }))

  watch(collections, () => persistWriter.schedule(), { deep: true })

  return {
    // state
    collections,
    // getters
    collectionCount,
    itemCount,
    collectionColor,
    findCollection,
    findItem,
    // actions
    addCollection,
    updateCollection,
    removeCollection,
    addItem,
    updateItem,
    removeItem,
    exportData,
    importData,
    resetAll,
  }
})
