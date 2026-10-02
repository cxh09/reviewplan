#!/usr/bin/env node
/**
 * 古诗文背诵文本库抓取脚本。
 *
 * 从古诗文库（gushiwenku.cn）批量抓取「语文古诗文复习」合集 60 篇的纯原文，
 * 解析 <article class="poem-content"> 下的 <p class="original"> 段落，
 * 生成 src/data/recitations.json（并复制到 mobile/assets/recitations.json）。
 *
 * 用法：
 *   node scripts/fetch_recitations.mjs            # 抓取（已成功的 slug 自动跳过，可重跑续抓）
 *   node scripts/fetch_recitations.mjs --force    # 全部重抓
 * 输出：
 *   src/data/recitations.json   { slug: { title, author, paragraphs: string[] } }
 *   mobile/assets/recitations.json 同内容副本（Flutter 端打包为 asset）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_WEB = path.join(ROOT, 'src', 'data', 'recitations.json')
const OUT_MOBILE = path.join(ROOT, 'mobile', 'assets', 'recitations.json')
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const GAP_MS = 300
// 最短的《长亭送别·端正好》仅 25 个汉字，阈值取 20 挡住解析失败的空页
const MIN_CHARS = 20

/** 「语文古诗文复习」合集 60 条（来自线上日程广场快照，2026-09 核对） */
const ITEMS = [
  { slug: '41d249b', title: '《论语》十二章' },
  { slug: '6599baa', title: '《劝学（节选）》' },
  { slug: '6bf773f', title: '《屈原列传（节选）》' },
  { slug: '6c8d581', title: '《谏太宗十思疏》' },
  { slug: 'fbe5b3e', title: '《师说》' },
  { slug: '2f8e6fe', title: '《阿房宫赋》' },
  { slug: 'accfb17', title: '《六国论》' },
  { slug: 'd02c4e6', title: '《答司马谏议书》' },
  { slug: '06f2b2b', title: '《赤壁赋》' },
  { slug: '3a05547', title: '《项脊轩志》' },
  { slug: '31320e8', title: '《子路、曾皙、冉有、公西华侍坐》' },
  { slug: 'e9c612c', title: '《报任安书（节选）》' },
  { slug: '78badcf', title: '《过秦论（上）》' },
  { slug: 'cd89b30', title: '《礼运》' },
  { slug: '5447286', title: '《陈情表》' },
  { slug: '8992edc', title: '《归去来兮辞（并序）》' },
  { slug: 'bd78d35', title: '《种树郭橐驼传》' },
  { slug: '329faef', title: '《五代史伶官传序》' },
  { slug: '80d9b12', title: '《石钟山记》' },
  { slug: 'aaa9ef0', title: '《登泰山记》' },
  { slug: 'b48a979', title: '《静女》' },
  { slug: '87ce339', title: '《无衣》' },
  { slug: 'f2c73db', title: '《离骚（节选）》' },
  { slug: '829b08a', title: '《涉江采芙蓉》' },
  { slug: '4e5b344', title: '《短歌行》' },
  { slug: 'bfba9dd', title: '《归园田居（其一）》' },
  { slug: '9de4afa', title: '《拟行路难·其四》' },
  { slug: 'd477d33', title: '《春江花月夜》' },
  { slug: '440dd75', title: '《山居秋暝》' },
  { slug: 'ffc4463', title: '《蜀道难》' },
  { slug: 'fcec20d', title: '《梦游天姥吟留别》' },
  { slug: '8656c8f', title: '《将进酒》' },
  { slug: 'b631900', title: '《燕歌行》' },
  { slug: '74d1bb5', title: '《蜀相》' },
  { slug: '8a9fbca', title: '《客至》' },
  { slug: 'c385cf2', title: '《登高》' },
  { slug: 'dac1c56', title: '《登岳阳楼》' },
  { slug: '786276a', title: '《琵琶行（并序）》' },
  { slug: '1a0faba', title: '《李凭箜篌引》' },
  { slug: '57576b7', title: '《菩萨蛮》' },
  { slug: 'bd7ca1f', title: '《锦瑟》' },
  { slug: 'a4e307e', title: '《虞美人》' },
  { slug: 'dca9362', title: '《望海潮》' },
  { slug: 'c95ddc8', title: '《桂枝香·金陵怀古》' },
  { slug: 'c63cf9f', title: '《江城子·乙卯正月二十日夜记梦》' },
  { slug: 'c826b23', title: '《念奴娇·赤壁怀古》' },
  { slug: '95c36da', title: '《登快阁》' },
  { slug: '7653c5b', title: '《鹊桥仙》' },
  { slug: '6cc0ecd', title: '《苏幕遮》' },
  { slug: '871d1c8', title: '《声声慢》' },
  { slug: '135a0e1', title: '《书愤》' },
  { slug: '8149e7b', title: '《临安春雨初霁》' },
  { slug: 'b68b271', title: '《念奴娇·过洞庭》' },
  { slug: '268d6d4', title: '《永遇乐·京口北固亭怀古》' },
  { slug: 'd850a2d', title: '《菩萨蛮·书江西造口壁》' },
  { slug: '2a552de', title: '《青玉案·元夕》' },
  { slug: '48a65f5', title: '《贺新郎》' },
  { slug: '1b7f6f4', title: '《扬州慢》' },
  { slug: '72a5422', title: '《长亭送别（正宫·端正好）》' },
  { slug: '8dc56a5', title: '《朝天子·咏喇叭》' },
]

const NAMED_ENTITIES = {
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  middot: '·',
  laquo: '«',
  raquo: '»',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  nbsp: ' ',
}

/** 解码 HTML 实体（命名常用 + 数字），并去掉残留标签 */
function cleanHtml(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, '')
}

function hanCount(text) {
  return (text.match(/[\u3400-\u9fff]/g) || []).length
}

/**
 * 从页内 <title>（如「苏轼《石钟山记》原文翻译及拼音版」）提取作者。
 * 篇名统一用合集标题（与 plan.title 一致，便于标题兜底匹配），这里只抽《》前的作者。
 */
function parseAuthor(rawTitle) {
  const m = `${rawTitle}`.match(/^(.{1,8}?)《/)
  return m ? m[1].trim() : ''
}

/** 合集标题去《》后的规范篇名 */
function canonicalTitle(itemTitle) {
  return itemTitle.replace(/[《》]/g, '').trim()
}

/** 提取正文：优先 poem-content 下的 p.original；兜底为逐句翻译区隔开的原文段 */
function parseParagraphs(html) {
  const block = html.match(/<article class="poem-content"[^>]*>([\s\S]*?)<\/article>/)
  if (block) {
    const ps = [...block[1].matchAll(/<p class="original">([\s\S]*?)<\/p>/g)]
      .map((m) => cleanHtml(m[1]))
      .filter(Boolean)
    if (ps.length) return ps
  }
  // 兜底：「逐句原文翻译」区里，原文段是每对 <p> 中的奇数项（原文/翻译交替），
  // 无法稳定区分时直接放弃，让调用方记入失败清单人工处理。
  return null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchOne(item) {
  const url = `https://www.gushiwenku.cn/shiwen/${item.slug}/`
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  const paragraphs = parseParagraphs(html)
  if (!paragraphs) throw new Error('未找到原文段落（结构可能变化）')
  const chars = paragraphs.join('').length
  if (hanCount(paragraphs.join('')) < MIN_CHARS) throw new Error(`原文过短（${chars} 字）`)
  const pageMatch = html.match(/<title>([^<]*)<\/title>/)
  return {
    title: canonicalTitle(item.title),
    author: parseAuthor(pageMatch ? pageMatch[1].split(' - ')[0] : ''),
    paragraphs,
  }
}

/** 修补旧版脚本写入的坏数据：title 存成了整段页面标题、author 丢失 */
function patchEntry(entry, item) {
  let changed = false
  const wantTitle = canonicalTitle(item.title)
  if (entry.title !== wantTitle) {
    entry.author = entry.author || parseAuthor(entry.title)
    entry.title = wantTitle
    changed = true
  }
  if (!entry.author) {
    entry.author = parseAuthor(entry.title)
  }
  return changed
}

async function main() {
  const force = process.argv.includes('--force')
  fs.mkdirSync(path.dirname(OUT_WEB), { recursive: true })

  const store = force || !fs.existsSync(OUT_WEB) ? {} : JSON.parse(fs.readFileSync(OUT_WEB, 'utf8'))
  const failed = []
  let done = 0

  for (const item of ITEMS) {
    if (store[item.slug]) {
      if (patchEntry(store[item.slug], item)) {
        console.log(`修补 ${item.title} -> author=${store[item.slug].author || '(无)'}`)
      }
      done += 1
      continue
    }
    try {
      store[item.slug] = await fetchOne(item)
      const text = store[item.slug].paragraphs.join('')
      done += 1
      console.log(
        `[${done}/${ITEMS.length}] ✓ ${item.title} ${store[item.slug].author} | ${text.length}字 | ${text.slice(0, 12)}…${text.slice(-12)}`,
      )
      // 每抓一篇就落盘，中断可续
      fs.writeFileSync(OUT_WEB, JSON.stringify(store, null, 0))
    } catch (error) {
      failed.push({ ...item, reason: error.message })
      console.log(`[${done}/${ITEMS.length}] ✗ ${item.title}: ${error.message}`)
    }
    await sleep(GAP_MS)
  }

  fs.writeFileSync(OUT_WEB, JSON.stringify(store, null, 0))
  fs.mkdirSync(path.dirname(OUT_MOBILE), { recursive: true })
  fs.copyFileSync(OUT_WEB, OUT_MOBILE)

  console.log(`\n完成：${Object.keys(store).length}/${ITEMS.length} 篇`)
  console.log(`Web:    ${OUT_WEB}`)
  console.log(`Mobile: ${OUT_MOBILE}`)
  if (failed.length) {
    console.log('\n失败清单（重跑本脚本可续抓）：')
    failed.forEach((f) => console.log(`  ${f.slug} ${f.title} -> ${f.reason}`))
    process.exitCode = 1
  }
}

main()
