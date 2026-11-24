/**
 * Tiny XML reader for XMind 8 `content.xml`.
 *
 * Only the subset that appears in XMind documents is supported: elements,
 * attributes, text, CDATA, comments, the XML prolog, and the five predefined
 * entities plus numeric character references. Namespaces are dropped so
 * lookups use local names.
 */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/gu, (match, body) => {
    if (body.startsWith('#x') || body.startsWith('#X')) return String.fromCodePoint(Number.parseInt(body.slice(2), 16))
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10))
    return Object.prototype.hasOwnProperty.call(ENTITIES, body) ? ENTITIES[body] : match
  })
}

function localName(qualified) {
  const index = qualified.indexOf(':')
  return index === -1 ? qualified : qualified.slice(index + 1)
}

/**
 * @typedef {{ name: string, attributes: Record<string, string>, children: any[], text: string }} XmlElement
 */

/**
 * Parse an XML document into a tree of elements.
 * @param {string} source
 * @returns {XmlElement}
 */
export function parseXml(source) {
  const root = { name: '#document', attributes: {}, children: [], text: '' }
  const stack = [root]
  let index = 0
  const length = source.length

  const appendText = (raw) => {
    if (raw === '') return
    const decoded = decodeEntities(raw)
    const current = stack[stack.length - 1]
    current.text += decoded
  }

  while (index < length) {
    const next = source.indexOf('<', index)
    if (next === -1) {
      appendText(source.slice(index))
      break
    }
    if (next > index) appendText(source.slice(index, next))
    if (source.startsWith('<!--', next)) {
      const end = source.indexOf('-->', next + 4)
      if (end === -1) throw new Error('malformed XML: unterminated comment')
      index = end + 3
      continue
    }
    if (source.startsWith('<![CDATA[', next)) {
      const end = source.indexOf(']]>', next + 9)
      if (end === -1) throw new Error('malformed XML: unterminated CDATA')
      stack[stack.length - 1].text += source.slice(next + 9, end)
      index = end + 3
      continue
    }
    if (source.startsWith('<?', next)) {
      const end = source.indexOf('?>', next + 2)
      if (end === -1) throw new Error('malformed XML: unterminated processing instruction')
      index = end + 2
      continue
    }
    if (source.startsWith('<!', next)) {
      const end = source.indexOf('>', next + 2)
      if (end === -1) throw new Error('malformed XML: unterminated declaration')
      index = end + 1
      continue
    }
    const tagEnd = findTagEnd(source, next + 1)
    if (tagEnd === -1) throw new Error('malformed XML: unterminated tag')
    const raw = source.slice(next + 1, tagEnd)
    index = tagEnd + 1
    if (raw.startsWith('/')) {
      const closing = localName(raw.slice(1).trim())
      while (stack.length > 1) {
        const popped = stack.pop()
        if (popped.name === closing) break
        if (stack.length === 1) throw new Error(`malformed XML: unexpected closing tag ${closing}`)
      }
      continue
    }
    const selfClosing = raw.endsWith('/')
    const body = selfClosing ? raw.slice(0, -1) : raw
    const spaceIndex = body.search(/\s/u)
    const qualified = spaceIndex === -1 ? body : body.slice(0, spaceIndex)
    const element = { name: localName(qualified.trim()), attributes: {}, children: [], text: '' }
    if (spaceIndex !== -1) {
      const attributeText = body.slice(spaceIndex)
      const attributePattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu
      let match
      while ((match = attributePattern.exec(attributeText)) !== null) {
        element.attributes[localName(match[1])] = decodeEntities(match[2] ?? match[3] ?? '')
      }
    }
    stack[stack.length - 1].children.push(element)
    if (!selfClosing) stack.push(element)
  }
  return root
}

function findTagEnd(source, from) {
  let quote = ''
  for (let index = from; index < source.length; index += 1) {
    const char = source[index]
    if (quote !== '') {
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '>') return index
  }
  return -1
}

/** All descendants with the given local name, in document order (iterative). */
export function findAll(element, name) {
  const found = []
  const stack = [...element.children]
  while (stack.length > 0) {
    const current = stack.shift()
    if (current.name === name) found.push(current)
    stack.unshift(...current.children)
  }
  return found
}

/** First child with the given local name. */
export function findChild(element, name) {
  return element.children.find((child) => child.name === name)
}

/** Trimmed text of the first child with the given name, or '' */
export function childText(element, name) {
  const child = findChild(element, name)
  return child ? child.text.trim() : ''
}