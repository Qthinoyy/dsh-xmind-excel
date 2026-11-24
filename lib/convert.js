/**
 * Orchestration: read a .xmind file, build the requested sheets, write .xlsx.
 */
import { readFile, writeFile, access, mkdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, basename, extname, resolve } from 'node:path'
import { loadSheets, walkPaths } from './xmind.js'
import { buildSheetFor, ALL_MODES, MODE_LABEL, MODES } from './modes.js'
import { buildWorkbook } from './xlsx.js'

export const MAX_INPUT_BYTES = 50 * 1024 * 1024

function normalizeMode(mode) {
  const value = String(mode ?? 'outline').trim().toLowerCase()
  if (value === 'all') return { modes: ALL_MODES, mode: 'all' }
  if (value === 'checklist') return { modes: ['checklist'], mode: 'checklist' }
  if (MODES.includes(value)) return { modes: [value], mode: value }
  throw new Error(`不支持的 mode：${mode}（可用：${[...MODES, 'checklist', 'all'].join(' / ')}）`)
}

function parseCaseDepths(value) {
  if (value === undefined || value === null || value === '') return []
  const parts = String(value)
    .replace(/，/gu, ',')
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
  const valid = parts.filter((item) => Number.isInteger(item) && item > 0 && item <= 30)
  return [...new Set(valid)]
}

function defaultOutputPath(inputPath, mode) {
  const extension = extname(inputPath)
  const base = extension ? inputPath.slice(0, -extension.length) : inputPath
  if (mode === 'outline' || mode === 'all') return `${base}.xlsx`
  return `${base}.${mode}.xlsx`
}

export function convertBuffer(buffer, options = {}) {
  const { filename = 'input.xmind', mode = 'outline', maxLevel = 12, splitSheets = false, explodeSteps = false } = options
  const caseDepths = parseCaseDepths(options.caseDepth)
  const { modes, mode: resolvedMode } = normalizeMode(mode)
  if (resolvedMode === 'checklist' && caseDepths.length === 0) {
    throw new Error('checklist 模式需要 caseDepth，例如 3 或 2,3（先用 xmind_inspect 看层级结构）')
  }
  const maxLevelValue = Number.parseInt(maxLevel, 10)
  if (!Number.isInteger(maxLevelValue) || maxLevelValue < 1 || maxLevelValue > 30) {
    throw new Error('maxLevel 需要是 1–30 的整数')
  }
  let sheets = loadSheets(buffer, filename)
  if (options.sheet) {
    const wanted = String(options.sheet).trim()
    const exact = sheets.filter((sheet) => sheet.title === wanted)
    const partial = sheets.filter((sheet) => sheet.title.toLowerCase().includes(wanted.toLowerCase()))
    sheets = exact.length > 0 ? exact : partial
    if (sheets.length === 0) {
      throw new Error(`没有找到画布「${wanted}」，可用画布：${sheets.map((sheet) => sheet.title).join(', ') || '（无）'}`)
    }
  }
  const stats = { sheets: 0, nodes: 0, rows: 0, cases: 0, mode: resolvedMode }
  const workbookSheets = []
  const usedNames = []
  for (const sheet of sheets) {
    stats.sheets += 1
    stats.nodes += walkPaths(sheet.root).length
    for (const modeName of modes) {
      const built = buildSheetFor(modeName, sheet, {
        maxLevel: maxLevelValue,
        caseDepths,
        explodeSteps: Boolean(explodeSteps),
      })
      const name = splitSheets ? `${sheet.title}.${MODE_LABEL[modeName] ?? modeName}` : sheet.title
      workbookSheets.push({
        name,
        rows: built.rows,
        widths: built.widths,
        wrapColumns: built.wrapColumns,
        merges: built.merges ?? [],
      })
      stats.rows += built.rows.length - 1
      if (modeName === 'testcase' || modeName === 'checklist') stats.cases += built.cases ?? 0
      usedNames.push(name)
    }
  }
  const buffer2 = buildWorkbook(workbookSheets, { title: options.title ?? filename })
  return { buffer: buffer2, stats }
}

export async function convertFile(inputPath, options = {}) {
  const absolute = resolve(String(inputPath))
  let buffer
  try {
    buffer = await readFile(absolute)
  } catch {
    throw new Error(`输入文件不存在或不可读：${absolute}`)
  }
  const { size } = await stat(absolute)
  if (size > MAX_INPUT_BYTES) throw new Error(`输入文件过大：${(size / 1024 / 1024).toFixed(1)} MB（上限 50 MB）`)
  const { buffer: workbookBuffer, stats } = convertBuffer(buffer, { filename: basename(absolute), ...options })
  let output = options.output ? resolve(String(options.output)) : defaultOutputPath(absolute, stats.mode)
  try {
    await access(output, constants.F_OK)
    if (options.overwrite !== true) {
      const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace(/\..+$/u, '').replace(/T/u, '-')
      const extension = extname(output)
      output = `${output.slice(0, -extension.length)}-${stamp}${extension}`
    }
  } catch {
    // target does not exist yet
  }
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, workbookBuffer)
  return { ...stats, output, bytes: workbookBuffer.length }
}

export function inspectBuffer(buffer, options = {}) {
  const filename = options.filename ?? 'input.xmind'
  const sheets = loadSheets(buffer, filename)
  const result = { sheets: [] }
  for (const sheet of sheets) {
    const paths = walkPaths(sheet.root)
    const depthCount = new Map()
    const markers = new Map()
    const samples = new Map()
    for (const { node, depth } of paths) {
      depthCount.set(depth, (depthCount.get(depth) ?? 0) + 1)
      for (const marker of node.markers) markers.set(marker, (markers.get(marker) ?? 0) + 1)
      const bucket = samples.get(depth) ?? []
      if (bucket.length < (options.samplesPerLevel ?? 4)) {
        bucket.push(node.title.replace(/\s*\n\s*/gu, ' ⏎ ').slice(0, 80))
      }
      samples.set(depth, bucket)
    }
    result.sheets.push({
      title: sheet.title,
      root: sheet.root.title,
      nodes: paths.length,
      depthDistribution: [...depthCount.entries()].sort((a, b) => a[0] - b[0]).map(([depth, count]) => ({ depth, count })),
      markers: [...markers.entries()].map(([marker, count]) => ({ marker, count })),
      samples: [...samples.entries()].sort((a, b) => a[0] - b[0]).map(([depth, titles]) => ({ depth, titles })),
    })
  }
  return result
}

export async function inspectFile(inputPath, options = {}) {
  const absolute = resolve(String(inputPath))
  let buffer
  try {
    buffer = await readFile(absolute)
  } catch {
    throw new Error(`输入文件不存在或不可读：${absolute}`)
  }
  if (buffer.length > MAX_INPUT_BYTES) throw new Error('输入文件过大（上限 50 MB）')
  return { ...inspectBuffer(buffer, { filename: basename(absolute), ...options }), input: absolute }
}

export { MODE_LABEL, MODES }