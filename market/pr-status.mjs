#!/usr/bin/env node
/**
 * Is the market submission merged yet?
 *
 *   node market/pr-status.mjs
 *
 * Three independent signals:
 *   1. the pull request's own state/merged flag (GitHub API),
 *   2. whether the entry file now exists on the upstream default branch (raw file),
 *   3. whether the market index lists the plugin (awesome-dsh-plugin.com/plugins.json).
 *
 * Exit code 0 = merged/listable, 1 = still pending.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const PR = 'https://api.github.com/repos/awesome-dsh-plugin/awesome-dsh-plugin/pulls/18697'
const RAW = 'https://raw.githubusercontent.com/awesome-dsh-plugin/awesome-dsh-plugin/main/data/plugins/Qthinoyy__dsh-xmind-excel.yml'
const INDEX = 'https://awesome-dsh-plugin.com/plugins.json'
const REPO = 'Qthinoyy/dsh-xmind-excel'

async function request(url, ms = 30000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { 'User-Agent': 'dsh-market-status', Accept: 'application/vnd.github+json' } })
    const text = await res.text()
    return { status: res.status, text }
  } catch (error) {
    return { status: 0, text: error.message }
  }
}

const pr = await request(PR)
let prData = null
try { prData = JSON.parse(pr.text) } catch {}
if (prData?.number) {
  const when = prData.merged_at ?? prData.closed_at ?? ''
  console.log(`PR #${prData.number}: state=${prData.state} merged=${prData.merged} mergeable_state=${prData.mergeable_state ?? '-'} ${when ? 'at ' + when : ''}`)
  if (prData.message) console.log('api message:', prData.message)
} else {
  console.log(`PR API unavailable (HTTP ${pr.status}): ${String(pr.text).slice(0, 120)}`)
}

const raw = await request(RAW)
if (raw.status === 200) {
  console.log('upstream main file: EXISTS → 条目已在 main（已合并/已应用）')
  console.log('---')
  console.log(raw.text.trim().split('\n').map((line) => '  ' + line).join('\n'))
} else {
  console.log(`upstream main file: NOT PRESENT (HTTP ${raw.status}) → 还没合并`)
}

console.log('checking market index … (this host is slow, up to 2 minutes)')
const index = await request(INDEX, 120000)
if (index.status === 200) {
  try {
    const data = JSON.parse(index.text)
    const list = Array.isArray(data) ? data : data.plugins ?? data.entries ?? []
    const hit = list.some((entry) => JSON.stringify(entry).includes(REPO))
    console.log(`market index: ${hit ? 'LISTED ✅' : 'not listed yet'} (entries: ${list.length})`)
    if (hit) {
      console.log('安装命令: dsh plugin add dsh-xmind-excel')
      process.exit(0)
    }
  } catch {
    console.log('market index: unparsable response')
  }
} else {
  console.log(`market index unavailable (HTTP ${index.status})`)
}

process.exit(prData?.merged === true || raw.status === 200 ? 0 : 1)