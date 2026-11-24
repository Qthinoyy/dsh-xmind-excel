# XMind to Excel for DeepSeek Harness

[![npm version](https://img.shields.io/npm/v/dsh-xmind-excel.svg)](https://www.npmjs.com/package/dsh-xmind-excel)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Convert `.xmind` mind maps into `.xlsx` workbooks from inside DeepSeek Harness (DSH).
Two tools, four views, no runtime dependencies, no network access.

| Tool | What it does |
|---|---|
| `xmind_to_excel` | Reads a `.xmind` file and writes an `.xlsx` workbook: `outline`, `testcase`, `checklist`, `qa`, `matrix`, or `all` |
| `xmind_inspect` | Summarizes canvases, node count, depth distribution, priority markers and sample titles per level — pick the view and case levels from facts, not guesses |

## Views

| Mode | Columns | Use it for |
|---|---|---|
| `outline` (default) | 层级1…层级N, 标题, 备注, 标签, 超链接, 标记/优先级, 路径, 相对深度 | A faithful dump: one row per node, filterable and pivot-friendly |
| `testcase` | 模块, 用例标题, 优先级, 前置条件, 步骤, 预期结果, 标签, 超链接, 备注 | Maps whose case titles start with `验证` / `校验` / `测试` |
| `checklist` | 模块, 场景, 用例标题, 优先级, 预期结果, 标签, 超链接, 备注 | Maps shaped 模块 → 场景 → 用例 → 预期; case levels come from `caseDepth` |
| `qa` | **QA table**: 模块, 子模块, 用例场景, 优先级, 前置条件, 操作步骤, 预期结果, XMind 来源, plus a 分类核对 sheet with each inferred decision, score and rule | Test-case handoff; the map carries no explicit precondition/step semantics, so the split is heuristic and reviewable |
| `matrix` | 层级1…层级N with vertically merged ancestor cells | Printing and review: one row per leaf path, reads like the expanded map |
| `all` | `outline` + `testcase` + `matrix` sheets | Hand all three to the user and let them choose |

`xmind_to_excel` accepts XMind 2020+/Zen containers (`content.json`) and XMind 8 containers (`content.xml`), including floating topics (converted as ordinary children).

## Install

**From npm (recommended):**

```
plugin_manager { action: "install_bundle", target: "dsh-xmind-excel@1.0.1" }
```

Or open **Plugins** → **Add plugin** and paste `dsh-xmind-excel@1.0.1`.

**From a local directory** — the usual path for a plugin under development:

1. Open **Plugins** in the DSH sidebar.
2. Choose **Add plugin** and point it at this directory (`dsh-xmind-excel/`), or run `plugin_manager` with `action: install_bundle` and this directory as the target.
3. The new row **XMind to Excel** appears in the plugin list; both tools are registered for new and existing sessions, and the bundled `xmind-to-excel` skill shows up in the skill catalog.

**From npm** (after publishing):

```
plugin_manager { action: "install_bundle", target: "dsh-xmind-excel@1.0.0" }
```

Turning the bundle off removes both tools and the bundled skill; nothing else in the profile changes.

## Usage

```
xmind_inspect  { input: "D:\\cases\\calculator.xmind" }

xmind_to_excel { input: "D:\\cases\\calculator.xmind",
                 mode: "checklist", caseDepth: "2,3" }
# -> Created: D:\cases\calculator.checklist.xlsx
#    mode=checklist sheets=1 nodes=121 rows=53 cases=53 size=29.9 KB
```

Parameter notes:

- `caseDepth` (`checklist` only) lists the tree levels that hold cases, e.g. `"3"` or `"2,3"`. A node on one of those levels is a case unless a deeper case level exists below it; higher nodes become module/scene. Level-2 nodes titled 说明/备注/注意/举例/前提/范围 are treated as annotations: the scene column stays empty and the text moves to the notes column.
- `sceneLevel` (`qa` only) picks the 用例场景 level (default 3); `levelOffset` shifts module/submodule/scene down when the first level is a version or a device; `preconditionDepth` / `stepDepth` force levels to count as 前置条件 / 操作步骤; `withDetail: false` skips the review sheet.
- `qa` classification, strongest signal first: explicit prefixes (`前置：` / `步骤：` / `预期：`), numbered notes (steps) or 前置/前提 wording (precondition), bracket annotations, then wording (verb → step, state words 已/未/断网/安装… → precondition). Nothing decisive → 未分类: the node stays out of both columns, appears in 「分类核对」, and the full path remains in the XMind 来源 column.
- `output` sets the workbook path. Without it the workbook lands next to the input as `<input>.xlsx` (single `outline`/`all`) or `<input>.<mode>.xlsx`; if that name is taken a timestamp suffix is added unless `overwrite: true`.
- `sheet` converts only a matching canvas; `maxLevel` (1–30, default 12) controls how many level columns expand; `splitSheets` names worksheets `<canvas>.<view>`; `explodeSteps` writes one row per step in `testcase` mode.

Case recognition rules for `testcase` are documented in the bundled skill and in `docs/DETAIL`; when titles do not follow the convention the tool falls back to "every leaf is a case" and reports the count so you can spot it.

## Limits and privacy

- Reads the given `.xmind` file (≤ 50 MB) and writes one `.xlsx` file. No network requests, no uploads, no telemetry.
- Only the text structure is converted: images, stickers, relationship lines, boundaries, summaries and layout positions are dropped; floating topics appear as ordinary children.
- Encrypted, corrupt or non-zip files fail with a clear error instead of a best guess.
- Conversion is rule-based; review the first rows when titles are not written in a recognizable style.
- The matrix view merges only vertically adjacent equal ancestor cells; it does not reproduce complex layouts.

## Compatibility

- DSH `>=0.2.0-rc.1 <0.3.0-0` (declared as `dsh.engines.dsh`); Node.js 22+.
- Host-only bundle: no UI slots, no settings fields, no client bundle.

## Development

```powershell
node --test                 # 34 tests: parsing, four views, zip/xlsx structure, error paths, packaging
node -e "import('./lib/convert.js').then(...)"   # or use the tools from a DSH session
```

Layout:

```
index.js            Host plugin: registers both tools and the bundled skill
lib/xmind.js        .xmind container reader (content.json / content.xml)
lib/xml.js          Minimal XML reader for XMind 8 files
lib/modes.js        outline / testcase / checklist / matrix builders
lib/xlsx.js         XLSX writer (inline strings, styles, merges, freeze, filter)
lib/zip.js          ZIP reader/writer (CRC32, stored + deflate)
lib/convert.js      Orchestration: mode selection, output naming, size limits
skills/             Bundled `xmind-to-excel` skill
locale/             English and Chinese plugin metadata
docs/               Detail documents and the feature image
test/               node:test suite with XMind 2020, XMind 8 and checklist fixtures
```

## Author

欧阳秋生 (Ouyang Qiusheng) — maintainer.

Source: https://github.com/Qthinoyy/dsh-xmind-excel.

Release, attribution and monetisation notes: [PUBLISHING.md](PUBLISHING.md).

## License

MIT — see [LICENSE](LICENSE).

