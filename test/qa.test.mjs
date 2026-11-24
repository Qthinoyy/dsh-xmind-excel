import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { classifyNode, buildQa, QA_HEADER, QA_DETAIL_HEADER } from '../lib/qa.js'
import { convertBuffer, inspectBuffer } from '../lib/convert.js'
import { loadSheets } from '../lib/xmind.js'
import { readZip } from '../lib/zip.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name) => join(here, 'fixtures', name)

async function sheetFromFixture() {
  const buffer = await readFile(fixture('sample-qa.xmind'))
  return loadSheets(buffer, 'sample-qa.xmind')[0]
}

function rowsOf(buffer, sheetIndex) {
  const xml = readZip(buffer).get(`xl/worksheets/sheet${sheetIndex}.xml`).toString('utf8')
  return [...xml.matchAll(/<row r="\d+">([\s\S]*?)<\/row>/gu)].map((match) => {
    const cells = new Map()
    for (const cell of match[1].matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*)>([\s\S]*?)<\/c>/gu)) {
      let column = 0
      for (const char of cell[1]) column = column * 26 + (char.charCodeAt(0) - 64)
      const text = /<t xml:space="preserve">([\s\S]*?)<\/t>/u.exec(cell[2])
      cells.set(column - 1, text ? text[1] : '')
    }
    const width = Math.max(-1, ...cells.keys()) + 1
    return Array.from({ length: width }, (_, column) => cells.get(column) ?? '')
  })
}

test('classifyNode prefers explicit prefixes', () => {
  assert.equal(classifyNode({ title: '前置：已登录', notes: '', markers: [] }).verdict, '前置')
  assert.equal(classifyNode({ title: '步骤：打开页面', notes: '', markers: [] }).verdict, '步骤')
  assert.equal(classifyNode({ title: '预期：显示成功', notes: '', markers: [] }).verdict, '预期')
})

test('classifyNode reads numbered notes as steps and state words as preconditions', () => {
  assert.equal(classifyNode({ title: '登录流程', notes: '1. 打开\n2. 输入', markers: [] }).verdict, '步骤')
  assert.equal(classifyNode({ title: '已激活设备', notes: '', markers: [] }).verdict, '前置')
  assert.equal(classifyNode({ title: '点击开始', notes: '', markers: [] }).verdict, '步骤')
  assert.equal(classifyNode({ title: '下一步', notes: '', markers: [] }).verdict, '步骤')
  assert.equal(classifyNode({ title: '根据机型区分', notes: '', markers: [] }).verdict, '前置')
  assert.equal(classifyNode({ title: '无网络情况', notes: '', markers: [] }).verdict, '前置')
})

test('classifyNode leaves ambiguous nodes unclassified', () => {
  const result = classifyNode({ title: '排序规则', notes: '', markers: [] })
  assert.equal(result.verdict, '未分类')
  assert.equal(result.preScore, 0)
  assert.equal(result.stepScore, 0)
})

test('classifyNode treats a question parent as a scene and action nouns as steps', () => {
  assert.equal(classifyNode({ title: '他人孵化', notes: '', markers: [], children: [{ title: '是否实时变化？' }] }).verdict, '场景')
  assert.equal(classifyNode({ title: '他人孵化', notes: '', markers: [], children: [] }).verdict, '步骤')
})

test('buildQa splits preconditions from steps and writes the review sheet', async () => {
  const sheet = await sheetFromFixture()
  const qa = buildQa(sheet, { sceneLevel: 3 })
  assert.deepEqual(qa.rows[0], QA_HEADER)
  assert.deepEqual(qa.detail[0], QA_DETAIL_HEADER)
  assert.equal(qa.rows.length - 1, 6)
  assert.equal(qa.stats.unclassified, 1)
  assert.equal(qa.stats.unclassifiedPlaced, 1)
  assert.equal(qa.stats.sceneAugmented, 1)
  assert.equal(qa.stats.resultExpected, 2)

  const byExpected = new Map(qa.rows.slice(1).map((row) => [row[6], row]))
  assert.equal(byExpected.get('显示成功页面')[0], '模块A')
  assert.equal(byExpected.get('显示成功页面')[1], '子模块1')
  assert.equal(byExpected.get('显示成功页面')[2], '场景1')
  assert.equal(byExpected.get('显示成功页面')[4], '前置：已登录')
  assert.equal(byExpected.get('显示成功页面')[5], '点击开始')
  assert.equal(byExpected.get('出现提示')[4], '')
  assert.equal(byExpected.get('出现提示')[5], '断网时点击')
  assert.equal(byExpected.get('结果A')[5], '备注编号步骤')
  assert.equal(byExpected.get('结果B')[4], '无信号')
  assert.equal(byExpected.get('结果B')[5], '')
  // 他人孵化 is a scene (its child is a question); 是否实时变化？ is undecided and appended to steps (default policy)
  assert.equal(byExpected.get('状态不需实时更新')[2], '场景3 / 他人孵化')
  assert.equal(byExpected.get('状态不需实时更新')[4], '')
  assert.equal(byExpected.get('状态不需实时更新')[5], '是否实时变化？')
  // result wording wins over action verbs: both ancestors land in the expected column
  const resultRow = qa.rows.find((row) => typeof row[6] === 'string' && row[6].endsWith('查看所有形象点位'))
  assert.ok(resultRow, 'row for 查看所有形象点位 exists')
  assert.equal(resultRow[5], '')
  assert.equal(resultRow[6], 'pad选择同步到cat → 形象跟随切换 → 查看所有形象点位')

  assert.equal(qa.detail.length - 1, 9)
  assert.ok(qa.detail.some((row) => row[3] === '前置' && String(row[6]).includes('前缀')))
  assert.ok(qa.detail.every((row, index) => index === 0 || typeof row[1] === 'number'))
})

test('qa mode writes the main sheet plus the review sheet', async () => {
  const buffer = await readFile(fixture('sample-qa.xmind'))
  const { buffer: workbook, stats } = convertBuffer(buffer, { filename: 'sample-qa.xmind', mode: 'qa', sceneLevel: 3 })
  assert.equal(stats.rows, 6)
  assert.equal(stats.qa.sceneLevel, 3)
  assert.equal(stats.qa.unclassified, 1)
  assert.equal(stats.qa.unclassifiedPlaced, 1)
  const workbookXml = readZip(workbook).get('xl/workbook.xml').toString('utf8')
  const names = [...workbookXml.matchAll(/<sheet name="([^"]+)"/gu)].map((match) => match[1])
  assert.deepEqual(names, ['画布 1.用例表', '画布 1.分类核对'])
  const main = rowsOf(workbook, 1)
  assert.deepEqual(main[0], QA_HEADER)
  assert.equal(main.length, 7)
})

test('qa mode honours levelOffset and withDetail=false', async () => {
  const buffer = await readFile(fixture('sample-qa.xmind'))
  const { buffer: workbook, stats } = convertBuffer(buffer, {
    filename: 'sample-qa.xmind',
    mode: 'qa',
    sceneLevel: 3,
    levelOffset: 1,
    withDetail: false,
  })
  assert.equal(stats.qa.levelOffset, 1)
  const main = rowsOf(workbook, 1)
  // offset 1: module becomes 子模块1, submodule 场景1, scene 前置：已登录
  assert.equal(main[1][0], '子模块1')
  assert.equal(main[1][1], '场景1')
  assert.equal(main[1][2], '前置：已登录')
  const workbookXml = readZip(workbook).get('xl/workbook.xml').toString('utf8')
  const names = [...workbookXml.matchAll(/<sheet name="([^"]+)"/gu)].map((match) => match[1])
  assert.deepEqual(names, ['画布 1.用例表'])
})

test('forced depths override the heuristic', async () => {
  const sheet = await sheetFromFixture()
  const qa = buildQa(sheet, { sceneLevel: 3, stepDepths: [4] })
  const byExpected = new Map(qa.rows.slice(1).map((row) => [row[6], row]))
  // depth 4 nodes are forced to steps, including the 前置：已登录 one
  assert.equal(byExpected.get('显示成功页面')[4], '')
  assert.equal(byExpected.get('显示成功页面')[5], '前置：已登录 → 点击开始')
})

test('inspect reports a dialect profile', async () => {
  const info = inspectBuffer(await readFile(fixture('sample-qa.xmind')), { filename: 'sample-qa.xmind' })
  const dialect = info.sheets[0].dialect
  assert.equal(dialect.suggestion, 'structure')
  assert.ok(dialect.considered > 0)
  assert.ok(Array.isArray(dialect.depths))
})