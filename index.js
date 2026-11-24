/**
 * dsh-xmind-excel — convert XMind mind maps into Excel workbooks.
 *
 * Tools:
 *   xmind_to_excel — write .xlsx from a .xmind file (outline / testcase / checklist / matrix / all)
 *   xmind_inspect  — summarize canvases, depth distribution and samples before choosing a mode
 *
 * Also registers the bundled `xmind-to-excel` skill so agents can load the full
 * workflow and limitations on demand.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { convertFile, inspectFile } from './lib/convert.js'

const SKILL_NAME = 'xmind-to-excel'
const SKILL_PROVIDER_NAME = 'dsh-xmind-excel-bundled-skill'
const SKILL_URL = new URL('./skills/xmind-to-excel/SKILL.md', import.meta.url)
const SKILL_RESOURCE_BASE = { kind: 'directory', path: fileURLToPath(new URL('./skills/xmind-to-excel/', import.meta.url)) }
const BUNDLED_SKILL_RANK = 600
const SKILL_FALLBACK_DESCRIPTION =
  'Convert .xmind mind maps to .xlsx with the xmind_to_excel tool: outline, testcase, checklist and merged matrix views.'

export const inject = ['tools']

function render(value) {
  return [{ type: 'text', text: value }]
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatConvertResult(result) {
  return [
    `Created: ${result.output}`,
    `mode=${result.mode} sheets=${result.sheets} nodes=${result.nodes} rows=${result.rows} cases=${result.cases} size=${formatBytes(result.bytes)}`,
  ].join('\n')
}

function formatInspectResult(info) {
  const lines = [`File: ${info.input}`, `Canvases: ${info.sheets.length}`]
  for (const [index, sheet] of info.sheets.entries()) {
    lines.push(`[${index + 1}] ${sheet.title} — root "${sheet.root}", ${sheet.nodes} nodes`)
    lines.push(
      `    depth: ${sheet.depthDistribution.map(({ depth, count }) => `${depth}:${count}`).join(' ')}`,
    )
    if (sheet.markers.length > 0) {
      lines.push(`    markers: ${sheet.markers.map(({ marker, count }) => `${marker}×${count}`).join(', ')}`)
    }
    for (const { depth, titles } of sheet.samples) {
      lines.push(`    L${depth}: ${titles.join(' | ')}`)
    }
  }
  const guidance = []
  if (info.sheets.some((sheet) => sheet.nodes > 1)) {
    guidance.push('outline = every node as a row (faithful); matrix = leaf paths with merged ancestor cells.')
    guidance.push('testcase expects case titles starting with 验证/校验/测试; otherwise it falls back to leaf nodes.')
    guidance.push('For 模块 → 场景 → 用例 → 预期 maps, use mode=checklist with caseDepth=2,3 (pick levels from the depth distribution).')
  }
  if (guidance.length > 0) lines.push('', ...guidance)
  return lines.join('\n')
}

function normalizeArgs(args) {
  return {
    input: args?.input,
    output: args?.output,
    mode: args?.mode,
    caseDepth: args?.caseDepth,
    sheet: args?.sheet,
    maxLevel: args?.maxLevel,
    splitSheets: args?.splitSheets,
    explodeSteps: args?.explodeSteps,
    overwrite: args?.overwrite,
  }
}

function parseSkillDocument(source) {
  const newline = source.startsWith('---\r\n') ? '\r\n' : '\n'
  const opening = `---${newline}`
  if (!source.startsWith(opening)) return { fields: {}, body: source }
  const closing = `${newline}---${newline}`
  const end = source.indexOf(closing, opening.length)
  if (end === -1) return { fields: {}, body: source }
  const fields = {}
  for (const line of source.slice(opening.length, end).split(newline)) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/u.exec(line)
    if (match === null) continue
    const value = match[2].trim().replace(/^(['"])([\s\S]*)\1$/u, '$2')
    if (value !== '') fields[match[1]] = value
  }
  return { fields, body: source.slice(end + closing.length) }
}

async function loadSkillDocument(signal) {
  const source = await readFile(SKILL_URL, { encoding: 'utf8', ...(signal ? { signal } : {}) })
  const { fields, body } = parseSkillDocument(source)
  return {
    candidate: {
      name: SKILL_NAME,
      description: fields.description ?? SKILL_FALLBACK_DESCRIPTION,
      ...(fields.whenToUse !== undefined ? { whenToUse: fields.whenToUse } : {}),
      invocation: { modelInvocable: true, userInvocable: true },
      provider: SKILL_PROVIDER_NAME,
      source: 'bundled',
      resourceBase: SKILL_RESOURCE_BASE,
      rank: BUNDLED_SKILL_RANK,
      locator: SKILL_URL,
      path: fileURLToPath(SKILL_URL),
      metadata: fields,
    },
    content: body,
  }
}

const skillProvider = {
  name: SKILL_PROVIDER_NAME,
  async list(options = {}) {
    const { candidate } = await loadSkillDocument(options.signal)
    return [candidate]
  },
  async get(selected, options = {}) {
    if (selected.name !== SKILL_NAME) return undefined
    const { candidate, content } = await loadSkillDocument(options.signal)
    return { ...candidate, content }
  },
}

export { skillProvider }

export function apply(ctx) {
  ctx.effect(function* registerTools() {
    yield ctx.tools.register({
      name: 'xmind_to_excel',
      description:
        'Convert an XMind mind map (.xmind) into an Excel workbook (.xlsx). Modes: outline (every node as a row with level columns), testcase (cases whose titles start with 验证/校验/测试), checklist (cases chosen by tree level, expectations from child nodes), matrix (leaf paths with merged ancestor cells), or all. Writes the workbook locally next to the input file unless an output path is given.',
      parameters: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Absolute path of the .xmind file.' },
          output: { type: 'string', description: 'Absolute path of the .xlsx to write; defaults to <input>.xlsx (or <input>.<mode>.xlsx), with a timestamp suffix when the name is taken. Pass overwrite=true to replace it instead.' },
          mode: {
            type: 'string',
            enum: ['outline', 'testcase', 'checklist', 'matrix', 'all'],
            description: 'outline (default) writes one row per node; testcase needs 验证/校验/测试 prefixes; checklist needs caseDepth; matrix merges ancestor cells; all writes outline + testcase + matrix.',
          },
          caseDepth: { type: 'string', description: 'checklist mode only: tree levels that contain cases, e.g. "3" or "2,3". A node at one of these levels is a case unless a deeper case level exists below it.' },
          sheet: { type: 'string', description: 'Only convert the canvas whose title matches exactly, or contains, this text.' },
          maxLevel: { type: 'string', description: 'Level columns to expand, 1–30; defaults to 12.' },
          splitSheets: { type: 'boolean', description: 'Name each worksheet <canvas>.<view> instead of sharing the canvas title.' },
          explodeSteps: { type: 'boolean', description: 'testcase mode: write one row per step instead of one row per case.' },
          overwrite: { type: 'boolean', description: 'Replace an existing default output file instead of adding a timestamp suffix.' },
        },
        required: ['input'],
        additionalProperties: false,
      },
      timeoutMs: 60000,
      output: { schema: { type: 'string' }, render: (_args, value) => render(value) },
      async execute(args, exec) {
        const options = normalizeArgs(args)
        if (typeof options.input !== 'string' || options.input.trim() === '') throw new Error('input 需要是 .xmind 文件的绝对路径')
        const signal = exec?.signal
        signal?.throwIfAborted?.()
        const result = await convertFile(options.input.trim(), {
          output: typeof options.output === 'string' && options.output.trim() !== '' ? options.output.trim() : undefined,
          mode: options.mode,
          caseDepth: options.caseDepth,
          sheet: options.sheet,
          maxLevel: options.maxLevel ?? 12,
          splitSheets: options.splitSheets === true,
          explodeSteps: options.explodeSteps === true,
          overwrite: options.overwrite === true,
        })
        signal?.throwIfAborted?.()
        return formatConvertResult(result)
      },
    })
    yield ctx.tools.register({
      name: 'xmind_inspect',
      description:
        'Summarize an XMind mind map before converting: canvases, node counts, depth distribution, priority markers, and sample titles per level. Use it to pick the right conversion mode and caseDepth.',
      parameters: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Absolute path of the .xmind file.' },
        },
        required: ['input'],
        additionalProperties: false,
      },
      timeoutMs: 30000,
      output: { schema: { type: 'string' }, render: (_args, value) => render(value) },
      async execute(args, exec) {
        if (typeof args?.input !== 'string' || args.input.trim() === '') throw new Error('input 需要是 .xmind 文件的绝对路径')
        exec?.signal?.throwIfAborted?.()
        const info = await inspectFile(args.input.trim())
        return formatInspectResult(info)
      },
    })
  }, 'xmind-excel-tools')

  ctx.inject(['skills'], (skillCtx) => {
    try {
      skillCtx.skills.registerProvider(() => skillProvider)
    } catch (error) {
      ctx.logger?.warn?.('dsh-xmind-excel: bundled skill was not registered: %s', error?.message ?? error)
    }
  })
}