/**
 * QA table mode: 模块 / 子模块 / 用例场景 / 优先级 / 前置条件 / 操作步骤 / 预期结果 / XMind 来源
 *
 * The mind map itself does not encode "precondition" vs "step" semantics, so the
 * split is inferred from four signals, strongest first, and every decision is
 * written to a review sheet:
 *
 *   1. explicit prefix     前置：/前提：/环境： vs 步骤：/操作：/流程：  (score 5)
 *   2. notes structure     numbered list in notes -> step (3); 前置/前提 wording -> precondition (3)
 *   3. bracket annotation  （已登录） style text, priority markers excluded (1)
 *   4. wording             verb-initial -> step (3) / verb word -> step (1);
 *                          state words (已/未/当前/断网/安装…) -> precondition (2)
 *
 * A node with no signal, or equal scores, is marked 未分类 and stays out of both
 * columns; its full path is still in the XMind 来源 column and the review sheet.
 */

export const QA_HEADER = ['模块', '子模块', '用例场景', '优先级', '前置条件', '操作步骤', '预期结果', 'XMind 来源']
export const QA_DETAIL_HEADER = ['主表行', '层级', '节点文本', '判定', '前置得分', '步骤得分', '依据', 'XMind 路径']

const PRIORITY_RE = /[（(]\s*(P[0-4])\s*[)）]/iu
const BRACKET_RE = /[（(]([^（()）]{1,120})[)）]/gu
const PREFIX_PRE_RE = /^\s*(前置|前提|准备|环境|账号|数据|条件)\s*[:：]?/u
const PREFIX_STEP_RE = /^\s*(步骤|操作|流程)\s*[:：]?/u
const PREFIX_EXPECT_RE = /^\s*(预期|结果|期望)\s*[:：]?/u
const QUESTION_RE = /[?？]|是否|如何|怎么|待确认/u
const STATE_RE = /(已|未|当前|存在|无|有网|断网|默认|版本|激活|安装|适配|机型|设备|网络|系统|通道|权限|条件|场景|情况|开关|处于|情况下|前提|前置|准备|环境|账号|数据)/u
const CONDITION_START_RE = /^(根据|按照|针对|当|若|如果|需|需要)/u
const VERB_START_RE = /^(点击|输入|选择|进入|打开|切换|滑动|长按|拖动|上传|下载|提交|返回|关闭|重启|安装|卸载|登录|扫码|勾选|填写|设置|按|点|删除|添加|保存|唤醒|跳转|查看|发送|兑换|购买|领取|解绑|绑定|刷新|播放|暂停|开启|禁用|下一步|上一步|继续|确认|确定|取消|退出|完成|重试)/u
const VERB_WORD_RE = /(点击|输入|选择|进入|打开|切换|滑动|长按|上传|下载|提交|返回|关闭|重启|安装|登录|扫码|勾选|填写|发送|兑换|购买|删除|添加|保存|唤醒|跳转)/u
const ACTION_NOUN_RE = /(孵化|变身|切换|升级|刷新|抽卡|兑换|发送|删除|添加|同步|领取|解锁|购买|唤醒|登录|解绑|绑定)$/u
// 断言/结果措辞（仅在 results: "on" 时使用）：出现、跟随、同步、生效、不变、显示…
const RESULT_RE = /(不变|跟随|同步|生效|更新|刷新|显示|展示|出现|提示|弹窗|置灰|高亮|消失|成功|失败|可查看|查看所有|支持查看|保持|恢复|对齐|选中态|勾选成功|不再)/u
// 这些词说明节点是判断/疑问/分支，不该当“结果措辞”
const RESULT_BLOCK_RE = /(是否|怎么|如何|判断|待确认|吗|确认是否)/u
const BRANCH_RE = /^(是|否|有|无|都|均)([（(].*[)）])?$/u
const NUMBERED_RE = /^\s*(?:\d+[.、)）]|[①-⑳])\s*/u
const MARKER_BRACKET_RE = /^[（(]\s*(P[0-4]|锚定|线上|新增|待定|选填|可滑动)\s*[)）]$/iu

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

/**
 * Classify one intermediate node.
 * @returns {{ verdict: '前置' | '步骤' | '未分类' | '预期' | '场景', preScore: number, stepScore: number, reasons: string[] }}
 */
export function classifyNode(node, options = {}) {
  const title = (node.title ?? '').trim()
  const notes = (node.notes ?? '').trim()
  const reasons = []
  let preScore = 0
  let stepScore = 0

  if (PREFIX_PRE_RE.test(title)) return { verdict: '前置', preScore: 5, stepScore: 0, reasons: ['前缀:前置'] }
  if (PREFIX_STEP_RE.test(title)) return { verdict: '步骤', preScore: 0, stepScore: 5, reasons: ['前缀:步骤'] }
  if (PREFIX_EXPECT_RE.test(title)) return { verdict: '预期', preScore: 0, stepScore: 0, reasons: ['前缀:预期'] }

  // 子节点是问句（是否/如何/怎么）→ 当前节点更像“场景/分支”，不是操作也不是前置
  if ((node.children ?? []).some((child) => QUESTION_RE.test(child.title ?? ''))) {
    return { verdict: '场景', preScore: 0, stepScore: 0, reasons: ['子节点为疑问'] }
  }

  if (notes !== '') {
    const numberedLines = notes.split('\n').filter((line) => NUMBERED_RE.test(line)).length
    if (numberedLines >= 2) {
      stepScore += 3
      reasons.push('备注:编号列表')
    }
    if (PREFIX_PRE_RE.test(notes) || /前提|前置|环境|账号/u.test(notes)) {
      preScore += 3
      reasons.push('备注:前置描述')
    }
  }

  for (const match of title.matchAll(BRACKET_RE)) {
    if (!MARKER_BRACKET_RE.test(match[0])) {
      preScore += 1
      reasons.push('括号注释')
      break
    }
  }

  if (CONDITION_START_RE.test(title)) {
    preScore += 2
    reasons.push('条件开头')
  }

  // 结果/断言措辞优先于动作词：如「形象跟随切换」。只在 results:"on" 且是紧邻叶子的节点时启用
  if (
    options.useResultRule === true
    && RESULT_RE.test(title)
    && !VERB_START_RE.test(title)
    && !RESULT_BLOCK_RE.test(title)
    && !BRANCH_RE.test(title)
  ) {
    return { verdict: '预期', preScore: 0, stepScore: 0, reasons: ['结果措辞'] }
  }

  if (VERB_START_RE.test(title)) {
    stepScore += 3
    reasons.push('动词开头')
  } else if (VERB_WORD_RE.test(title)) {
    stepScore += 2
    reasons.push('含动作词')
  } else if (ACTION_NOUN_RE.test(title)) {
    stepScore += 2
    reasons.push('动作名词')
  }

  if (STATE_RE.test(title)) {
    preScore += 2
    reasons.push('状态词')
  }

  if (QUESTION_RE.test(title)) reasons.push('疑问句')

  let verdict = '未分类'
  if (stepScore > preScore) verdict = '步骤'
  else if (preScore > stepScore) verdict = '前置'
  else if (stepScore > 0 && preScore > 0) {
    // 动作优先：像「断网时点击」这类条件+动作混写的节点，按操作步骤算，条件写在步骤文本里
    verdict = '步骤'
    reasons.push('动作优先')
  }
  return { verdict, preScore, stepScore, reasons }
}

/**
 * Lexical profile per depth, to pick the QA dialect before converting.
 * @param {object} sheet
 */
export function profileSheet(sheet) {
  const rows = []
  const visit = (node, depth) => {
    rows.push({ node, depth })
    for (const child of node.children) visit(child, depth + 1)
  }
  visit(sheet.root, 0)

  const byDepth = new Map()
  let prefixHits = 0
  let numberedHits = 0
  let considered = 0
  for (const { node, depth } of rows) {
    if (depth === 0) continue
    if (node.children.length === 0) continue
    const title = (node.title ?? '').trim()
    const notes = (node.notes ?? '').trim()
    const bucket = byDepth.get(depth) ?? { depth, n: 0, verbStart: 0, stateWord: 0, bracket: 0, numberedNotes: 0, prefix: 0 }
    bucket.n += 1
    if (VERB_START_RE.test(title)) bucket.verbStart += 1
    if (STATE_RE.test(title)) bucket.stateWord += 1
    if ([...title.matchAll(BRACKET_RE)].some((match) => !MARKER_BRACKET_RE.test(match[0]))) bucket.bracket += 1
    if (notes.split('\n').filter((line) => NUMBERED_RE.test(line)).length >= 2) bucket.numberedNotes += 1
    if (PREFIX_PRE_RE.test(title) || PREFIX_STEP_RE.test(title) || PREFIX_EXPECT_RE.test(title)) bucket.prefix += 1
    byDepth.set(depth, bucket)
    considered += 1
    if (PREFIX_PRE_RE.test(title) || PREFIX_STEP_RE.test(title) || PREFIX_EXPECT_RE.test(title)) prefixHits += 1
    if (notes.split('\n').filter((line) => NUMBERED_RE.test(line)).length >= 2) numberedHits += 1
  }

  const depths = [...byDepth.values()].sort((a, b) => a.depth - b.depth)
  const ratio = (value) => (considered === 0 ? 0 : value / considered)
  let suggestion = 'structure'
  let note = '未发现显式前缀或备注编号，建议按当前层级切分（sceneLevel/levelOffset），并核对「分类核对」表'
  if (ratio(prefixHits) >= 0.2) {
    suggestion = 'prefix'
    note = '图中大量节点使用「前置：/步骤：/预期：」前缀，严格按前缀解析最准'
  } else if (ratio(numberedHits) >= 0.2) {
    suggestion = 'notes'
    note = '图中大量用例把步骤写在备注的编号列表里，建议按备注解析'
  }
  return { depths, suggestion, note, considered, prefixRatio: ratio(prefixHits), numberedNotesRatio: ratio(numberedHits) }
}

/**
 * Build the QA table plus its classification review sheet.
 * @param {{ title: string, root: object }} sheet
 * @param {{ sceneLevel?: number, levelOffset?: number, preconditionDepths?: number[], stepDepths?: number[] }} options
 */
export function buildQa(sheet, options = {}) {
  const sceneLevel = Number.isInteger(options.sceneLevel) ? options.sceneLevel : 3
  const offset = Number.isInteger(options.levelOffset) ? options.levelOffset : 0
  const preDepths = new Set(Array.isArray(options.preconditionDepths) ? options.preconditionDepths : [])
  const stepDepths = new Set(Array.isArray(options.stepDepths) ? options.stepDepths : [])

  const rows = [QA_HEADER]
  const detail = [QA_DETAIL_HEADER]
  const stats = {
    rows: 0,
    nodes: 0,
    preconditionCells: 0,
    stepCells: 0,
    sceneAugmented: 0,
    resultExpected: 0,
    unclassified: 0,
    unclassifiedPlaced: 0,
    classified: 0,
  }
  const verdictCounts = { 前置: 0, 步骤: 0, 未分类: 0, 预期: 0, 场景: 0 }
  const policy = ['scene', 'steps', 'drop'].includes(options.unclassifiedPolicy) ? options.unclassifiedPolicy : 'steps'

  const visit = (node, trail) => {
    const chain = [...trail, node]
    const depth = chain.length - 1
    if (node.children.length > 0) {
      for (const child of node.children) visit(child, chain)
      return
    }
    if (depth === 0) return

    const titles = chain.map((item) => item.title)
    const moduleName = titles[1 + offset] ?? sheet.root.title
    const submodule = titles[2 + offset] ?? ''
    const scene = titles[sceneLevel + offset] ?? ''

    const pre = []
    const steps = []
    const sceneParts = []
    const expectedParts = []
    for (let index = 0; index < chain.length - 1; index += 1) {
      const item = chain[index]
      if (index <= 0 + offset) continue
      if (index <= 2 + offset) continue
      if (index <= sceneLevel + offset) continue
      const verdict =
        preDepths.has(index) ? { verdict: '前置', preScore: 9, stepScore: 0, reasons: ['参数指定层级'] }
          : stepDepths.has(index) ? { verdict: '步骤', preScore: 0, stepScore: 9, reasons: ['参数指定层级'] }
            : classifyNode(item, {
              useResultRule: options.results === 'on' && index === chain.length - 2,
            })
      verdictCounts[verdict.verdict] += 1
      let placed = verdict.verdict
      if (verdict.verdict === '前置') {
        pre.push(item.title.trim())
        stats.classified += 1
      } else if (verdict.verdict === '步骤') {
        steps.push(item.title.trim())
        stats.classified += 1
      } else if (verdict.verdict === '场景') {
        sceneParts.push(item.title.trim())
      } else if (verdict.verdict === '预期') {
        expectedParts.push(item.title.trim())
        stats.resultExpected += 1
        placed = '预期→结果'
      } else if (verdict.verdict === '未分类') {
        stats.unclassified += 1
        if (policy === 'scene') {
          sceneParts.push(item.title.trim())
          stats.unclassifiedPlaced += 1
          placed = '未分类→场景'
        } else if (policy === 'steps') {
          steps.push(item.title.trim())
          stats.unclassifiedPlaced += 1
          placed = '未分类→步骤'
        } else {
          placed = '未分类(未放入表格)'
        }
      }
      detail.push([
        stats.rows + 2,
        index,
        item.title,
        verdict.verdict,
        verdict.preScore,
        verdict.stepScore,
        verdict.reasons.join('、'),
        titles.slice(0, index + 1).join(' / '),
      ])
    }

    const leafText = node.notes ? `${node.title}（${node.notes}）` : node.title
    const expected = [...expectedParts, leafText].join(' → ')
    const sceneText = [scene, ...sceneParts].filter((part) => part !== '').join(' / ')
    rows.push([
      moduleName,
      submodule,
      sceneText,
      priorityOf(node, chain),
      pre.join('；'),
      steps.join(' → '),
      expected,
      `${sheet.title} › ${titles.join(' / ')}`,
    ])
    stats.rows += 1
    if (pre.length > 0) stats.preconditionCells += 1
    if (steps.length > 0) stats.stepCells += 1
    if (sceneParts.length > 0) stats.sceneAugmented += 1
  }

  visit(sheet.root, [])

  return {
    rows,
    detail,
    stats: { ...stats, sceneLevel, levelOffset: offset, unclassifiedPolicy: policy, results: options.results === 'on' ? 'on' : 'off', verdictCounts },
    widths: [18, 22, 34, 8, 26, 60, 52, 80],
    wrapColumns: [4, 5, 6, 7],
    detailWidths: [8, 6, 40, 12, 8, 8, 24, 60],
    detailWrapColumns: [2, 7],
  }
}