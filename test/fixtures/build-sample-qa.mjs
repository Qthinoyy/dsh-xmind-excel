// Regenerate test/fixtures/sample-qa.xmind (XMind 2020+ content.json layout).
// Run with: node test/fixtures/build-sample-qa.mjs
import { writeFile } from 'node:fs/promises'
import { createZip } from '../../lib/zip.js'

const t = (title, children = [], notes) => ({
  id: `t${Math.random().toString(36).slice(2, 8)}`,
  title,
  ...(notes ? { notes: { plain: { content: notes } } } : {}),
  ...(children.length > 0 ? { children: { attached: children } } : {}),
})

const root = t('学伴圈示例', [
  t('模块A', [
    t('子模块1', [
      t('场景1', [
        t('前置：已登录', [t('点击开始', [t('显示成功页面')])]),
        t('断网时点击', [t('出现提示')]),
      ]),
      t('场景2', [
        t('备注编号步骤', [t('结果A')], '1. 打开页面\n2. 点击确认'),
        t('无信号', [t('结果B')]),
      ]),
    ]),
  ]),
])

const content = [{ id: 'sheet1', class: 'sheet', title: '画布 1', rootTopic: root }]
const archive = createZip([
  { name: 'content.json', data: JSON.stringify(content) },
  { name: 'metadata.json', data: JSON.stringify({ creator: { name: 'fixture' } }) },
])
await writeFile(new URL('./sample-qa.xmind', import.meta.url), archive)
console.log('wrote test/fixtures/sample-qa.xmind')