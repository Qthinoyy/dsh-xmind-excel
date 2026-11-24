#!/usr/bin/env node
/**
 * 按 QA 表头生成表格：模块 / 子模块 / 用例场景 / 优先级 / 前置条件 / 操作步骤 / 预期结果 / XMind 来源
 *
 * 映射规则（每个叶子 = 一条"预期结果"行）：
 *   模块      = 第 1 层
 *   子模块    = 第 2 层
 *   用例场景  = 第 sceneLevel 层（默认 3，可用参数改）
 *   优先级    = 叶子或祖先上最近的 priority-N 标记 / 标题里的 （P0）
 *   前置条件  = 祖先标题里最近一处括号说明
 *   操作步骤  = sceneLevel+1 到父节点之间的路径（" → " 连接）
 *   预期结果  = 叶子标题（+ 备注）
 *   XMind 来源 = 画布名 › 完整路径
 *
 * 用法：node tools/qa-table.mjs <input.xmind> <output.xlsx> [sceneLevel=3]
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const lib = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib')
const libUrl = `file:///${lib.replace(/\\/gu, '/')}`
const { loadSheets, walkPaths } = await import(`${libUrl}/xmind.js`)
const { buildWorkbook } = await import(`${libUrl}/xlsx.js`)

const PRIORITY_RE = /[（(]\s*(P[0-4])\s*[)）]/iu
const BRACKET_RE = /[（(]([^（()）]{1,120})[)）]/u

function priorityOf(node, chain) {
  for (const item of [node, ...[...chain].reverse()]) {
    for (const marker of item.markers ?? []) {
      const match = /priority-([0-4])/iu.exec(marker)
      if (match) return `P${match[1]}`
    }
    const bracket = PRIORITY_RE.exec(item.title ?? '')
    if (bracket) return bracket[1].toUpperCase()
  }
  return ''
}

function preconditionOf(chain) {
  for (const item of [...chain].reverse()) {
    const match = BRACKET_RE.exec(item.title ?? '')
    if (match && !PRIORITY_RE.test(match[0])) return match[1].trim()
  }
  return ''
}

const [input, output, sceneArg, offsetArg] = process.argv.slice(2)
const sceneLevel = Number.parseInt(sceneArg ?? '3', 10) || 3
const offset = Number.parseInt(offsetArg ?? '0', 10) || 0
if (!input || !output) {
  console.error('usage: node tools/qa-table.mjs <input.xmind> <output.xlsx> [sceneLevel=3] [offset=0]')
  process.exit(2)
}

const sheets = loadSheets(await readFile(input), input)
const rows = [['模块', '子模块', '用例场景', '优先级', '前置条件', '操作步骤', '预期结果', 'XMind 来源']]
let count = 0
for (const sheet of sheets) {
  for (const { node, trail, depth } of walkPaths(sheet.root)) {
    if (node.children.length > 0 || depth === 0) continue // 叶子才是“预期结果”行
    const chain = [...trail, node]
    const titles = chain.map((item) => item.title)
    const moduleName = titles[1 + offset] ?? sheet.root.title
    const submodule = titles[2 + offset] ?? ''
    const scene = titles[sceneLevel + offset] ?? ''
    const steps = titles.slice(sceneLevel + offset + 1, -1)
    const expected = node.notes ? `${node.title}（${node.notes}）` : node.title
    rows.push([
      moduleName,
      submodule,
      scene,
      priorityOf(node, chain),
      preconditionOf(chain),
      steps.join(' → '),
      expected,
      `${sheet.title} › ${titles.join(' / ')}`,
    ])
    count += 1
  }
}

const workbook = buildWorkbook(
  [{ name: '用例表', rows, widths: [18, 22, 34, 8, 26, 60, 52, 80], wrapColumns: [4, 5, 6, 7] }],
  { title: 'QA 表' },
)
await writeFile(output, workbook)
console.log(JSON.stringify({ rows: count, sceneLevel, output }))