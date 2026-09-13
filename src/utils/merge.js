/**
 * 快照合并：按「条目」做 last-write-wins。
 *
 * 服务端保存的是一整份快照，两端先后上传时先到的一侧会拿到 409。
 * 如果直接把后到的一侧丢掉，那 300ms 窗口里的改动就没了；
 * 这里改成把本地和云端两份快照按 id 逐条合并，谁的时间戳新谁生效，
 * 这样两端各改各的都不会互相覆盖。
 *
 * 删除必须靠删除标记（tombstone）：只按 id 合并的话，
 * 一端删掉的条目会被另一端残留的副本「复活」，所以每个删除动作都要记一笔 { id, at }。
 */

/** 删除标记的保留时长：超过之后不再随快照上传，避免列表无限增长 */
export const TOMBSTONE_TTL = 30 * 24 * 60 * 60 * 1000

/** 条目最后一次修改的时间；历史数据没有这个字段时按 0 处理（视为最旧） */
function entityTime(entity) {
  const value = Number(entity?.updatedAt)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function indexById(list) {
  const map = new Map()
  if (Array.isArray(list)) {
    list.forEach((item) => {
      if (item && item.id) map.set(`${item.id}`, item)
    })
  }
  return map
}

/**
 * 同 id 的两条记录取新的那条。
 * 时间戳相同（含历史数据都是 0）时以云端为准，保证两端结果一致。
 */
function pickNewer(local, remote) {
  if (!local) return remote
  if (!remote) return local
  return entityTime(local) > entityTime(remote) ? local : remote
}

/** 合并两端的删除标记，同一 id 取更晚的删除时间，并回收过期的 */
function mergeTombstones(localList, remoteList, now) {
  const map = new Map()

  const collect = (list) => {
    if (!Array.isArray(list)) return
    list.forEach((entry) => {
      const id = entry?.id
      const at = Number(entry?.at)
      if (!id || !Number.isFinite(at) || at <= 0) return
      if (now - at > TOMBSTONE_TTL) return
      const prev = map.get(id)
      if (prev === undefined || at > prev) map.set(id, at)
    })
  }

  collect(localList)
  collect(remoteList)

  return [...map.entries()].map(([id, at]) => ({ id, at }))
}

/**
 * 合并一组按 id 唯一的条目（待办 / 计划 / 合集 / 合集里的日程通用）。
 * 删除时间晚于最后一次修改的条目会被真正丢弃。
 */
function mergeEntities(localList, remoteList, tombstoneAt) {
  const localMap = indexById(localList)
  const remoteMap = indexById(remoteList)
  const merged = []

  new Set([...localMap.keys(), ...remoteMap.keys()]).forEach((id) => {
    const winner = pickNewer(localMap.get(id), remoteMap.get(id))
    if (!winner) return

    const deletedAt = tombstoneAt.get(id)
    if (deletedAt !== undefined && deletedAt > entityTime(winner)) return

    merged.push(winner)
  })

  return merged
}

function mergeCollections(localList, remoteList, tombstoneAt) {
  const localMap = indexById(localList)
  const remoteMap = indexById(remoteList)

  return mergeEntities(localList, remoteList, tombstoneAt).map((collection) => {
    // 合集本身按 LWW 决定归属，里面的日程再单独合一次：
    // 两端各往同一个合集里加日程时，两边的条目都要留下
    const local = localMap.get(collection.id)
    const remote = remoteMap.get(collection.id)
    return {
      ...collection,
      items: mergeEntities(local?.items, remote?.items, tombstoneAt),
    }
  })
}

/** 高考日期是个标量，单独用它的修改时间比 */
function mergeGaokaoDate(local, remote) {
  const localAt = Number(local?.gaokaoDateUpdatedAt) || 0
  const remoteAt = Number(remote?.gaokaoDateUpdatedAt) || 0
  const localDate = typeof local?.gaokaoDate === 'string' ? local.gaokaoDate : ''
  const remoteDate = typeof remote?.gaokaoDate === 'string' ? remote.gaokaoDate : ''

  if (!remoteDate) return { gaokaoDate: localDate, gaokaoDateUpdatedAt: localAt }
  if (!localDate) return { gaokaoDate: remoteDate, gaokaoDateUpdatedAt: remoteAt }

  return localAt > remoteAt
    ? { gaokaoDate: localDate, gaokaoDateUpdatedAt: localAt }
    : { gaokaoDate: remoteDate, gaokaoDateUpdatedAt: remoteAt }
}

/**
 * 合并本地与云端两份快照。
 * @param {object} local 本地快照（形如 buildPayload 的结果）
 * @param {object} remote 云端快照
 * @param {number} now 当前时间，用于回收过期删除标记
 */
export function mergeSnapshots(local, remote, now = Date.now()) {
  const deleted = mergeTombstones(local?.deleted, remote?.deleted, now)
  const tombstoneAt = new Map(deleted.map((entry) => [entry.id, entry.at]))

  return {
    ...mergeGaokaoDate(local, remote),
    todos: mergeEntities(local?.todos, remote?.todos, tombstoneAt),
    plans: mergeEntities(local?.plans, remote?.plans, tombstoneAt),
    collections: mergeCollections(local?.collections, remote?.collections, tombstoneAt),
    deleted,
  }
}
