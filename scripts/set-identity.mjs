#!/usr/bin/env node
/**
 * Fill the identity placeholders (GitHub / email / npm scope) in one pass.
 *
 *   node scripts/set-identity.mjs --github ouyangqiusheng --email me@example.com
 *   node scripts/set-identity.mjs --github ouyangqiusheng --email me@example.com --scope my-scope
 *
 * Updates package.json (repository, homepage, bugs, author.url, optional scoped name),
 * the README source links, and the local git identity. Idempotent.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const AUTHOR = '欧阳秋生'

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      args[key] = true
      continue
    }
    args[key] = value
    index += 1
  }
  return args
}

function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
const github = typeof args.github === 'string' ? args.github.trim().replace(/^@/u, '') : ''
if (github === '') fail('缺少 --github <GitHub 用户名>')
if (!/^[A-Za-z0-9-]+$/u.test(github)) fail(`GitHub 用户名不合法：${github}`)
const email = typeof args.email === 'string' ? args.email.trim() : ''
const scope = typeof args.scope === 'string' ? args.scope.trim().replace(/^@/u, '') : ''
const npmUser = typeof args.npm === 'string' ? args.npm.trim().replace(/^@/u, '') : ''

const repositoryUrl = `https://github.com/${github}/dsh-xmind-excel`
const manifestPath = join(root, 'package.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

manifest.name = scope ? `@${scope}/dsh-xmind-excel` : 'dsh-xmind-excel'
manifest.author = { name: AUTHOR, url: `https://github.com/${github}` }
manifest.repository = { type: 'git', url: `git+${repositoryUrl}.git` }
manifest.homepage = `${repositoryUrl}#readme`
manifest.bugs = { url: `${repositoryUrl}/issues` }
if (npmUser) manifest.publishConfig = { ...(manifest.publishConfig ?? {}), registry: 'https://registry.npmjs.org', tag: 'latest' }

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

const readmeReplacements = [
  ['README.md', `Source: ${repositoryUrl}.`],
  ['README.zh.md', `源码：${repositoryUrl}。`],
]
for (const [file, text] of readmeReplacements) {
  const path = join(root, file)
  const source = await readFile(path, 'utf8')
  const marker = /<!-- repository -->/u
  if (marker.test(source)) {
    await writeFile(path, source.replace(marker, text), 'utf8')
  } else {
    console.warn(`warn: ${file} 里没有 <!-- repository --> 标记，跳过链接替换`)
  }
}

const git = (gitArgs) => {
  try {
    execFileSync('git', gitArgs, { cwd: root, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}
if (git(['rev-parse', '--git-dir'])) {
  git(['config', 'user.name', AUTHOR])
  if (email !== '') git(['config', 'user.email', email])
} else {
  console.log('提示：目录还不是 git 仓库，先执行 git init。')
}

console.log(`\n已写入身份信息：`)
console.log(`  name       = ${manifest.name}`)
console.log(`  author     = ${AUTHOR} (https://github.com/${github})`)
console.log(`  repository = ${repositoryUrl}`)
console.log(`  email      = ${email || '(未设置，commit 前需 --email 或 git config user.email)'}`)
console.log(`\n下一步：`)
console.log(`  git add .`)
console.log(`  git commit -m "feat: XMind to Excel converter for DeepSeek Harness"`)
console.log(`  git remote add origin ${repositoryUrl}.git`)
console.log(`  git push -u origin main`)
console.log(`  npm publish --access public   # 或打 tag 让 GitHub Actions 带 provenance 发布`)
if (email === '') console.log(`\n注意：git commit 需要邮箱，重新跑一次并带上 --email <你@example.com>。`)