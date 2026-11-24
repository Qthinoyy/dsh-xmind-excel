#!/usr/bin/env node
/**
 * Release preflight: tells you exactly what is ready and what blocks publishing.
 *
 *   node scripts/release-check.mjs            # 本地检查
 *   node scripts/release-check.mjs --remote   # 额外检查 GitHub 远端与 npm 名字（需要网络）
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const checkRemote = process.argv.includes('--remote')
const lines = []
let failures = 0

const ok = (label, detail = '') => lines.push(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`)
const bad = (label, detail = '') => {
  failures += 1
  lines.push(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
}
const info = (label, detail = '') => lines.push(`  · ${label}${detail ? ` — ${detail}` : ''}`)

const run = (command, args, options = {}) =>
  spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: options.timeout ?? 120000, ...options })

async function main() {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const license = await readFile(join(root, 'LICENSE'), 'utf8')
  lines.push(`release-check: ${manifest.name}@${manifest.version}\n`)

  lines.push('身份与元数据')
  const authorName = typeof manifest.author === 'string' ? manifest.author : manifest.author?.name
  if (authorName === '欧阳秋生') ok('package.json author', authorName)
  else bad('package.json author', String(authorName ?? '(空)'))
  if (/欧阳秋生/u.test(license)) ok('LICENSE 版权人', '欧阳秋生')
  else bad('LICENSE 版权人', '未写 欧阳秋生')
  if (manifest.repository?.url) ok('repository', manifest.repository.url)
  else bad('repository', '未声明（scripts/set-identity.mjs 可补）')

  lines.push('\n代码与测试')
  const tests = run(process.execPath, ['--test'])
  const summary = /ℹ pass (\d+)[\s\S]*?ℹ fail (\d+)/u.exec(tests.stdout ?? '')
  if (summary && summary[2] === '0') ok('node --test', `${summary[1]} passed`)
  else bad('node --test', summary ? `${summary[1]} passed, ${summary[2]} failed` : '未能运行')

  lines.push('\nGit')
  const git = (args) => run('git', args)
  const insideRepo = git(['rev-parse', '--is-inside-work-tree']).status === 0
  if (!insideRepo) {
    bad('git 仓库', '未初始化：git init')
  } else {
    const branch = (git(['branch', '--show-current']).stdout ?? '').trim()
    if (branch === 'main') ok('分支', 'main')
    else bad('分支', `${branch || '(无)'}，推送前执行 git branch -M main`)
    const dirty = (git(['status', '--porcelain']).stdout ?? '').trim()
    if (dirty === '') ok('工作区', 'clean')
    else bad('工作区', `${dirty.split('\n').length} 个文件未提交`)
    const commits = (git(['rev-list', '--count', 'HEAD']).stdout ?? '').trim()
    const author = (git(['log', '-1', '--format=%an <%ae>']).stdout ?? '').trim()
    if (Number(commits) > 0 && author.includes('ouyangqiusheng@163.com')) ok('提交历史', `${commits} 个提交，作者 ${author}`)
    else bad('提交历史', commits === '0' ? '尚无提交' : `作者 ${author || '(无)'}`)
    const remote = (git(['remote', 'get-url', 'origin']).stdout ?? '').trim()
    if (remote) ok('origin', remote)
    else bad('origin', '未配置：git remote add origin <url>')
  }

  lines.push('\n产物')
  const tarball = join(root, 'dist', `${manifest.name.replace(/^@[^/]+\//u, '')}-${manifest.version}.tgz`)
  const tarballInfo = await stat(tarball).catch(() => null)
  if (tarballInfo) ok('tarball', `${(tarballInfo.size / 1024).toFixed(1)} KB`)
  else info('tarball', '未打包：pnpm pack --pack-destination dist')

  if (checkRemote) {
    lines.push('\n网络与发布目标')
    const fetchStatus = async (url) => {
      try {
        const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) })
        return response.status
      } catch (error) {
        return `失败(${error.name})`
      }
    }
    const registry = await fetchStatus(`https://registry.npmjs.org/${manifest.name}`)
    if (registry === 404) ok('npm 名字', `${manifest.name} 可用（404）`)
    else if (registry === 200) info('npm 名字', `${manifest.name} 已被占用（200）`)
    else bad('npm 名字检查', String(registry))
    const repoName = (manifest.repository?.url ?? '').replace(/^git\+/u, '').replace(/\.git$/u, '')
    const repoStatus = await fetchStatus(`${repoName}`)
    if (typeof repoStatus === 'number' && repoStatus < 400) ok('GitHub 仓库可达', repoName)
    else bad('GitHub 仓库可达', `${repoName} → ${repoStatus}（未建仓库或网络不可达）`)
    const authNpm = run('npm', ['whoami'], { timeout: 15000 })
    if (authNpm.status === 0) ok('npm 登录', (authNpm.stdout ?? '').trim())
    else info('npm 登录', '未登录：npm login')
  }

  configReport()
  console.log(lines.join('\n'))
  console.log(failures === 0 ? '\n结论：本地已就绪，可以推送/发布。' : `\n结论：${failures} 项待处理（见上）。`)
  process.exitCode = failures === 0 ? 0 : 1
}

function configReport() {
  lines.push('\n下一步')
  lines.push('  1. GitHub 建空仓库（Public，不勾 README/gitignore/license）')
  lines.push('  2. git push -u origin main && git tag v1.0.0 && git push --tags')
  lines.push('  3. npm login && npm publish --access public')
}

await main()