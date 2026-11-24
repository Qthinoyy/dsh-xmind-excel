import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { parseXml } from '../lib/xml.js'
import { skillProvider } from '../index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (name) => readFile(join(root, name))
const readJson = async (name) => JSON.parse(await read(name))
const readText = async (name) => (await read(name)).toString('utf8')

const FORBIDDEN_SVG = ['script', 'style', 'text', 'image', 'foreignObject', 'animate', 'animateTransform']

function collectTags(element, output = []) {
  for (const child of element.children) {
    output.push(child.name)
    collectTags(child, output)
  }
  return output
}

test('locale files carry title, description and a detail document', async () => {
  for (const [name, expectedTitle] of [
    ['locale/en.json', 'XMind to Excel'],
    ['locale/zh.json', 'XMind 转 Excel'],
  ]) {
    const locale = await readJson(name)
    assert.equal(locale.meta.title, expectedTitle)
    assert.ok(locale.meta.description.length > 80, `${name} description is too short`)
    assert.match(locale.meta.detail, /^docs\/DETAIL(?:\.[a-z]+)?\.md$/u)
    const detail = await readText(locale.meta.detail)
    const imageLines = detail.split('\n').filter((line) => line.trim().startsWith('!['))
    assert.equal(imageLines.length, 1, `${name} detail must contain exactly one image line`)
    const imagePath = /\]\(([^)]+)\)/u.exec(imageLines[0])[1]
    const imageStat = await stat(join(root, 'docs', imagePath))
    assert.ok(imageStat.size < 1024 * 1024, 'detail image must stay under 1 MiB')
  }
})

test('icon is a self-contained 36x36 SVG', async () => {
  const source = await readText('icon.svg')
  const document = parseXml(source)
  const svg = document.children.find((child) => child.name === 'svg')
  assert.ok(svg, 'icon.svg has an svg root')
  assert.equal(svg.attributes.width, '36')
  assert.equal(svg.attributes.height, '36')
  assert.equal(svg.attributes.viewBox, '0 0 36 36')
  const tags = collectTags(document)
  for (const forbidden of FORBIDDEN_SVG) assert.ok(!tags.includes(forbidden), `icon must not contain <${forbidden}>`)
  assert.ok((await stat(join(root, 'icon.svg'))).size < 256 * 1024)
})

test('detail preview is a 640x300 text-free SVG', async () => {
  const source = await readText('docs/preview.svg')
  const document = parseXml(source)
  const svg = document.children.find((child) => child.name === 'svg')
  assert.ok(svg, 'preview.svg has an svg root')
  assert.equal(svg.attributes.width, '640')
  assert.equal(svg.attributes.height, '300')
  assert.equal(svg.attributes.viewBox, '0 0 640 300')
  const tags = collectTags(document)
  for (const forbidden of FORBIDDEN_SVG) assert.ok(!tags.includes(forbidden), `preview must not contain <${forbidden}>`)
})

test('manifest declares the bundle patch, engines and shipped files', async () => {
  const manifest = await readJson('package.json')
  assert.equal(manifest.name, 'dsh-xmind-excel')
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.match(manifest.dsh.engines.dsh, /0\.2\./u)
  assert.match(manifest.engines.node, />=22/u)
  for (const required of ['index.js', 'lib/', 'skills/', 'locale/', 'docs/', 'cordis.patch.yml', 'icon.svg', 'README.md', 'README.zh.md', 'CHANGELOG.md', 'LICENSE']) {
    assert.ok(manifest.files.includes(required), `files must list ${required}`)
  }
  for (const exported of ['.', './locale/*.json', './icon']) {
    assert.ok(manifest.exports[exported], `exports must declare ${exported}`)
  }
  const patch = await readText('cordis.patch.yml')
  assert.match(patch, /id: xmind-excel/u)
  assert.match(patch, /name: 'dsh-xmind-excel'/u)
})

test('every file referenced by the manifest exists', async () => {
  const manifest = await readJson('package.json')
  const missing = []
  const walk = async (relativePath) => {
    const absolute = join(root, relativePath)
    const info = await stat(absolute).catch(() => null)
    if (!info) return missing.push(relativePath)
    if (!info.isDirectory()) return
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      await walk(join(relativePath, entry.name))
    }
  }
  for (const entry of manifest.files) {
    if (entry.startsWith('!')) continue
    await walk(entry.replace(/\/$/u, ''))
  }
  assert.deepEqual(missing, [])
})

test('authorship is declared in manifest, licence and docs', async () => {
  const manifest = await readJson('package.json')
  const authorName = typeof manifest.author === 'string' ? manifest.author : manifest.author?.name
  assert.equal(authorName, '欧阳秋生')
  if (typeof manifest.author === 'object') assert.match(manifest.author.url ?? '', /^https:\/\/github\.com\//u)
  const license = await readText('LICENSE')
  assert.match(license, /Copyright \(c\) 2026 欧阳秋生 \(Ouyang Qiusheng\)/u)
  const publishing = await readText('PUBLISHING.md')
  assert.match(publishing, /欧阳秋生/u)
  assert.match(publishing, /provenance/u)
  const workflow = await readText('.github/workflows/publish.yml')
  assert.match(workflow, /npm publish --provenance/u)
  assert.match(workflow, /NODE_AUTH_TOKEN/u)
  const ignore = await readText('.gitignore')
  assert.match(ignore, /node_modules\//u)
  const english = await readText('README.md')
  assert.match(english, /<!-- repository -->|Source: https:\/\/github\.com\//u)
})

test('bundled skill provider serves the SKILL.md document', async () => {
  const candidates = await skillProvider.list()
  assert.equal(candidates.length, 1)
  const candidate = candidates[0]
  assert.equal(candidate.name, 'xmind-to-excel')
  assert.equal(candidate.provider, 'dsh-xmind-excel-bundled-skill')
  assert.equal(candidate.source, 'bundled')
  assert.equal(candidate.rank, 600)
  assert.match(candidate.description, /xmind_to_excel|XMind/u)
  assert.equal(candidate.resourceBase.kind, 'directory')
  const document = await skillProvider.get({ name: 'xmind-to-excel' })
  assert.equal(document.name, 'xmind-to-excel')
  assert.match(document.content, /xmind_to_excel/u)
  assert.match(document.content, /caseDepth/u)
  assert.equal(await skillProvider.get({ name: 'something-else' }), undefined)
})

test('documentation stays truthful about the published limits', async () => {
  const english = await readText('README.md')
  const chinese = await readText('README.zh.md')
  for (const text of [english, chinese]) {
    assert.match(text, /50 MB/u)
    assert.match(text, /matrix/u)
    assert.match(text, /LICENSE/u)
  }
  const relativeDocs = [
    relative(root, join(root, 'docs', 'DETAIL.md')).replace(/\\/gu, '/'),
    relative(root, join(root, 'docs', 'DETAIL.zh.md')).replace(/\\/gu, '/'),
  ]
  assert.deepEqual(relativeDocs, ['docs/DETAIL.md', 'docs/DETAIL.zh.md'])
})