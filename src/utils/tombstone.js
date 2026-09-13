import { ref } from 'vue'

import { TOMBSTONE_TTL } from '@/utils/merge'
import { createDebouncedWriter } from '@/utils/persist'
import { readJSON } from '@/utils/storage'

/**
 * 删除标记：条目被删掉时记一笔 { id, at }。
 *
 * 合并两端快照时，如果没有删除标记，一端删掉的条目会被另一端残留的副本复活。
 * 标记要跟着本地缓存一起持久化：否则「删除后推送失败 → 刷新页面」会丢掉删除记录。
 */

const STORAGE_KEY = 'reviewplan:tombstones:v1'

function normalize(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((entry) => ({ id: `${entry?.id ?? ''}`, at: Number(entry?.at) || 0 }))
    .filter((entry) => entry.id && entry.at > 0)
}

export const tombstones = ref(normalize(readJSON(STORAGE_KEY, [])))

const writer = createDebouncedWriter(STORAGE_KEY, () => tombstones.value)

/** 记录一次删除；同一 id 只保留最新的删除时间 */
export function markDeleted(id, at = Date.now()) {
  if (!id) return

  const index = tombstones.value.findIndex((entry) => entry.id === id)
  if (index === -1) tombstones.value.push({ id, at })
  else if (at > tombstones.value[index].at) tombstones.value[index].at = at

  writer.schedule()
}

/** 批量记录删除（清空数据时用） */
export function markDeletedMany(ids) {
  ids.forEach((id) => markDeleted(id))
}

/** 用云端快照里的删除标记替换本地（同步层应用远端数据时调用） */
export function setTombstones(list) {
  if (!Array.isArray(list)) return
  tombstones.value = normalize(list)
  writer.schedule()
}

/** 取还在有效期内的删除标记（随快照上传的那份） */
export function activeTombstones(now = Date.now()) {
  return tombstones.value.filter((entry) => now - entry.at <= TOMBSTONE_TTL)
}
