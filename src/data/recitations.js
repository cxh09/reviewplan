/**
 * 背诵文本库入口：JSON 由 scripts/fetch_recitations.mjs 从古诗文库抓取生成。
 * 引擎（utils/recitation.js）保持纯函数、由调用方注入这份数据，
 * 便于 Node parity 脚本无转换复用同一实现。
 */
import recitations from './recitations.json'

export default recitations
