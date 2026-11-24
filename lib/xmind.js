/**
 * Read a `.xmind` container into a normalized mind-map tree.
 *
 * Supported layouts:
 *   - XMind 2020+/Zen: `content.json` (array of sheets, each with `rootTopic`)
 *   - XMind 8: `content.xml` (`<xmap-content><sheet><topic>`)
 */
import { parseXml, findChild, childText } from './xml.js'
import { readZip } from './zip.js'

const FLOATING_SUPPORTED = true

/**
 * @typedef {object} MindNode
 * @property {string} title
 * @property {string} notes
 * @property {string[]} labels
 * @property {string} href
 * @property {string[]} markers
 * @property {MindNode[]} children
 */

/**
 * @typedef {object} MindSheet
 * @property {string} title
 * @property {MindNode} root
 */

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function jsonTopic(raw) {
  const plain = raw?.notes?.plain
  const notes = typeof plain === 'object' && plain !== null ? text(plain.content) : ''
  const labels = Array.isArray(raw?.labels) ? raw.labels.map((item) => text(String(item))).filter(Boolean) : []
  const markers = []
  for (const marker of Array.isArray(raw?.markers) ? raw.markers : []) {
    const id = typeof marker === 'string' ? marker : marker?.markerId
    if (text(id)) markers.push(text(id))
  }
  for (const key of ['markerRefs', 'extensions']) {
    for (const item of Array.isArray(raw?.[key]) ? raw[key] : []) {
      const id = typeof item === 'string' ? item : item?.markerId
      if (text(id)) markers.push(text(id))
    }
  }
  const children = []
  for (const child of raw?.children?.attached ?? []) if (child && typeof child === 'object') children.push(jsonTopic(child))
  if (FLOATING_SUPPORTED) {
    for (const child of raw?.children?.detached ?? []) if (child && typeof child === 'object') children.push(jsonTopic(child))
  }
  return {
    title: text(raw?.title) || text(raw?.plainContent),
    notes,
    labels,
    href: text(raw?.href),
    markers,
    children,
  }
}

function xmlTopic(element) {
  const labelsElement = findChild(element, 'labels')
  const labels = (labelsElement?.children ?? [])
    .filter((child) => child.name === 'label')
    .map((child) => text(child.text))
    .filter(Boolean)
  const markerRefs = findChild(element, 'marker-refs')
  const markers = (markerRefs?.children ?? [])
    .filter((child) => child.name === 'marker-ref')
    .map((child) => text(child.attributes['marker-id']))
    .filter(Boolean)
  const children = []
  const childrenElement = findChild(element, 'children')
  for (const topics of childrenElement?.children ?? []) {
    if (topics.name !== 'topics') continue
    for (const child of topics.children) if (child.name === 'topic') children.push(xmlTopic(child))
  }
  const notesElement = findChild(element, 'notes')
  const notes = notesElement ? childText(notesElement, 'plain') || childText(notesElement, 'html') : ''
  return {
    title: childText(element, 'title') || childText(element, 'plainContent'),
    notes,
    labels,
    href: text(element.attributes.href) || childText(element, 'href'),
    markers,
    children,
  }
}

function normalizeSheetTitle(value, index) {
  const title = text(value)
  return title || `画布 ${index + 1}`
}

/**
 * @param {Buffer} buffer contents of a .xmind file
 * @param {string} [filename] used for error messages
 * @returns {MindSheet[]}
 */
export function loadSheets(buffer, filename = 'input.xmind') {
  let entries
  try {
    entries = readZip(buffer)
  } catch (error) {
    throw new Error(`${filename} 不是有效的 .xmind（zip）文件：${error.message}`)
  }
  if (entries.has('content.json')) {
    let data
    try {
      data = JSON.parse(entries.get('content.json').toString('utf8').replace(/^\uFEFF/u, ''))
    } catch (error) {
      throw new Error(`${filename} 的 content.json 无法解析：${error.message}`)
    }
    const sheets = []
    for (const [index, raw] of (Array.isArray(data) ? data : []).entries()) {
      if (!raw || typeof raw !== 'object' || !raw.rootTopic || typeof raw.rootTopic !== 'object') continue
      sheets.push({ title: normalizeSheetTitle(raw.title, index), root: jsonTopic(raw.rootTopic) })
    }
    if (sheets.length === 0) throw new Error(`${filename} 的 content.json 里没有找到任何带 rootTopic 的画布`)
    return sheets
  }
  if (entries.has('content.xml')) {
    const document = parseXml(entries.get('content.xml').toString('utf8'))
    const content = document.children.find((child) => child.name === 'xmap-content') ?? document
    const sheets = []
    let index = 0
    for (const sheetElement of content.children) {
      if (sheetElement.name !== 'sheet') continue
      const topicElement = sheetElement.children.find((child) => child.name === 'topic')
      if (!topicElement) continue
      sheets.push({ title: normalizeSheetTitle(childText(sheetElement, 'title'), index), root: xmlTopic(topicElement) })
      index += 1
    }
    if (sheets.length === 0) throw new Error(`${filename} 的 content.xml 里没有找到任何 sheet/topic`)
    return sheets
  }
  throw new Error(`${filename} 结构不认识：包里既没有 content.json 也没有 content.xml`)
}

/** Depth-first walk yielding { node, trail, depth } (root has depth 0, trail excludes the node). */
export function walkPaths(root) {
  const output = []
  const stack = [{ node: root, trail: [], depth: 0 }]
  while (stack.length > 0) {
    const { node, trail, depth } = stack.pop()
    output.push({ node, trail, depth })
    const chain = [...trail, node]
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: node.children[index], trail: chain, depth: depth + 1 })
    }
  }
  return output
}

/** Parent chain from root down to (excluding) the node, or null when not found. */
export function ancestorsOf(root, target) {
  if (root === target) return []
  const stack = [{ node: root, trail: [] }]
  while (stack.length > 0) {
    const { node, trail } = stack.pop()
    for (const child of node.children) {
      if (child === target) return [...trail, node]
      stack.push({ node: child, trail: [...trail, node] })
    }
  }
  return []
}