/**
 * Conversion modes: outline (level table), testcase (verify-prefixed cases),
 * checklist (structure-driven cases), matrix (merged path view).
 */
import { walkPaths, ancestorsOf } from './xmind.js'

export const MODES = ['outline', 'testcase', 'matrix']
export const ALL_MODES = ['outline', 'testcase', 'matrix']
export const MODE_LABEL = { outline: '大纲', testcase: '用例', matrix: '矩阵', checklist: '清单' }

const CASE_PREFIX_RE = /^\s*(?:验证|校验|测试)(?!码)\s*/u
const PRIORITY_RE = /[（(]\s*(P[0-4])\s*[)）]/iu
const BRACKET_RE = /[（(]([^（()）]{1,120})[)）]/u
const ANNOTATION_RE = /^\s*(说明|备注|注意|举例|前提|范围)\s*[:：]?/u
const EXPECT_SPLIT_RE = /\s*(?:=>|→|->|预期[:：])\s*/u

function priorityOf(title, markers = []) {
  for (const marker of markers) {
    const match = /priority-([0-4])/iu.exec(marker)
    if (match) return `P${match[1]}`
  }
  const match = PRIORITY_RE.exec(title)
  return match ? match[1].toUpperCase() : ''
}

function hasCaseDescendant(node, depth, caseDepths) {
  const stack = node.children.map((child) => ({ node: child, depth: depth + 1 }))
  while (stack.length > 0) {
    const current = stack.pop()
    if (caseDepths.has(current.depth)) return true
    for (const child of current.node.children) stack.push({ node: child, depth: current.depth + 1 })
  }
  return false
}

function splitStep(title) {
  const match = EXPECT_SPLIT_RE.exec(title)
  if (match && match.index > 0) {
    const before = title.slice(0, match.index).trim()
    const after = title.slice(match.index + match[0].length).trim()
    if (before) return [before, after]
  }
  return [title.trim(), '']
}

/** Level table: one row per node. */
export function buildOutline(sheet, { maxLevel = 12 } = {}) {
  const paths = walkPaths(sheet.root)
  const depthCap = Math.min(Math.max(...paths.map(({ depth }) => depth), 0), maxLevel)
  const header = [
    ...Array.from({ length: depthCap }, (_, index) => `层级${index + 1}`),
    '标题',
    '备注',
    '标签',
    '超链接',
    '标记/优先级',
    '路径',
    '相对深度',
  ]
  const rows = [header]
  for (const { node, trail, depth } of paths) {
    const chain = [...trail, node]
    const levels = chain.slice(1, depthCap + 1).map((item) => item.title)
    while (levels.length < depthCap) levels.push('')
    rows.push([
      ...levels,
      node.title,
      node.notes,
      node.labels.join(', '),
      node.href,
      priorityOf(node.title, node.markers) || node.markers.join(', '),
      chain.map((item) => item.title).join(' / '),
      depth,
    ])
  }
  const widths = {}
  for (let index = 1; index <= depthCap; index += 1) widths[index] = Math.max(12, Math.min(28, 10 + 2 * index))
  Object.assign(widths, {
    [depthCap + 1]: 40,
    [depthCap + 2]: 40,
    [depthCap + 3]: 16,
    [depthCap + 4]: 40,
    [depthCap + 5]: 16,
    [depthCap + 6]: 60,
    [depthCap + 7]: 10,
  })
  return {
    header,
    rows,
    widths: Object.values(widths),
    wrapColumns: [depthCap, depthCap + 1, depthCap + 5],
  }
}

/** Test case table for maps whose case titles start with 验证/校验/测试. */
export function buildTestcase(sheet, { explodeSteps = false } = {}) {
  const header = ['模块', '用例标题', '优先级', '前置条件', '步骤', '预期结果', '标签', '超链接', '备注']
  const walked = walkPaths(sheet.root).filter(({ depth }) => depth > 0)
  const explicit = walked.filter(({ node }) => CASE_PREFIX_RE.test(node.title))
  let chosen
  if (explicit.length > 0) {
    const nested = new Set()
    for (const { node } of explicit) {
      const stack = [...node.children]
      while (stack.length > 0) {
        const current = stack.pop()
        nested.add(current)
        stack.push(...current.children)
      }
    }
    chosen = explicit.filter(({ node }) => !nested.has(node))
  } else {
    const leaves = walked.filter(({ node }) => node.children.length === 0)
    chosen = leaves.length > 0 ? leaves : walked
  }
  const cases = []
  for (const { node } of chosen) {
    const chain = [...ancestorsOf(sheet.root, node), node]
    const moduleParts = chain
      .slice(0, -1)
      .map((item) => item.title)
      .filter((title) => title && !CASE_PREFIX_RE.test(title))
      .slice(0, 2)
    const module = moduleParts.join(' / ') || sheet.title
    let precondition = ''
    for (const ancestor of [...chain].slice(0, -1).reverse()) {
      const match = BRACKET_RE.exec(ancestor.title)
      if (match && !PRIORITY_RE.test(match[0])) {
        precondition = match[1].trim()
        break
      }
    }
    if (!precondition) {
      for (const child of node.children) {
        if (child.title.startsWith('前置') || child.title.startsWith('前提')) {
          precondition = child.notes || child.title
          break
        }
      }
    }
    const steps = []
    for (const child of node.children) {
      if (child.title.startsWith('前置') || child.title.startsWith('前提')) continue
      const [step, expectedFallback] = splitStep(child.title)
      let expected = expectedFallback
      if (!expected && child.notes) expected = child.notes.trim()
      steps.push([step, expected])
    }
    if (steps.length === 0) steps.push([node.notes.trim(), ''])
    const stepsText = steps.map(([step], index) => `${index + 1}. ${step}`).join('\n')
    const expectedText = steps.map(([, expected], index) => (expected ? `${index + 1}. ${expected}` : `${index + 1}. `)).join('\n')
    cases.push({
      module,
      title: node.title.trim() || '(未命名)',
      priority: priorityOf(node.title, node.markers),
      precondition,
      steps: stepsText,
      expected: expectedText,
      labels: node.labels.join(', '),
      href: node.href,
      notes: node.notes,
    })
  }
  const rows = [header]
  let caseCount = 0
  for (const item of cases) {
    const stepItems = item.steps.split('\n')
    const expectedItems = item.expected.split('\n')
    if (explodeSteps && stepItems.length > 1) {
      stepItems.forEach((step, index) => {
        rows.push([
          item.module,
          index === 0 ? item.title : '',
          index === 0 ? item.priority : '',
          index === 0 ? item.precondition : '',
          step,
          expectedItems[index] ?? '',
          index === 0 ? item.labels : '',
          index === 0 ? item.href : '',
          index === 0 ? item.notes : '',
        ])
      })
    } else {
      rows.push([item.module, item.title, item.priority, item.precondition, item.steps, item.expected, item.labels, item.href, item.notes])
    }
    caseCount += 1
  }
  return {
    header,
    rows,
    widths: [28, 36, 8, 28, 46, 46, 16, 36, 30],
    wrapColumns: [3, 4, 5, 8],
    cases: caseCount,
  }
}

/** Case checklist for maps shaped as 模块 → 场景 → 用例 → 预期. */
export function buildChecklist(sheet, { caseDepths = [] } = {}) {
  const depths = new Set(caseDepths)
  if (depths.size === 0) throw new Error('checklist 模式需要 caseDepth，例如 3 或 2,3')
  const header = ['模块', '场景', '用例标题', '优先级', '预期结果', '标签', '超链接', '备注']
  const rows = [header]
  let count = 0
  for (const { node, trail, depth } of walkPaths(sheet.root)) {
    if (!depths.has(depth)) continue
    if (hasCaseDescendant(node, depth, depths)) continue
    const chain = [...trail, node]
    const module = chain[1]?.title ?? ''
    let scene = depth >= 3 ? chain[2]?.title ?? '' : ''
    let annotation = ''
    if (scene && ANNOTATION_RE.test(scene)) {
      annotation = scene.trim()
      scene = ''
    }
    const lines = []
    node.children.forEach((child, index) => {
      let text = child.title.trim()
      if (child.notes) text = text ? `${text}（${child.notes.trim()}）` : child.notes.trim()
      lines.push(`${index + 1}. ${text}`)
      for (const grand of child.children) lines.push(`   · ${grand.title.trim()}`)
    })
    const notes = [annotation, node.notes.trim()].filter(Boolean).join('\n')
    rows.push([
      module,
      scene,
      node.title,
      priorityOf(node.title, node.markers),
      lines.join('\n'),
      node.labels.join(', '),
      node.href,
      notes,
    ])
    count += 1
  }
  return {
    header,
    rows,
    widths: [22, 26, 40, 8, 70, 16, 36, 30],
    wrapColumns: [2, 4, 7],
    cases: count,
  }
}

/** Merged path view: one row per leaf, ancestor cells merged vertically. */
export function buildMatrix(sheet, { maxLevel = 12 } = {}) {
  const leaves = []
  for (const { node, trail } of walkPaths(sheet.root)) {
    if (node.children.length > 0) continue
    const path = [...trail.map((item) => item.title), node.title].slice(0, maxLevel)
    leaves.push(path)
  }
  if (leaves.length === 0) leaves.push([sheet.root.title])
  const depth = Math.max(...leaves.map((path) => path.length), 1)
  const header = Array.from({ length: depth }, (_, index) => `层级${index + 1}`)
  const rows = [header]
  for (const path of leaves) {
    const row = [...path]
    while (row.length < depth) row.push('')
    rows.push(row)
  }
  const merges = []
  for (let column = 0; column < depth - 1; column += 1) {
    let start = 1 // zero-based row index 1 == worksheet row 2
    while (start <= leaves.length) {
      const value = rows[start][column]
      let end = start
      while (end + 1 <= leaves.length && rows[end + 1][column] === value) end += 1
      if (value !== '' && end > start) merges.push({ r1: start, c1: column, r2: end, c2: column })
      start = end + 1
    }
  }
  return {
    header,
    rows,
    widths: Array.from({ length: depth }, (_, index) => Math.max(14, Math.min(30, 8 + 3 * (index + 1)))),
    wrapColumns: Array.from({ length: depth }, (_, index) => index),
    merges,
  }
}

export function buildSheetFor(mode, sheet, options) {
  if (mode === 'outline') return buildOutline(sheet, options)
  if (mode === 'testcase') return buildTestcase(sheet, options)
  if (mode === 'checklist') return buildChecklist(sheet, options)
  if (mode === 'matrix') return buildMatrix(sheet, options)
  throw new Error(`未知模式：${mode}`)
}