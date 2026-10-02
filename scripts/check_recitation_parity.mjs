#!/usr/bin/env node
/**
 * 双端一致性（parity）校验：用 Web 引擎（src/utils/recitation.js）对固定篇目
 * 生成挖空签名，写入 mobile/test/fixtures/recitation_parity.json；
 * Dart 单测（recitation_engine_test.dart）读同一份 fixture 比对。
 *
 * 用法：node scripts/check_recitation_parity.mjs
 * 任何一端改了挖空算法，都要重跑本脚本刷新 fixture，并确认两端实现同步。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPuzzle, createReciteSession } from '../src/utils/recitation.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'mobile', 'test', 'fixtures', 'recitation_parity.json')
const recitations = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/recitations.json'), 'utf8'))

function signature(slug, level) {
  const entry = { slug, ...recitations[slug] }
  const puzzle = buildPuzzle(entry, level)
  // 签名：空数 + 每空的「答案字 + 8 个候选字」全量（不只前几条，锁得更死）
  const blanks = puzzle.blanks.map((b) => `${b.char}:${b.candidates.join('')}`)
  const session = createReciteSession(puzzle)
  puzzle.blanks.forEach((b) => session.fill(b.id, b.char))
  return { total: puzzle.total, rate: session.rate(), blanks }
}

const fixture = {}
for (const slug of ['80d9b12', 'b48a979', '4e5b344']) {
  for (const level of ['easy', 'medium', 'hard']) {
    fixture[`${slug}:${level}`] = signature(slug, level)
    console.log(`${slug}:${level} total=${fixture[`${slug}:${level}`].total}`)
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(fixture, null, 2))
console.log(`fixture -> ${OUT}`)
