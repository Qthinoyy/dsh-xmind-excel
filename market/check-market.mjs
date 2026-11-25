#!/usr/bin/env node
/**
 * After the submission PR is merged, verify that the plugin is actually visible
 * in the market index and that installs resolve to the latest npm version.
 *
 *   node market/check-market.mjs
 *
 * Exit code 0 = entry present (and npm latest resolved); 1 = not visible yet.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const INDEX = 'https://awesome-dsh-plugin.com/plugins.json'
const REPO = 'Qthinoyy/dsh-xmind-excel'
const PACKAGE = 'dsh-xmind-excel'

async function fetchWithTimeout(url, ms) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { 'User-Agent': 'dsh-market-check' } })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const text = await res.text()
    try { return { data: JSON.parse(text) } } catch { return { error: `unparsable (${text.slice(0, 60)})` } }
  } catch (error) {
    return { error: error.message }
  }
}

const npm = await fetchWithTimeout(`https://registry.npmjs.org/${PACKAGE}`, 30000)
const latest = npm.data?.['dist-tags']?.latest ?? '(unknown)'
const provenance = Boolean(npm.data?.versions?.[latest]?.dist?.attestations)
console.log(`npm ${PACKAGE}: latest=${latest} | provenance=${provenance ? 'yes' : 'no'}`)

console.log(`fetching ${INDEX} …`)
const index = await fetchWithTimeout(INDEX, 120000)
if (index.error) {
  console.log(`market index unavailable: ${index.error}`)
  console.log('(the host is slow from this network; retry later or check https://awesome-dsh-plugin.com/ in a browser)')
  process.exit(1)
}

const list = Array.isArray(index.data) ? index.data : index.data?.plugins ?? index.data?.entries ?? []
console.log(`market entries: ${list.length}`)
const hit = list.find((entry) => {
  const haystack = JSON.stringify(entry)
  return haystack.includes(REPO) || haystack.includes(PACKAGE)
})
if (!hit) {
  console.log(`NOT LISTED YET: ${REPO} is not in the index (merge pending or index not rebuilt)`)
  process.exit(1)
}
console.log('LISTED:')
console.log(JSON.stringify(hit, null, 2).slice(0, 1200))
console.log('\nmarket install command: dsh plugin add ' + (hit.npm ?? PACKAGE))
process.exit(0)