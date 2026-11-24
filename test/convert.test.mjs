import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { deflateRawSync } from 'node:zlib'

import { loadSheets, walkPaths } from '../lib/xmind.js'
import { inspectBuffer, convertBuffer, convertFile } from '../lib/convert.js'
import { readZip, createZip, crc32 } from '../lib/zip.js'
import { buildWorkbook, safeSheetName } from '../lib/xlsx.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name) => join(here, 'fixtures', name)
const fixtureBuffer = (name) => readFile(fixture(name))

function sheetXml(workbook, index = 1) {
  return readZip(workbook).get(`xl/worksheets/sheet${index}.xml`).toString('utf8')
}

function decodeXml(value) {
  return value
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&')
}

function columnIndex(letters) {
  let index = 0
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64)
  return index - 1
}

function rowTexts(workbook, index = 1) {
  const xml = sheetXml(workbook, index)
  return [...xml.matchAll(/<row r="\d+">([\s\S]*?)<\/row>/gu)].map((match) => {
    const cells = new Map()
    for (const cell of match[1].matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*)>([\s\S]*?)<\/c>/gu)) {
      const column = columnIndex(cell[1])
      const text = /<t xml:space="preserve">([\s\S]*?)<\/t>/u.exec(cell[2])
      const number = /<v>([\s\S]*?)<\/v>/u.exec(cell[2])
      cells.set(column, decodeXml(text ? text[1] : number ? number[1] : ''))
    }
    const width = Math.max(-1, ...cells.keys()) + 1
    return Array.from({ length: width }, (_, column) => cells.get(column) ?? '')
  })
}

test('reads XMind 2020+ content.json', async () => {
  const sheets = loadSheets(await fixtureBuffer('sample-2020.xmind'), 'sample-2020.xmind')
  assert.deepEqual(sheets.map((sheet) => sheet.title), ['会员中心', '登录异常分支'])
  assert.equal(sheets.reduce((sum, sheet) => sum + walkPaths(sheet.root).length, 0), 21)
  const first = sheets[0].root.children[0].children[0]
  assert.equal(first.title, '验证手机号登录')
  assert.deepEqual(first.markers, ['priority-1'])
  assert.deepEqual(first.labels, ['冒烟', '登录'])
  assert.match(first.notes, /验证码 60s 失效/u)
})

test('reads XMind 8 content.xml', async () => {
  const sheets = loadSheets(await fixtureBuffer('sample-8.xmind'), 'sample-8.xmind')
  assert.deepEqual(sheets.map((sheet) => sheet.title), ['旧版画布'])
  assert.equal(sheets[0].root.title, '需求梳理')
  const first = sheets[0].root.children[0]
  assert.equal(first.title, '验证上传大小限制')
  assert.deepEqual(first.labels, ['边界'])
  assert.deepEqual(first.markers, ['priority-2'])
  assert.equal(first.notes, '最大 20MB')
})

test('outline writes one row per node with level columns', async () => {
  const buffer = await fixtureBuffer('sample-2020.xmind')
  const { buffer: workbook, stats } = convertBuffer(buffer, { filename: 'sample-2020.xmind', mode: 'outline' })
  assert.equal(stats.nodes, 21)
  assert.equal(stats.rows, 21)
  const rows = rowTexts(workbook)
  assert.equal(rows.length, 19) // header + 18 nodes of the first canvas
  assert.deepEqual(rows[0].slice(0, 2), ['层级1', '层级2'])
  assert.equal(rows[0].at(-1), '相对深度')
  assert.equal(rows[0].length, 10)
})

test('testcase recognizes 验证 titles and ignores 验证码 steps', async () => {
  const buffer = await fixtureBuffer('sample-2020.xmind')
  const { buffer: workbook, stats } = convertBuffer(buffer, { filename: 'sample-2020.xmind', mode: 'testcase', splitSheets: true })
  assert.equal(stats.cases, 4)
  const xml = sheetXml(workbook, 1)
  assert.match(xml, /验证手机号登录/u)
  assert.match(xml, /输入合法手机号并点击获取验证码/u)
  assert.match(xml, /P1/u)
  assert.match(xml, /账号已绑定邮箱/u)
})

test('testcase explodeSteps writes one row per step', async () => {
  const buffer = await fixtureBuffer('sample-2020.xmind')
  const { stats } = convertBuffer(buffer, { filename: 'sample-2020.xmind', mode: 'testcase', splitSheets: true, explodeSteps: true })
  assert.equal(stats.rows, 8)
})

test('checklist uses caseDepth, moves 说明 nodes to notes', async () => {
  const buffer = await fixtureBuffer('sample-checklist.xmind')
  const { buffer: workbook, stats } = convertBuffer(buffer, {
    filename: 'sample-checklist.xmind',
    mode: 'checklist',
    caseDepth: '2,3',
    splitSheets: true,
  })
  assert.equal(stats.cases, 4)
  const rows = rowTexts(workbook)
  assert.deepEqual(rows[0], ['模块', '场景', '用例标题', '优先级', '预期结果', '标签', '超链接', '备注'])
  assert.deepEqual(
    rows.slice(1).map((row) => row[2]),
    ['用例1', '用例2', '用例3', '用例4'],
  )
  assert.match(rows[1][4], /1\. 预期A/u)
  assert.match(rows[1][4], /2\. 预期B/u)
  assert.equal(rows[3][1], '') // L2 leaf case has no scene
  assert.match(rows[4][7], /^说明：/u)
})

test('checklist requires caseDepth', async () => {
  const buffer = await fixtureBuffer('sample-checklist.xmind')
  assert.throws(
    () => convertBuffer(buffer, { filename: 'sample-checklist.xmind', mode: 'checklist' }),
    /caseDepth/u,
  )
})

test('matrix merges adjacent equal ancestors', async () => {
  const buffer = await fixtureBuffer('sample-2020.xmind')
  const { buffer: workbook, stats } = convertBuffer(buffer, { filename: 'sample-2020.xmind', mode: 'matrix', splitSheets: true })
  assert.equal(stats.rows, 12)
  const xml = sheetXml(workbook, 1)
  assert.match(xml, /<mergeCells count="\d+">/u)
  assert.match(xml, /<mergeCell ref="A2:A12"\/>/u)
})

test('all mode writes outline, testcase and matrix sheets', async () => {
  const buffer = await fixtureBuffer('sample-2020.xmind')
  const { buffer: workbook, stats } = convertBuffer(buffer, { filename: 'sample-2020.xmind', mode: 'all', splitSheets: true })
  assert.equal(stats.sheets, 2)
  const workbookXml = readZip(workbook).get('xl/workbook.xml').toString('utf8')
  const names = [...workbookXml.matchAll(/<sheet name="([^"]+)"/gu)].map((match) => match[1])
  assert.deepEqual(names, ['会员中心.大纲', '会员中心.用例', '会员中心.矩阵', '登录异常分支.大纲', '登录异常分支.用例', '登录异常分支.矩阵'])
})

test('sheet name filtering', async () => {
  const buffer = await fixtureBuffer('sample-2020.xmind')
  const { stats } = convertBuffer(buffer, { filename: 'sample-2020.xmind', mode: 'outline', sheet: '异常' })
  assert.equal(stats.sheets, 1)
  assert.equal(stats.nodes, 3)
})

test('xlsx package has the required parts', async () => {
  const workbook = buildWorkbook([{ name: 'Demo', rows: [['a', 'b'], [1, 'x']], widths: [10, 20], wrapColumns: [1] }])
  const entries = readZip(workbook)
  for (const name of [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/worksheets/sheet1.xml',
  ]) {
    assert.ok(entries.has(name), `missing ${name}`)
  }
  assert.match(entries.get('xl/worksheets/sheet1.xml').toString('utf8'), /<c r="A2" s="3"><v>1<\/v><\/c>/u)
})

test('invalid inputs produce clear errors', async () => {
  assert.throws(() => loadSheets(Buffer.from('not a zip'), 'bad.xmind'), /不是有效的 \.xmind/u)
  const empty = createZip([{ name: 'content.json', data: '[]' }])
  assert.throws(() => loadSheets(empty, 'empty.xmind'), /没有找到任何带 rootTopic/u)
  const noParts = createZip([{ name: 'other.txt', data: 'x' }])
  assert.throws(() => loadSheets(noParts, 'none.xmind'), /structure|结构/u)
})

test('zip roundtrip keeps entries and detects corruption', () => {
  const archive = createZip([
    { name: 'a.txt', data: 'hello' },
    { name: 'dir/b.bin', data: Buffer.from([0, 1, 2, 255]) },
  ])
  const entries = readZip(archive)
  assert.equal(entries.get('a.txt').toString('utf8'), 'hello')
  assert.deepEqual([...entries.get('dir/b.bin')], [0, 1, 2, 255])
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926)
  const deflated = createZip([{ name: 'c.txt', data: deflateRawSync(Buffer.from('hello deflate')) }])
  assert.ok(readZip(deflated).has('c.txt'))
})

test('convertFile writes next to the input and avoids clobbering', async () => {
  const workdir = await mkdtemp(join(tmpdir(), 'dsh-xmind-'))
  const input = join(workdir, 'case.xmind')
  await writeFile(input, await fixtureBuffer('sample-2020.xmind'))
  const first = await convertFile(input, { mode: 'outline' })
  assert.equal(first.output, join(workdir, 'case.xlsx'))
  assert.ok((await stat(first.output)).size > 0)
  const second = await convertFile(input, { mode: 'outline' })
  assert.notEqual(second.output, first.output)
  assert.match(second.output, /-\d{8}-\d{6}\.xlsx$/u)
  const overwritten = await convertFile(input, { mode: 'outline', overwrite: true })
  assert.equal(overwritten.output, first.output)
})

test('convertFile rejects a missing file', async () => {
  await assert.rejects(() => convertFile(join(tmpdir(), 'no-such-file.xmind')), /不存在或不可读/u)
})

test('inspect reports canvases, depths and samples', async () => {
  const info = inspectBuffer(await fixtureBuffer('sample-2020.xmind'), { filename: 'sample-2020.xmind' })
  assert.equal(info.sheets.length, 2)
  assert.equal(info.sheets[0].nodes, 18)
  assert.deepEqual(info.sheets[0].depthDistribution[0], { depth: 0, count: 1 })
  assert.ok(info.sheets[0].samples.length > 0)
  assert.ok(info.sheets[0].markers.some((marker) => marker.marker === 'priority-1'))
})

test('safeSheetName sanitizes and deduplicates', () => {
  const used = []
  assert.equal(safeSheetName('会员中心.大纲', used), '会员中心.大纲')
  assert.equal(safeSheetName('a/b:c', used), 'a_b_c')
  assert.equal(safeSheetName('x'.repeat(40), used), 'x'.repeat(31))
  assert.equal(safeSheetName('x'.repeat(40), used), `${'x'.repeat(29)}-2`)
})